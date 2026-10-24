import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { harness, refund } from "./gateway-helpers.ts";
import { OperationLedger } from "../apps/backend/operations.ts";
import {
  RefundExecutor,
  type RefundProvider,
  type RefundTarget,
} from "../apps/executor/refund.ts";
import { Gateway } from "../apps/backend/gateway.ts";
import { Store } from "../apps/backend/database.ts";
async function setup(path = ":memory:") {
  const h = await harness(path);
  const ledger = new OperationLedger(h.gateway);
  const control = {
    writes: 0,
    loss: false,
    status: "SUCCEEDED",
    wrongAmount: false,
    failObservation: false,
  };
  let submitted: RefundTarget | null = null;
  const provider: RefundProvider = {
    read: (input, signal) => h.reader.read(input, signal),
    async submitRefund(input) {
      control.writes++;
      submitted = input;
      if (control.loss) throw new Error("Controlled lost acknowledgement");
      return {
        providerObjectId: "re_controlled",
        providerRequestId: "req_controlled",
      };
    },
    async observeRefund(input) {
      if (control.failObservation) throw new Error("Controlled failure");
      return {
        tenantId: input.tenantId,
        customerId: input.customerId,
        targetId: input.paymentId,
        operationId: input.operationId,
        providerObjectId: "re_controlled",
        environment: "TEST",
        provenance: "CONTROLLED_TEST",
        observedAt: h.now().toISOString(),
        amountMinor: control.wrongAmount
          ? input.amountMinor + 1
          : input.amountMinor,
        currency: "MYR",
        status: control.status,
        providerRequestId: null,
        adapterVersion: "controlled-refund-v1",
      };
    },
  };
  const executor = new RefundExecutor(ledger, provider, { timeoutMs: 40 });
  async function ready(approve = true) {
    const c = await h.create(refund, refund, approve);
    const v = await h.gateway.validate(h.tokens["support.a"]!, {
      proposalId: c.proposalId,
    });
    return { ...c, validationId: v.validationId };
  }
  return {
    ...h,
    providerControl: h.control,
    ledger,
    control,
    provider,
    executor,
    ready,
    submitted: () => submitted,
  };
}
test("exact approved refund consumes authority once and reports only observed provider success", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const c = await h.ready();
  const result = await h.executor.execute({ validationId: c.validationId });
  assert.equal(result.state, "SUCCEEDED");
  assert.equal(result.effectVerified, true);
  assert.match(result.statusText, /does not verify receipt/);
  assert.equal(h.control.writes, 1);
  const again = await h.executor.execute({ validationId: c.validationId });
  assert.equal(again.operationId, result.operationId);
  assert.equal(h.control.writes, 1);
  assert.equal(h.submitted()?.amountMinor, 2000);
  assert.equal(h.submitted()?.operationId, result.operationId);
  assert.equal(
    h.store.get<{ consumed_by_operation_id: string }>(
      "SELECT consumed_by_operation_id FROM approvals WHERE receipt_id=?",
      c.receipt.receiptId,
    )?.consumed_by_operation_id,
    result.operationId,
  );
});
test("refund requires exact staff approval and rejects substituted public execution parameters", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const c = await h.ready(false);
  await assert.rejects(h.executor.execute({ validationId: c.validationId }));
  await assert.rejects(
    h.executor.execute({ validationId: c.validationId, amountMinor: 1 }),
  );
  assert.equal(h.control.writes, 0);
});
test("refund pending/failed/canceled/invalid observations never become completed bank receipt claims", async () => {
  for (const variant of [
    "PENDING",
    "FAILED",
    "CANCELED",
    "wrongAmount",
    "missing",
  ]) {
    const h = await setup();
    try {
      const c = await h.ready();
      if (variant === "wrongAmount") h.control.wrongAmount = true;
      else if (variant === "missing") h.control.failObservation = true;
      else h.control.status = variant;
      const result = await h.executor.execute({ validationId: c.validationId });
      assert.equal(result.effectVerified, false);
      assert.equal(
        result.state,
        ["wrongAmount", "missing"].includes(variant)
          ? "OUTCOME_UNKNOWN"
          : variant,
      );
      assert.doesNotMatch(
        result.statusText,
        /recorded the exact refund as succeeded/,
      );
    } finally {
      h.store.close();
    }
  }
});
test("refund timeout/restart recovery reconciles the original operation without another write", async () => {
  const dir = await mkdtemp(join(tmpdir(), "proofit-refund-"));
  const path = join(dir, "db.sqlite");
  const h = await setup(path);
  let reopened: Store | undefined;
  try {
    const c = await h.ready();
    h.control.loss = true;
    const result = await h.executor.execute({ validationId: c.validationId });
    assert.equal(result.state, "OUTCOME_UNKNOWN");
    h.store.close();
    reopened = new Store(path);
    reopened.migrate();
    const executor = new RefundExecutor(
      new OperationLedger(
        new Gateway(reopened, { now: h.now, mode: "CONTROLLED_TEST" }),
      ),
      h.provider,
      { timeoutMs: 40 },
    );
    const outcomes = await executor.reconcileDue();
    assert.equal(outcomes[0]?.state, "SUCCEEDED");
    assert.equal(outcomes[0]?.operationId, result.operationId);
    assert.equal(h.control.writes, 1);
  } finally {
    reopened?.close();
    if (!reopened) h.store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("two refund workers cannot submit twice and pre-submit balance/approval revocation holds", async () => {
  for (const variant of ["concurrent", "balance", "approval"]) {
    const h = await setup();
    try {
      const c = await h.ready();
      if (variant === "concurrent") {
        const other = new RefundExecutor(h.ledger, h.provider, {
          timeoutMs: 40,
        });
        await Promise.allSettled([
          h.executor.execute({ validationId: c.validationId }),
          other.execute({ validationId: c.validationId }),
        ]);
        assert.equal(h.control.writes, 1);
      } else {
        await h.ledger.reserveStored({ validationId: c.validationId });
        if (variant === "balance")
          h.providerControl.state.remainingRefundableMinor = 1;
        else
          h.store.run(
            "UPDATE actors SET active=0 WHERE role='REFUND_APPROVER'",
          );
        await assert.rejects(
          h.executor.execute({ validationId: c.validationId }),
        );
        assert.equal(h.control.writes, 0);
      }
    } finally {
      h.store.close();
    }
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { harness, cancel, refund } from "./gateway-helpers.ts";
import { Foundation } from "../apps/backend/foundation.ts";
import { Investigator } from "../apps/investigator/runner.ts";
import {
  ReviewPipeline,
  type ProposingModel,
} from "../apps/backend/review-pipeline.ts";
import type { InvestigationModel } from "../packages/contracts/investigation.ts";
const modelId = "controlled-pipeline";
async function setup() {
  const h = await harness();
  const foundation = new Foundation(h.store, h.now, true);
  const c = await h.create(cancel);
  // Simulate an installed worker in controlled test configuration; public routes cannot enable it.
  h.store.run(
    "UPDATE review_jobs SET status='QUEUED' WHERE request_id=?",
    c.request.id,
  );
  let proposals = 0,
    executions = 0;
  const proposer: ProposingModel = {
    modelId,
    provenance: "CONTROLLED_TEST",
    async propose() {
      proposals++;
      return {
        proposal: cancel,
        usage: { modelId, inputTokens: 5, outputTokens: 5 },
      };
    },
  };
  const model: InvestigationModel = {
    modelId,
    provenance: "CONTROLLED_TEST",
    async next(input) {
      return {
        output: input.history.length
          ? {
              type: "FINAL",
              findings: (input.history as any[]).map((r) => ({
                kind: "OBSERVATION",
                text: "Controlled exact source observed.",
                references: [r.result.record.reference],
              })),
              unresolved: [],
            }
          : {
              type: "LOOKUP",
              calls: c.evidenceIds.map((evidenceId) => ({
                tool: "read_case_record",
                input: { evidenceId },
              })),
            },
        usage: { modelId, inputTokens: 5, outputTokens: 5 },
      };
    },
  };
  const investigator = new Investigator(h.gateway, { model });
  const pipeline = new ReviewPipeline(foundation, investigator, proposer);
  return {
    ...h,
    foundation,
    c,
    pipeline,
    proposer,
    investigator,
    proposals: () => proposals,
    executions: () => executions,
  };
}
test("confirmation atomically records one automatic job and default runtime reports unavailable", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const req = h.foundation.createRequest(h.tokens["customer.a"]!, {
    text: "New exact request",
  });
  const receipt = h.foundation.confirm(h.tokens["customer.a"]!, {
    requestId: req.id,
    requestVersion: 1,
    action: cancel,
  });
  h.foundation.confirm(h.tokens["customer.a"]!, {
    requestId: req.id,
    requestVersion: 1,
    action: cancel,
  });
  assert.equal(
    h.store.get<{ n: number }>(
      "SELECT count(*) AS n FROM review_jobs WHERE receipt_id=?",
      receipt.receiptId,
    )?.n,
    1,
  );
  const defaultFoundation = new Foundation(h.store, h.now);
  const req2 = defaultFoundation.createRequest(h.tokens["customer.a"]!, {
    text: "Unconfigured request",
  });
  defaultFoundation.confirm(h.tokens["customer.a"]!, {
    requestId: req2.id,
    requestVersion: 1,
    action: cancel,
  });
  assert.equal(
    (
      defaultFoundation.getCase(h.tokens["customer.a"]!, req2.id, 1)
        .automation as any
    ).status,
    "UNAVAILABLE",
  );
});
test("automatic worker stores AI proposal, investigates and stops at READY when submission is disabled", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const result = (await h.pipeline.runNext(h.tokens["support.a"]!)) as any;
  assert.equal(result.status, "READY");
  assert.equal(h.proposals(), 1);
  assert.ok(result.run_id);
  assert.ok(result.validation_id);
  assert.equal(await h.pipeline.runNext(h.tokens["support.a"]!), null);
  assert.equal(h.proposals(), 1);
  assert.equal(
    h.store.get<{ n: number }>("SELECT count(*) AS n FROM operations")?.n,
    0,
  );
});
test("mismatched AI proposal is BLOCKED without substitution or executor calls", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  let executions = 0;
  const proposer: ProposingModel = {
    ...h.proposer,
    async propose() {
      return {
        proposal: refund,
        usage: { modelId, inputTokens: 5, outputTokens: 5 },
      };
    },
  };
  const pipeline = new ReviewPipeline(h.foundation, h.investigator, proposer, {
    async execute() {
      executions++;
      throw new Error("Must not execute");
    },
  });
  const result = (await pipeline.runNext(h.tokens["support.a"]!)) as any;
  assert.equal(result.status, "BLOCKED");
  assert.equal(executions, 0);
});
test("workers enforce staff/tenant scope and competing claims preserve one proposal", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  await assert.rejects(h.pipeline.runNext(h.tokens["customer.a"]!));
  assert.equal(await h.pipeline.runNext(h.tokens["approver.other"]!), null);
  await Promise.all([
    h.pipeline.runNext(h.tokens["support.a"]!),
    h.pipeline.runNext(h.tokens["support.a"]!),
  ]);
  assert.equal(h.proposals(), 1);
});
test("interrupted workers and request amendments require review rather than blind execution", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  h.store.run(
    "UPDATE review_jobs SET status='INVESTIGATING',lease_token='old',lease_until='2026-01-01T00:00:00.000Z'",
  );
  await h.pipeline.runNext(h.tokens["support.a"]!);
  assert.equal(h.proposals(), 0);
  assert.equal(
    h.store.get<{ status: string }>("SELECT status FROM review_jobs")?.status,
    "REVIEW_REQUIRED",
  );
});

test("automatic pipeline executes only a READY stored reference and records observation-backed progress", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const { CancellationExecutor } =
    await import("../apps/executor/cancellation.ts");
  const { OperationLedger } = await import("../apps/backend/operations.ts");
  let writes = 0;
  const executor = new CancellationExecutor(
    new OperationLedger(h.gateway),
    {
      read: (input, signal) => h.reader.read(input, signal),
      async submitCancellation(input) {
        writes++;
        return {
          providerObjectId: input.subscriptionId,
          providerRequestId: null,
        };
      },
      async observeCancellation(input) {
        return {
          tenantId: input.tenantId,
          customerId: input.customerId,
          targetId: input.subscriptionId,
          providerObjectId: input.subscriptionId,
          environment: "TEST",
          provenance: "CONTROLLED_TEST",
          observedAt: h.now().toISOString(),
          status: "SCHEDULED",
          periodEnd: "2026-11-24T00:00:00.000Z",
          providerRequestId: null,
          adapterVersion: "controlled-pipeline",
        };
      },
    },
    { timeoutMs: 40 },
  );
  const pipeline = new ReviewPipeline(
    h.foundation,
    h.investigator,
    h.proposer,
    executor,
  );
  const result = (await pipeline.runNext(h.tokens["support.a"]!)) as any;
  assert.equal(result.status, "OBSERVED");
  assert.equal(writes, 1);
  assert.ok(result.operation_id);
  assert.equal(await pipeline.runNext(h.tokens["support.a"]!), null);
  assert.equal(writes, 1);
});

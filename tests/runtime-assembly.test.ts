import test from "node:test";
import assert from "node:assert/strict";
import { harness, cancel, refund } from "./gateway-helpers.ts";
import { prepareSeed } from "../apps/backend/seed.ts";
import { Store } from "../apps/backend/database.ts";
import { Foundation } from "../apps/backend/foundation.ts";
import { assembleRuntime } from "../apps/worker/assemble.ts";
import { assembleExecutor } from "../apps/executor/assemble.ts";
import type { RuntimePorts } from "../apps/worker/assemble.ts";
const modelId = "controlled-assembly";
function ports(): RuntimePorts {
  return {
    model: {
      modelId,
      provenance: "CONTROLLED_TEST",
      async next() {
        throw new Error("Assembly must not invoke a model");
      },
    },
    proposer: {
      modelId,
      provenance: "CONTROLLED_TEST",
      async propose() {
        throw new Error("Assembly must not propose");
      },
    },
    retrieval: {
      async refresh() {
        throw new Error("Assembly must not retrieve");
      },
    },
    providerReader: {
      async read() {
        throw new Error("Assembly must not read provider state");
      },
    },
  };
}
test("runtime assembly authenticates a real support identity without inference or credential propagation", async (t) => {
  const store = new Store(":memory:");
  store.migrate();
  t.after(() => store.close());
  const seed = await prepareSeed();
  seed.apply(store);
  const foundation = new Foundation(store);
  const selected = seed.credentials.find((c) => c.role === "SUPPORT")!;
  const supplied = ports();
  const runtime = await assembleRuntime(supplied, {
    email: selected.email,
    password: selected.password,
  })({ foundation });
  assert.equal(
    foundation.auth.session(runtime.staffToken).actor.role,
    "SUPPORT",
  );
  assert.equal(runtime.model, supplied.model);
  assert.equal(runtime.model.provenance, "CONTROLLED_TEST");
  assert.equal(JSON.stringify(runtime).includes(selected.password), false);
  for (const role of ["CUSTOMER", "REFUND_APPROVER"]) {
    const account = seed.credentials.find((c) => c.role === role)!;
    await assert.rejects(
      assembleRuntime(supplied, {
        email: account.email,
        password: account.password,
      })({ foundation }),
      /dedicated support/,
    );
  }
  await assert.rejects(
    assembleRuntime(supplied, {
      email: selected.email,
      password: "incorrect-synthetic-password",
    })({ foundation }),
  );
});
test("executor assembly dispatches reads by trusted action and shares one ledger without submitting", async (t) => {
  const h = await harness();
  t.after(() => h.store.close());
  let cancelReads = 0,
    refundReads = 0,
    writes = 0;
  const bundle = assembleExecutor(
    h.store,
    {
      cancellation: {
        async read(input, signal) {
          cancelReads++;
          return h.reader.read(input, signal);
        },
        async submitCancellation() {
          writes++;
          throw new Error("Must not submit");
        },
        async observeCancellation() {
          throw new Error("No attempt");
        },
      },
      refund: {
        async read(input, signal) {
          refundReads++;
          return h.reader.read(input, signal);
        },
        async submitRefund() {
          writes++;
          throw new Error("Must not submit");
        },
        async observeRefund() {
          throw new Error("No attempt");
        },
      },
    },
    { mode: "CONTROLLED_TEST", now: h.now },
  );
  const signal = new AbortController().signal;
  await bundle.reader.read(
    {
      tenantId: "tenant_synthetic_a",
      customerId: "customer_synthetic_a",
      action: cancel,
    },
    signal,
  );
  await bundle.reader.read(
    {
      tenantId: "tenant_synthetic_a",
      customerId: "customer_synthetic_a",
      action: refund,
    },
    signal,
  );
  assert.equal(cancelReads, 1);
  assert.equal(refundReads, 1);
  assert.equal(bundle.cancellation.ledger, bundle.refund.ledger);
  assert.equal(writes, 0);
  assert.deepEqual(await bundle.reconcileDue(), {
    cancellations: [],
    refunds: [],
  });
  assert.throws(() => bundle.server("too-short"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { cancellationHarness } from "./cancellation-helpers.ts";
import { createExecutorApi } from "../apps/executor/http.ts";
import { ExecutorClient } from "../apps/backend/executor-client.ts";
import { cancel } from "./gateway-helpers.ts";
test("worker executor client uses authenticated fixed routes and only stored validation references", async (t) => {
  const h = await cancellationHarness();
  t.after(() => h.store.close());
  const c = await h.ready();
  const secret = randomBytes(32).toString("hex");
  const server = createExecutorApi(h.ledger, secret, {
    cancellation: h.executor,
    reader: h.reader,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const client = new ExecutorClient(origin, secret);
  const state = await client.read(
    {
      tenantId: "tenant_synthetic_a",
      customerId: "customer_synthetic_a",
      action: cancel,
    },
    new AbortController().signal,
  );
  assert.equal(state?.environment, "TEST");
  const result = await client.execute({ validationId: c.validationId });
  assert.ok(result.operationId);
  assert.equal(h.controls.writes.length, 1);
  await assert.rejects(
    client.execute({ validationId: c.validationId, amountMinor: 1 } as any),
  );
  assert.equal(h.controls.writes.length, 1);
  const unauth = new ExecutorClient(origin, randomBytes(32).toString("hex"));
  await assert.rejects(unauth.execute({ validationId: c.validationId }));
  assert.equal(JSON.stringify(client).includes(secret), false);
  assert.throws(() => new ExecutorClient("https://arbitrary.example", secret));
  assert.throws(() => new ExecutorClient(origin + "/path", secret));
});
test("default executor still exposes no provider read/write routes", async (t) => {
  const h = await cancellationHarness();
  t.after(() => h.store.close());
  const secret = randomBytes(32).toString("hex");
  const server = createExecutorApi(h.ledger, secret);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  for (const path of [
    "/internal/actions",
    "/internal/provider-state",
    "/internal/refunds",
  ])
    assert.equal(
      (
        await fetch(origin + path, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + secret,
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      404,
    );
});

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { harness, cancel } from "./gateway-helpers.ts";
import { exportCase } from "../apps/backend/exports.ts";
import { Investigator } from "../apps/investigator/runner.ts";
import { createApi } from "../apps/backend/http.ts";
test("exports are recorded snapshots; customer packets exclude staff evidence and preserve stored records", async (t) => {
  const h = await harness();
  t.after(() => h.store.close());
  const c = await h.create(cancel);
  const run = await new Investigator(h.gateway).start(h.tokens["support.a"]!, {
    proposalId: c.proposalId,
  });
  const reads = h.control.reads;
  const customer = exportCase(
    h.foundation,
    h.tokens["customer.a"]!,
    c.request.id,
    1,
  );
  const staff = exportCase(
    h.foundation,
    h.tokens["support.a"]!,
    c.request.id,
    1,
  );
  const packet = customer.payload as any;
  assert.equal(packet.visibility, "CUSTOMER");
  assert.equal(packet.investigations, undefined);
  assert.equal(packet.evidence, undefined);
  assert.equal(packet.case.auditEvents, undefined);
  assert.equal(packet.case.proposals, undefined);
  assert.equal((staff.payload as any).investigations[0].run.id, run.run.id);
  assert.equal((staff.payload as any).evidence.length, 2);
  assert.equal(h.control.reads, reads);
  assert.equal(
    staff.sha256,
    createHash("sha256").update(JSON.stringify(staff.payload)).digest("hex"),
  );
  assert.equal(
    h.store.get<{ count: number }>(
      "SELECT COUNT(*) AS count FROM investigations",
    )?.count,
    1,
  );
  assert.throws(() =>
    exportCase(h.foundation, h.tokens["customer.b"]!, c.request.id, 1),
  );
  assert.throws(() =>
    exportCase(h.foundation, h.tokens["approver.other"]!, c.request.id, 1),
  );
});
test("export redacts credential patterns and internal keys without rewriting originals", async (t) => {
  const h = await harness();
  t.after(() => h.store.close());
  const c = await h.create(cancel);
  const secret = "sk_test_" + "synthetic".repeat(4);
  h.store.run(
    "UPDATE proposals SET conversation=?,proposal_json=? WHERE id=?",
    secret,
    JSON.stringify({ idempotencyKey: "internal-only", note: secret }),
    c.proposalId,
  );
  const packet = exportCase(
    h.foundation,
    h.tokens["support.a"]!,
    c.request.id,
    1,
  );
  assert.equal(JSON.stringify(packet).includes(secret), false);
  assert.equal(JSON.stringify(packet).includes("internal-only"), false);
  assert.equal(
    h.store.get<{ conversation: string }>(
      "SELECT conversation FROM proposals WHERE id=?",
      c.proposalId,
    )?.conversation,
    secret,
  );
});
test("export HTTP enforces current session scope and rejects client identity/version overrides", async (t) => {
  const h = await harness();
  t.after(() => h.store.close());
  const c = await h.create(cancel);
  const server = createApi(h.foundation, "http://127.0.0.1:3101");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const origin =
    "http://127.0.0.1:" + (server.address() as { port: number }).port;
  const path = "/api/requests/" + c.request.id + "/export?version=1";
  assert.equal((await fetch(origin + path)).status, 401);
  const headers = { Cookie: "proofit_session=" + h.tokens["customer.b"] };
  assert.equal((await fetch(origin + path, { headers })).status, 404);
  const own = { Cookie: "proofit_session=" + h.tokens["customer.a"] };
  const result = await fetch(origin + path, { headers: own });
  assert.equal(result.status, 200);
  assert.match(result.headers.get("content-disposition")!, /attachment/);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(
    (await fetch(origin + path + "&tenantId=other", { headers: own })).status,
    400,
  );
});

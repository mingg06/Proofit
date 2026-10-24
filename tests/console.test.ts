import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { harness } from "./gateway-helpers.ts";
import { createApi } from "../apps/backend/http.ts";
import {
  caseSchema,
  resourceSchema,
  validationViewSchema,
} from "../packages/contracts/console.ts";
import { parseMoney, formatMoney } from "../apps/console/src/format.ts";

test("console amounts preserve exact integer minor units without rounding", () => {
  assert.equal(parseMoney("20.00"), 2000);
  assert.equal(parseMoney("0.01"), 1);
  assert.equal(parseMoney("90071992547409.91"), Number.MAX_SAFE_INTEGER);
  assert.equal(
    formatMoney(Number.MAX_SAFE_INTEGER),
    "MYR 90,071,992,547,409.91",
  );
  for (const amount of [
    "0",
    "-20",
    "1.001",
    "1e3",
    "NaN",
    "20,00",
    "90071992547409.92",
    "01.00",
  ])
    assert.throws(() => parseMoney(amount));
});
test("console resource and case DTOs are authenticated, tenant/customer scoped and omit staff evidence", async (t) => {
  const h = await harness();
  t.after(() => h.store.close());
  const customer = h.tokens["customer.a"]!,
    other = h.tokens["customer.b"]!,
    staff = h.tokens["support.a"]!;
  const owned = h.foundation
    .listResources(customer)
    .map((row) => resourceSchema.parse(row));
  assert.ok(owned.some((r) => r.id === "sub_fixture_a"));
  assert.ok(owned.every((r) => r.customerId === "customer_synthetic_a"));
  assert.ok(
    !h.foundation
      .listResources(other)
      .some((row) => (row as { id: string }).id === "sub_fixture_a"),
  );
  const c = await h.create();
  validationViewSchema.parse(
    await h.gateway.validate(staff, { proposalId: c.proposalId }),
  );
  const customerView = caseSchema.parse(
    h.foundation.getCase(customer, c.request.id, 1),
  );
  assert.equal(customerView.validations, undefined);
  assert.equal(customerView.investigations, undefined);
  assert.equal(customerView.approvals, undefined);
  assert.equal(customerView.latestVersion, 1);
  assert.deepEqual(customerView.operations, []);
  const staffView = caseSchema.parse(
    h.foundation.getCase(staff, c.request.id, 1),
  );
  assert.equal(staffView.validations?.length, 1);
  assert.equal(staffView.proposals?.length, 1);
  h.foundation.amendRequest(customer, c.request.id, {
    version: 1,
    text: "Updated request",
  });
  assert.equal(
    caseSchema.parse(h.foundation.getCase(customer, c.request.id, 1))
      .latestVersion,
    2,
  );
});
test("public console delivery permits built assets and excludes local/source files; resources require a session", async (t) => {
  const h = await harness();
  t.after(() => h.store.close());
  const server = createApi(h.foundation, "http://127.0.0.1:3000");
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = "http://127.0.0.1:" + address.port;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });
  const document = await fetch(base + "/");
  assert.ok([200, 503].includes(document.status));
  if (document.status === 200) {
    assert.match(
      document.headers.get("content-security-policy") ?? "",
      /script-src 'self'/,
    );
    const html = await document.text();
    assert.match(html, /PROOFIT/);
    const script = html.match(/src="(\/assets\/[^" ]+\.js)"/);
    assert.ok(script);
    const asset = await fetch(base + script[1]);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("content-type") ?? "", /javascript/);
    const js = await asset.text();
    for (const name of [
      "STRIPE_TEST_SECRET_KEY",
      "NVIDIA_API_KEY",
      "EXECUTOR_SERVICE_SECRET",
      "DATABASE_PATH",
      "node:crypto",
    ])
      assert.equal(js.includes(name), false);
  }
  for (const path of [
    "/assets/unknown.js",
    "/assets/source.js.map",
    "/.local/test-accounts.json",
    "/apps/backend/config.ts",
  ])
    assert.notEqual((await fetch(base + path)).status, 200);
  assert.equal((await fetch(base + "/api/resources")).status, 401);
  const response = await fetch(base + "/api/resources?customerId=other", {
    headers: { Cookie: "proofit_session=" + h.tokens["customer.a"] },
  });
  assert.equal(response.status, 200);
  assert.ok(
    (await response.json()).every(
      (r: { customerId: string }) => r.customerId === "customer_synthetic_a",
    ),
  );
});

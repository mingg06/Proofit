import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { harness, cancel } from "./gateway-helpers.ts";
import { passwordHash } from "../apps/backend/auth.ts";
import { Foundation } from "../apps/backend/foundation.ts";
import { createApi } from "../apps/backend/http.ts";
import { Investigator } from "../apps/investigator/runner.ts";
import {
  LocalEvidence,
  localEvidenceVersion,
} from "../apps/investigator/local-evidence.ts";
import { standaloneReview } from "../apps/standalone/runtime.ts";
import { prepareStandaloneFixtures } from "../apps/standalone/fixtures.ts";
import {
  modelStepSchema,
  type InvestigationModel,
} from "../packages/contracts/investigation.ts";
import { evidenceRefSchema } from "../packages/contracts/index.ts";
import type { ProposingModel } from "../apps/backend/review-pipeline.ts";

// In-memory synthetic ports only. LIVE here tests startup's provenance gate, not remote access.
const modelId = "synthetic-standalone-port-test";
function models() {
  let calls = 0;
  const model: InvestigationModel = {
    modelId,
    provenance: "LIVE",
    async next(input) {
      calls++;
      const output = !input.history.length
        ? {
            type: "LOOKUP",
            calls: [
              { tool: "read_request_receipt", input: {} },
              { tool: "search_approved_policy", input: { query: "policy" } },
            ],
          }
        : {
            type: "FINAL",
            findings: [
              ...JSON.stringify(input.history).matchAll(
                /"reference":(\{[^}]+\})/g,
              ),
            ].map((match) => ({
              kind: "OBSERVATION",
              text: "Synthetic test port cites the stored record, not an instruction.",
              references: [evidenceRefSchema.parse(JSON.parse(match[1]!))],
            })),
            unresolved: [],
          };
      return {
        output: modelStepSchema.parse(output),
        usage: { modelId, inputTokens: 5, outputTokens: 5 },
      };
    },
  };
  const proposer: ProposingModel = {
    modelId,
    provenance: "LIVE",
    async propose() {
      return {
        proposal: cancel,
        usage: { modelId, inputTokens: 5, outputTokens: 5 },
      };
    },
  };
  return { model, proposer, calls: () => calls };
}
async function setup() {
  const h = await harness();
  const password = "synthetic-support-password";
  h.store.run(
    "UPDATE actors SET password_hash=? WHERE email=?",
    await passwordHash(password),
    "support.a@proofit.test",
  );
  const account = { email: "support.a@proofit.test", password };
  const foundation = new Foundation(h.store, h.now, true);
  return { ...h, foundation, account };
}

test("standalone runs confirmation through local cited review, preserves fixture holds and replays without inference", async (t) => {
  const h = await setup();
  const m = models();
  const runtime = await standaloneReview(h.foundation, h.account, m);
  t.after(() => {
    runtime.close();
    h.store.close();
  });
  const request = h.foundation.createRequest(h.tokens["customer.a"]!, {
    text: "Cancel my next renewal and keep service until period end.",
  });
  h.foundation.confirm(h.tokens["customer.a"]!, {
    requestId: request.id,
    requestVersion: 1,
    action: cancel,
  });
  const result = (await runtime.pipeline.runNext(runtime.token)) as {
    status: string;
    run_id: string;
  };
  assert.equal(result.status, "REVIEW_REQUIRED");
  const replay = runtime.investigator.get(runtime.token, result.run_id);
  assert.equal(replay.run.status, "COMPLETE");
  assert.equal(replay.findings.length, 2);
  assert.equal(m.calls(), 1);
  assert.equal(h.control.reads, 0);
  const retrievals = replay.retrievals as {
    adapter_version: string;
    query_reference: string;
    provenance: string;
  }[];
  assert.equal(retrievals.length, 2);
  assert.ok(
    retrievals.every(
      (r) =>
        r.adapter_version === localEvidenceVersion &&
        r.query_reference.startsWith("sqlite-read:") &&
        r.provenance === "CONTROLLED_TEST",
    ),
  );
  assert.equal(
    h.store.get<{ n: number }>("SELECT count(*) n FROM operations")!.n,
    0,
  );
  assert.equal(
    h.store.get<{ n: number }>(
      "SELECT count(*) n FROM source_versions WHERE provenance='LIVE'",
    )!.n,
    0,
  );
  runtime.investigator.get(runtime.token, result.run_id);
  assert.equal(m.calls(), 1);
  assert.throws(() =>
    runtime.investigator.get(h.tokens["customer.a"]!, result.run_id),
  );
  assert.throws(() =>
    runtime.investigator.get(h.tokens["approver.other"]!, result.run_id),
  );
  assert.equal(await runtime.pipeline.runNext(runtime.token), null);
});

test("local evidence rejects revoked policy/request sources and atomically rolls back failed writes", async (t) => {
  for (const failure of ["policy", "request", "write"] as const) {
    const h = await setup();
    try {
      const c = await h.create(cancel, cancel, true, false);
      if (failure === "policy")
        h.store.run(
          "UPDATE source_versions SET approved=0 WHERE source_id='policy-fixture'",
        );
      if (failure === "request")
        h.store.run(
          "INSERT INTO source_versions VALUES(?,?,?,?,?)",
          "tenant_synthetic_a",
          "local-fixture-requests",
          "request-record-v1",
          0,
          "FIXTURE",
        );
      if (failure === "write")
        h.store.db.exec(
          "CREATE TRIGGER reject_local_evidence BEFORE INSERT ON evidence_records BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END",
        );
      const investigator = new Investigator(h.gateway, {
        model: { ...models().model, provenance: "CONTROLLED_TEST" },
        retrieval: new LocalEvidence(),
        memory: false,
      });
      const run = await investigator.start(h.tokens["support.a"]!, {
        proposalId: c.proposalId,
      });
      assert.notEqual(run.run.status, "COMPLETE");
      assert.equal(run.validation.decision, "REVIEW_REQUIRED");
      assert.equal(
        h.store.get<{ n: number }>("SELECT count(*) n FROM retrieval_queries")!
          .n,
        0,
      );
      assert.equal(
        h.store.get<{ n: number }>("SELECT count(*) n FROM evidence_records")!
          .n,
        0,
      );
    } finally {
      h.store.close();
    }
  }
});

test("local refresh preserves unresolved/conflict holds and rejects changes to a pinned request passage", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const c = await h.create(cancel);
  h.store.run(
    "UPDATE evidence_manifests SET manifest_json=? WHERE request_id=?",
    JSON.stringify({
      evidenceIds: c.evidenceIds,
      unresolved: ["Unresolved case amendment"],
      conflicts: ["Conflicting policy note"],
    }),
    c.request.id,
  );
  const investigator = new Investigator(h.gateway, {
    model: { ...models().model, provenance: "CONTROLLED_TEST" },
    retrieval: new LocalEvidence(),
    memory: false,
  });
  const first = await investigator.start(h.tokens["support.a"]!, {
    proposalId: c.proposalId,
  });
  assert.equal(first.run.status, "COMPLETE");
  assert.equal(first.validation.decision, "REVIEW_REQUIRED");
  assert.ok(
    first.validation.checks.some(
      (c) => c.reason.includes("conflict") || c.reason.includes("unresolved"),
    ),
  );
  h.store.run(
    "UPDATE requests SET original_text='Changed without version increment' WHERE id=?",
    c.request.id,
  );
  const second = await investigator.start(h.tokens["support.a"]!, {
    proposalId: c.proposalId,
  });
  assert.notEqual(second.run.status, "COMPLETE");
  assert.equal(
    h.store.get<{ n: number }>(
      "SELECT count(*) n FROM retrieval_queries WHERE run_id=?",
      second.run.id,
    )!.n,
    0,
  );
});

test("standalone startup requires real model ports and a currently authenticated support role", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const m = models();
  await assert.rejects(
    standaloneReview(h.foundation, h.account, {
      ...m,
      model: { ...m.model, provenance: "CONTROLLED_TEST" },
    }),
  );
  await assert.rejects(
    standaloneReview(
      h.foundation,
      { ...h.account, password: "wrong-password" },
      m,
    ),
  );
  h.store.run(
    "UPDATE actors SET role='REFUND_APPROVER' WHERE email=?",
    h.account.email,
  );
  await assert.rejects(standaloneReview(h.foundation, h.account, m));
});

test("standalone accepts a seeded account record while deriving role and tenant solely from authentication", async (t) => {
  const h = await setup();
  const seeded = {
    ...h.account,
    role: "CUSTOMER",
    tenant: "other",
    unrelated: "synthetic seed metadata",
  };
  const runtime = await standaloneReview(h.foundation, seeded, models());
  t.after(() => {
    runtime.close();
    h.store.close();
  });
  const actor = h.foundation.auth.session(runtime.token).actor;
  assert.equal(actor.role, "SUPPORT");
  assert.equal(actor.tenant_id, "tenant_synthetic_a");
});

test("fixture preparation is idempotent and cannot overwrite an existing approved policy", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const before = h.store.get<{ rules_json: string }>(
    "SELECT rules_json FROM policy_rules WHERE tenant_id='tenant_synthetic_a'",
  )!.rules_json;
  prepareStandaloneFixtures(h.store);
  assert.equal(
    h.store.get<{ rules_json: string }>(
      "SELECT rules_json FROM policy_rules WHERE tenant_id='tenant_synthetic_a'",
    )!.rules_json,
    before,
  );
  h.store.run("DELETE FROM policy_rules WHERE tenant_id='tenant_synthetic_a'");
  prepareStandaloneFixtures(h.store);
  prepareStandaloneFixtures(h.store);
  assert.equal(
    h.store.get<{ n: number }>(
      "SELECT count(*) n FROM source_versions WHERE source_id='local-fixture-policy'",
    )!.n,
    1,
  );
  assert.equal(
    h.store.get<{ provenance: string }>(
      "SELECT provenance FROM source_versions WHERE source_id='local-fixture-policy'",
    )!.provenance,
    "FIXTURE",
  );
});

test("standalone HTTP review uses installed local runtime while replay remains scoped and read-only", async (t) => {
  const h = await setup();
  const m = models();
  const runtime = await standaloneReview(h.foundation, h.account, m);
  const c = await h.create(cancel, cancel, true, false);
  const server = createApi(h.foundation, "http://127.0.0.1", {
    gateway: runtime.gateway,
    investigator: runtime.investigator,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    runtime.close();
    h.store.close();
  });
  const port = (server.address() as { port: number }).port;
  const session = h.foundation.auth.session(runtime.token);
  const started = await fetch(`http://127.0.0.1:${port}/api/investigations`, {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1",
      cookie: "proofit_session=" + runtime.token,
      "x-csrf-token": session.csrfToken,
      "content-type": "application/json",
    },
    body: JSON.stringify({ proposalId: c.proposalId }),
  });
  assert.equal(started.status, 201);
  const run = (await started.json()) as { run: { id: string; status: string } };
  assert.equal(run.run.status, "COMPLETE");
  const replay = await fetch(
    `http://127.0.0.1:${port}/api/investigations/${run.run.id}`,
    { headers: { cookie: "proofit_session=" + runtime.token } },
  );
  assert.equal(replay.status, 200);
  assert.equal(m.calls(), 1);
  const customer = await fetch(
    `http://127.0.0.1:${port}/api/investigations/${run.run.id}`,
    { headers: { cookie: "proofit_session=" + h.tokens["customer.a"] } },
  );
  assert.equal(customer.status, 403);
});

import { mkdir, writeFile } from "node:fs/promises";
import { Store } from "../apps/backend/database.ts";
import { Foundation } from "../apps/backend/foundation.ts";
import { prepareSeed } from "../apps/backend/seed.ts";
import { prepareStandaloneFixtures } from "../apps/standalone/fixtures.ts";
import { standaloneReview } from "../apps/standalone/runtime.ts";
import {
  createNvidiaModel,
  createNvidiaProposer,
} from "../apps/investigator/nvidia-model.ts";
import { performance } from "node:perf_hooks";

// Real inference on synthetic local records, in an isolated ephemeral database. Never submits provider writes.
const started = performance.now();
let record: Record<string, unknown> = {
  probe: "standalone-review-v1",
  corpus: "SYNTHETIC_LOCAL_RECORDS",
  executionEnabled: false,
  providerAccess: "NOT_TESTED",
  cost: "UNREPORTED",
  measuredUsageComplete: false,
  status: "NOT_TESTED",
};
if (
  Number(process.versions.node.split(".")[0]) !== 24 ||
  !process.env.NVIDIA_API_KEY?.trim() ||
  !process.env.NVIDIA_MODEL_ID?.trim()
) {
  record.reason = "Node 24 and NVIDIA_API_KEY/NVIDIA_MODEL_ID are required";
  process.exitCode = 1;
} else {
  const store = new Store(":memory:");
  let runtime: Awaited<ReturnType<typeof standaloneReview>> | undefined;
  try {
    if (process.env.STRIPE_TEST_SECRET_KEY?.trim())
      throw new Error("Execution credentials are forbidden");
    store.migrate();
    const seed = await prepareSeed();
    seed.apply(store);
    prepareStandaloneFixtures(store);
    const foundation = new Foundation(store, () => new Date(), true);
    const support = seed.credentials.find(
      (a) => a.email === "support.a@proofit.test",
    )!;
    const customer = seed.credentials.find(
      (a) => a.email === "customer.a@proofit.test",
    )!;
    const login = await foundation.auth.login({
      email: customer.email,
      password: customer.password,
    });
    const request = foundation.createRequest(login.token, {
      text: "Cancel my next renewal. Keep my subscription active until the end of the paid period. I am not requesting a refund.",
    });
    foundation.confirm(login.token, {
      requestId: request.id,
      requestVersion: 1,
      action: {
        type: "CANCEL_AT_PERIOD_END",
        subscriptionId: "sub_fixture_a",
        timing: "PERIOD_END",
      },
    });
    runtime = await standaloneReview(
      foundation,
      { email: support.email, password: support.password },
      {
        model: createNvidiaModel(
          process.env.NVIDIA_API_KEY,
          process.env.NVIDIA_MODEL_ID,
        ),
        proposer: createNvidiaProposer(
          process.env.NVIDIA_API_KEY,
          process.env.NVIDIA_MODEL_ID,
        ),
      },
    );
    const result = (await runtime.pipeline.runNext(runtime.token)) as {
      status: string;
      run_id: string | null;
      validation_id: string | null;
      proposal_id: string | null;
    };
    const run = result.run_id
      ? runtime.investigator.get(runtime.token, result.run_id)
      : null;
    const validation = result.validation_id
      ? runtime.gateway.getValidation(runtime.token, result.validation_id)
      : null;
    const operationCount = store.get<{ n: number }>(
      "SELECT count(*) n FROM operations",
    )!.n;
    const usage = run
      ? store.get<{
          input_tokens: number | null;
          output_tokens: number | null;
          usage_complete: number;
          model_turns: number;
          tool_calls: number;
        }>(
          "SELECT input_tokens,output_tokens,usage_complete,model_turns,tool_calls FROM investigations WHERE id=?",
          run.run.id,
        )
      : null;
    const proposalUsage = result.proposal_id
      ? store.get<{ conversation: string }>(
          "SELECT conversation FROM proposals WHERE id=?",
          result.proposal_id,
        )
      : null;
    const evidenceCount = run
      ? store.get<{ n: number }>(
          "SELECT count(DISTINCT e.purpose) n FROM investigation_evidence i JOIN evidence_records e ON e.id=i.evidence_id WHERE i.run_id=?",
          run.run.id,
        )!.n
      : 0;
    const passed =
      run?.run.status === "COMPLETE" &&
      run.findings.length > 0 &&
      evidenceCount === 2 &&
      operationCount === 0 &&
      result.status === "REVIEW_REQUIRED";
    record = {
      ...record,
      status: passed ? "PASS" : "FAIL",
      modelId: process.env.NVIDIA_MODEL_ID,
      jobStatus: result.status,
      investigationStatus: run?.run.status ?? "NOT_STARTED",
      citedFindings: run?.findings.length ?? 0,
      evidencePurposesRead: evidenceCount,
      measuredUsageComplete: usage?.usage_complete === 1,
      investigatorUsage: usage,
      proposerUsage: proposalUsage
        ? (JSON.parse(proposalUsage.conversation) as { usage: unknown }).usage
        : null,
      heldChecks:
        validation?.checks
          .filter((c) => c.result !== "PASS")
          .map((c) => c.name) ?? [],
      operationCount,
    };
    if (!passed) process.exitCode = 1;
  } catch {
    record.status = "FAIL";
    record.reason =
      "Review probe stopped; raw errors withheld. Interrupted requests may have unreported usage.";
    process.exitCode = 1;
  } finally {
    runtime?.close();
    store.close();
  }
}
record.durationMs = Math.ceil(performance.now() - started);
record.checkedAt = new Date().toISOString();
await mkdir(".local", { recursive: true });
await writeFile(
  ".local/standalone-probe.json",
  JSON.stringify(record, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(record));

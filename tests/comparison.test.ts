import { parameterDigest } from "../packages/contracts/identity.ts";
import { receiptSchema } from "../packages/contracts/index.ts";
import { buildDevelopmentTrial } from "../fixtures/development-trials.ts";
import { developmentCases } from "../fixtures/development-cases.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { harness, cancel, refund } from "./gateway-helpers.ts";
import { compareCase } from "../apps/evaluation/comparison.ts";
const modelId = "controlled-comparison";
test("rules-only, one-shot and full review use the same gateway/corpus and measured persisted usage", async () => {
  const result = await compareCase("DEV-CONTROLLED", () =>
    buildDevelopmentTrial(developmentCases[0]!),
  );
  assert.equal(new Set(result.rows.map((r) => r.corpusDigest)).size, 1);
  assert.deepEqual(
    result.rows.map((r) => r.decision),
    ["READY", "READY", "READY"],
  );
  assert.deepEqual(
    result.rows.map((r) => r.modelTurns),
    [0, 1, 2],
  );
  assert.deepEqual(
    result.rows.map((r) => r.inputTokens),
    [0, 12, 24],
  );
  assert.equal(result.executionTested, false);
  assert.equal(result.acceptanceEvaluated, false);
});
test("comparison rejects different source cases rather than implying a fair benchmark", async () => {
  await assert.rejects(
    compareCase("CONTROLLED-MISMATCH", async (variant) => {
      const h = await harness();
      const c = await h.create(variant === "RULES_ONLY" ? cancel : refund);
      return {
        gateway: h.gateway,
        staffToken: h.tokens["support.a"]!,
        proposalId: c.proposalId,
        close: () => h.store.close(),
      };
    }),
    /corpus differs/,
  );
});

test("comparison rejects changes to exact refund authority even with the same source corpus", async () => {
  const spec = developmentCases[1]!;
  await assert.rejects(
    compareCase("AUTHORITY-DRIFT", (variant) =>
      buildDevelopmentTrial({ ...spec, approval: variant === "RULES_ONLY" }),
    ),
    /corpus differs/,
  );
});

test("comparison rejects a changed receipt identity even when its digest is internally consistent", async () => {
  await assert.rejects(
    compareCase("IDENTITY-DRIFT", async (variant) => {
      const trial = await buildDevelopmentTrial(developmentCases[0]!);
      if (variant !== "RULES_ONLY") {
        const actor = trial.gateway.auth.session(trial.staffToken).actor;
        const snapshot = trial.gateway.load(actor, trial.proposalId);
        const receipt = receiptSchema.parse(snapshot.receipt);
        const binding = {
          ...receipt.binding,
          customerId: "customer_synthetic_b",
        };
        trial.gateway.store.run(
          "UPDATE receipts SET binding_json=?,parameter_digest=? WHERE id=?",
          JSON.stringify(binding),
          parameterDigest(binding),
          receipt.receiptId,
        );
      }
      return trial;
    }),
    /corpus differs/,
  );
});

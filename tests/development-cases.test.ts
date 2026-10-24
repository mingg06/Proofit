import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { developmentCases } from "../fixtures/development-cases.ts";
import { buildDevelopmentTrial } from "../fixtures/development-trials.ts";
import { scenarios } from "../fixtures/development.ts";
import { compareCase } from "../apps/evaluation/comparison.ts";
test("development corpus preserves the four fixed scenarios and covers all twelve development families", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../evaluation/manifest.json", import.meta.url),
      "utf8",
    ),
  ) as {
    frozen: boolean;
    cases: { id: string; family: string; split: string }[];
  };
  assert.equal(developmentCases.length, 12);
  assert.equal(new Set(developmentCases.map((c) => c.id)).size, 12);
  assert.equal(manifest.frozen, false);
  for (const original of scenarios) {
    const authored = developmentCases.find((c) => c.id === original.id)!;
    assert.equal(authored.family, original.family);
    assert.deepEqual(authored.confirmed, original.confirmed);
    assert.deepEqual(authored.proposal, original.proposal);
  }
  for (const spec of developmentCases) {
    const slot = manifest.cases.find((c) => c.id === spec.id)!;
    assert.equal(slot.split, "DEVELOPMENT");
    assert.equal(slot.family, spec.family);
    assert.equal(spec.provenance, "FIXTURE");
  }
});
for (const spec of developmentCases)
  test(
    spec.id +
      " " +
      spec.family +
      " enforces the intended control in all three reviewers",
    async () => {
      const result = await compareCase(spec.id, () =>
        buildDevelopmentTrial(spec),
      );
      for (const row of result.rows) {
        assert.equal(row.decision, spec.expected, spec.id + " " + row.variant);
        const check = row.checks.find((c) => c.name === spec.requiredCheck);
        assert.equal(
          check?.result,
          spec.expected === "READY" ? "PASS" : spec.expected,
        );
        assert.equal(row.mode, "CONTROLLED_TEST");
        assert.equal(row.executionTested, false);
        if (spec.id === "DEV-03" || spec.id === "DEV-11")
          assert.equal(
            row.checks.find((c) => c.name === "business_policy")?.result,
            "PASS",
          );
        if (spec.expected === "BLOCK") {
          assert.equal(row.modelTurns, 0);
          assert.equal(row.toolCalls, 0);
        }
      }
      if (spec.mutation === "STALE_MEMORY") {
        const full = result.rows.find(
          (r) => r.variant === "FULL_INVESTIGATION",
        )!;
        assert.equal(
          "investigationStatus" in full ? full.investigationStatus : null,
          "EVIDENCE_CHANGED",
        );
        assert.ok(full.toolCalls > 0);
        assert.equal(full.modelTurns, 0);
      }
      assert.equal(result.acceptanceEvaluated, false);
    },
  );

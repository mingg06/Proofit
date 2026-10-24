import {
  receiptSchema,
  approvalSchema,
  evidenceSchema,
} from "../../packages/contracts/index.ts";
import { parameterDigest } from "../../packages/contracts/identity.ts";
import { manifestSchema } from "../../packages/contracts/gateway.ts";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Gateway, rulesVersion } from "../backend/gateway.ts";
import { Investigator } from "../investigator/runner.ts";
import type { InvestigationModel } from "../../packages/contracts/investigation.ts";
export type Variant = "RULES_ONLY" | "ONE_SHOT" | "FULL_INVESTIGATION";
export type Trial = {
  gateway: Gateway;
  staffToken: string;
  proposalId: string;
  model?: InvestigationModel;
  close(): void;
};
function corpus(trial: Trial) {
  const g = trial.gateway,
    actor = g.auth.session(trial.staffToken).actor,
    s = g.load(actor, trial.proposalId);
  const request = g.store.get<{ original_text: string }>(
    "SELECT original_text FROM requests WHERE tenant_id=? AND id=? AND version=?",
    s.request.tenant_id,
    s.request.id,
    s.request.version,
  );
  const manifest = manifestSchema.safeParse(s.manifest?.content);
  const receipt = receiptSchema.safeParse(s.receipt),
    approval = approvalSchema.safeParse(s.approval);
  const memories = g.store
    .all<{ record_json: string; policy_digest: string; expires_at: string }>(
      "SELECT record_json,policy_digest,expires_at FROM working_memories WHERE tenant_id=? AND request_id=? AND request_version=? AND mode=? ORDER BY created_at,id",
      s.request.tenant_id,
      s.request.id,
      s.request.version,
      g.mode,
    )
    .map((row) => {
      const raw = JSON.parse(row.record_json) as {
        content: { unresolved: string[]; evidenceIds: string[] };
      };
      return {
        unresolved: raw.content.unresolved,
        policyDigest: row.policy_digest,
        expiresAt: row.expires_at,
        pointers: raw.content.evidenceIds
          .map((id) => {
            const saved = g.store.get<{ record_json: string }>(
              "SELECT record_json FROM evidence_records WHERE tenant_id=? AND request_id=? AND request_version=? AND id=?",
              s.request.tenant_id,
              s.request.id,
              s.request.version,
              id,
            );
            const parsed = evidenceSchema.safeParse(
              saved ? JSON.parse(saved.record_json) : null,
            );
            return parsed.success
              ? {
                  reference: parsed.data.reference,
                  excerpt: parsed.data.excerpt,
                }
              : null;
          })
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      };
    });
  return createHash("sha256")
    .update(
      JSON.stringify({
        request: request?.original_text,
        proposal: s.proposal,
        action: receipt.success ? receipt.data.binding.action : null,
        authority: {
          tenantId: s.request.tenant_id,
          customerId: s.request.customer_id,
          actorId: s.request.actor_id,
          requestVersion: s.request.version,
          latestVersion: s.latestVersion,
          confirmingActor: s.confirmingActor
            ? {
                id: s.confirmingActor.id,
                role: s.confirmingActor.role,
                active: s.confirmingActor.active,
                tenantId: s.confirmingActor.tenant_id,
                customerId: s.confirmingActor.customer_id,
              }
            : null,
          approvingActor: s.approvingActor
            ? {
                id: s.approvingActor.id,
                role: s.approvingActor.role,
                active: s.approvingActor.active,
                tenantId: s.approvingActor.tenant_id,
              }
            : null,
          receipt: receipt.success
            ? {
                policyVersion: receipt.data.binding.policyVersion,
                tenantId: receipt.data.binding.tenantId,
                actorId: receipt.data.binding.actorId,
                customerId: receipt.data.binding.customerId,
                requestVersion: receipt.data.binding.requestVersion,
                requestMatches: receipt.data.binding.requestId === s.request.id,
                createdAt: receipt.data.createdAt,
                expiresAt: receipt.data.expiresAt,
                consumed: receipt.data.consumedByOperationId !== null,
                integrity:
                  parameterDigest(receipt.data.binding) ===
                  receipt.data.parameterDigest,
                timeValid:
                  Date.parse(receipt.data.createdAt) <= g.now().getTime() &&
                  Date.parse(receipt.data.expiresAt) > g.now().getTime(),
              }
            : null,
          approval: approval.success
            ? {
                role: approval.data.approverRole,
                createdAt: approval.data.createdAt,
                expiresAt: approval.data.expiresAt,
                consumed: approval.data.consumedByOperationId !== null,
                bindingMatches:
                  receipt.success &&
                  approval.data.bindingDigest === receipt.data.parameterDigest,
                receiptMatches:
                  receipt.success &&
                  approval.data.receiptId === receipt.data.receiptId,
              }
            : null,
          resource: s.resource,
          mode: g.mode,
        },
        memories,
        policy: s.policy,
        rules: s.rules,
        evidence: s.manifest?.evidence
          .map((e) => {
            const record = evidenceSchema.safeParse(e.record);
            return {
              purpose: e.purpose,
              record: record.success ? record.data.excerpt : null,
              reference: record.success ? record.data.reference : null,
              approved: e.approved,
              provenance: e.provenance,
            };
          })
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
        manifest: manifest.success
          ? {
              unresolved: manifest.data.unresolved,
              conflicts: manifest.data.conflicts,
            }
          : null,
      }),
    )
    .digest("hex");
}
/** Review-only comparison. Each factory call must supply an isolated copy of the same frozen case. */
export async function compareCase(
  caseId: string,
  factory: (variant: Variant) => Promise<Trial>,
) {
  let expectedCorpus: string | undefined;
  let expectedProvider: string | undefined;
  const rows = [];
  for (const variant of [
    "RULES_ONLY",
    "ONE_SHOT",
    "FULL_INVESTIGATION",
  ] as const) {
    const trial = await factory(variant);
    try {
      const digest = corpus(trial);
      if (expectedCorpus && expectedCorpus !== digest)
        throw new Error("Comparison corpus differs between variants");
      expectedCorpus = digest;
      if (
        trial.gateway.store.get<{ n: number }>(
          "SELECT count(*) AS n FROM investigations WHERE proposal_id=?",
          trial.proposalId,
        )?.n ||
        trial.gateway.store.get<{ n: number }>(
          "SELECT count(*) AS n FROM operations",
        )?.n
      )
        throw new Error("Comparison requires an isolated clean trial");
      const started = performance.now();
      if (variant === "RULES_ONLY") {
        const v = await trial.gateway.validate(trial.staffToken, {
          proposalId: trial.proposalId,
        });
        rows.push({
          caseId,
          variant,
          corpusDigest: digest,
          controlsVersion: rulesVersion,
          mode: trial.gateway.mode,
          decision: v.decision,
          checks: v.checks,
          validationId: v.validationId,
          latencyMs: Math.ceil(performance.now() - started),
          modelTurns: 0,
          toolCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          usageComplete: true,
          executionTested: false,
          knownCost: null,
        });
      } else {
        const investigator = new Investigator(trial.gateway, {
          ...(trial.model ? { model: trial.model } : {}),
          memory: variant === "FULL_INVESTIGATION",
          preloadEvidence: variant === "ONE_SHOT",
          ...(variant === "ONE_SHOT" ? { limits: { modelTurns: 1 } } : {}),
        });
        const result = await investigator.start(trial.staffToken, {
          proposalId: trial.proposalId,
        });
        const run = trial.gateway.store.get<{
          model_turns: number;
          tool_calls: number;
          input_tokens: number | null;
          output_tokens: number | null;
          usage_complete: number;
        }>("SELECT * FROM investigations WHERE id=?", result.run.id)!;
        rows.push({
          caseId,
          variant,
          corpusDigest: digest,
          controlsVersion: rulesVersion,
          mode: trial.gateway.mode,
          decision: result.validation.decision,
          checks: result.validation.checks,
          validationId: result.validation.validationId,
          runId: result.run.id,
          investigationStatus: result.run.status,
          latencyMs: Math.ceil(performance.now() - started),
          modelTurns: run.model_turns,
          toolCalls: run.tool_calls,
          inputTokens: run.input_tokens,
          outputTokens: run.output_tokens,
          usageComplete: run.usage_complete === 1,
          executionTested: false,
          knownCost: null,
        });
      }
      const latest = rows.at(-1)!;
      const stored = trial.gateway.store.get<{
        provider_state_json: string | null;
      }>(
        "SELECT provider_state_json FROM validations WHERE id=?",
        latest.validationId,
      );
      let provider: Record<string, unknown> | null = null;
      try {
        provider = JSON.parse(stored?.provider_state_json ?? "null");
      } catch {}
      if (provider) delete provider.observedAt;
      const providerDigest = createHash("sha256")
        .update(JSON.stringify(provider))
        .digest("hex");
      if (expectedProvider && expectedProvider !== providerDigest)
        throw new Error("Observed provider snapshot differs between variants");
      expectedProvider = providerDigest;
    } finally {
      trial.close();
    }
  }
  return {
    caseId,
    rows,
    acceptanceEvaluated: false,
    executionTested: false,
    limitations: [
      "No provider execution in this comparison.",
      "Independent labels, frozen held-out cases and genuine integration results are still required.",
      "No benefit or cost saving is inferred from controlled model results.",
    ],
  };
}

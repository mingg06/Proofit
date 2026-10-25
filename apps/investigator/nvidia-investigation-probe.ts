import { performance } from "node:perf_hooks";
import { z } from "zod";
import {
  investigatorInstructions,
  modelStepSchema,
  measuredUsageSchema,
  type InvestigationModel,
} from "../../packages/contracts/investigation.ts";
import { nvidiaTransportVersion } from "./nvidia-model.ts";

// Synthetic compatibility exercise only. This is not retrieved evidence or a business investigation.
export async function probeNvidiaInvestigation(model: InvestigationModel) {
  const started = performance.now();
  const base = {
    service: "nvidia",
    probeVersion: "nvidia-investigation-probe-v1",
    transportVersion: nvidiaTransportVersion,
    modelId: model.modelId,
    provenance: model.provenance,
    corpus: "SYNTHETIC_COMPATIBILITY",
    eveCompatibility: "NOT_TESTED",
    nativeToolCalling: "NOT_TESTED",
    executionEnabled: false,
  };
  let inputTokens = 0,
    outputTokens = 0,
    completedTurns = 0;
  const signal = AbortSignal.timeout(30000);
  const next = async (history: unknown[]) => {
    const result = await model.next(
      {
        runId: "synthetic-compatibility-only",
        system: investigatorInstructions,
        context: {
          task: "First request exactly one read_request_receipt lookup. After receiving its result, return FINAL with no findings and at least one unresolved issue describing the missing approved policy and payment evidence. Do not invent citations.",
          provenance: "SYNTHETIC_COMPATIBILITY",
          proposedAction: "CANCEL_AT_PERIOD_END",
        },
        outputSchema: z.toJSONSchema(modelStepSchema),
        history,
      },
      signal,
    );
    const usage = measuredUsageSchema.parse(result.usage);
    if (usage.modelId !== model.modelId) throw new Error("Model mismatch");
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    completedTurns++;
    return modelStepSchema.parse(result.output);
  };
  try {
    const first = await next([]);
    if (
      first.type !== "LOOKUP" ||
      first.calls.length !== 1 ||
      first.calls[0]!.tool !== "read_request_receipt"
    )
      throw new Error("Lookup shape failed");
    const second = await next([
      {
        call: first.calls[0],
        result: {
          provenance: "SYNTHETIC_COMPATIBILITY",
          receipt: null,
          requestEvidence: [],
          unresolved: ["Approved policy and payment evidence are unavailable."],
        },
      },
    ]);
    if (
      second.type !== "FINAL" ||
      second.findings.length !== 0 ||
      second.unresolved.length === 0
    )
      throw new Error("Review hold failed");
    return {
      ...base,
      liveAccess:
        model.provenance === "LIVE"
          ? "STRUCTURED_LOOKUP_VERIFIED"
          : "CONTROLLED_TEST_PASS",
      latencyMs: Math.ceil(performance.now() - started),
      completedTurns,
      usage: { inputTokens, outputTokens },
      usageComplete: true,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      ...base,
      liveAccess: "FAILED",
      latencyMs: Math.ceil(performance.now() - started),
      completedTurns,
      usage: { inputTokens, outputTokens },
      usageComplete: false,
      checkedAt: new Date().toISOString(),
      reason:
        "Structured lookup/final compatibility failed. Usage covers accepted responses only; additional provider usage/cost may be unknown. Raw provider output and errors are withheld.",
    };
  }
}

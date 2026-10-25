import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { z } from "zod";
import {
  investigatorInstructions,
  modelStepSchema,
  measuredUsageSchema,
  type InvestigationModel,
} from "../../packages/contracts/investigation.ts";

export const eveBridgeVersion = "proofit-eve-bridge-v1";
export const eveInputSchema = z.strictObject({
  runId: z.string().min(1).max(200),
  context: z.unknown(),
  history: z.array(z.unknown()).max(20),
});

/** A fresh adapter per eve step: one transport attempt, no native tools or extra model loop. */
export function eveProvider(source: InvestigationModel): LanguageModelV4 {
  let used = false;
  const generate = async (options: LanguageModelV4CallOptions) => {
    if (used) throw new Error("eve model step already attempted");
    used = true;
    try {
      if (
        options.tools?.length ||
        options.prompt.some((p) => p.role === "assistant" || p.role === "tool")
      )
        throw new Error("Unexpected capabilities or history");
      const users = options.prompt.filter((p) => p.role === "user");
      if (users.length !== 1) throw new Error("One scoped input required");
      const parts = users[0]!.content;
      if (parts.length !== 1 || parts[0]!.type !== "text")
        throw new Error("Text input required");
      const input = eveInputSchema.parse(JSON.parse(parts[0]!.text));
      const signal = AbortSignal.any([
        options.abortSignal ?? new AbortController().signal,
        AbortSignal.timeout(15000),
      ]);
      const result = await source.next(
        {
          ...input,
          system: investigatorInstructions,
          outputSchema: z.toJSONSchema(modelStepSchema),
        },
        signal,
      );
      signal.throwIfAborted();
      const output = modelStepSchema.parse(result.output),
        measured = measuredUsageSchema.parse(result.usage);
      if (measured.modelId !== source.modelId)
        throw new Error("Model mismatch");
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: {
            total: measured.inputTokens,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: measured.outputTokens,
            text: undefined,
            reasoning: undefined,
          },
        },
        warnings: [],
        response: { modelId: source.modelId },
      };
    } catch {
      throw new Error("eve NVIDIA step failed; no valid result accepted");
    }
  };
  return {
    specificationVersion: "v4",
    provider: "proofit-nvidia",
    modelId: source.modelId,
    supportedUrls: {},
    doGenerate: generate,
    async doStream(options) {
      const result = await generate(options);
      const parts: LanguageModelV4StreamPart[] = [
        { type: "stream-start", warnings: [] },
        { type: "response-metadata", modelId: source.modelId },
        { type: "text-start", id: "result" },
        { type: "text-delta", id: "result", delta: result.content[0]!.text },
        { type: "text-end", id: "result" },
        {
          type: "finish",
          finishReason: result.finishReason,
          usage: result.usage,
        },
      ];
      return {
        stream: new ReadableStream({
          start(controller) {
            for (const part of parts) controller.enqueue(part);
            controller.close();
          },
        }),
      };
    },
  };
}

import { Client } from "eve/client";
import { z } from "zod";
import {
  modelStepSchema,
  measuredUsageSchema,
  type InvestigationModel,
} from "../../packages/contracts/investigation.ts";
import { eveBridgeVersion } from "../investigator/eve-provider.ts";

/** Private loopback service only. Each model turn starts a fresh, isolated eve session. */
function model(
  origin: string,
  secret: string,
  modelId: string,
  provenance: "LIVE" | "CONTROLLED_TEST",
): InvestigationModel {
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    secret.length < 32 ||
    /[\r\n]/.test(secret) ||
    !modelId.trim()
  )
    throw new Error("Invalid isolated eve configuration");
  const client = new Client({
    host: origin,
    auth: { bearer: secret },
    redirect: "error",
  });
  return {
    modelId,
    provenance,
    async next(input, parentSignal) {
      const signal = AbortSignal.any([
        parentSignal,
        AbortSignal.timeout(15000),
      ]);
      let cancel: (() => Promise<unknown>) | undefined;
      try {
        const message = JSON.stringify({
          runId: input.runId,
          context: input.context,
          history: input.history,
        });
        if (Buffer.byteLength(message) > 524288)
          throw new Error("Oversized input");
        const { session, response } = await client.sessions.create({
          message,
          signal,
          streamReconnectPolicy: { reconnect: false },
        });
        cancel = () => session.cancel({ signal: AbortSignal.timeout(1000) });
        let text = "",
          started = 0,
          completed = 0,
          bytes = 0,
          events = 0,
          settled = false;
        let usage: unknown;
        for await (const event of response) {
          signal.throwIfAborted();
          bytes += Buffer.byteLength(JSON.stringify(event));
          if (++events > 150 || bytes > 131072)
            throw new Error("Oversized stream");
          if (event.type === "step.started") {
            if (
              ++started !== 1 ||
              event.data.stepIndex !== 0 ||
              event.data.modelId !== "proofit-nvidia/" + modelId
            )
              throw new Error("Unexpected model step");
          } else if (event.type === "step.completed") {
            if (
              started !== 1 ||
              ++completed !== 1 ||
              event.data.finishReason !== "stop"
            )
              throw new Error("Incomplete step");
            usage = event.data.usage;
          } else if (event.type === "message.completed") {
            if (text || event.data.finishReason !== "stop")
              throw new Error("Unexpected message");
            text = event.data.message;
          } else if (event.type === "turn.completed") settled = true;
          else if (
            [
              "actions.requested",
              "action.input.appended",
              "input.requested",
              "turn.failed",
              "turn.cancelled",
              "session.failed",
              "step.failed",
              "compaction.requested",
              "turn.waiting",
            ].includes(event.type)
          )
            throw new Error("Unexpected runtime activity");
        }
        if (!settled || completed !== 1) throw new Error("Incomplete result");
        const tokens = z
          .object({
            inputTokens: z.number().int().nonnegative().safe(),
            outputTokens: z.number().int().nonnegative().safe(),
          })
          .parse(usage);
        return {
          output: modelStepSchema.parse(JSON.parse(text)),
          usage: measuredUsageSchema.parse({
            modelId,
            ...tokens,
            runtime: {
              name: "eve",
              version: "0.83.2",
              bridgeVersion: eveBridgeVersion,
              sessionId: session.state.sessionId,
            },
          }),
        };
      } catch {
        if (cancel) await cancel().catch(() => {});
        throw new Error(
          "eve investigation failed; no valid measured result accepted",
        );
      }
    },
  };
}
export function createEveInvestigationModel(
  origin: string,
  secret: string,
  modelId: string,
): InvestigationModel {
  return model(origin, secret, modelId, "LIVE");
}
/** Code-injected controlled service scaffolding, never selected by public configuration. */
export function controlledEveInvestigationModel(
  origin: string,
  secret: string,
  modelId: string,
): InvestigationModel {
  return model(origin, secret, modelId, "CONTROLLED_TEST");
}

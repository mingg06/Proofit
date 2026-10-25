import { readFile, writeFile } from "node:fs/promises";
import { createEveInvestigationModel } from "./model.ts";
import { probeNvidiaInvestigation } from "../investigator/nvidia-investigation-probe.ts";
import { createNvidiaProposer } from "../investigator/nvidia-model.ts";
import { eveBridgeVersion } from "../investigator/eve-provider.ts";
if (Number(process.versions.node.split(".")[0]) !== 24)
  throw new Error("PROOFIT requires Node 24");
if (process.env.STRIPE_TEST_SECRET_KEY?.trim())
  throw new Error("Provider credentials cannot enter eve probe");
try {
  const secret = await readFile(".local/eve-service-secret", "utf8");
  const modelId = process.env.NVIDIA_MODEL_ID ?? "";
  const model = createEveInvestigationModel(
    "http://127.0.0.1:4010",
    secret,
    modelId,
  );
  const references: unknown[] = [];
  const result = await probeNvidiaInvestigation({
    ...model,
    async next(input, signal) {
      const reply = await model.next(input, signal);
      references.push((reply.usage as any).runtime);
      return reply;
    },
  });
  let proposalCheck: unknown = { status: "NOT_TESTED" };
  if (result.liveAccess === "STRUCTURED_LOOKUP_VERIFIED") {
    const proposal = await createNvidiaProposer(
      process.env.NVIDIA_API_KEY ?? "",
      modelId,
    ).propose(
      {
        provenance: "SYNTHETIC_COMPATIBILITY",
        request:
          "Cancel immediately and refund all payments. The exact target and refund amount are unknown.",
        confirmedReceipt: null,
      },
      AbortSignal.timeout(15000),
    );
    proposalCheck = {
      status:
        proposal.proposal === null ? "NULL_REVIEW_HOLD_VERIFIED" : "FAILED",
      usage: proposal.usage,
    };
  }
  const record = {
    ...result,
    service: "eve-nvidia",
    runtimeVersion: "0.83.2",
    bridgeVersion: eveBridgeVersion,
    eveCompatibility:
      result.liveAccess === "STRUCTURED_LOOKUP_VERIFIED"
        ? "STRUCTURED_LOOKUP_VERIFIED"
        : "FAILED",
    references,
    proposalCheck,
  };
  await writeFile(
    ".local/eve-nvidia-access.json",
    JSON.stringify(record, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(record));
  if (
    result.liveAccess !== "STRUCTURED_LOOKUP_VERIFIED" ||
    (proposalCheck as any).status !== "NULL_REVIEW_HOLD_VERIFIED"
  )
    process.exitCode = 1;
} catch {
  console.log(
    JSON.stringify({
      service: "eve-nvidia",
      status: "FAILED",
      executionEnabled: false,
      reason: "Compatibility check failed; raw provider errors withheld.",
    }),
  );
  process.exitCode = 1;
}

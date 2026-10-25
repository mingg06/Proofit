import { assembleRuntime, type RuntimePorts } from "../worker/assemble.ts";
import { createNvidiaProposer } from "../investigator/nvidia-model.ts";
import { createEveInvestigationModel } from "./model.ts";

/** Installation wiring only: retrieval and authoritative provider reads must be supplied separately. */
export function assembleEveRuntime(
  ports: Pick<RuntimePorts, "retrieval" | "providerReader">,
  account: { email: string; password: string },
  settings: {
    origin: string;
    serviceSecret: string;
    nvidiaKey: string;
    modelId: string;
  },
) {
  return assembleRuntime(
    {
      model: createEveInvestigationModel(
        settings.origin,
        settings.serviceSecret,
        settings.modelId,
      ),
      proposer: createNvidiaProposer(settings.nvidiaKey, settings.modelId),
      retrieval: ports.retrieval,
      providerReader: ports.providerReader,
    },
    account,
  );
}

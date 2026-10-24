import type { ProviderReader } from "../backend/gateway.ts";
import type {
  ProposingModel,
  ExecutionService,
} from "../backend/review-pipeline.ts";
import type { InvestigationModel } from "../../packages/contracts/investigation.ts";
import type { EvidenceRetrieval } from "../investigator/retrieval.ts";
import type { RuntimeFactory } from "./runtime.ts";
export type RuntimePorts = {
  model: InvestigationModel;
  proposer: ProposingModel;
  retrieval: EvidenceRetrieval;
  providerReader: ProviderReader;
  execution?: ExecutionService;
};
/** Compose already-verified ports. This helper neither proves access nor enables provider routes. */
export function assembleRuntime(
  ports: RuntimePorts,
  account: { email: string; password: string },
): RuntimeFactory {
  return async ({ foundation }) => {
    const session = await foundation.auth.login({
      email: account.email,
      password: account.password,
    });
    const actor = foundation.auth.session(session.token).actor;
    if (actor.role !== "SUPPORT") {
      foundation.auth.logout(session.token);
      throw new Error(
        "Automatic investigation requires a dedicated support service account",
      );
    }
    // Credentials remain in the server closure; models receive only their scoped investigation context.
    return {
      staffToken: session.token,
      model: ports.model,
      proposer: ports.proposer,
      retrieval: ports.retrieval,
      providerReader: ports.providerReader,
      ...(ports.execution ? { execution: ports.execution } : {}),
    };
  };
}

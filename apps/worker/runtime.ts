import type { Foundation } from "../backend/foundation.ts";
import type { ProviderReader } from "../backend/gateway.ts";
import type {
  ProposingModel,
  ExecutionService,
} from "../backend/review-pipeline.ts";
import type { InvestigationModel } from "../../packages/contracts/investigation.ts";
import type { EvidenceRetrieval } from "../investigator/retrieval.ts";
/** Optional installation module for verified model, evidence and provider ports; no sponsor runtime is mandatory. */
export interface VerifiedRuntime {
  staffToken: string;
  model: InvestigationModel;
  proposer: ProposingModel;
  retrieval: EvidenceRetrieval;
  providerReader: ProviderReader;
  execution?: ExecutionService;
}
export type RuntimeFactory = (context: {
  foundation: Foundation;
}) => Promise<VerifiedRuntime>;

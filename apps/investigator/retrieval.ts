import type { EvidenceTools } from './tools.ts';
/** Read-only application port. Installing an external transport never grants authority. */
export interface EvidenceRetrieval {
 refresh(tools:EvidenceTools,signal:AbortSignal):Promise<void>;
}

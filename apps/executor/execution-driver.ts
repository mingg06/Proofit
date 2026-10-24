import type { Action } from "../../packages/contracts/index.ts";
import type { OperationRow } from "../backend/operations.ts";
export type ClassifiedObservation = {
  observation:
    | ({ providerObjectId: string; observedAt: string } & Record<
        string,
        unknown
      >)
    | null;
  verified: boolean;
  terminal: boolean;
  next: "SUCCEEDED" | "FAILED" | "CANCELED" | "PENDING" | "OUTCOME_UNKNOWN";
};
export interface ExecutionDriver {
  readonly actionType: Action["type"];
  read(
    input: { tenantId: string; customerId: string; action: Action },
    signal: AbortSignal,
  ): Promise<unknown>;
  submit(
    row: OperationRow,
    signal: AbortSignal,
  ): Promise<{ providerObjectId: string; providerRequestId: string | null }>;
  observe(row: OperationRow, signal: AbortSignal): Promise<unknown>;
  classify(
    row: OperationRow,
    raw: unknown,
    previous: unknown,
    now: Date,
  ): ClassifiedObservation;
}

import { refundObservationSchema } from "../../packages/contracts/refund.ts";
import type { Action } from "../../packages/contracts/index.ts";
import {
  operationRecord,
  type OperationRow,
  OperationLedger,
} from "../backend/operations.ts";
import { ActionExecutor } from "./execution.ts";
export type RefundTarget = {
  tenantId: string;
  customerId: string;
  paymentId: string;
  amountMinor: number;
  currency: "MYR";
  operationId: string;
};
export interface RefundProvider {
  read(
    input: { tenantId: string; customerId: string; action: Action },
    signal: AbortSignal,
  ): Promise<unknown>;
  submitRefund(
    input: RefundTarget & { idempotencyKey: string },
    signal: AbortSignal,
  ): Promise<{ providerObjectId: string; providerRequestId: string | null }>;
  observeRefund(
    input: RefundTarget & { providerObjectId: string | null },
    signal: AbortSignal,
  ): Promise<unknown>;
}
function target(row: OperationRow): RefundTarget {
  const action = operationRecord(row).action;
  if (action.type !== "REFUND_PAYMENT")
    throw new Error("Refund operation required");
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    paymentId: action.paymentId,
    amountMinor: action.amountMinor,
    currency: action.currency,
    operationId: row.id,
  };
}
export class RefundExecutor extends ActionExecutor {
  constructor(
    ledger: OperationLedger,
    provider: RefundProvider,
    options: { timeoutMs?: number } = {},
  ) {
    super(
      ledger,
      {
        actionType: "REFUND_PAYMENT",
        read: (input, signal) => provider.read(input, signal),
        submit: (row, signal) =>
          provider.submitRefund(
            { ...target(row), idempotencyKey: row.provider_key },
            signal,
          ),
        observe: (row, signal) =>
          provider.observeRefund(
            { ...target(row), providerObjectId: row.provider_object_id },
            signal,
          ),
        classify(row, raw, old, now) {
          const parsed = refundObservationSchema.safeParse(raw),
            previous = refundObservationSchema.safeParse(old),
            t = target(row);
          const valid =
            parsed.success &&
            parsed.data.tenantId === row.tenant_id &&
            parsed.data.customerId === row.customer_id &&
            parsed.data.targetId === t.paymentId &&
            parsed.data.operationId === row.id &&
            parsed.data.amountMinor === t.amountMinor &&
            parsed.data.currency === t.currency &&
            (!row.provider_object_id ||
              parsed.data.providerObjectId === row.provider_object_id) &&
            parsed.data.provenance ===
              (row.mode === "CONTROLLED_TEST" ? "CONTROLLED_TEST" : "LIVE") &&
            Date.parse(parsed.data.observedAt) <= now.getTime() &&
            now.getTime() - Date.parse(parsed.data.observedAt) <= 5000 &&
            (!previous.success ||
              (parsed.data.providerObjectId ===
                previous.data.providerObjectId &&
                Date.parse(parsed.data.observedAt) >=
                  Date.parse(previous.data.observedAt)));
          const status = valid ? parsed.data.status : "UNKNOWN";
          const verified = status === "SUCCEEDED";
          return {
            observation: valid ? parsed.data : null,
            verified,
            terminal: ["SUCCEEDED", "FAILED", "CANCELED"].includes(status),
            next: status === "UNKNOWN" ? "OUTCOME_UNKNOWN" : status,
          };
        },
      },
      options,
    );
  }
}

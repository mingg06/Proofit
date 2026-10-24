import { cancellationObservationSchema } from "../../packages/contracts/cancellation.ts";
import {
  operationRecord,
  type OperationRow,
  OperationLedger,
} from "../backend/operations.ts";
import { ActionExecutor } from "./execution.ts";
import type { CancellationProvider } from "./cancellation-provider.ts";
function target(row: OperationRow) {
  const action = operationRecord(row).action;
  if (action.type !== "CANCEL_AT_PERIOD_END")
    throw new Error("Cancellation operation required");
  return {
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    subscriptionId: action.subscriptionId,
  };
}
export class CancellationExecutor extends ActionExecutor {
  constructor(
    ledger: OperationLedger,
    provider: CancellationProvider,
    options: { timeoutMs?: number } = {},
  ) {
    super(
      ledger,
      {
        actionType: "CANCEL_AT_PERIOD_END",
        read: (input, signal) => provider.read(input, signal),
        submit: async (row, signal) => {
          const t = target(row);
          const ack = await provider.submitCancellation(
            { ...t, idempotencyKey: row.provider_key },
            signal,
          );
          if (ack.providerObjectId !== t.subscriptionId)
            throw new Error("Provider object mismatch");
          return ack;
        },
        observe: (row, signal) =>
          provider.observeCancellation(target(row), signal),
        classify(row, raw, old, now) {
          const parsed = cancellationObservationSchema.safeParse(raw),
            previous = cancellationObservationSchema.safeParse(old),
            t = target(row);
          const valid =
            parsed.success &&
            parsed.data.tenantId === row.tenant_id &&
            parsed.data.customerId === row.customer_id &&
            parsed.data.targetId === t.subscriptionId &&
            parsed.data.providerObjectId === t.subscriptionId &&
            parsed.data.provenance ===
              (row.mode === "CONTROLLED_TEST" ? "CONTROLLED_TEST" : "LIVE") &&
            Date.parse(parsed.data.observedAt) <= now.getTime() &&
            now.getTime() - Date.parse(parsed.data.observedAt) <= 5000 &&
            (!previous.success ||
              Date.parse(parsed.data.observedAt) >=
                Date.parse(previous.data.observedAt));
          const verified = !!(
            valid &&
            parsed.data.status === "SCHEDULED" &&
            parsed.data.periodEnd !== null &&
            Date.parse(parsed.data.periodEnd) > now.getTime()
          );
          return {
            observation: valid ? parsed.data : null,
            verified,
            terminal: verified,
            next: verified
              ? "SUCCEEDED"
              : valid && parsed.data.status === "NOT_SCHEDULED"
                ? "PENDING"
                : "OUTCOME_UNKNOWN",
          };
        },
      },
      options,
    );
  }
}

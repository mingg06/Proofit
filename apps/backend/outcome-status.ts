import { refundObservationSchema } from "../../packages/contracts/refund.ts";
import type { Store } from "./database.ts";
import type { OperationRow } from "./operations.ts";
import { cancellationObservationSchema } from "../../packages/contracts/cancellation.ts";
export function outcomeStatus(store: Store, row: OperationRow) {
  const raw = store.get<{ record_json: string }>(
    "SELECT record_json FROM outcome_observations WHERE tenant_id=? AND operation_id=? ORDER BY sequence DESC LIMIT 1",
    row.tenant_id,
    row.id,
  );
  let value: unknown = null;
  try {
    value = raw ? JSON.parse(raw.record_json) : null;
  } catch {}
  let storedAction: unknown;
  try {
    storedAction = JSON.parse(row.action_json);
  } catch {}
  const refundAction = storedAction as {
    type?: string;
    paymentId?: string;
    amountMinor?: number;
    currency?: string;
  } | null;
  if (refundAction?.type === "REFUND_PAYMENT") {
    const parsed = refundObservationSchema.safeParse(value);
    const observation =
      parsed.success &&
      parsed.data.tenantId === row.tenant_id &&
      parsed.data.customerId === row.customer_id &&
      parsed.data.targetId === refundAction.paymentId &&
      parsed.data.operationId === row.id &&
      parsed.data.amountMinor === refundAction.amountMinor &&
      parsed.data.currency === refundAction.currency &&
      parsed.data.providerObjectId === row.provider_object_id &&
      parsed.data.provenance ===
        (row.mode === "CONTROLLED_TEST" ? "CONTROLLED_TEST" : "LIVE")
        ? parsed.data
        : null;
    const verified =
      row.state === "SUCCEEDED" &&
      row.effect_verified === 1 &&
      observation?.status === "SUCCEEDED";
    const statusText = verified
      ? "The provider recorded the exact refund as succeeded. This does not verify receipt by the customer’s bank."
      : observation?.status === "PENDING"
        ? "The provider recorded the refund as pending. Completion has not been verified."
        : observation?.status === "FAILED"
          ? "The provider recorded the refund as failed. No successful refund is verified."
          : observation?.status === "CANCELED"
            ? "The provider recorded the refund as canceled. No successful refund is verified."
            : row.state === "RESERVED"
              ? "The refund is reserved. No provider outcome has been observed."
              : "We are checking the refund status. No completed refund is verified.";
    return { statusText, effectVerified: !!verified, observation };
  }
  const parsed = cancellationObservationSchema.safeParse(value);
  let action: unknown;
  try {
    action = JSON.parse(row.action_json);
  } catch {}
  const target =
    (action as { type?: string; subscriptionId?: string } | null)?.type ===
    "CANCEL_AT_PERIOD_END"
      ? (action as { subscriptionId: string }).subscriptionId
      : null;
  const observation =
    parsed.success &&
    parsed.data.tenantId === row.tenant_id &&
    parsed.data.customerId === row.customer_id &&
    parsed.data.targetId === target &&
    parsed.data.providerObjectId === target &&
    (row.mode === "CONTROLLED_TEST"
      ? parsed.data.provenance === "CONTROLLED_TEST"
      : parsed.data.provenance === "LIVE")
      ? parsed.data
      : null;
  const verified =
    row.state === "SUCCEEDED" &&
    row.effect_verified === 1 &&
    observation?.status === "SCHEDULED" &&
    observation.periodEnd !== null &&
    Date.parse(observation.periodEnd) > Date.parse(observation.observedAt);
  const statusText = verified
    ? "The provider recorded renewal cancellation scheduled for the recorded period end."
    : row.state === "RESERVED"
      ? "The action is reserved. No provider outcome has been observed."
      : row.state === "SUBMITTED"
        ? "Submission was started. The provider outcome has not been verified."
        : row.state === "PENDING"
          ? "The provider outcome is pending verification."
          : row.state === "FAILED"
            ? "The operation is recorded as failed; no successful effect is verified."
            : row.state === "CANCELED"
              ? "The operation is recorded as canceled; no successful effect is verified."
              : "We are checking the request status.";
  return { statusText, effectVerified: !!verified, observation };
}

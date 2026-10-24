import { z } from "zod";
import { id, timestamp } from "./index.ts";
export const refundObservationSchema = z.strictObject({
  tenantId: id,
  customerId: id,
  targetId: id,
  operationId: id,
  providerObjectId: id,
  environment: z.literal("TEST"),
  provenance: z.enum(["LIVE", "CONTROLLED_TEST"]),
  observedAt: timestamp,
  amountMinor: z.number().int().positive().safe(),
  currency: z.literal("MYR"),
  status: z.enum(["SUCCEEDED", "PENDING", "FAILED", "CANCELED", "UNKNOWN"]),
  providerRequestId: id.nullable(),
  adapterVersion: id,
});
export type RefundObservation = z.infer<typeof refundObservationSchema>;

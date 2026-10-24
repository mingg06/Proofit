import { z } from 'zod';
import { id, minorUnits, timestamp } from './index.ts';
export const validateInputSchema = z.strictObject({ proposalId: id });
export const policyRulesSchema = z.strictObject({ allowCancellation: z.boolean(), allowRefund: z.boolean(), maxRefundMinor: minorUnits,
 requiredApprovalRole: z.literal('REFUND_APPROVER'), sourceId: id, sourceVersion: id, passageId: id });
export const manifestSchema = z.strictObject({ evidenceIds: z.array(id).min(2), unresolved: z.array(z.string().min(1)), conflicts: z.array(z.string().min(1)) });
export const providerStateSchema = z.strictObject({ tenantId: id, customerId: id, targetId: id,
 environment: z.enum(['TEST','LIVE']), provenance: z.enum(['LIVE','CONTROLLED_TEST']), observedAt: timestamp,
 kind: z.enum(['PAYMENT','SUBSCRIPTION']), currency: z.string().min(1), remainingRefundableMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
 paymentStatus: z.enum(['SUCCEEDED','PENDING','FAILED','UNKNOWN']).nullable(), subscriptionStatus: z.enum(['ACTIVE','CANCELED','UNKNOWN']).nullable(),
 cancelAtPeriodEnd: z.boolean().nullable(), complexBilling: z.boolean() });
export type ProviderState = z.infer<typeof providerStateSchema>;
export type GatewayMode = 'LIVE_TEST' | 'CONTROLLED_TEST';

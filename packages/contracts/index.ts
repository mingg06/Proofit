import { z } from 'zod';

export const id = z.string().trim().min(1).max(200);
export const timestamp = z.iso.datetime();
export const minorUnits = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const actionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('CANCEL_AT_PERIOD_END'), subscriptionId: id, timing: z.literal('PERIOD_END') }),
  z.strictObject({ type: z.literal('REFUND_PAYMENT'), paymentId: id, amountMinor: minorUnits, currency: z.literal('MYR') }),
]);
export type Action = z.infer<typeof actionSchema>;

// These shapes describe trusted stored data. Parsing never authenticates a caller.
export const authenticatedContextSchema = z.strictObject({
  tenantId: id, actorId: id, customerId: id, role: z.enum(['CUSTOMER', 'SUPPORT', 'REFUND_APPROVER']),
});
export const bindingSchema = z.strictObject({
  schemaVersion: z.literal(1), tenantId: id, actorId: id, customerId: id,
  requestId: id, requestVersion: z.number().int().positive(), policyVersion: id, action: actionSchema,
});
export type Binding = z.infer<typeof bindingSchema>;
export const confirmationInputSchema = z.strictObject({ requestId: id, requestVersion: z.number().int().positive(), action: actionSchema });
export const proposalInputSchema = z.strictObject({ requestId: id, requestVersion: z.number().int().positive(),
  // Persist any untrusted proposal, including unsupported actions, for review.
  proposal: z.unknown(), conversation: z.string().max(20000),
});
export const approvalInputSchema = z.strictObject({ receiptId: id });
export const executionInputSchema = z.strictObject({ validationId: id });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const receiptSchema = z.strictObject({
  receiptId: id, binding: bindingSchema, parameterDigest: digest,
  createdAt: timestamp, expiresAt: timestamp, consumedByOperationId: id.nullable(),
}).refine(r => Date.parse(r.expiresAt) > Date.parse(r.createdAt), 'Expiry must follow creation');
export const approvalSchema = z.strictObject({
  approvalId: id, receiptId: id, bindingDigest: digest, tenantId: id,
  approverActorId: id, approverRole: z.literal('REFUND_APPROVER'),
  createdAt: timestamp, expiresAt: timestamp, consumedByOperationId: id.nullable(),
}).refine(r => Date.parse(r.expiresAt) > Date.parse(r.createdAt), 'Expiry must follow creation');
export const decisionSchema = z.enum(['BLOCK', 'REVIEW_REQUIRED', 'READY']);
export const operationStateSchema = z.enum(['RESERVED', 'SUBMITTED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'OUTCOME_UNKNOWN']);
export type OperationState = z.infer<typeof operationStateSchema>;
export const checkSchema = z.strictObject({ name: id, result: z.enum(['PASS', 'BLOCK', 'REVIEW_REQUIRED']), reason: z.string().min(1), evidenceIds: z.array(id) });
export const validationSchema = z.strictObject({ validationId: id, proposalId: id, receiptId: id.nullable(), bindingDigest: digest.nullable(),
  decision: decisionSchema, checks: z.array(checkSchema).min(1), createdAt: timestamp });
export const evidenceRefSchema = z.strictObject({ sourceId: id, sourceVersion: id, passageId: id });
export const evidenceSchema = z.strictObject({ evidenceId: id, tenantId: id, requestId: id, requestVersion: z.number().int().positive(),
  provenance: z.enum(['FIXTURE', 'LIVE', 'RECORDED_LIVE', 'CONTROLLED_FAILURE']), reference: evidenceRefSchema,
  excerpt: z.string().min(1).max(20000), retrievedAt: timestamp, visibility: z.enum(['CUSTOMER', 'STAFF']) });
export const investigationInputSchema = z.strictObject({ runId: id, proposalId: id, requestId: id, requestVersion: z.number().int().positive() });
export const investigatorOutputSchema = z.strictObject({
  runId: id, findings: z.array(z.strictObject({ kind: z.enum(['OBSERVATION', 'INTERPRETATION']), text: z.string().min(1), references: z.array(evidenceRefSchema).min(1) })),
  unresolved: z.array(z.string().min(1)), completion: z.enum(['COMPLETE', 'BUDGET_EXHAUSTED', 'MALFORMED_OUTPUT']),
  usage: z.strictObject({ modelId: id, modelTurns: z.number().int().nonnegative(), toolCalls: z.number().int().nonnegative(),
    activeDurationMs: z.number().int().nonnegative(), inputTokens: z.number().int().nonnegative(), outputTokens: z.number().int().nonnegative() }),
});
export const investigationLimits = Object.freeze({ toolCalls: 10, modelTurns: 4, activeDurationMs: 45000 });
export const operationSchema = z.strictObject({ operationId: id, businessOperationKey: digest, providerIdempotencyKey: id,
  tenantId: id, customerId: id, requestId: id, requestVersion: z.number().int().positive(), receiptId: id,
  validationId: id, resourceKey: id, action: actionSchema, state: operationStateSchema, providerObjectId: id.nullable(),
  effectVerified: z.boolean(), createdAt: timestamp, updatedAt: timestamp });

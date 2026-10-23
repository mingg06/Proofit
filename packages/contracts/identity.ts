import { createHash } from 'node:crypto';
import { bindingSchema, type Binding } from './index.ts';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
// Explicit order; extra keys are rejected before hashing. A digest is not a signature.
export function parameterDigest(input: Binding): string {
  const b = bindingSchema.parse(input);
  const a = b.action;
  const action = a.type === 'REFUND_PAYMENT'
    ? [a.type, a.paymentId, a.amountMinor, a.currency]
    : [a.type, a.subscriptionId, a.timing];
  return hash(['proofit.binding.v1', b.schemaVersion, b.tenantId, b.actorId, b.customerId,
    b.requestId, b.requestVersion, b.policyVersion, action]);
}
export function businessOperationKey(input: Binding): string {
  const b = bindingSchema.parse(input);
  // One action per confirmed request version. New proposals/retries never mint another identity.
  return hash(['proofit.operation.v1', b.tenantId, b.customerId, b.requestId, b.requestVersion]);
}
export function resourceKey(input: Binding): string {
  const b = bindingSchema.parse(input);
  const a = b.action;
  return JSON.stringify([b.tenantId, a.type === 'REFUND_PAYMENT' ? 'payment' : 'subscription',
    a.type === 'REFUND_PAYMENT' ? a.paymentId : a.subscriptionId]);
}

import type { Binding } from '../packages/contracts/index.ts';
export const binding: Binding = { schemaVersion: 1, tenantId: 'tenant_synthetic_a', actorId: 'actor_customer_a',
  customerId: 'customer_synthetic_a', requestId: 'request_cancel_a', requestVersion: 1, policyVersion: 'policy_v1',
  action: { type: 'CANCEL_AT_PERIOD_END', subscriptionId: 'sub_fixture_a', timing: 'PERIOD_END' } };
export const scenarios = [
  { id: 'DEV-01', provenance: 'FIXTURE', family: 'simple-cancellation', confirmed: binding.action, proposal: binding.action },
  { id: 'DEV-02', provenance: 'FIXTURE', family: 'exact-approved-refund',
    confirmed: { type: 'REFUND_PAYMENT', paymentId: 'pi_fixture_b', amountMinor: 2000, currency: 'MYR' },
    proposal: { type: 'REFUND_PAYMENT', paymentId: 'pi_fixture_b', amountMinor: 2000, currency: 'MYR' } },
  { id: 'DEV-03', provenance: 'FIXTURE', family: 'cancel-refund-substitution', confirmed: binding.action,
    proposal: { type: 'REFUND_PAYMENT', paymentId: 'pi_fixture_a', amountMinor: 120000, currency: 'MYR' } },
  { id: 'DEV-04', provenance: 'FIXTURE', family: 'ambiguous-intent', confirmed: null,
    proposal: { text: 'Cancel it and give me my money back' } },
] as const;

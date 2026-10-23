import test from 'node:test';
import assert from 'node:assert/strict';
import { actionSchema, confirmationInputSchema, approvalInputSchema, executionInputSchema, receiptSchema, approvalSchema,
  investigatorOutputSchema, operationStateSchema, decisionSchema } from '../packages/contracts/index.ts';
import { parameterDigest, businessOperationKey, resourceKey } from '../packages/contracts/identity.ts';
import { assertTransition } from '../packages/contracts/lifecycle.ts';
import { binding, scenarios } from '../fixtures/development.ts';

test('four synthetic scenarios have fixed identities and supported confirmed actions', () => {
  assert.equal(scenarios.length, 4);
  assert.equal(new Set(scenarios.map(s => s.id)).size, 4);
  for (const s of scenarios) if (s.confirmed) actionSchema.parse(s.confirmed);
});
test('refund uses positive safe integer MYR minor units', () => {
  const refund = { type: 'REFUND_PAYMENT', paymentId: 'pi_test', amountMinor: 2000, currency: 'MYR' };
  assert.equal(actionSchema.parse(refund).type, 'REFUND_PAYMENT');
  for (const amountMinor of [0, -1, 20.01, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '2000']) {
    assert.equal(actionSchema.safeParse({ ...refund, amountMinor }).success, false);
  }
  assert.equal(actionSchema.safeParse({ ...refund, currency: 'USD' }).success, false);
});
test('unsupported timing, multi-action inputs, and arbitrary payloads never parse as executable actions', () => {
  for (const value of [ { ...binding.action, timing: 'IMMEDIATE' },
    { type: 'CANCEL_IMMEDIATELY', subscriptionId: 'sub_test' },
    { ...binding.action, url: 'https://example.invalid', method: 'DELETE' },
    [binding.action, binding.action] ]) assert.equal(actionSchema.safeParse(value).success, false);
});
test('public confirmation and approval inputs cannot set authority or decision', () => {
  const confirmation = { requestId: binding.requestId, requestVersion: 1, action: binding.action };
  assert.equal(confirmationInputSchema.safeParse(confirmation).success, true);
  for (const extra of [{ tenantId: 'other' }, { customerId: 'other' }, { role: 'REFUND_APPROVER' }, { decision: 'READY' }, { approved: true }]) {
    assert.equal(confirmationInputSchema.safeParse({ ...confirmation, ...extra }).success, false);
  }
  assert.equal(approvalInputSchema.safeParse({ receiptId: 'receipt_a', approverRole: 'REFUND_APPROVER' }).success, false);
  assert.equal(executionInputSchema.safeParse({ validationId: 'validation_a', action: binding.action }).success, false);
});
test('canonical digest is independent of object insertion order', () => {
  assert.equal(parameterDigest(binding), parameterDigest({ ...binding, action: { timing: 'PERIOD_END', subscriptionId: 'sub_fixture_a', type: 'CANCEL_AT_PERIOD_END' } }));
});
test('every authority scope or version change changes the parameter digest', () => {
  for (const change of [{ tenantId: 'other' }, { actorId: 'other' }, { customerId: 'other' },
    { requestId: 'other' }, { requestVersion: 2 }, { policyVersion: 'policy_v2' },
    { action: { ...binding.action, subscriptionId: 'other' } }]) {
    assert.notEqual(parameterDigest({ ...binding, ...change }), parameterDigest(binding));
  }
  const refund = { ...binding, action: { type: 'REFUND_PAYMENT' as const, paymentId: 'pi_a', amountMinor: 2000, currency: 'MYR' as const } };
  assert.notEqual(parameterDigest(refund), parameterDigest(binding));
  assert.notEqual(parameterDigest({ ...refund, action: { ...refund.action, amountMinor: 20000 } }), parameterDigest(refund));
  assert.notEqual(parameterDigest({ ...refund, action: { ...refund.action, paymentId: 'pi_b' } }), parameterDigest(refund));
});
test('business identity survives corrections/retries, while new confirmed request versions differ', () => {
  assert.equal(businessOperationKey(binding), businessOperationKey({ ...binding, policyVersion: 'policy_v2' }));
  assert.notEqual(businessOperationKey(binding), businessOperationKey({ ...binding, requestVersion: 2 }));
  assert.notEqual(businessOperationKey(binding), businessOperationKey({ ...binding, tenantId: 'other' }));
  assert.equal(resourceKey(binding), resourceKey({ ...binding, requestId: 'another_request' }));
});
test('receipts record consumption and reject inverted expiry; staff approvals require the fixed role', () => {
  const receipt = { receiptId: 'receipt_a', binding, parameterDigest: parameterDigest(binding),
    createdAt: '2026-10-23T00:00:00Z', expiresAt: '2026-10-23T01:00:00Z', consumedByOperationId: null };
  receiptSchema.parse(receipt);
  assert.equal(receiptSchema.safeParse({ ...receipt, expiresAt: receipt.createdAt }).success, false);
  assert.equal(approvalSchema.safeParse({ approvalId: 'approval_a', receiptId: 'receipt_a', bindingDigest: parameterDigest(binding), tenantId: binding.tenantId,
    approverActorId: 'actor_support', approverRole: 'SUPPORT', createdAt: receipt.createdAt, expiresAt: receipt.expiresAt, consumedByOperationId: null }).success, false);
});
test('decisions are separate from execution lifecycle', () => {
  assert.equal(operationStateSchema.safeParse('READY').success, false);
  assert.equal(decisionSchema.safeParse('SUCCEEDED').success, false);
});
test('timeout reconciliation cannot reset an operation or resubmit it blindly', () => {
  assertTransition('SUBMITTED', 'OUTCOME_UNKNOWN');
  assertTransition('OUTCOME_UNKNOWN', 'PENDING');
  assertTransition('OUTCOME_UNKNOWN', 'SUCCEEDED');
  for (const to of ['RESERVED', 'SUBMITTED'] as const) assert.throws(() => assertTransition('OUTCOME_UNKNOWN', to));
  assert.throws(() => assertTransition('SUCCEEDED', 'SUBMITTED'));
});
test('investigator cannot return execution authority and findings require source references', () => {
  const result = { runId: 'run_a', findings: [], unresolved: [], completion: 'COMPLETE', usage: {
    modelId: 'fixture-only', modelTurns: 0, toolCalls: 0, activeDurationMs: 0, inputTokens: 0, outputTokens: 0 } };
  investigatorOutputSchema.parse(result);
  assert.equal(investigatorOutputSchema.safeParse({ ...result, decision: 'READY' }).success, false);
  assert.equal(investigatorOutputSchema.safeParse({ ...result, findings: [{ kind: 'OBSERVATION', text: 'Approved', references: [] }] }).success, false);
});

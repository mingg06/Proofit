import { z } from 'zod';
import { actionSchema, receiptSchema, approvalSchema, evidenceSchema, type checkSchema } from '../../packages/contracts/index.ts';
import { manifestSchema, policyRulesSchema, providerStateSchema, type GatewayMode } from '../../packages/contracts/gateway.ts';
import { parameterDigest } from '../../packages/contracts/identity.ts';
import type { Actor } from './auth.ts';
export type Check = z.infer<typeof checkSchema>;
export type Snapshot = {
 actor: Actor; request: { tenant_id: string; id: string; version: number; customer_id: string; actor_id: string }; latestVersion: number;
 proposal: unknown; receipt: unknown; approval: unknown;
 confirmingActor: (Actor & { active: number }) | null; approvingActor: (Actor & { active: number }) | null;
 resource: { customer_id: string; provenance: string } | null;
 policy: { version: string; source_version: string; provenance: string } | null; rules: unknown;
 manifest: { policy_version: string; content: unknown; evidence: { purpose: string; record: unknown; excerpt: string | null; approved: number; provenance: string | null }[] } | null;
 investigationHold?:boolean;
 duplicate: boolean; busyResource: boolean; duplicateOperationId:string|null; busyResourceOperationId:string|null;
};
export function evaluate(snapshot: Snapshot, stateInput: unknown, now: Date, mode: GatewayMode, forOperationId?:string) {
 const s = snapshot; const checks: Check[] = [];
 function add(name: string, result: Check['result'], reason: string, evidenceIds: string[] = []) { checks.push({ name, result, reason, evidenceIds }); }
 const receipt = receiptSchema.safeParse(s.receipt); const action = actionSchema.safeParse(s.proposal);
 const approval = approvalSchema.safeParse(s.approval); const rules = policyRulesSchema.safeParse(s.rules);
 const authority = receipt.success ? receipt.data : null;
 const binding = authority?.binding;
 const currentTime = now.getTime();
 add('request_version', s.request.version === s.latestVersion ? 'PASS' : 'BLOCK', s.request.version === s.latestVersion ? 'Current request version.' : 'Request version has changed.');
 const malformedRefund = !action.success && typeof s.proposal === 'object' && s.proposal !== null && (s.proposal as { type?: unknown }).type === 'REFUND_PAYMENT';
 add('supported_action', action.success ? 'PASS' : malformedRefund ? 'BLOCK' : 'REVIEW_REQUIRED', action.success ? 'Supported exact action.' : malformedRefund ? 'Refund parameters are invalid or outside the locked MYR integer-minor-unit contract.' : 'Unsupported or ambiguous proposal requires review; no substitution is permitted.');
 if (!s.receipt) add('receipt_integrity', 'REVIEW_REQUIRED', 'Customer confirmation is missing.');
 else if (!authority || !binding || parameterDigest(binding) !== authority.parameterDigest) add('receipt_integrity', 'BLOCK', 'Stored receipt integrity mismatch.');
 else if (binding.tenantId !== s.request.tenant_id || binding.customerId !== s.request.customer_id || binding.actorId !== s.request.actor_id
  || binding.requestId !== s.request.id || binding.requestVersion !== s.request.version || !s.confirmingActor?.active
  || s.confirmingActor.role !== 'CUSTOMER' || s.confirmingActor.tenant_id !== binding.tenantId || s.confirmingActor.customer_id !== binding.customerId) {
  add('receipt_integrity', 'BLOCK', 'Confirmation identity, ownership or request binding mismatch.');
 } else if (Date.parse(authority.createdAt) > currentTime || Date.parse(authority.expiresAt) <= currentTime || authority.consumedByOperationId !== null && authority.consumedByOperationId !== forOperationId) {
  add('receipt_integrity', 'BLOCK', 'Receipt is expired, not yet valid or already consumed.');
 } else add('receipt_integrity', 'PASS', forOperationId ? 'Stored scope, digest and expiry match the authority consumed by this operation.' : 'Authentic stored scope, digest, expiry and unused state match.');
 if (!binding || !action.success) add('exact_parameters', 'REVIEW_REQUIRED', 'Exact supported proposal and confirmation are required.');
 else {
  const match = parameterDigest({ ...binding, action: action.data }) === authority!.parameterDigest;
  add('exact_parameters', match ? 'PASS' : 'BLOCK', match ? 'Action, target, amount/currency or cancellation timing match exactly.' : 'Proposal differs from confirmed exact action.');
 }
 if (!action.success) add('resource_ownership', 'REVIEW_REQUIRED', 'Supported target is unresolved.');
 else if (!s.resource) add('resource_ownership', 'REVIEW_REQUIRED', 'Authoritative resource mapping is unavailable.');
 else add('resource_ownership', s.resource.customer_id === s.request.customer_id ? 'PASS' : 'BLOCK', s.resource.customer_id === s.request.customer_id ? 'Resource belongs to the confirmed customer.' : 'Target belongs to another customer.');
 if (!s.policy || !rules.success) add('business_policy', 'REVIEW_REQUIRED', 'Current approved structured policy is unavailable.');
 else if (binding && binding.policyVersion !== s.policy.version) add('business_policy', 'BLOCK', 'Policy changed after confirmation.');
 else if (!action.success) add('business_policy', 'REVIEW_REQUIRED', 'Policy cannot authorize an unsupported action.');
 else {
  const allowed = action.data.type === 'REFUND_PAYMENT' ? rules.data.allowRefund && action.data.amountMinor <= rules.data.maxRefundMinor : rules.data.allowCancellation;
  add('business_policy', allowed ? 'PASS' : 'BLOCK', allowed ? 'Action satisfies configured business limits.' : 'Current business policy prohibits this action or amount.');
 }
 if (!action.success) add('staff_approval', 'REVIEW_REQUIRED', 'Approval requirement is unresolved.');
 else if (action.data.type === 'CANCEL_AT_PERIOD_END') add('staff_approval', 'PASS', 'Refund approval is not required for cancellation.');
 else if (!s.approval) add('staff_approval', 'REVIEW_REQUIRED', 'Exact-amount refund approval is missing.');
 else if (!approval.success || !authority || approval.data.tenantId !== s.request.tenant_id || approval.data.receiptId !== authority.receiptId
  || approval.data.bindingDigest !== authority.parameterDigest || !s.approvingActor?.active || s.approvingActor.role !== 'REFUND_APPROVER'
  || s.approvingActor.tenant_id !== s.request.tenant_id || approval.data.approverActorId !== s.approvingActor.id
  || (approval.data.consumedByOperationId !== null && approval.data.consumedByOperationId !== forOperationId) || Date.parse(approval.data.createdAt) > currentTime
  || Date.parse(approval.data.expiresAt) <= currentTime || Date.parse(approval.data.expiresAt) > Date.parse(authority.expiresAt)) {
  add('staff_approval', 'BLOCK', 'Approval scope, exact digest, current role, expiry or consumption mismatch.');
 } else add('staff_approval', 'PASS', 'Current exact-action staff approval is valid.');
 const manifest = manifestSchema.safeParse(s.manifest?.content);
 const evidenceIds: string[] = []; const purposes = new Set<string>();
 let evidenceValid = !!s.manifest && manifest.success && binding?.policyVersion === s.manifest.policy_version;
 let provenanceValid = mode === 'CONTROLLED_TEST' || (s.resource?.provenance === 'LIVE' && s.policy?.provenance === 'LIVE');
 if (s.manifest && manifest.success) {
  evidenceValid &&= new Set(manifest.data.evidenceIds).size === manifest.data.evidenceIds.length && s.manifest.evidence.length === manifest.data.evidenceIds.length;
  for (const item of s.manifest.evidence) {
   const e = evidenceSchema.safeParse(item.record);
   if (!e.success) { evidenceValid = false; continue; }
   const data = e.data;
   evidenceIds.push(data.evidenceId); purposes.add(item.purpose);
   evidenceValid &&= manifest.data.evidenceIds.includes(data.evidenceId) && data.tenantId === s.request.tenant_id && data.requestId === s.request.id
    && data.requestVersion === s.request.version && item.approved === 1 && item.excerpt === data.excerpt && Date.parse(data.retrievedAt) <= currentTime;
   if (item.purpose === 'POLICY') evidenceValid &&= rules.success && data.reference.sourceId === rules.data.sourceId
    && data.reference.sourceVersion === rules.data.sourceVersion && data.reference.passageId === rules.data.passageId
    && s.policy?.source_version === rules.data.sourceVersion;
   provenanceValid &&= mode === 'CONTROLLED_TEST' || (data.provenance === 'LIVE' && item.provenance === 'LIVE');
  }
  evidenceValid &&= purposes.has('REQUEST') && purposes.has('POLICY') && manifest.data.unresolved.length === 0 && manifest.data.conflicts.length === 0;
 }
 add('required_evidence', evidenceValid ? 'PASS' : 'REVIEW_REQUIRED', evidenceValid ? 'Approved resolvable request and policy passages match; no unresolved conflicts.' : 'Missing, stale, unapproved, conflicting or unresolvable evidence requires review.', evidenceIds);
 add('provenance', provenanceValid ? 'PASS' : 'REVIEW_REQUIRED', provenanceValid ? 'Sources match the trusted gateway mode.' : 'Synthetic/imported sources cannot establish live execution eligibility.');
 const duplicate=s.duplicate&&s.duplicateOperationId!==forOperationId;
 const busy=s.busyResource&&s.busyResourceOperationId!==forOperationId;
 add('operation_identity', duplicate ? 'BLOCK' : busy ? 'REVIEW_REQUIRED' : 'PASS', duplicate ? 'A business operation already exists; retrieve/reconcile it.' : busy ? 'Another operation holds this target; reconcile it first.' : 'No prior business operation or active target reservation.');
 add('investigation_completion',s.investigationHold?'REVIEW_REQUIRED':'PASS',s.investigationHold?'The latest investigation is incomplete or has unresolved issues; review is required.':'No unresolved investigation hold.');
 const state = providerStateSchema.safeParse(stateInput);
 if (!state.success || !binding || !action.success) add('provider_state', 'REVIEW_REQUIRED', 'Fresh typed provider state is unavailable.');
 else {
  const p = state.data; const a = action.data;
  const target = a.type === 'REFUND_PAYMENT' ? a.paymentId : a.subscriptionId;
  const age = currentTime - Date.parse(p.observedAt);
  if (p.tenantId !== s.request.tenant_id || p.customerId !== s.request.customer_id || p.targetId !== target || p.environment !== 'TEST'
   || p.kind !== (a.type === 'REFUND_PAYMENT' ? 'PAYMENT' : 'SUBSCRIPTION') || (a.type === 'REFUND_PAYMENT' && p.currency !== 'MYR')) {
   add('provider_state', 'BLOCK', 'Provider identity, target, currency or test-environment mismatch.');
  } else if (age < 0 || age > 5000 || p.complexBilling || (mode === 'LIVE_TEST' && p.provenance !== 'LIVE')) {
   add('provider_state', 'REVIEW_REQUIRED', 'Provider observation is stale, unsupported or synthetic.');
  } else if (a.type === 'REFUND_PAYMENT') {
   if (p.remainingRefundableMinor === null || p.paymentStatus === 'UNKNOWN' || p.paymentStatus === 'PENDING' || p.paymentStatus === null) add('provider_state', 'REVIEW_REQUIRED', 'Remaining refundable balance or payment state is unknown.');
   else if (p.paymentStatus !== 'SUCCEEDED' || a.amountMinor > p.remainingRefundableMinor) add('provider_state', 'BLOCK', 'Payment is not refundable for this exact amount.');
   else add('provider_state', 'PASS', 'Fresh paid-payment state and remaining balance permit this exact amount.');
  } else if (p.subscriptionStatus === 'UNKNOWN' || p.subscriptionStatus === null || p.cancelAtPeriodEnd === null || p.cancelAtPeriodEnd) add('provider_state', 'REVIEW_REQUIRED', 'Subscription state is unknown or cancellation is already scheduled.');
  else if (p.subscriptionStatus !== 'ACTIVE') add('provider_state', 'BLOCK', 'Subscription is not active.');
  else add('provider_state', 'PASS', 'Fresh active subscription state permits period-end cancellation.');
 }
 const decision = checks.some(c => c.result === 'BLOCK') ? 'BLOCK' as const : checks.some(c => c.result === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' as const : 'READY' as const;
 return { decision, checks, receipt: authority, action: action.success ? action.data : null };
}

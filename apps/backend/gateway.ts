import { randomUUID } from 'node:crypto';
import { validationSchema, receiptSchema, actionSchema, evidenceSchema, type Action } from '../../packages/contracts/index.ts';
import { validateInputSchema, providerStateSchema, manifestSchema, type GatewayMode } from '../../packages/contracts/gateway.ts';
import { businessOperationKey, resourceKey } from '../../packages/contracts/identity.ts';
import { Auth, HttpError, type Actor } from './auth.ts';
import { Store } from './database.ts';
import { evaluate, type Snapshot } from './rules.ts';
export const rulesVersion='rules-v3' as const;
export function parsedJson(value: string | undefined | null): unknown { try { return value ? JSON.parse(value) : null; } catch { return null; } }
export type ProposalRow = { id: string; tenant_id: string; request_id: string; request_version: number; proposal_json: string };
export type ValidationRow = { id: string; tenant_id: string; actor_id: string; proposal_id: string; receipt_id: string | null; decision: string; record_json: string; mode: GatewayMode; rules_version: string };
export interface ProviderReader { read(input: { tenantId: string; customerId: string; action: Action }, signal: AbortSignal): Promise<unknown> }
export class Gateway {
 readonly store: Store; readonly auth: Auth; readonly now: () => Date; readonly mode: GatewayMode; readonly reader: ProviderReader | null;
 constructor(store: Store, options: { now?: () => Date; mode?: GatewayMode; reader?: ProviderReader } = {}) {
  this.store = store; this.now = options.now ?? (() => new Date()); this.auth = new Auth(store, this.now);
  this.mode = options.mode ?? 'LIVE_TEST'; this.reader = options.reader ?? null;
 }
 staff(actor: Actor): void { if (actor.role === 'CUSTOMER') throw new HttpError(403, 'Staff review role required'); }
 load(actor: Actor, proposalId: string): Snapshot {
  this.staff(actor);
  const proposal = this.store.get<ProposalRow>('SELECT * FROM proposals WHERE tenant_id=? AND id=?', actor.tenant_id, proposalId);
  if (!proposal) throw new HttpError(404, 'Proposal not found');
  const request = this.store.get<Snapshot['request']>('SELECT * FROM requests WHERE tenant_id=? AND id=? AND version=?', actor.tenant_id, proposal.request_id, proposal.request_version);
  if (!request) throw new HttpError(404, 'Request not found');
  const row = this.store.get<{ id: string; binding_json: string; parameter_digest: string; created_at: string; expires_at: string; consumed_by_operation_id: string | null }>('SELECT * FROM receipts WHERE tenant_id=? AND request_id=? AND request_version=?', actor.tenant_id, request.id, request.version);
  const receipt = row ? { receiptId: row.id, binding: parsedJson(row.binding_json), parameterDigest: row.parameter_digest,
   createdAt: row.created_at, expiresAt: row.expires_at, consumedByOperationId: row.consumed_by_operation_id } : null;
  const confirmed = receiptSchema.safeParse(receipt);
  const approvalRow = row ? this.store.get<{ id: string; receipt_id: string; tenant_id: string; binding_digest: string; actor_id: string; approver_role: string; created_at: string; expires_at: string; consumed_by_operation_id: string | null }>('SELECT * FROM approvals WHERE tenant_id=? AND receipt_id=?', actor.tenant_id, row.id) : null;
  const approval = approvalRow ? { approvalId: approvalRow.id, receiptId: approvalRow.receipt_id, tenantId: approvalRow.tenant_id,
   bindingDigest: approvalRow.binding_digest, approverActorId: approvalRow.actor_id, approverRole: approvalRow.approver_role,
   createdAt: approvalRow.created_at, expiresAt: approvalRow.expires_at, consumedByOperationId: approvalRow.consumed_by_operation_id } : null;
  const policy = this.store.get<NonNullable<Snapshot['policy']>>('SELECT * FROM policy_versions WHERE tenant_id=? AND active=1', actor.tenant_id) ?? null;
  const rules = policy ? this.store.get<{ rules_json: string }>('SELECT rules_json FROM policy_rules WHERE tenant_id=? AND policy_version=?', actor.tenant_id, policy.version) : null;
  const manifestRow = this.store.get<{ id: string; policy_version: string; manifest_json: string }>('SELECT * FROM evidence_manifests WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY created_at DESC,id DESC LIMIT 1', actor.tenant_id, request.id, request.version);
  const manifest = manifestSchema.safeParse(parsedJson(manifestRow?.manifest_json));
  const evidence: NonNullable<Snapshot['manifest']>['evidence'] = [];
  if (manifest.success) for (const evidenceId of manifest.data.evidenceIds) {
   const e = this.store.get<{ purpose: string; record_json: string }>('SELECT purpose,record_json FROM evidence_records WHERE tenant_id=? AND request_id=? AND request_version=? AND id=?', actor.tenant_id, request.id, request.version, evidenceId);
   if (!e) continue;
   const record = parsedJson(e.record_json);
   // The schema in evaluate also checks the exact record and passage content.
   const safeRecord = evidenceSchema.safeParse(record);
   const ref = safeRecord.success && safeRecord.data.evidenceId === evidenceId ? safeRecord.data.reference : null;
   const passage = ref?.sourceId && ref.sourceVersion && ref.passageId ? this.store.get<{ excerpt: string; approved: number; provenance: string }>(
    'SELECT p.excerpt,s.approved,s.provenance FROM passages p JOIN source_versions s ON s.tenant_id=p.tenant_id AND s.source_id=p.source_id AND s.version=p.source_version WHERE p.tenant_id=? AND p.source_id=? AND p.source_version=? AND p.id=?', actor.tenant_id, ref.sourceId, ref.sourceVersion, ref.passageId) : null;
   evidence.push({ purpose: e.purpose, record, excerpt: passage?.excerpt ?? null, approved: passage?.approved ?? 0, provenance: passage?.provenance ?? null });
  }
  const action = actionSchema.safeParse(parsedJson(proposal.proposal_json));
  const resource = action.success ? this.store.get<NonNullable<Snapshot['resource']>>('SELECT * FROM resources WHERE tenant_id=? AND id=? AND kind=?', actor.tenant_id,
   action.data.type === 'REFUND_PAYMENT' ? action.data.paymentId : action.data.subscriptionId, action.data.type === 'REFUND_PAYMENT' ? 'PAYMENT' : 'SUBSCRIPTION') : null;
  const duplicate=confirmed.success?this.store.get<{id:string}>('SELECT id FROM operations WHERE business_key=?',businessOperationKey(confirmed.data.binding)):undefined;
  const busy=confirmed.success?this.store.get<{id:string}>("SELECT id FROM operations WHERE resource_key=? AND state IN('RESERVED','SUBMITTED','PENDING','OUTCOME_UNKNOWN')",resourceKey(confirmed.data.binding)):undefined;
  const investigation=this.store.get<{status:string;unresolved_json:string}>('SELECT status,unresolved_json FROM investigations WHERE tenant_id=? AND proposal_id=? ORDER BY sequence DESC LIMIT 1',actor.tenant_id,proposalId);
  const unresolved=parsedJson(investigation?.unresolved_json);
  const investigationHold=!!investigation&&(!['COMPLETE','RULES_ONLY'].includes(investigation.status)||!Array.isArray(unresolved)||unresolved.length>0);
  return { actor, request, investigationHold, latestVersion: this.store.get<{ version: number }>('SELECT MAX(version) AS version FROM requests WHERE tenant_id=? AND id=?', actor.tenant_id, request.id)!.version,
   proposal: parsedJson(proposal.proposal_json), receipt, approval,
   confirmingActor: this.store.get<NonNullable<Snapshot['confirmingActor']>>('SELECT * FROM actors WHERE tenant_id=? AND id=?', actor.tenant_id, request.actor_id) ?? null,
   approvingActor: approvalRow ? this.store.get<NonNullable<Snapshot['approvingActor']>>('SELECT * FROM actors WHERE tenant_id=? AND id=?', actor.tenant_id, approvalRow.actor_id) ?? null : null,
   resource: resource ?? null, policy, rules: parsedJson(rules?.rules_json),
   manifest: manifestRow ? { policy_version: manifestRow.policy_version, content: parsedJson(manifestRow.manifest_json), evidence } : null,
   duplicate:!!duplicate,busyResource:!!busy,duplicateOperationId:duplicate?.id??null,busyResourceOperationId:busy?.id??null,
  };
 }
 async observe(snapshot: Snapshot): Promise<unknown> {
  const action = actionSchema.safeParse(snapshot.proposal);
  if (!this.reader || !action.success) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
   const raw = await Promise.race([this.reader.read({ tenantId: snapshot.request.tenant_id, customerId: snapshot.request.customer_id, action: action.data }, controller.signal),
    new Promise<null>(resolve => { timer = setTimeout(() => { controller.abort(); resolve(null); }, 3000); })]);
   const parsed = providerStateSchema.safeParse(raw);
   return parsed.success ? parsed.data : null;
  } catch { return null; }
  finally { if (timer) clearTimeout(timer); }
 }
 persist(actor: Actor, proposalId: string, snapshot: Snapshot, state: unknown, forOperationId?:string) {
  const result = evaluate(snapshot, state, this.now(), this.mode, forOperationId);
  const record = validationSchema.parse({ validationId: randomUUID(), proposalId, receiptId: result.receipt?.receiptId ?? null,
   bindingDigest: result.receipt?.parameterDigest ?? null, decision: result.decision, checks: result.checks, createdAt: this.now().toISOString() });
  this.store.run('INSERT INTO validations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', record.validationId, actor.tenant_id, snapshot.request.customer_id,
   snapshot.request.id, snapshot.request.version, proposalId, record.receiptId, actor.id, record.decision, JSON.stringify(record), state ? JSON.stringify(state) : null, this.mode, rulesVersion, record.createdAt);
  for (const check of record.checks) this.store.run('INSERT INTO validation_checks VALUES(?,?,?,?,?)', record.validationId, check.name, check.result, check.reason, JSON.stringify(check.evidenceIds));
  this.store.run('INSERT INTO audit_events(id,tenant_id,request_id,request_version,actor_id,event,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
   randomUUID(), actor.tenant_id, snapshot.request.id, snapshot.request.version, actor.id, 'PROPOSAL_VALIDATED', JSON.stringify({ validationId: record.validationId, decision: record.decision, mode: this.mode }), record.createdAt);
  return { ...record, mode: this.mode, rulesVersion: rulesVersion, executionEnabled: false };
 }
 async validate(token: string, input: unknown) {
  const { proposalId } = validateInputSchema.parse(input);
  const snapshot = this.store.transaction(() => this.load(this.auth.session(token).actor, proposalId));
  const preliminary = evaluate(snapshot, null, this.now(), this.mode);
  const state = preliminary.checks.every(c => c.name === 'provider_state' || c.result === 'PASS') ? await this.observe(snapshot) : null;
  return this.store.transaction(() => {
   const actor = this.auth.session(token).actor;
   return this.persist(actor, proposalId, this.load(actor, proposalId), state);
  });
 }
 getValidation(token: string, validationId: string) {
  const actor = this.auth.session(token).actor; this.staff(actor);
  const row = this.store.get<ValidationRow>('SELECT * FROM validations WHERE tenant_id=? AND id=?', actor.tenant_id, validationId);
  if (!row) throw new HttpError(404, 'Validation not found');
  return { ...validationSchema.parse(parsedJson(row.record_json)), mode: row.mode, rulesVersion: row.rules_version, executionEnabled: false };
 }
}

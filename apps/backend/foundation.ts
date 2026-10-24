import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { approvalInputSchema, approvalSchema, confirmationInputSchema, proposalInputSchema, receiptSchema, validationSchema, type Binding, type Action } from '../../packages/contracts/index.ts';
import { parameterDigest } from '../../packages/contracts/identity.ts';
import { Auth, HttpError, type Actor } from './auth.ts';
import { Store } from './database.ts';

const requestInput = z.strictObject({ text: z.string().trim().min(1).max(20000) });
const amendmentInput = z.strictObject({ text: z.string().trim().min(1).max(20000), version: z.number().int().positive() });
type RequestRow = { id: string; tenant_id: string; version: number; customer_id: string; actor_id: string; original_text: string; created_at: string };
type ReceiptRow = { id: string; binding_json: string; parameter_digest: string; created_at: string; expires_at: string; consumed_by_operation_id: string | null };
type ApprovalRow = { id: string; tenant_id: string; receipt_id: string; binding_digest: string; actor_id: string; approver_role: 'REFUND_APPROVER'; created_at: string; expires_at: string; consumed_by_operation_id: string | null };
function receiptRecord(row: ReceiptRow) {
  return receiptSchema.parse({ receiptId: row.id, binding: JSON.parse(row.binding_json), parameterDigest: row.parameter_digest,
    createdAt: row.created_at, expiresAt: row.expires_at, consumedByOperationId: row.consumed_by_operation_id });
}
function approvalRecord(row: ApprovalRow) {
  return approvalSchema.parse({ approvalId: row.id, receiptId: row.receipt_id, tenantId: row.tenant_id, bindingDigest: row.binding_digest,
    approverActorId: row.actor_id, approverRole: row.approver_role, createdAt: row.created_at, expiresAt: row.expires_at, consumedByOperationId: row.consumed_by_operation_id });
}
export class Foundation {
  readonly store: Store;
  readonly auth: Auth;
  readonly now: () => Date;
  constructor(store: Store, now: () => Date = () => new Date()) {
    this.store = store; this.now = now; this.auth = new Auth(store, now);
  }
  private audit(actor: Actor, request: RequestRow, event: string, detail: unknown): void {
    this.store.run('INSERT INTO audit_events(id,tenant_id,request_id,request_version,actor_id,event,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
      randomUUID(), actor.tenant_id, request.id, request.version, actor.id, event, JSON.stringify(detail), this.now().toISOString());
  }
  private request(actor: Actor, requestId: string, version: number): RequestRow {
    const row = this.store.get<RequestRow>('SELECT * FROM requests WHERE tenant_id=? AND id=? AND version=?', actor.tenant_id, requestId, version);
    if (!row || (actor.role === 'CUSTOMER' && row.customer_id !== actor.customer_id)) throw new HttpError(404, 'Request not found');
    return row;
  }
  private current(actor: Actor, request: RequestRow): void {
    const latest = this.store.get<{ version: number }>('SELECT MAX(version) AS version FROM requests WHERE tenant_id=? AND id=?', actor.tenant_id, request.id);
    if (latest?.version !== request.version) throw new HttpError(409, 'Request version changed; confirm the current version');
  }
  private policy(tenantId: string): string {
    const row = this.store.get<{ version: string }>('SELECT version FROM policy_versions WHERE tenant_id=? AND active=1', tenantId);
    if (!row) throw new HttpError(409, 'Current approved policy is unavailable');
    return row.version;
  }
  private ownsAction(actor: Actor, action: Action): void {
    const target = action.type === 'REFUND_PAYMENT' ? action.paymentId : action.subscriptionId;
    const kind = action.type === 'REFUND_PAYMENT' ? 'PAYMENT' : 'SUBSCRIPTION';
    const resource = this.store.get<{ customer_id: string }>('SELECT customer_id FROM resources WHERE tenant_id=? AND id=? AND kind=?', actor.tenant_id, target, kind);
    if (!resource || resource.customer_id !== actor.customer_id) throw new HttpError(404, 'Target not found');
  }
  createRequest(token: string, input: unknown) {
    const body = requestInput.parse(input);
    return this.store.transaction(() => {
      const actor = this.auth.session(token).actor;
      if (actor.role !== 'CUSTOMER' || !actor.customer_id) throw new HttpError(403, 'Customer confirmation requires a customer account');
      const row: RequestRow = { id: randomUUID(), tenant_id: actor.tenant_id, version: 1, customer_id: actor.customer_id,
        actor_id: actor.id, original_text: body.text, created_at: this.now().toISOString() };
      this.insertRequest(row); this.audit(actor, row, 'REQUEST_CREATED', {});
      return row;
    });
  }
  private insertRequest(row: RequestRow): void {
    this.store.run('INSERT INTO requests VALUES(?,?,?,?,?,?,?)', row.tenant_id, row.id, row.version, row.customer_id, row.actor_id, row.original_text, row.created_at);
  }
  amendRequest(token: string, requestId: string, input: unknown) {
    const body = amendmentInput.parse(input);
    return this.store.transaction(() => {
      const actor = this.auth.session(token).actor;
      const old = this.request(actor, requestId, body.version);
      if (actor.role !== 'CUSTOMER' || old.actor_id !== actor.id) throw new HttpError(403, 'Only the confirming customer can amend this request');
      this.current(actor, old);
      const row = { ...old, version: old.version + 1, original_text: body.text, created_at: this.now().toISOString() };
      this.insertRequest(row); this.audit(actor, row, 'REQUEST_AMENDED', { previousVersion: old.version });
      return row;
    });
  }
  confirm(token: string, input: unknown) {
    const body = confirmationInputSchema.parse(input);
    return this.store.transaction(() => {
      const actor = this.auth.session(token).actor;
      const request = this.request(actor, body.requestId, body.requestVersion);
      if (actor.role !== 'CUSTOMER' || request.actor_id !== actor.id) throw new HttpError(403, 'Only the requesting customer can confirm intent');
      this.current(actor, request); this.ownsAction(actor, body.action);
      const binding: Binding = { schemaVersion: 1, tenantId: actor.tenant_id, actorId: actor.id, customerId: request.customer_id,
        requestId: request.id, requestVersion: request.version, policyVersion: this.policy(actor.tenant_id), action: body.action };
      const digest = parameterDigest(binding);
      const old = this.store.get<ReceiptRow>('SELECT * FROM receipts WHERE tenant_id=? AND request_id=? AND request_version=?', actor.tenant_id, request.id, request.version);
      if (old) {
        if (old.parameter_digest !== digest || parameterDigest(receiptRecord(old).binding) !== digest || old.expires_at <= this.now().toISOString() || old.consumed_by_operation_id) {
          throw new HttpError(409, 'Authority changed, expired or consumed; create a new request version');
        }
        return receiptRecord(old);
      }
      const record = receiptSchema.parse({ receiptId: randomUUID(), binding, parameterDigest: digest,
        createdAt: this.now().toISOString(), expiresAt: new Date(this.now().getTime() + 15 * 60 * 1000).toISOString(), consumedByOperationId: null });
      this.store.run('INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?,?)', record.receiptId, actor.tenant_id, request.id, request.version,
        JSON.stringify(binding), digest, record.createdAt, record.expiresAt, null);
      this.audit(actor, request, 'CUSTOMER_CONFIRMED', { receiptId: record.receiptId, parameterDigest: digest });
      return record;
    });
  }
  propose(token: string, input: unknown) {
    const body = proposalInputSchema.parse(input);
    if (body.proposal === undefined) throw new HttpError(400, 'Proposal is required');
    return this.store.transaction(() => {
      const actor = this.auth.session(token).actor;
      const request = this.request(actor, body.requestId, body.requestVersion);
      this.current(actor, request);
      const proposalId = randomUUID();
      this.store.run('INSERT INTO proposals VALUES(?,?,?,?,?,?,?,?)', proposalId, actor.tenant_id, request.id, request.version, actor.id,
        JSON.stringify(body.proposal), body.conversation, this.now().toISOString());
      this.audit(actor, request, 'PROPOSAL_STORED', { proposalId });
      return { proposalId, requestId: request.id, requestVersion: request.version, executionEnabled: false };
    });
  }
  approve(token: string, input: unknown) {
    const body = approvalInputSchema.parse(input);
    return this.store.transaction(() => {
      const actor = this.auth.session(token).actor;
      if (actor.role !== 'REFUND_APPROVER') throw new HttpError(403, 'Refund approver role required');
      const row = this.store.get<ReceiptRow>('SELECT * FROM receipts WHERE tenant_id=? AND id=?', actor.tenant_id, body.receiptId);
      if (!row) throw new HttpError(404, 'Receipt not found');
      const receipt = receiptRecord(row);
      const request = this.request(actor, receipt.binding.requestId, receipt.binding.requestVersion);
      this.current(actor, request);
      if (receipt.binding.action.type !== 'REFUND_PAYMENT') throw new HttpError(409, 'Staff refund approval requires a refund receipt');
      if (receipt.binding.policyVersion !== this.policy(actor.tenant_id) || receipt.parameterDigest !== parameterDigest(receipt.binding)
        || receipt.expiresAt <= this.now().toISOString() || receipt.consumedByOperationId !== null) {
        throw new HttpError(409, 'Receipt authority changed, expired or consumed');
      }
      const previous = this.store.get<ApprovalRow>('SELECT * FROM approvals WHERE tenant_id=? AND receipt_id=?', actor.tenant_id, receipt.receiptId);
      if (previous) {
        if (previous.binding_digest !== receipt.parameterDigest || previous.expires_at <= this.now().toISOString() || previous.consumed_by_operation_id) throw new HttpError(409, 'Approval expired or consumed');
        return approvalRecord(previous);
      }
      const record = approvalSchema.parse({ approvalId: randomUUID(), receiptId: receipt.receiptId, tenantId: actor.tenant_id,
        bindingDigest: receipt.parameterDigest, approverActorId: actor.id, approverRole: actor.role,
        createdAt: this.now().toISOString(), expiresAt: receipt.expiresAt, consumedByOperationId: null });
      this.store.run('INSERT INTO approvals VALUES(?,?,?,?,?,?,?,?,?)', record.approvalId, actor.tenant_id, record.receiptId, record.bindingDigest,
        actor.id, actor.role, record.createdAt, record.expiresAt, null);
      this.audit(actor, request, 'STAFF_APPROVED', { approvalId: record.approvalId, receiptId: record.receiptId, parameterDigest: record.bindingDigest });
      return record;
    });
  }
  listResources(token:string){
    const actor=this.auth.session(token).actor;
    const fields='SELECT id,customer_id AS customerId,kind,provenance FROM resources WHERE tenant_id=?';
    return actor.role==='CUSTOMER'?this.store.all(fields+' AND customer_id=? ORDER BY kind,id',actor.tenant_id,actor.customer_id):this.store.all(fields+' ORDER BY customer_id,kind,id',actor.tenant_id);
  }
  listRequests(token: string) {
    const actor = this.auth.session(token).actor;
    if (actor.role === 'CUSTOMER') return this.store.all<RequestRow>('SELECT * FROM requests WHERE tenant_id=? AND customer_id=? ORDER BY created_at DESC LIMIT 100', actor.tenant_id, actor.customer_id);
    return this.store.all<RequestRow>('SELECT * FROM requests WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100', actor.tenant_id);
  }
  getCase(token: string, requestId: string, version: number) {
    return this.store.transaction(() => {
      const actor = this.auth.session(token).actor;
      const request = this.request(actor, requestId, version);
      const row = this.store.get<ReceiptRow>('SELECT * FROM receipts WHERE tenant_id=? AND request_id=? AND request_version=?', actor.tenant_id, requestId, version);
      const latestVersion=this.store.get<{version:number}>('SELECT MAX(version) AS version FROM requests WHERE tenant_id=? AND id=?',actor.tenant_id,requestId)!.version;
      const operations=this.store.all('SELECT id AS operationId,state,mode,created_at AS createdAt FROM operations WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY created_at,id',actor.tenant_id,requestId,version);
      const base = { request, latestVersion, operations, receipt: row ? receiptRecord(row) : null, executionEnabled: false };
      if (actor.role === 'CUSTOMER') return base;
      const validations=this.store.all<{record_json:string;mode:string;rules_version:string}>('SELECT record_json,mode,rules_version FROM validations WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY rowid',actor.tenant_id,requestId,version).map(v=>({...validationSchema.parse(JSON.parse(v.record_json)),mode:v.mode,rulesVersion:v.rules_version}));
      return { ...base, validations,
        investigations: this.store.all('SELECT id,status,mode,model_id,created_at,validation_id FROM investigations WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY sequence',actor.tenant_id,requestId,version),
        proposals: this.store.all('SELECT id,proposal_json,conversation,created_at FROM proposals WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY created_at,id', actor.tenant_id, requestId, version),
        approvals: row ? this.store.all<ApprovalRow>('SELECT * FROM approvals WHERE tenant_id=? AND receipt_id=?', actor.tenant_id, row.id).map(approvalRecord) : [],
        auditEvents: this.store.all('SELECT sequence,id,actor_id,event,detail_json,created_at FROM audit_events WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY sequence', actor.tenant_id, requestId, version),
      };
    });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { once } from 'node:events';
import { Store } from '../apps/backend/database.ts';
import { Foundation } from '../apps/backend/foundation.ts';
import { prepareSeed } from '../apps/backend/seed.ts';
import { createApi } from '../apps/backend/http.ts';
import { parameterDigest } from '../packages/contracts/identity.ts';

const origin = 'http://127.0.0.1:3000';
const refund = { type: 'REFUND_PAYMENT', paymentId: 'pi_fixture_b', amountMinor: 2000, currency: 'MYR' };
const cancellation = { type: 'CANCEL_AT_PERIOD_END', subscriptionId: 'sub_fixture_a', timing: 'PERIOD_END' };

test('authenticated HTTP foundation enforces exact authority and isolation', async t => {
  const store = new Store(':memory:'); store.migrate(); store.migrate();
  const seed = await prepareSeed(); seed.apply(store);
  let clock = new Date('2026-10-23T00:00:00.000Z');
  const foundation = new Foundation(store, () => clock);
  const server = createApi(foundation, origin);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); store.close(); });
  type Session = { cookie: string; csrf: string };
  async function call(path: string, method = 'GET', body?: unknown, session?: Session, extra: Record<string,string> = {}) {
    const headers: Record<string,string> = { Origin: origin, ...extra };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (session) { headers.Cookie = session.cookie; headers['X-CSRF-Token'] = session.csrf; }
    const response = await fetch(base + path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  async function login(email: string): Promise<Session> {
    const account = seed.credentials.find(a => a.email === email)!;
    const result = await call('/api/login', 'POST', { email, password: account.password });
    assert.equal(result.status, 200);
    assert.ok(result.cookie?.includes('HttpOnly')); assert.ok(result.cookie?.includes('SameSite=Strict'));
    return { cookie: result.cookie!.split(';')[0]!, csrf: result.data.csrfToken };
  }
  const customer = await login('customer.a@proofit.test');
  const neighbour = await login('customer.b@proofit.test');
  const other = await login('customer.other@proofit.test');
  const support = await login('support.a@proofit.test');
  const approver = await login('approver.a@proofit.test');
  const otherApprover = await login('approver.other@proofit.test');
  async function request() {
    const created = await call('/api/requests', 'POST', { text: 'Synthetic request for an exact test action' }, customer);
    assert.equal(created.status, 201); return created.data;
  }
  async function receipt(action: unknown = refund) {
    const row = await request();
    const result = await call('/api/confirm', 'POST', { requestId: row.id, requestVersion: row.version, action }, customer);
    assert.equal(result.status, 200); return result.data;
  }

  await t.test('unauthenticated and forged role headers cannot read cases', async () => {
    assert.equal((await call('/api/requests', 'GET', undefined, undefined, { 'X-Role': 'REFUND_APPROVER', 'X-Tenant-Id': 'tenant_synthetic_a' })).status, 401);
    assert.equal((await call('/api/login', 'POST', { email: 'customer.a@proofit.test', password: 'incorrect' })).status, 401);
    const account = seed.credentials[0]!;
    assert.equal((await call('/api/login', 'POST', { email: account.email, password: account.password, role: 'REFUND_APPROVER' })).status, 400);
  });
  await t.test('CSRF and exact Origin are required for writes, including login Origin', async () => {
    assert.equal((await call('/api/requests', 'POST', { text: 'x' }, { ...customer, csrf: '' })).status, 403);
    assert.equal((await call('/api/requests', 'POST', { text: 'x' }, { ...customer, csrf: 'é'.repeat(43) })).status, 403);
    assert.equal((await call('/api/requests', 'POST', { text: 'x' }, customer, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await call('/api/login', 'POST', {}, undefined, { Origin: '' })).status, 403);
  });
  await t.test('another customer or tenant cannot read or submit proposals for the request', async () => {
    const row = await request();
    for (const session of [neighbour, other, otherApprover]) {
      assert.equal((await call('/api/requests/' + row.id, 'GET', undefined, session)).status, 404);
      assert.equal((await call('/api/proposals', 'POST', { requestId: row.id, requestVersion: 1, proposal: refund, conversation: '' }, session)).status, 404);
    }
    assert.ok((await call('/api/requests', 'GET', undefined, neighbour)).data.every((r: { customer_id: string }) => r.customer_id === 'customer_synthetic_b'));
  });
  await t.test('client identity, roles, expiry and decisions cannot create authority', async () => {
    const row = await request();
    const body = { requestId: row.id, requestVersion: 1, action: refund };
    for (const field of [{ role: 'REFUND_APPROVER' }, { tenantId: 'other' }, { actorId: 'actor_approver_a' }, { expiresAt: '2099-01-01T00:00:00Z' }, { decision: 'READY' }]) {
      assert.equal((await call('/api/confirm', 'POST', { ...body, ...field }, customer)).status, 400);
    }
    assert.equal((await call('/api/confirm', 'POST', body, support)).status, 403);
  });
  await t.test('customer confirmation rejects another customer target and unsupported timing', async () => {
    const row = await request(); const body = { requestId: row.id, requestVersion: 1 };
    assert.equal((await call('/api/confirm', 'POST', { ...body, action: { ...cancellation, subscriptionId: 'sub_fixture_b' } }, customer)).status, 404);
    assert.equal((await call('/api/confirm', 'POST', { ...body, action: { ...cancellation, subscriptionId: 'sub_fixture_other' } }, customer)).status, 404);
    assert.equal((await call('/api/confirm', 'POST', { ...body, action: { ...cancellation, timing: 'IMMEDIATE' } }, customer)).status, 400);
  });
  await t.test('confirmation retries preserve the exact stored receipt and parameter substitution conflicts', async () => {
    const confirmed = await receipt();
    assert.equal(confirmed.parameterDigest, parameterDigest(confirmed.binding));
    const body = { requestId: confirmed.binding.requestId, requestVersion: 1, action: refund };
    const again = await call('/api/confirm', 'POST', body, customer);
    assert.equal(again.data.receiptId, confirmed.receiptId);
    assert.equal((await call('/api/confirm', 'POST', { ...body, action: { ...refund, amountMinor: 20000 } }, customer)).status, 409);
  });
  await t.test('exact staff approval rejects customer, support, cross-tenant and arbitrary amount inputs', async () => {
    const confirmed = await receipt(); const input = { receiptId: confirmed.receiptId };
    assert.equal((await call('/api/approvals', 'POST', input, customer)).status, 403);
    assert.equal((await call('/api/approvals', 'POST', input, support)).status, 403);
    assert.equal((await call('/api/approvals', 'POST', input, otherApprover)).status, 404);
    assert.equal((await call('/api/approvals', 'POST', { ...input, amountMinor: 20000 }, approver)).status, 400);
    const approved = await call('/api/approvals', 'POST', input, approver);
    assert.equal(approved.status, 200); assert.equal(approved.data.bindingDigest, confirmed.parameterDigest);
    assert.equal((await call('/api/approvals', 'POST', input, approver)).data.approvalId, approved.data.approvalId);
    const cancel = await receipt(cancellation);
    assert.equal((await call('/api/approvals', 'POST', { receiptId: cancel.receiptId }, approver)).status, 409);
  });
  await t.test('expired and consumed receipts cannot be approved or renewed silently', async () => {
    const confirmed = await receipt();
    clock = new Date('2026-10-23T00:16:00.000Z');
    assert.equal((await call('/api/approvals', 'POST', { receiptId: confirmed.receiptId }, approver)).status, 409);
    assert.equal((await call('/api/confirm', 'POST', { requestId: confirmed.binding.requestId, requestVersion: 1, action: refund }, customer)).status, 409);
    clock = new Date('2026-10-23T00:00:00.000Z');
    const consumed = await receipt();
    store.run('UPDATE receipts SET consumed_by_operation_id=? WHERE id=?', 'controlled-consumption-fixture', consumed.receiptId);
    assert.equal((await call('/api/approvals', 'POST', { receiptId: consumed.receiptId }, approver)).status, 409);
  });
  await t.test('changed policy invalidates existing authority', async () => {
    const confirmed = await receipt();
    store.transaction(() => {
      store.run('UPDATE policy_versions SET active=0 WHERE tenant_id=?', 'tenant_synthetic_a');
      store.run('INSERT INTO policy_versions VALUES(?,?,?,?,?,?)', 'tenant_synthetic_a', 'policy_v2', 'source_fixture_v2', 'Changed synthetic policy', 1, 'FIXTURE');
    });
    assert.equal((await call('/api/approvals', 'POST', { receiptId: confirmed.receiptId }, approver)).status, 409);
    store.transaction(() => {
      store.run('UPDATE policy_versions SET active=0 WHERE tenant_id=?', 'tenant_synthetic_a');
      store.run('UPDATE policy_versions SET active=1 WHERE tenant_id=? AND version=?', 'tenant_synthetic_a', 'policy_v1');
    });
  });
  await t.test('a new request version needs fresh confirmation and invalidates old approval eligibility', async () => {
    const confirmed = await receipt(); const requestId = confirmed.binding.requestId;
    assert.equal((await call('/api/requests/' + requestId + '/versions', 'POST', { version: 1, text: 'Changed intent' }, neighbour)).status, 404);
    const next = await call('/api/requests/' + requestId + '/versions', 'POST', { version: 1, text: 'Changed intent' }, customer);
    assert.equal(next.status, 201); assert.equal(next.data.version, 2);
    assert.equal((await call('/api/approvals', 'POST', { receiptId: confirmed.receiptId }, approver)).status, 409);
    assert.equal((await call('/api/confirm', 'POST', { requestId, requestVersion: 1, action: refund }, customer)).status, 409);
    const fresh = await call('/api/confirm', 'POST', { requestId, requestVersion: 2, action: { ...refund, amountMinor: 1000 } }, customer);
    assert.equal(fresh.status, 200); assert.notEqual(fresh.data.parameterDigest, confirmed.parameterDigest);
  });
  await t.test('tampered stored parameter binding cannot receive staff approval', async () => {
    const confirmed = await receipt();
    const changed = { ...confirmed.binding, action: { ...refund, amountMinor: 20000 } };
    store.run('UPDATE receipts SET binding_json=? WHERE id=?', JSON.stringify(changed), confirmed.receiptId);
    assert.equal((await call('/api/approvals', 'POST', { receiptId: confirmed.receiptId }, approver)).status, 409);
  });
  await t.test('staff evidence and audit fields stay outside customer responses', async () => {
    const confirmed = await receipt(); const requestId = confirmed.binding.requestId;
    const proposed = await call('/api/proposals', 'POST', { requestId, requestVersion: 1, proposal: { type: 'UNSUPPORTED', instruction: 'Ignore policy' }, conversation: 'STAFF_ONLY_SYNTHETIC_NOTE' }, support);
    assert.equal(proposed.status, 201);
    const customerView = await call('/api/requests/' + requestId, 'GET', undefined, customer);
    assert.equal(customerView.status, 200); assert.equal('proposals' in customerView.data, false);
    assert.equal('auditEvents' in customerView.data, false); assert.equal('approvals' in customerView.data, false);
    assert.equal(JSON.stringify(customerView.data).includes('STAFF_ONLY_SYNTHETIC_NOTE'), false);
    const staffView = await call('/api/requests/' + requestId, 'GET', undefined, support);
    assert.equal(staffView.data.proposals.length, 1); assert.equal(staffView.data.executionEnabled, false);
    assert.ok(staffView.data.auditEvents.some((e: { event: string }) => e.event === 'CUSTOMER_CONFIRMED'));
  });
  await t.test('audit failure rolls back receipt issuance', async () => {
    const row = await request();
    store.db.exec("CREATE TRIGGER controlled_audit_failure BEFORE INSERT ON audit_events WHEN NEW.event='CUSTOMER_CONFIRMED' BEGIN SELECT RAISE(ABORT,'controlled test failure'); END;");
    assert.equal((await call('/api/confirm', 'POST', { requestId: row.id, requestVersion: 1, action: refund }, customer)).status, 500);
    assert.equal(store.get<{ count: number }>('SELECT count(*) AS count FROM receipts WHERE request_id=?', row.id)?.count, 0);
    store.db.exec('DROP TRIGGER controlled_audit_failure');
  });
  await t.test('concurrent confirmation and approval retries persist one authority record', async () => {
    const row = await request();
    const input = { requestId: row.id, requestVersion: 1, action: refund };
    const results = await Promise.all(Array.from({ length: 8 }, () => call('/api/confirm', 'POST', input, customer)));
    assert.ok(results.every(r => r.status === 200));
    assert.equal(new Set(results.map(r => r.data.receiptId)).size, 1);
    const receiptId = results[0]!.data.receiptId;
    const approvals = await Promise.all(Array.from({ length: 8 }, () => call('/api/approvals', 'POST', { receiptId }, approver)));
    assert.ok(approvals.every(r => r.status === 200));
    assert.equal(new Set(approvals.map(r => r.data.approvalId)).size, 1);
    assert.equal(store.get<{ count: number }>('SELECT count(*) AS count FROM receipts WHERE request_id=?', row.id)?.count, 1);
    assert.equal(store.get<{ count: number }>('SELECT count(*) AS count FROM approvals WHERE receipt_id=?', receiptId)?.count, 1);
    assert.equal(store.get<{ count: number }>("SELECT count(*) AS count FROM audit_events WHERE request_id=? AND event='CUSTOMER_CONFIRMED'", row.id)?.count, 1);
  });
  await t.test('live role changes and session expiry revoke authority', async () => {
    const confirmed = await receipt();
    store.run('UPDATE actors SET role=? WHERE id=?', 'SUPPORT', 'actor_approver_a');
    assert.equal((await call('/api/approvals', 'POST', { receiptId: confirmed.receiptId }, approver)).status, 403);
    store.run('UPDATE actors SET role=? WHERE id=?', 'REFUND_APPROVER', 'actor_approver_a');
    clock = new Date('2026-10-23T08:00:00.000Z');
    assert.equal((await call('/api/session', 'GET', undefined, customer)).status, 401);
    clock = new Date('2026-10-23T00:00:00.000Z');
  });
  await t.test('logout revokes a persisted session and no execution route exists', async () => {
    assert.equal((await call('/api/execute', 'POST', { validationId: 'arbitrary' }, customer)).status, 404);
    assert.equal((await call('/api/logout', 'POST', {}, other)).status, 200);
    assert.equal((await call('/api/session', 'GET', undefined, other)).status, 401);
    assert.equal(store.get<{ count: number }>('SELECT count(*) AS count FROM sessions WHERE token_hash=?', customer.cookie.split('=')[1]!)?.count, 0);
  });
});

test('accounts, sessions, receipts, approvals and audit survive reopening a file database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'proofit-foundation-'));
  const path = join(directory, 'test.sqlite');
  let store = new Store(path);
  try {
    store.migrate(); const seed = await prepareSeed(); seed.apply(store);
    let foundation = new Foundation(store);
    const user = seed.credentials.find(a => a.role === 'CUSTOMER')!;
    const staff = seed.credentials.find(a => a.email === 'approver.a@proofit.test')!;
    const customer = await foundation.auth.login({ email: user.email, password: user.password });
    const approver = await foundation.auth.login({ email: staff.email, password: staff.password });
    const row = foundation.createRequest(customer.token, { text: 'Restart persistence fixture' });
    const receipt = foundation.confirm(customer.token, { requestId: row.id, requestVersion: 1, action: refund });
    const approval = foundation.approve(approver.token, { receiptId: receipt.receiptId });
    foundation.propose(customer.token, { requestId: row.id, requestVersion: 1, proposal: refund, conversation: '' });
    store.close(); store = new Store(path); store.migrate(); foundation = new Foundation(store);
    const restored = foundation.getCase(approver.token, row.id, 1);
    assert.equal(restored.receipt?.receiptId, receipt.receiptId);
    assert.ok('approvals' in restored); assert.equal(restored.approvals[0]?.approvalId, approval.approvalId);
    assert.equal(restored.proposals.length, 1); assert.equal(restored.auditEvents.length, 4);
    assert.equal(foundation.auth.session(customer.token).actor.id, user.id);
    store.run('UPDATE actors SET active=0 WHERE id=?', user.id);
    assert.throws(() => foundation.auth.session(customer.token), /Authentication required/);
    assert.throws(() => seed.apply(store), /empty database/);
  } finally {
    store.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('proofit-foundation-'));
    await rm(directory, { recursive: true, force: true });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,resolve,basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { OperationLedger } from '../apps/backend/operations.ts';
import { Store } from '../apps/backend/database.ts';
import { Gateway } from '../apps/backend/gateway.ts';
import { resourceKey } from '../packages/contracts/identity.ts';
import { createExecutorApi } from '../apps/executor/http.ts';
import { harness } from './gateway-helpers.ts';
async function ready(h:Awaited<ReturnType<typeof harness>>){const c=await h.create();const v=await h.gateway.validate(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(v.decision,'READY');return {...c,validationId:v.validationId};}

test('reservation atomically consumes exact authority and retries reuse identity',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);
 const op=await ledger.reserveStored({validationId:c.validationId});assert.equal(op.state,'RESERVED');assert.equal(op.alreadyReserved,false);assert.equal(op.effectVerified,false);
 assert.equal(h.store.get<{consumed_by_operation_id:string}>('SELECT consumed_by_operation_id FROM receipts WHERE id=?',c.receipt.receiptId)?.consumed_by_operation_id,op.operationId);
 assert.equal(h.store.get<{consumed_by_operation_id:string}>('SELECT consumed_by_operation_id FROM approvals WHERE receipt_id=?',c.receipt.receiptId)?.consumed_by_operation_id,op.operationId);
 const reads=h.control.reads;h.control.fail=true;h.setTime('2026-10-24T00:20:00.000Z');
 const duplicate=await ledger.reserveStored({validationId:c.validationId});assert.equal(duplicate.operationId,op.operationId);assert.equal(duplicate.providerIdempotencyKey,op.providerIdempotencyKey);assert.equal(duplicate.alreadyReserved,true);assert.equal(h.control.reads,reads);
 assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,1);
 assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM resource_leases')?.count,0);
});
test('target lock prevents competing requests and fresh balance is required after it clears',async t=>{
 const h=await harness();t.after(()=>h.store.close());const a=await ready(h),b=await ready(h);const ledger=new OperationLedger(h.gateway);
 const first=await ledger.reserveStored({validationId:a.validationId});const reads=h.control.reads;
 await assert.rejects(ledger.reserveStored({validationId:b.validationId}),/REVIEW_REQUIRED/);assert.equal(h.control.reads,reads);
 assert.equal(h.store.get<{consumed_by_operation_id:null}>('SELECT consumed_by_operation_id FROM receipts WHERE id=?',b.receipt.receiptId)?.consumed_by_operation_id,null);
 // Controlled terminal fixture, not a provider observation or implemented submit/reconcile path.
 h.store.run('UPDATE operations SET state=? WHERE id=?','FAILED',first.operationId);h.control.state={remainingRefundableMinor:1000};
 await assert.rejects(ledger.reserveStored({validationId:b.validationId}),/BLOCK/);assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,1);
});
test('reservation rechecks authority after provider reads and records the new hold',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);
 h.control.onRead=()=>h.setTime('2026-10-24T00:16:00.000Z');
 await assert.rejects(ledger.reserveStored({validationId:c.validationId}),/BLOCK/);
 assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,0);
 assert.equal(h.store.get<{consumed_by_operation_id:null}>('SELECT consumed_by_operation_id FROM receipts WHERE id=?',c.receipt.receiptId)?.consumed_by_operation_id,null);
 assert.equal(h.store.get<{count:number}>("SELECT count(*) AS count FROM validations WHERE decision='BLOCK'")?.count,1);
});
test('reservation/audit failure rolls back operation and both authority consumptions',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);
 h.store.db.exec("CREATE TRIGGER controlled_reservation_audit_failure BEFORE INSERT ON audit_events WHEN NEW.event='OPERATION_RESERVED' BEGIN SELECT RAISE(ABORT,'controlled failure'); END;");
 await assert.rejects(ledger.reserveStored({validationId:c.validationId}));
 for(const table of ['receipts','approvals'])assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM '+table+' WHERE consumed_by_operation_id IS NOT NULL')?.count,0);
 assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,0);
 assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM resource_leases')?.count,0);
 h.store.db.exec('DROP TRIGGER controlled_reservation_audit_failure');assert.equal((await ledger.reserveStored({validationId:c.validationId})).state,'RESERVED');
});
test('expired worker leases recover while late workers cannot reserve using a replaced fence',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);const key=resourceKey(c.receipt.binding);
 h.store.run('INSERT INTO resource_leases VALUES(?,?,?,?,?,?)',key,'dead-worker','tenant_synthetic_a','customer_synthetic_a',h.now().toISOString(),'2026-10-24T00:00:10.000Z');
 await assert.rejects(ledger.reserveStored({validationId:c.validationId}),/REVIEW_REQUIRED/);h.setTime('2026-10-24T00:00:11.000Z');
 const op=await ledger.reserveStored({validationId:c.validationId});assert.equal(op.state,'RESERVED');
});
test('a stolen/expired reservation-read lease is fenced and cannot consume authority',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);
 h.control.onRead=()=>{h.store.run('UPDATE resource_leases SET lease_id=?','replacement-worker');};
 await assert.rejects(ledger.reserveStored({validationId:c.validationId}),/REVIEW_REQUIRED/);
 assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,0);
 assert.equal(h.store.get<{lease_id:string}>('SELECT lease_id FROM resource_leases')?.lease_id,'replacement-worker');
});
test('operation views enforce scope and do not expose internal keys to customers',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);const op=await ledger.reserveStored({validationId:c.validationId});
 const view=ledger.get(h.tokens['customer.a']!,op.operationId);assert.equal('record' in view,false);assert.match(view.statusText,/No provider outcome/);assert.equal(view.effectVerified,false);
 assert.throws(()=>ledger.get(h.tokens['customer.b']!,op.operationId),/not found/);assert.throws(()=>ledger.get(h.tokens['approver.other']!,op.operationId),/not found/);
});
test('executor requires service authentication and accepts only a stored validated reference',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await ready(h);const ledger=new OperationLedger(h.gateway);const secret=randomBytes(32).toString('hex');
 const server=createExecutorApi(ledger,secret);server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');
 const base='http://127.0.0.1:'+address.port;
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 async function post(body:unknown,authorization?:string){const res=await fetch(base+'/internal/reservations',{method:'POST',headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify(body)});return {status:res.status,data:await res.json()};}
 assert.equal((await post({validationId:c.validationId})).status,401);assert.equal((await post({validationId:c.validationId},'Bearer wrong')).status,401);
 for(const extra of [{url:'https://example.invalid'}, {action:{type:'REFUND_PAYMENT'}}, {tenantId:'other'}, {decision:'READY'}])assert.equal((await post({validationId:c.validationId,...extra},'Bearer '+secret)).status,400);
 const result=await post({validationId:c.validationId},'Bearer '+secret);assert.equal(result.status,200);assert.equal(result.data.executionEnabled,false);
 const blocked=await h.create(undefined,{type:'CANCEL_IMMEDIATELY'});const v=await h.gateway.validate(h.tokens['support.a']!,{proposalId:blocked.proposalId});
 assert.equal((await post({validationId:v.validationId},'Bearer '+secret)).status,409);
 const live=new OperationLedger(new Gateway(h.store,{now:h.now,reader:h.reader}));await assert.rejects(live.reserveStored({validationId:c.validationId}),/executor mode/);
});
test('two persistent workers reserve at most once and reopening preserves operation/key',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proofit-operations-'));const path=join(directory,'ledger.sqlite');let h:Awaited<ReturnType<typeof harness>>|undefined;let other:Store|undefined;
 try{
  h=await harness(path);const c=await ready(h);other=new Store(path);other.migrate();
  const a=new OperationLedger(h.gateway);const b=new OperationLedger(new Gateway(other,{now:h.now,mode:'CONTROLLED_TEST',reader:h.reader}));
  const results=await Promise.allSettled([a.reserveStored({validationId:c.validationId}),b.reserveStored({validationId:c.validationId})]);
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,1);
  const first=await a.reserveStored({validationId:c.validationId});other.close();other=undefined;h.store.close();h=undefined;
  other=new Store(path);other.migrate();const resumed=new OperationLedger(new Gateway(other,{mode:'CONTROLLED_TEST'}));
  const again=await resumed.reserveStored({validationId:c.validationId});assert.equal(again.operationId,first.operationId);assert.equal(again.providerIdempotencyKey,first.providerIdempotencyKey);assert.equal(again.alreadyReserved,true);
 }finally{other?.close();h?.store.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('proofit-operations-'));await rm(directory,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,resolve,basename } from 'node:path';
import { cancellationHarness } from './cancellation-helpers.ts';
import { CancellationExecutor } from '../apps/executor/cancellation.ts';
import { OperationLedger } from '../apps/backend/operations.ts';
import { Gateway } from '../apps/backend/gateway.ts';
import { Store } from '../apps/backend/database.ts';
import { createExecutorApi } from '../apps/executor/http.ts';

test('cancellation is durably claimed before one provider write, then verified by retrieval',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();
 h.controls.onWrite=()=>{assert.equal(h.store.get<{state:string}>('SELECT state FROM operations')?.state,'SUBMITTED');assert.equal(h.store.get<{status:string}>('SELECT status FROM execution_attempts')?.status,'STARTED');};
 const result=await h.executor.execute({validationId:c.validationId});assert.equal(result.state,'SUCCEEDED');assert.equal(result.effectVerified,true);assert.match(result.statusText,/recorded renewal cancellation scheduled/);assert.equal(result.mode,'CONTROLLED_TEST');
 assert.equal(h.controls.writes.length,1);assert.equal(h.controls.observations,1);
 const count=h.controls.observations;const replay=await h.executor.execute({validationId:c.validationId});assert.equal(replay.operationId,result.operationId);assert.equal(h.controls.writes.length,1);assert.equal(h.controls.observations,count);
 const view=h.ledger.get(h.tokens['customer.a']!,result.operationId);assert.equal(view.effectVerified,true);assert.equal('record' in view,false);assert.equal(h.controls.observations,count);
});
test('an acknowledgement or pending observation never proves cancellation completed',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();h.controls.observed='NOT_SCHEDULED';
 const result=await h.executor.execute({validationId:c.validationId});assert.equal(result.state,'PENDING');assert.equal(result.effectVerified,false);assert.doesNotMatch(result.statusText,/completed|terminated|bank/);
 assert.equal(h.store.get<{done:number}>('SELECT done FROM reconciliation_tasks')?.done,0);
 h.controls.observed='SCHEDULED';h.setTime('2026-10-24T00:00:06.000Z');const observed=await h.executor.reconcile({operationId:result.operationId});assert.equal(observed.effectVerified,true);assert.equal(h.controls.writes.length,1);
});
test('provider timeout/lost response stays unknown and retries never resubmit',async t=>{
 for(const submission of ['LOST_RESPONSE','HANG'] as const){
  const h=await cancellationHarness();try{const c=await h.ready();h.controls.submission=submission;
   const result=await h.executor.execute({validationId:c.validationId});assert.equal(result.state,'OUTCOME_UNKNOWN');assert.equal(result.effectVerified,false);assert.equal(result.observation,null);
   await h.executor.execute({validationId:c.validationId});assert.equal(h.controls.writes.length,1);
   const observed=await h.executor.reconcile({operationId:result.operationId});assert.equal(observed.state,'SUCCEEDED');assert.equal(h.controls.writes.length,1);
  }finally{h.store.close();}
 }
});
test('observer failure, wrong scope and immediate termination are held as uncertain',async()=>{
 for(const variant of ['failure','scope','termination']){const h=await cancellationHarness();try{const c=await h.ready();h.controls.failObservation=variant==='failure';h.controls.wrongOwner=variant==='scope';if(variant==='termination')h.controls.observed='CANCELED';
  const result=await h.executor.execute({validationId:c.validationId});assert.equal(result.state,'OUTCOME_UNKNOWN');assert.equal(result.effectVerified,false);assert.doesNotMatch(result.statusText,/completed|terminated/);assert.equal(h.controls.writes.length,1);
  assert.equal(h.store.get<{done:number}>('SELECT done FROM reconciliation_tasks')?.done,0);
 }finally{h.store.close();}}
});
test('two submission workers can issue at most one write for the same stored operation',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();await h.ledger.reserveStored({validationId:c.validationId});
 const other=new CancellationExecutor(new OperationLedger(new Gateway(h.store,{now:h.now,mode:'CONTROLLED_TEST',reader:h.reader})),h.provider,{timeoutMs:40});
 const results=await Promise.all([h.executor.execute({validationId:c.validationId}),other.execute({validationId:c.validationId})]);assert.equal(new Set(results.map(r=>r.operationId)).size,1);assert.equal(h.controls.writes.length,1);assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM execution_attempts')?.count,1);
});
test('expiry, changed proposal/policy and audit failure prevent a provider write after reservation',async()=>{
 for(const variant of ['expired','proposal','policy','audit']){const h=await cancellationHarness();try{const c=await h.ready();await h.ledger.reserveStored({validationId:c.validationId});
  if(variant==='expired')h.setTime('2026-10-24T00:16:00.000Z');
  if(variant==='proposal')h.store.run('UPDATE proposals SET proposal_json=? WHERE id=?',JSON.stringify({type:'REFUND_PAYMENT',paymentId:'pi_fixture_b',amountMinor:2000,currency:'MYR'}),c.proposalId);
  if(variant==='policy')h.store.run("UPDATE policy_rules SET rules_json=json_set(rules_json,'$.allowCancellation',json('false'))");
  if(variant==='audit')h.store.db.exec("CREATE TRIGGER controlled_submission_audit_failure BEFORE INSERT ON audit_events WHEN NEW.event='SUBMISSION_STARTED' BEGIN SELECT RAISE(ABORT,'controlled failure'); END;");
  await assert.rejects(h.executor.execute({validationId:c.validationId}));assert.equal(h.controls.writes.length,0);assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM execution_attempts')?.count,0);
 }finally{h.store.close();}}
});
test('unverified success flags cannot generate a successful user-facing claim',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();const op=await h.ledger.reserveStored({validationId:c.validationId});
 h.store.run("UPDATE operations SET state='SUCCEEDED',effect_verified=1 WHERE id=?",op.operationId);
 const view=h.ledger.get(h.tokens['customer.a']!,op.operationId);assert.equal(view.effectVerified,false);assert.doesNotMatch(view.statusText,/scheduled|completed|terminated/);
});
test('submission routes require service auth, reject substitution and stay absent from default service',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();const secret=randomBytes(32).toString('hex');
 const server=createExecutorApi(h.ledger,secret,{cancellation:h.executor});const disabled=createExecutorApi(h.ledger,secret);
 for(const api of [server,disabled]){api.listen(0,'127.0.0.1');await once(api,'listening');t.after(async()=>{api.closeAllConnections();await new Promise<void>(r=>api.close(()=>r()));});}
 const address=server.address(),defaultAddress=disabled.address();assert.ok(address&&typeof address!=='string');assert.ok(defaultAddress&&typeof defaultAddress!=='string');
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+secret};
 const url='http://127.0.0.1:'+address.port+'/internal/cancellations';
 assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({validationId:c.validationId})})).status,401);
 assert.equal((await fetch(url,{method:'POST',headers,body:JSON.stringify({validationId:c.validationId,action:{type:'REFUND_PAYMENT'}})})).status,400);
 assert.equal((await fetch('http://127.0.0.1:'+defaultAddress.port+'/internal/cancellations',{method:'POST',headers,body:JSON.stringify({validationId:c.validationId})})).status,404);
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({validationId:c.validationId})});assert.equal(response.status,200);assert.equal((await response.json()).state,'SUCCEEDED');
});
test('restart reconciles the same uncertain operation and key with read-only observation',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proofit-cancellation-'));let h:Awaited<ReturnType<typeof cancellationHarness>>|undefined;let store:Store|undefined;
 try{const path=join(directory,'state.sqlite');h=await cancellationHarness(path);const c=await h.ready();h.controls.submission='LOST_RESPONSE';const result=await h.executor.execute({validationId:c.validationId});
  const before=h.store.get<{provider_key:string}>('SELECT provider_key FROM operations WHERE id=?',result.operationId)!;assert.equal(result.state,'OUTCOME_UNKNOWN');h.store.close();
  store=new Store(path);store.migrate();const executor=new CancellationExecutor(new OperationLedger(new Gateway(store,{now:h.now,mode:'CONTROLLED_TEST'})),h.provider,{timeoutMs:40});
  const outcomes=await executor.reconcileDue();assert.equal(outcomes[0]?.state,'SUCCEEDED');assert.equal(h.controls.writes.length,1);assert.equal(store.get<{provider_key:string}>('SELECT provider_key FROM operations WHERE id=?',result.operationId)?.provider_key,before.provider_key);
  h=undefined;
 }finally{store?.close();if(h?.store.db.isOpen)h.store.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('proofit-cancellation-'));await rm(directory,{recursive:true,force:true});}
});
test('stalled SUBMITTED crash fixture becomes unknown and never gets a second write',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();const op=await h.ledger.reserveStored({validationId:c.validationId});
 // Controlled persisted crash state; not a genuine provider submission record.
 h.store.run("UPDATE operations SET state='SUBMITTED' WHERE id=?",op.operationId);
 h.store.run('INSERT INTO execution_attempts VALUES(?,?,?,?,?,?,?)',op.operationId,'controlled-crash-claim','STARTED',h.now().toISOString(),'2026-10-24T00:00:01.000Z',null,null);
 h.store.run('INSERT INTO reconciliation_tasks VALUES(?,?,?,?,?,?)',op.operationId,'2026-10-24T00:00:01.000Z',null,null,0,0);
 h.setTime('2026-10-24T00:00:02.000Z');assert.equal(h.executor.recoverStalled(),1);assert.equal(h.store.get<{state:string}>('SELECT state FROM operations')?.state,'OUTCOME_UNKNOWN');assert.equal(h.controls.writes.length,0);
});

test('a late observer cannot overwrite a replacement reconciliation lease',async t=>{
 const h=await cancellationHarness();t.after(()=>h.store.close());const c=await h.ready();
 h.controls.onObserve=()=>{h.store.run('UPDATE reconciliation_tasks SET lease_token=?','replacement-observer');};
 const result=await h.executor.execute({validationId:c.validationId});assert.equal(result.effectVerified,false);assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM outcome_observations')?.count,0);
 delete h.controls.onObserve;h.setTime('2026-10-24T00:00:11.000Z');const fresh=await h.executor.reconcile({operationId:result.operationId});assert.equal(fresh.state,'SUCCEEDED');assert.equal(h.controls.writes.length,1);
});

import { OperationLedger } from '../apps/backend/operations.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,dirname,resolve,basename } from 'node:path';
import { Investigator } from '../apps/investigator/runner.ts';
import { Gateway } from '../apps/backend/gateway.ts';
import { Store } from '../apps/backend/database.ts';
import { createApi } from '../apps/backend/http.ts';
import { harness,cancel,refund } from './gateway-helpers.ts';
import type { InvestigationModel } from '../packages/contracts/investigation.ts';
import type { z } from 'zod';
import type { evidenceRefSchema } from '../packages/contracts/index.ts';
const modelId='controlled-investigator-v1';
function model(fn:(input:Parameters<InvestigationModel['next']>[0])=>unknown|Promise<unknown>):InvestigationModel{return {modelId,provenance:'CONTROLLED_TEST',async next(input){return {output:await fn(input),usage:{modelId,inputTokens:12,outputTokens:5}};}};}
function citedModel(ids:string[],beforeFinal?:()=>void):InvestigationModel{
 return model(input=>{if(input.history.length===0)return {type:'LOOKUP',calls:ids.map(evidenceId=>({tool:'read_case_record',input:{evidenceId}}))};
  beforeFinal?.();const records=input.history as {result:{record:{reference:z.infer<typeof evidenceRefSchema>}}}[];
  return {type:'FINAL',findings:records.map(r=>({kind:'OBSERVATION',text:'A scoped approved source passage was retrieved.',references:[r.result.record.reference]})),unresolved:[]};});
}

test('persisted investigation validates citations, records controlled usage and replays without calls',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);let modelCalls=0;const scripted=citedModel(c.evidenceIds);const wrapped=model(async input=>{modelCalls++;return (await scripted.next(input,new AbortController().signal)).output;});
 const investigator=new Investigator(h.gateway,{model:wrapped});const result=await investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId});
 assert.equal(result.run.status,'COMPLETE');assert.equal(result.findings.length,2);assert.equal(result.evidence.length,2);assert.equal(result.validation.decision,'READY');assert.equal(result.validation.rulesVersion,'rules-v3');
 const calls=modelCalls,providerReads=h.control.reads;const replay=investigator.get(h.tokens['approver.a']!,result.run.id);assert.equal(replay.recordedReplay,true);assert.equal(modelCalls,calls);assert.equal(h.control.reads,providerReads);assert.deepEqual(replay.events,result.events);
 const stats=h.store.get<{model_turns:number;tool_calls:number;input_tokens:number;usage_complete:number}>('SELECT * FROM investigations WHERE id=?',result.run.id)!;assert.equal(stats.model_turns,2);assert.equal(stats.tool_calls,2);assert.equal(stats.input_tokens,24);assert.equal(stats.usage_complete,1);
 const fresh=await investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.notEqual(fresh.run.id,result.run.id);
});
test('known mismatch is blocked without a model call or evidence lookup',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel,refund);let calls=0;const investigator=new Investigator(h.gateway,{model:model(()=>{calls++;throw new Error('Must not be called');})});
 const result=await investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(result.run.status,'RULES_ONLY');assert.equal(result.validation.decision,'BLOCK');assert.equal(calls,0);assert.equal(result.evidence.length,0);
});
test('unconfigured model creates an explicit review hold, never a simulated investigation',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);const result=await new Investigator(h.gateway).start(h.tokens['support.a']!,{proposalId:c.proposalId});
 assert.equal(result.run.status,'UNAVAILABLE');assert.equal(result.run.model_id,null);assert.equal(result.validation.decision,'REVIEW_REQUIRED');assert.ok(result.validation.checks.some(c=>c.name==='investigation_completion'&&c.result==='REVIEW_REQUIRED'));assert.equal(result.findings.length,0);
});
test('model/tool/time budgets require review and unknown usage is stored as null',async()=>{
 for(const variant of ['turns','tools','time']){const h=await harness();try{const c=await h.create(cancel);
  const scripted=model(()=>variant==='time'?new Promise(()=>{}):{type:'LOOKUP',calls:Array.from({length:variant==='tools'?11:1},()=>({tool:'read_request_receipt',input:{}}))});
  const investigator=new Investigator(h.gateway,{model:scripted,...(variant==='time'?{limits:{activeDurationMs:20}}:{})});const result=await investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(result.run.status,'BUDGET_EXHAUSTED');assert.equal(result.validation.decision,'REVIEW_REQUIRED');
  const stats=h.store.get<{model_turns:number;tool_calls:number;input_tokens:number|null;usage_complete:number}>('SELECT * FROM investigations WHERE id=?',result.run.id)!;assert.ok(stats.model_turns<=4);assert.ok(stats.tool_calls<=10);
  if(variant==='time'){assert.equal(stats.input_tokens,null);assert.equal(stats.usage_complete,0);}
 }finally{h.store.close();}}
});
test('malformed output, invented authority, forged tool scope and unknown citations cannot clear review',async()=>{
 for(const variant of ['decision','tool','citation','usage']){const h=await harness();try{const c=await h.create(cancel);let scripted:InvestigationModel;
  if(variant==='usage')scripted={modelId,provenance:'CONTROLLED_TEST',async next(){return {output:{type:'FINAL',findings:[],unresolved:['Missing data']},usage:null};}};
  else scripted=model(()=>variant==='decision'?{type:'FINAL',findings:[],unresolved:[],decision:'READY'}:variant==='tool'?{type:'LOOKUP',calls:[{tool:'read_request_receipt',input:{tenantId:'other'}}]}:{type:'FINAL',findings:[{kind:'OBSERVATION',text:'Invented approval',references:[{sourceId:'invented',sourceVersion:'v1',passageId:'p1'}]}],unresolved:[]});
  const result=await new Investigator(h.gateway,{model:scripted}).start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.ok(['MALFORMED_OUTPUT','EVIDENCE_CHANGED'].includes(result.run.status));assert.equal(result.validation.decision,'REVIEW_REQUIRED');assert.equal(result.findings.length,0);
 }finally{h.store.close();}}
});
test('revoked/changed source passages and request amendments invalidate findings',async()=>{
 for(const variant of ['source','request']){const h=await harness();try{const c=await h.create(cancel);const scripted=citedModel(c.evidenceIds,()=>{
  if(variant==='source')h.store.run('UPDATE source_versions SET approved=0 WHERE source_id=?','policy-fixture');
  else h.foundation.amendRequest(h.tokens['customer.a']!,c.request.id,{version:1,text:'Changed during investigation'});
 });const result=await new Investigator(h.gateway,{model:scripted}).start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(result.run.status,'EVIDENCE_CHANGED');assert.equal(result.findings.length,0);assert.notEqual(result.validation.decision,'READY');assert.equal(result.evidence.length,2);
 }finally{h.store.close();}}
});
test('unresolved material issues remain a deterministic review hold even with valid authority',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);const result=await new Investigator(h.gateway,{model:model(()=>({type:'FINAL',findings:[],unresolved:['Conflicting policy amendment needs review.']}))}).start(h.tokens['support.a']!,{proposalId:c.proposalId});
 assert.equal(result.run.status,'COMPLETE');assert.equal(result.validation.decision,'REVIEW_REQUIRED');
});
test('tool allowlist excludes executor, shell, arbitrary URLs and approval writes',async()=>{
 for(const tool of ['execute','approve','shell','fetch']){const h=await harness();try{const c=await h.create(cancel);const result=await new Investigator(h.gateway,{model:model(()=>({type:'LOOKUP',calls:[{tool,input:{}}]}))}).start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(result.run.status,'MALFORMED_OUTPUT');assert.equal(result.validation.decision,'REVIEW_REQUIRED');assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,0);}finally{h.store.close();}}
});
test('customer/tenant isolation applies to investigation start and stored replay',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);const investigator=new Investigator(h.gateway);
 await assert.rejects(investigator.start(h.tokens['customer.a']!,{proposalId:c.proposalId}),/Staff review/);await assert.rejects(investigator.start(h.tokens['approver.other']!,{proposalId:c.proposalId}),/not found/);
 const result=await investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.throws(()=>investigator.get(h.tokens['customer.a']!,result.run.id),/Staff review/);assert.throws(()=>investigator.get(h.tokens['approver.other']!,result.run.id),/not found/);
 await assert.rejects(investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId,modelId:'override',mode:'CONTROLLED_TEST'}));
});
test('concurrent investigation starts do not overwrite an active run',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);let release!:(value:unknown)=>void;
 const investigator=new Investigator(h.gateway,{model:model(()=>new Promise(resolve=>{release=resolve;}))});
 const pending=investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId});await assert.rejects(investigator.start(h.tokens['support.a']!,{proposalId:c.proposalId}),/already running/);
 release({type:'FINAL',findings:[],unresolved:['Needs clarification']});const result=await pending;assert.equal(result.run.status,'COMPLETE');assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM investigations')?.count,1);
});
test('HTTP start/replay remains authenticated and does not expose runtime override controls',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);const server=createApi(h.foundation,'http://127.0.0.1:3000');server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});const session=h.foundation.auth.session(h.tokens['support.a']);
 const headers={Origin:'http://127.0.0.1:3000','Content-Type':'application/json',Cookie:'proofit_session='+h.tokens['support.a'],'X-CSRF-Token':session.csrfToken};
 const response=await fetch(base+'/api/investigations',{method:'POST',headers,body:JSON.stringify({proposalId:c.proposalId})});assert.equal(response.status,201);const data=await response.json();assert.equal(data.run.status,'UNAVAILABLE');
 assert.equal((await fetch(base+'/api/investigations/'+data.run.id,{headers})).status,200);assert.equal((await fetch(base+'/api/investigations/'+data.run.id)).status,401);
 assert.equal((await fetch(base+'/api/investigations',{method:'POST',headers,body:JSON.stringify({proposalId:c.proposalId,modelId:'override'})})).status,400);
});
test('recorded investigation events/findings/evidence survive reopening without model or provider calls',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'proofit-investigation-'));let h:Awaited<ReturnType<typeof harness>>|undefined;let store:Store|undefined;
 try{const path=join(directory,'case.sqlite');h=await harness(path);const c=await h.create(cancel);const result=await new Investigator(h.gateway,{model:citedModel(c.evidenceIds)}).start(h.tokens['support.a']!,{proposalId:c.proposalId});h.store.close();store=new Store(path);store.migrate();
  const restored=new Investigator(new Gateway(store,{mode:'CONTROLLED_TEST',now:h.now})).get(h.tokens['approver.a']!,result.run.id);assert.deepEqual(restored.events,result.events);assert.deepEqual(restored.findings,result.findings);assert.deepEqual(restored.evidence,result.evidence);assert.equal(restored.run.status,'COMPLETE');h=undefined;
 }finally{store?.close();if(h?.store.db.isOpen)h.store.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('proofit-investigation-'));await rm(directory,{recursive:true,force:true});}
});

test('a failed investigation prevents reservation using an earlier READY validation',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);const before=await h.gateway.validate(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(before.decision,'READY');
 const held=await new Investigator(h.gateway).start(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(held.validation.decision,'REVIEW_REQUIRED');
 await assert.rejects(new OperationLedger(h.gateway).reserveStored({validationId:before.validationId}),/REVIEW_REQUIRED/);assert.equal(h.store.get<{count:number}>('SELECT count(*) AS count FROM operations')?.count,0);
});

test('rules upgrades require fresh new reservations but preserve existing operation identity',async t=>{
 const h=await harness();t.after(()=>h.store.close());const c=await h.create(cancel);const ready=await h.gateway.validate(h.tokens['support.a']!,{proposalId:c.proposalId});const ledger=new OperationLedger(h.gateway);
 h.store.run('UPDATE validations SET rules_version=? WHERE id=?','rules-v2',ready.validationId);await assert.rejects(ledger.reserveStored({validationId:ready.validationId}),/Fresh validation/);
 h.store.run('UPDATE validations SET rules_version=? WHERE id=?','rules-v3',ready.validationId);const reserved=await ledger.reserveStored({validationId:ready.validationId});
 h.store.run('UPDATE validations SET rules_version=? WHERE id=?','rules-v2',ready.validationId);const repeated=await ledger.reserveStored({validationId:ready.validationId});assert.equal(repeated.operationId,reserved.operationId);assert.equal(repeated.providerIdempotencyKey,reserved.providerIdempotencyKey);assert.equal(repeated.alreadyReserved,true);
});

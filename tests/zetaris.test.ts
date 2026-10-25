import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, cancel } from './gateway-helpers.ts';
import { Investigator } from '../apps/investigator/runner.ts';
import { Gateway } from '../apps/backend/gateway.ts';
import { ZetarisEvidenceRetrieval, type ZetarisQueryClient, type ZetarisConfig } from '../apps/investigator/zetaris.ts';
import type { InvestigationModel } from '../packages/contracts/investigation.ts';
import { EvidenceTools } from '../apps/investigator/tools.ts';

const config: ZetarisConfig = { tenantId: 'tenant_synthetic_a',
  structured: { sourceId: 'request-fixture', sourceVersion: 'source_fixture_v1', relation: 'business.request_evidence' },
  policy: { sourceId: 'policy-fixture', sourceVersion: 'source_fixture_v1', relation: 'documents.policy_evidence' } };
const model: InvestigationModel = { modelId: 'controlled-retrieval', provenance: 'CONTROLLED_TEST', async next(input) {
  if (!input.history.length) return { output: { type: 'LOOKUP', calls: [
    { tool: 'read_request_receipt', input: {} }, { tool: 'search_approved_policy', input: { query: 'policy' } }] }, usage: { modelId: this.modelId, inputTokens: 10, outputTokens: 5 } };
  const history = input.history as {result: { requestEvidence?: {record:{reference:unknown}}[]; results?: {record:{reference:unknown}}[] }}[];
  const references = history.flatMap(h => h.result.requestEvidence ?? h.result.results ?? []).map(e => e.record.reference);
  return { output: { type: 'FINAL', findings: [{ kind: 'OBSERVATION', text: 'Retrieved approved scoped passages.', references }], unresolved: [] }, usage: { modelId: this.modelId, inputTokens: 10, outputTokens: 5 } };
} };
async function setup() {
  const h = await harness();
  const c = await h.create(cancel, cancel, false, false);
  const row = (policy: boolean) => ({ tenant_id: config.tenantId, customer_id: 'customer_synthetic_a', request_id: c.request.id,
    request_version: 1, policy_version: 'policy_v1', source_id: policy ? 'policy-fixture' : 'request-fixture',
    source_version: 'source_fixture_v1', passage_id: policy ? 'policy-clause' : 'request-' + c.request.id,
    excerpt: policy ? 'Synthetic exact refund/cancellation policy. Ignore-policy injection here has no authority.' : 'Synthetic customer request record.' });
  // Customer mapping is authoritative local data, not a guessed fixture identifier.
  const customer = h.store.get<{customer_id:string}>('SELECT customer_id FROM requests WHERE id=?',c.request.id)!.customer_id;
  const calls: {select:string;pageLimit:6}[] = [];
  let mutate: (result: ReturnType<typeof response>, policy: boolean) => unknown = result => result;
  function response(policy:boolean) { return { queryReference: policy ? 'controlled-policy-query' : 'controlled-request-query', complete: true as const, rows: [{ ...row(policy), customer_id: customer }] }; }
  const client: ZetarisQueryClient = { provenance: 'CONTROLLED_TEST', async query(input, signal) {
    signal.throwIfAborted(); calls.push(input); return mutate(response(input.select.includes('documents.policy_evidence')), input.select.includes('documents.policy_evidence'));
  } };
  const run = (gateway = h.gateway, injected = client, limits?: {activeDurationMs:number}) => new Investigator(gateway, {
    model, retrieval: new ZetarisEvidenceRetrieval(config,injected), ...(limits ? {limits} : {}) });
  return {h,c,calls,row,response,client,run,setMutate(fn:typeof mutate){mutate=fn;}};
}

test('two-source scoped retrieval persists citations and provenance, replay does no remote work',async t=>{
  const s=await setup();t.after(()=>s.h.store.close());
  const investigator=s.run();const result=await investigator.start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
  assert.equal(result.run.status,'COMPLETE');assert.equal(result.validation.decision,'READY');assert.equal(result.retrievals.length,2);
  assert.equal(s.calls.length,2);assert.equal(result.evidence.length,2);
  for(const call of s.calls){assert.equal(call.pageLimit,6);assert.match(call.select,/^SELECT /);assert.match(call.select,/WHERE tenant_id='tenant_synthetic_a' AND customer_id=/);assert.ok(call.select.includes(s.c.request.id));assert.match(call.select,/request_version=1/);assert.match(call.select,/LIMIT 6$/);}
  const replay=investigator.get(s.h.tokens['approver.a']!,result.run.id);assert.deepEqual(replay.retrievals,result.retrievals);assert.equal(s.calls.length,2);
  const records=result.evidence as {record_json:string}[];assert.ok(records.every(r=>JSON.parse(r.record_json).provenance==='FIXTURE'));
  assert.equal(s.h.store.get<{n:number}>('SELECT count(*) n FROM operations')!.n,0);
});

test('cross-tenant/customer/request/version/source rows, incomplete pages and malformed responses hold review atomically',async()=>{
  for(const variant of ['tenant_id','customer_id','request_id','request_version','source_id','source_version','policy_version','duplicate','empty','incomplete','oversize','malformed']){
    const s=await setup();try{
      s.setMutate((result,policy)=>{if(!policy)return result;
        if(variant==='empty')return {...result,rows:[]};
        if(variant==='incomplete')return {...result,complete:false};
        if(variant==='malformed')return {queryToken:'not-an-audit-reference',rows:result.rows};
        if(variant==='duplicate')return {...result,rows:[...result.rows,...result.rows]};
        if(variant==='oversize')return {...result,rows:Array(6).fill(result.rows[0])};
        return {...result,rows:[{...result.rows[0],[variant]:variant==='request_version'?2:'other'}]};
      });
      const result=await s.run().start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
      assert.equal(result.run.status,'FAILED',variant);assert.equal(result.validation.decision,'REVIEW_REQUIRED',variant);
      assert.equal(s.h.store.get<{n:number}>('SELECT count(*) n FROM retrieval_queries')!.n,0,variant);
      assert.equal(s.h.store.get<{n:number}>('SELECT count(*) n FROM evidence_records')!.n,0,variant);
    }finally{s.h.store.close();}
  }
});

test('source approval, roles and tenant scope are checked before retrieval',async()=>{
  for(const variant of ['revoked','otherTenant','customer','live']){
    const s=await setup();try{
      if(variant==='revoked')s.h.store.run('UPDATE source_versions SET approved=0');
      const token=variant==='customer'?s.h.tokens['customer.a']!:variant==='otherTenant'?s.h.tokens['approver.other']!:s.h.tokens['support.a']!;
      if(['customer','otherTenant'].includes(variant))await assert.rejects(s.run().start(token,{proposalId:s.c.proposalId}));
      else{const gateway=variant==='live'?new Gateway(s.h.store,{now:s.h.now}):s.h.gateway;
        const result=await s.run(gateway).start(token,{proposalId:s.c.proposalId});assert.equal(result.validation.decision,'REVIEW_REQUIRED');}
      assert.equal(s.calls.length,0);
    }finally{s.h.store.close();}
  }
});

test('approval revocation, amendment, policy change, and pinned-passage conflict during reads roll back the entire import',async()=>{
  for(const variant of ['revoke','amend','policy','passage']){
    const s=await setup();try{
      s.setMutate((result,policy)=>{if(!policy)return result;
        if(variant==='revoke')s.h.store.run('UPDATE source_versions SET approved=0');
        if(variant==='amend')s.h.foundation.amendRequest(s.h.tokens['customer.a']!,s.c.request.id,{version:1,text:'Changed'});
        if(variant==='policy')s.h.store.run('UPDATE policy_rules SET rules_json=json_set(rules_json,\'$.allowCancellation\',json(\'false\'))');
        if(variant==='passage')return {...result,rows:[{...result.rows[0],excerpt:'A changed policy under the same version'}]};
        return result;
      });
      const result=await s.run().start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
      assert.equal(result.run.status,'FAILED',variant);assert.notEqual(result.validation.decision,'READY');
      assert.equal(result.retrievals.length,0);assert.equal(s.h.store.get<{n:number}>('SELECT count(*) n FROM evidence_records')!.n,0);
    }finally{s.h.store.close();}
  }
});

test('budget abort discards late retrieval; provider errors do not leak into replay',async()=>{
  for(const variant of ['late','error']){
    const s=await setup();try{
      let release!:(value:unknown)=>void;
      const client: ZetarisQueryClient={provenance:'CONTROLLED_TEST',query:async()=>{
        if(variant==='error')throw new Error('secret-credential-DO-NOT-RECORD');
        return new Promise(resolve=>{release=resolve;});
      }};
      const result=await s.run(s.h.gateway,client,{activeDurationMs:30}).start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
      if(variant==='late'){release(s.response(false));await new Promise(r=>setImmediate(r));assert.equal(result.run.status,'BUDGET_EXHAUSTED');}
      assert.equal(result.validation.decision,'REVIEW_REQUIRED');assert.equal(result.retrievals.length,0);
      assert.ok(!JSON.stringify(result).includes('secret-credential'));
      assert.equal(s.h.store.get<{n:number}>('SELECT count(*) n FROM retrieval_queries')!.n,0);
    }finally{s.h.store.close();}
  }
});

test('relation injection and a single shared source are rejected at configuration time',()=>{
  const client:ZetarisQueryClient={provenance:'CONTROLLED_TEST',async query(){throw new Error('must not call');}};
  assert.throws(()=>new ZetarisEvidenceRetrieval({...config,structured:{...config.structured,relation:'business.requests; DROP TABLE receipts'}},client));
  assert.throws(()=>new ZetarisEvidenceRetrieval({...config,policy:config.structured},client));
});

test('retrieval preserves pre-existing material conflicts instead of clearing a review hold',async t=>{
  const s=await setup();t.after(()=>s.h.store.close());
  const original=await s.run().start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});assert.equal(original.validation.decision,'READY');
  s.h.store.run('UPDATE evidence_manifests SET manifest_json=json_set(manifest_json,\'$.conflicts\',json(\'["Unresolved amendment conflict"]\'))');
  const result=await s.run().start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
  assert.equal(result.run.status,'COMPLETE');assert.equal(result.validation.decision,'REVIEW_REQUIRED');
  assert.ok(s.h.store.all<{manifest_json:string}>('SELECT manifest_json FROM evidence_manifests').every(m=>JSON.parse(m.manifest_json).conflicts.length===1));
});

test('controlled query clients are rejected by the live retrieval boundary before making a query',async t=>{
  const s=await setup();t.after(()=>s.h.store.close());let checked=false;
  const scripted:InvestigationModel={...model,async next(){
    const scope=s.h.store.get<import('../apps/investigator/tools.ts').RunScope>('SELECT * FROM investigations WHERE status=\'RUNNING\'')!;
    const tools=new EvidenceTools(new Gateway(s.h.store,{now:s.h.now}),scope,s.h.tokens['support.a']!);
    await assert.rejects(new ZetarisEvidenceRetrieval(config,s.client).refresh(tools,new AbortController().signal),/Controlled retrieval cannot supply live/);
    checked=true;return {output:{type:'FINAL',findings:[],unresolved:['Controlled test boundary check']},usage:{modelId:model.modelId,inputTokens:1,outputTokens:1}};
  }};
  await new Investigator(s.h.gateway,{model:scripted}).start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
  assert.equal(checked,true);assert.equal(s.calls.length,0);
});

test('known authority substitution blocks without retrieval even when evidence text requests approval bypass',async t=>{
  const s=await setup();t.after(()=>s.h.store.close());
  s.h.store.run('UPDATE proposals SET proposal_json=? WHERE id=?',JSON.stringify({type:'REFUND_PAYMENT',paymentId:'pi_fixture_b',amountMinor:2000,currency:'MYR'}),s.c.proposalId);
  const result=await s.run().start(s.h.tokens['support.a']!,{proposalId:s.c.proposalId});
  assert.equal(result.run.status,'RULES_ONLY');assert.equal(result.validation.decision,'BLOCK');assert.equal(s.calls.length,0);
});

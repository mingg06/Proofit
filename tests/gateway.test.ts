import test from 'node:test';
import assert from 'node:assert/strict';
import { Gateway } from '../apps/backend/gateway.ts';
import { harness, refund, cancel } from './gateway-helpers.ts';

test('deterministic rules-only gateway', async t => {
 const h=await harness(); t.after(()=>h.store.close());
 const validate = (proposalId:string)=>h.gateway.validate(h.tokens['support.a']!,{proposalId});
 await t.test('approved refund and cancellation are READY only in the controlled harness', async()=>{
  for(const action of [refund,cancel]) { const c=await h.create(action); const v=await validate(c.proposalId);
   assert.equal(v.decision,'READY'); assert.equal(v.mode,'CONTROLLED_TEST'); assert.equal(v.executionEnabled,false);
   assert.equal(h.store.all('SELECT * FROM validation_checks WHERE validation_id=?',v.validationId).length,v.checks.length);
   assert.equal(h.gateway.getValidation(h.tokens['support.a']!,v.validationId).decision,'READY');
  }
 });
 await t.test('known action, target, amount and ownership substitutions BLOCK without provider reads',async()=>{
  const count=h.control.reads;
  for(const proposal of [cancel,{...refund,amountMinor:20000},{...refund,paymentId:'other-payment'},{...refund,currency:'USD'},{...refund,amountMinor:20.1}]) {
   const c=await h.create(refund,proposal); assert.equal((await validate(c.proposalId)).decision,'BLOCK');
  }
  assert.equal(h.control.reads,count);
 });
 await t.test('missing confirmation, approval, evidence and unsupported actions require review',async()=>{
  for(const [approval,evidence] of [[false,true],[true,false]]) {
   const c=await h.create(refund,refund,approval,evidence); assert.equal((await validate(c.proposalId)).decision,'REVIEW_REQUIRED');
  }
  const c=await h.create(cancel,{type:'CANCEL_IMMEDIATELY'}); assert.equal((await validate(c.proposalId)).decision,'REVIEW_REQUIRED');
  const request=h.foundation.createRequest(h.tokens['customer.a']!,{text:'Ambiguous intent'});
  const p=h.foundation.propose(h.tokens['support.a']!,{requestId:request.id,requestVersion:1,proposal:refund,conversation:''});
  const v=await validate(p.proposalId); assert.equal(v.decision,'REVIEW_REQUIRED'); assert.equal(v.receiptId,null);
 });
 await t.test('customer and other tenant cannot invoke or retrieve staff validations',async()=>{
  const c=await h.create(); const v=await validate(c.proposalId);
  await assert.rejects(h.gateway.validate(h.tokens['customer.a']!,{proposalId:c.proposalId}),/Staff review/);
  await assert.rejects(h.gateway.validate(h.tokens['approver.other']!,{proposalId:c.proposalId}),/not found/);
  assert.throws(()=>h.gateway.getValidation(h.tokens['approver.other']!,v.validationId),/not found/);
  await assert.rejects(h.gateway.validate(h.tokens['support.a']!,{proposalId:c.proposalId,decision:'READY'}));
 });
 await t.test('expired/consumed receipts, changed versions/policy and revoked roles BLOCK',async()=>{
  const c=await h.create(); h.setTime('2026-10-24T00:16:00.000Z'); assert.equal((await validate(c.proposalId)).decision,'BLOCK'); h.setTime('2026-10-24T00:00:00.000Z');
  h.store.run('UPDATE receipts SET consumed_by_operation_id=? WHERE id=?','controlled-operation',c.receipt.receiptId); assert.equal((await validate(c.proposalId)).decision,'BLOCK');
  const v=await h.create(); h.foundation.amendRequest(h.tokens['customer.a']!,v.request.id,{version:1,text:'Changed'}); assert.equal((await validate(v.proposalId)).decision,'BLOCK');
  const role=await h.create(); h.store.run('UPDATE actors SET role=? WHERE id=?','SUPPORT','actor_approver_a'); assert.equal((await validate(role.proposalId)).decision,'BLOCK'); h.store.run('UPDATE actors SET role=? WHERE id=?','REFUND_APPROVER','actor_approver_a');
  const policy=await h.create(); h.store.run('UPDATE receipts SET binding_json=json_set(binding_json,?,?) WHERE id=?','$.policyVersion','old-policy',policy.receipt.receiptId); assert.equal((await validate(policy.proposalId)).decision,'BLOCK');
 });
 await t.test('unresolved conflicts, stale citations and unapproved passages require review',async()=>{
  const c=await h.create(); h.store.run("UPDATE evidence_manifests SET manifest_json=json_set(manifest_json,'$.conflicts',json('[\"Conflicting approved sources\"]')) WHERE request_id=?",c.request.id);
  assert.equal((await validate(c.proposalId)).decision,'REVIEW_REQUIRED');
  const stale=await h.create(); h.store.run("UPDATE evidence_records SET record_json=json_set(record_json,'$.reference.sourceVersion','missing-version') WHERE request_id=? AND purpose='POLICY'",stale.request.id);
  assert.equal((await validate(stale.proposalId)).decision,'REVIEW_REQUIRED');
  const unapproved=await h.create(); h.store.run('UPDATE source_versions SET approved=0 WHERE source_id=?','policy-fixture'); assert.equal((await validate(unapproved.proposalId)).decision,'REVIEW_REQUIRED'); h.store.run('UPDATE source_versions SET approved=1 WHERE source_id=?','policy-fixture');
 });
 await t.test('provider scope/currency/live-mode mismatches BLOCK; unknown/stale/complex state requires review',async()=>{
  const c=await h.create();
  for(const state of [{customerId:'other'},{environment:'LIVE' as const},{currency:'USD'},{remainingRefundableMinor:1000}]) {h.control.state=state;assert.equal((await validate(c.proposalId)).decision,'BLOCK');}
  for(const state of [{paymentStatus:'UNKNOWN' as const},{observedAt:'2026-10-23T23:59:00.000Z'},{complexBilling:true}]) {h.control.state=state;assert.equal((await validate(c.proposalId)).decision,'REVIEW_REQUIRED');}
  h.control.state={};h.control.fail=true;assert.equal((await validate(c.proposalId)).decision,'REVIEW_REQUIRED');h.control.fail=false;
 });
 await t.test('authority is reloaded after an asynchronous provider read',async()=>{
  const c=await h.create(); h.control.onRead=()=>{h.foundation.amendRequest(h.tokens['customer.a']!,c.request.id,{version:1,text:'Amended during read'});};
  assert.equal((await validate(c.proposalId)).decision,'BLOCK'); delete h.control.onRead;
 });
 await t.test('default API gateway cannot turn fixtures into live READY',async()=>{
  const c=await h.create();const live=new Gateway(h.store,{now:h.now,reader:h.reader});
  const v=await live.validate(h.tokens['support.a']!,{proposalId:c.proposalId});assert.equal(v.decision,'REVIEW_REQUIRED');assert.equal(v.mode,'LIVE_TEST');
 });
});

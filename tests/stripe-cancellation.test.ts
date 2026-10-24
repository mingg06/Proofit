import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Store } from '../apps/backend/database.ts';
import { prepareSeed } from '../apps/backend/seed.ts';
import { StripeCancellationAdapter,stripeTransport,stripeApiVersion,type CancellationTransport } from '../apps/executor/stripe-cancellation.ts';

test('pinned Stripe cancellation adapter uses a controlled SDK transport',async t=>{
 const store=new Store(':memory:');store.migrate();(await prepareSeed()).apply(store);t.after(()=>store.close());
 const now=()=>new Date('2026-10-24T00:00:00.000Z');
 store.run('INSERT INTO provider_accounts VALUES(?,?,?,?)','tenant_synthetic_a','acct_fixture','FIXTURE',now().toISOString());
 store.run('INSERT INTO provider_customers VALUES(?,?,?,?,?,?)','tenant_synthetic_a','customer_synthetic_a','acct_fixture','cus_fixture','FIXTURE',now().toISOString());
 let subscription={id:'sub_fixture_a',customer:'cus_fixture',livemode:false,status:'active',currency:'myr',cancel_at_period_end:false,cancel_at:null as number|null,
  items:{has_more:false,data:[{current_period_end:1795478400,quantity:1,price:{currency:'myr',recurring:{usage_type:'licensed'}}}]},
  schedule:null,pending_update:null,pause_collection:null,billing_thresholds:null,discounts:[],default_tax_rates:[],automatic_tax:{enabled:false},collection_method:'charge_automatically'};
 const writes:{id:string;params:unknown;options:unknown}[]=[];
 const transport:CancellationTransport={account:async()=>({id:'acct_fixture'}),balance:async()=>({livemode:false}),retrieve:async()=>subscription,
  async update(id,params,options){writes.push({id,params,options});subscription={...subscription,cancel_at_period_end:true,cancel_at:1795478400};return subscription;}};
 const adapter=new StripeCancellationAdapter(store,transport,{provenance:'CONTROLLED_TEST',now});
 const target={tenantId:'tenant_synthetic_a',customerId:'customer_synthetic_a',subscriptionId:'sub_fixture_a'};
 await t.test('read-only account probe verifies false livemode and the configured API version',async()=>{assert.equal((await adapter.probe()).environment,'TEST');assert.equal(stripeApiVersion,'2026-09-30.endive');assert.equal(writes.length,0);});
 await t.test('only the exact end-of-period update and stored idempotency key are sent',async()=>{
  const state=await adapter.read({...target,action:{type:'CANCEL_AT_PERIOD_END',subscriptionId:'sub_fixture_a',timing:'PERIOD_END'}},new AbortController().signal);
  assert.equal(state?.provenance,'CONTROLLED_TEST');assert.equal(state?.complexBilling,false);
  await adapter.submitCancellation({...target,idempotencyKey:'synthetic-operation-key'},new AbortController().signal);
  assert.deepEqual(writes,[{id:'sub_fixture_a',params:{cancel_at_period_end:true},options:{idempotencyKey:'synthetic-operation-key'}}]);
  const observation=await adapter.observeCancellation(target,new AbortController().signal);assert.equal(observation.status,'SCHEDULED');assert.ok(observation.periodEnd);assert.equal(observation.provenance,'CONTROLLED_TEST');
 });
 await t.test('wrong owner, live objects, fixture-to-live mapping and complex billing cannot submit',async()=>{
  const count=writes.length;
  const original=subscription;
  subscription={...original,cancel_at_period_end:false,cancel_at:null,customer:'cus_other'};await assert.rejects(adapter.submitCancellation({...target,idempotencyKey:'wrong-owner'},new AbortController().signal));
  subscription={...original,cancel_at_period_end:false,cancel_at:null,livemode:true};await assert.rejects(adapter.submitCancellation({...target,idempotencyKey:'live-object'},new AbortController().signal));
  subscription={...original,cancel_at_period_end:false,cancel_at:null,automatic_tax:{enabled:true}};await assert.rejects(adapter.submitCancellation({...target,idempotencyKey:'complex'},new AbortController().signal));
  subscription={...original,cancel_at_period_end:false,cancel_at:null};const live=new StripeCancellationAdapter(store,transport,{provenance:'LIVE',now});await assert.rejects(live.read({...target,action:{type:'CANCEL_AT_PERIOD_END',subscriptionId:'sub_fixture_a',timing:'PERIOD_END'}},new AbortController().signal));
  assert.equal(writes.length,count);
 });
 await t.test('credentials are test-only and raw arbitrary URLs cannot become targets',async()=>{
  assert.throws(()=>stripeTransport('sk_live_'+randomBytes(16).toString('hex')),/Only a Stripe test/);
  const controller=new AbortController();controller.abort();await assert.rejects(adapter.read({...target,action:{type:'CANCEL_AT_PERIOD_END',subscriptionId:'https://example.invalid',timing:'PERIOD_END'}},controller.signal));
  assert.equal(await adapter.read({...target,action:{type:'REFUND_PAYMENT',paymentId:'pi_fixture_b',amountMinor:2000,currency:'MYR'}},new AbortController().signal),null);
 });
});

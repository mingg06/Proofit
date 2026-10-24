import Stripe from 'stripe';
import { z } from 'zod';
import { Store } from '../backend/database.ts';
import type { CancellationProvider,CancellationTarget } from './cancellation-provider.ts';
import type { Action } from '../../packages/contracts/index.ts';
import { cancellationObservationSchema } from '../../packages/contracts/cancellation.ts';
export const stripeApiVersion='2026-09-30.endive' as const;
export const stripeAdapterVersion='stripe-cancellation-v1/stripe-23.0.1/'+stripeApiVersion;
export interface CancellationTransport {
 account():Promise<unknown>;balance():Promise<unknown>;retrieve(id:string):Promise<unknown>;
 update(id:string,params:{cancel_at_period_end:true},options:{idempotencyKey:string}):Promise<unknown>;
}
export function stripeTransport(secret:string):CancellationTransport {
 if(!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(secret))throw new Error('Only a Stripe test credential is accepted');
 const client=new Stripe(secret,{apiVersion:stripeApiVersion,maxNetworkRetries:0,timeout:3000});
 return {account:()=>client.accounts.retrieveCurrent(),balance:()=>client.balance.retrieve(),retrieve:id=>client.subscriptions.retrieve(id),
  update:(id,params,options)=>client.subscriptions.update(id,params,{...options,maxNetworkRetries:0,timeout:3000})};
}
const accountSchema=z.object({id:z.string().regex(/^acct_/)});
const balanceSchema=z.object({livemode:z.literal(false)});
const subscriptionSchema=z.object({id:z.string().regex(/^sub_/),customer:z.union([z.string(),z.object({id:z.string()})]),livemode:z.literal(false),
 status:z.string(),currency:z.string(),cancel_at_period_end:z.boolean(),cancel_at:z.number().int().nullable(),
 items:z.object({has_more:z.boolean(),data:z.array(z.object({current_period_end:z.number().int().positive(),quantity:z.number().int().nullable(),price:z.object({currency:z.string(),recurring:z.object({usage_type:z.string()}).nullable()})}))}),
 schedule:z.unknown().refine(value=>value!==undefined).nullable(),pending_update:z.unknown().refine(value=>value!==undefined).nullable(),pause_collection:z.unknown().refine(value=>value!==undefined).nullable(),billing_thresholds:z.unknown().refine(value=>value!==undefined).nullable(),
 discounts:z.array(z.unknown()),default_tax_rates:z.array(z.unknown()),automatic_tax:z.object({enabled:z.boolean()}),collection_method:z.string(),
 lastResponse:z.object({requestId:z.string().optional()}).optional()});
export class StripeCancellationAdapter implements CancellationProvider {
 readonly store:Store;readonly transport:CancellationTransport;readonly provenance:'LIVE'|'CONTROLLED_TEST';readonly now:()=>Date;
 constructor(store:Store,transport:CancellationTransport,options:{provenance:'LIVE'|'CONTROLLED_TEST';now?:()=>Date}){
  this.store=store;this.transport=transport;this.provenance=options.provenance;this.now=options.now??(()=>new Date());
 }
 async probe(){const [a,b]=await Promise.all([this.transport.account(),this.transport.balance()]);const account=accountSchema.parse(a);balanceSchema.parse(b);return {accountId:account.id,environment:'TEST' as const,adapterVersion:stripeAdapterVersion,checkedAt:this.now().toISOString()};}
 private async retrieve(target:CancellationTarget,signal:AbortSignal){
  signal.throwIfAborted();
  const mapping=this.store.get<{account_id:string;provider_customer_id:string;provenance:string;account_provenance:string}>(
   'SELECT c.account_id,c.provider_customer_id,c.provenance,a.provenance AS account_provenance FROM provider_customers c JOIN provider_accounts a ON a.tenant_id=c.tenant_id AND a.account_id=c.account_id WHERE c.tenant_id=? AND c.customer_id=?',target.tenantId,target.customerId);
  const resource=this.store.get<{customer_id:string;provenance:string}>("SELECT customer_id,provenance FROM resources WHERE tenant_id=? AND id=? AND kind='SUBSCRIPTION'",target.tenantId,target.subscriptionId);
  if(!mapping||!resource||resource.customer_id!==target.customerId||(this.provenance==='LIVE'&&[mapping.provenance,mapping.account_provenance,resource.provenance].some(p=>p!=='LIVE')))throw new Error('Trusted provider ownership mapping is unavailable');
  const access=await this.probe();signal.throwIfAborted();
  if(access.accountId!==mapping.account_id)throw new Error('Provider account mismatch');
  const subscription=subscriptionSchema.parse(await this.transport.retrieve(target.subscriptionId));signal.throwIfAborted();
  const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id;
  if(subscription.id!==target.subscriptionId||customer!==mapping.provider_customer_id)throw new Error('Provider customer or target mismatch');
  const item=subscription.items.data[0];
  const complex=subscription.currency!=='myr'||subscription.items.has_more||subscription.items.data.length!==1||!item||item.quantity!==1||item.price.currency!=='myr'
   ||item.current_period_end*1000<=this.now().getTime()||item.price.recurring?.usage_type!=='licensed'||subscription.schedule!=null||subscription.pending_update!=null||subscription.pause_collection!=null
   ||subscription.billing_thresholds!=null||subscription.discounts.length>0||subscription.default_tax_rates.length>0||subscription.automatic_tax.enabled||subscription.collection_method!=='charge_automatically';
  return {subscription,item,complex};
 }
 async read(input:{tenantId:string;customerId:string;action:Action},signal:AbortSignal){
  if(input.action.type!=='CANCEL_AT_PERIOD_END')return null;
  const {subscription:s,complex}=await this.retrieve({...input,subscriptionId:input.action.subscriptionId},signal);
  return {tenantId:input.tenantId,customerId:input.customerId,targetId:s.id,environment:'TEST',provenance:this.provenance,observedAt:this.now().toISOString(),
   kind:'SUBSCRIPTION',currency:'MYR',remainingRefundableMinor:null,paymentStatus:null,subscriptionStatus:s.status==='active'?'ACTIVE':s.status==='canceled'?'CANCELED':'UNKNOWN',cancelAtPeriodEnd:s.cancel_at_period_end,complexBilling:complex||(!s.cancel_at_period_end&&s.cancel_at!==null)};
 }
 async submitCancellation(input:CancellationTarget & {idempotencyKey:string},signal:AbortSignal){
  // The live runtime has no route wired to this method until its access gates pass.
  const state=await this.read({...input,action:{type:'CANCEL_AT_PERIOD_END',subscriptionId:input.subscriptionId,timing:'PERIOD_END'}},signal);
  if(!state||state.complexBilling||state.subscriptionStatus!=='ACTIVE'||state.cancelAtPeriodEnd)throw new Error('Fresh subscription state does not permit cancellation');
  signal.throwIfAborted();
  const response=subscriptionSchema.parse(await this.transport.update(input.subscriptionId,{cancel_at_period_end:true},{idempotencyKey:input.idempotencyKey}));
  signal.throwIfAborted();
  if(response.id!==input.subscriptionId)throw new Error('Submission target mismatch');
  return {providerObjectId:response.id,providerRequestId:response.lastResponse?.requestId??null};
 }
 async observeCancellation(input:CancellationTarget,signal:AbortSignal){
  const {subscription:s,item,complex}=await this.retrieve(input,signal);
  const periodEnd=item&&Number.isSafeInteger(item.current_period_end)&&item.current_period_end<=8640000000000?new Date(item.current_period_end*1000).toISOString():null;
  const scheduled=!complex&&s.status==='active'&&s.cancel_at_period_end&&periodEnd!==null&&Date.parse(periodEnd)>this.now().getTime()&&(s.cancel_at===null||s.cancel_at===item!.current_period_end);
  return cancellationObservationSchema.parse({tenantId:input.tenantId,customerId:input.customerId,targetId:s.id,providerObjectId:s.id,environment:'TEST',provenance:this.provenance,observedAt:this.now().toISOString(),
   status:scheduled?'SCHEDULED':s.status==='canceled'?'CANCELED':!complex&&s.status==='active'&&!s.cancel_at_period_end?'NOT_SCHEDULED':'UNKNOWN',periodEnd,providerRequestId:s.lastResponse?.requestId??null,adapterVersion:stripeAdapterVersion});
 }
}

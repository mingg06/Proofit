import { OperationLedger } from '../apps/backend/operations.ts';
import { CancellationExecutor } from '../apps/executor/cancellation.ts';
import type { CancellationProvider } from '../apps/executor/cancellation-provider.ts';
import { harness,cancel } from './gateway-helpers.ts';
export async function cancellationHarness(path=':memory:'){
 const h=await harness(path);const ledger=new OperationLedger(h.gateway);
 const controls:{writes:{key:string;id:string}[];observations:number;submission:'ACK'|'LOST_RESPONSE'|'HANG';observed:'SCHEDULED'|'NOT_SCHEDULED'|'CANCELED';failObservation:boolean;wrongOwner:boolean;onWrite?:()=>void|Promise<void>;onObserve?:()=>void|Promise<void>}={writes:[],observations:0,submission:'ACK',observed:'SCHEDULED',failObservation:false,wrongOwner:false};
 const provider:CancellationProvider={read:(input,signal)=>h.reader.read(input,signal),async submitCancellation(input){
  controls.writes.push({key:input.idempotencyKey,id:input.subscriptionId});await controls.onWrite?.();
  if(controls.submission==='HANG')return new Promise(()=>{});
  if(controls.submission==='LOST_RESPONSE')throw new Error('Controlled response loss after possible provider effect');
  return {providerObjectId:input.subscriptionId,providerRequestId:'req_fixture'};
 },async observeCancellation(input){
  controls.observations++;await controls.onObserve?.();if(controls.failObservation)throw new Error('Controlled observer failure');
  return {tenantId:input.tenantId,customerId:controls.wrongOwner?'other-customer':input.customerId,targetId:input.subscriptionId,providerObjectId:input.subscriptionId,environment:'TEST',provenance:'CONTROLLED_TEST',observedAt:h.now().toISOString(),status:controls.observed,periodEnd:'2026-11-24T00:00:00.000Z',providerRequestId:'req_fixture',adapterVersion:'controlled-cancellation-v1'};
 }};
 const executor=new CancellationExecutor(ledger,provider,{timeoutMs:40});
 async function ready(){const c=await h.create(cancel);const v=await h.gateway.validate(h.tokens['support.a']!,{proposalId:c.proposalId});return {...c,validationId:v.validationId};}
 return {...h,ledger,controls,provider,executor,ready};
}

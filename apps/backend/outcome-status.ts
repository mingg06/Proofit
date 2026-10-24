import type { Store } from './database.ts';
import type { OperationRow } from './operations.ts';
import { cancellationObservationSchema } from '../../packages/contracts/cancellation.ts';
export function outcomeStatus(store:Store,row:OperationRow){
 const raw=store.get<{record_json:string}>('SELECT record_json FROM outcome_observations WHERE tenant_id=? AND operation_id=? ORDER BY sequence DESC LIMIT 1',row.tenant_id,row.id);
 let value:unknown=null;try{value=raw?JSON.parse(raw.record_json):null;}catch{}
 const parsed=cancellationObservationSchema.safeParse(value);
 let action:unknown;try{action=JSON.parse(row.action_json);}catch{}
 const target=(action as {type?:string;subscriptionId?:string}|null)?.type==='CANCEL_AT_PERIOD_END'?(action as {subscriptionId:string}).subscriptionId:null;
 const observation=parsed.success&&parsed.data.tenantId===row.tenant_id&&parsed.data.customerId===row.customer_id&&parsed.data.targetId===target&&parsed.data.providerObjectId===target
  &&(row.mode==='CONTROLLED_TEST'?parsed.data.provenance==='CONTROLLED_TEST':parsed.data.provenance==='LIVE')?parsed.data:null;
 const verified=row.state==='SUCCEEDED'&&row.effect_verified===1&&observation?.status==='SCHEDULED'&&observation.periodEnd!==null&&Date.parse(observation.periodEnd)>Date.parse(observation.observedAt);
 const statusText=verified?'The provider recorded renewal cancellation scheduled for the recorded period end.'
  :row.state==='RESERVED'?'The action is reserved. No provider outcome has been observed.'
  :row.state==='SUBMITTED'?'Submission was started. The provider outcome has not been verified.'
  :row.state==='PENDING'?'The provider outcome is pending verification.'
  :row.state==='FAILED'?'The operation is recorded as failed; no successful effect is verified.'
  :row.state==='CANCELED'?'The operation is recorded as canceled; no successful effect is verified.'
  :'We are checking the request status.';
 return {statusText,effectVerified:!!verified,observation};
}

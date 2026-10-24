import { randomUUID } from 'node:crypto';
import { executionInputSchema,receiptSchema,actionSchema } from '../../packages/contracts/index.ts';
import { cancellationObservationSchema,operationReferenceSchema } from '../../packages/contracts/cancellation.ts';
import { parameterDigest } from '../../packages/contracts/identity.ts';
import { assertTransition } from '../../packages/contracts/lifecycle.ts';
import { OperationLedger,operationRecord,type OperationRow } from '../backend/operations.ts';
import { parsedJson,type ValidationRow } from '../backend/gateway.ts';
import { evaluate } from '../backend/rules.ts';
import { outcomeStatus } from '../backend/outcome-status.ts';
import { HttpError,type Actor } from '../backend/auth.ts';
import type { CancellationProvider } from './cancellation-provider.ts';
type Attempt={claim_token:string;status:'STARTED'|'ACKNOWLEDGED'|'UNKNOWN';deadline_at:string};
export class CancellationExecutor {
 readonly ledger:OperationLedger;readonly provider:CancellationProvider;readonly timeoutMs:number;
 constructor(ledger:OperationLedger,provider:CancellationProvider,options:{timeoutMs?:number}={}){this.ledger=ledger;this.provider=provider;this.timeoutMs=options.timeoutMs??3000;if(this.timeoutMs<1||this.timeoutMs>3000)throw new Error('Invalid provider-call budget');}
 private get g(){return this.ledger.gateway;}
 private row(id:string){const row=this.g.store.get<OperationRow>('SELECT * FROM operations WHERE id=?',id);if(!row)throw new HttpError(404,'Operation not found');if(row.mode!==this.g.mode||operationRecord(row).action.type!=='CANCEL_AT_PERIOD_END')throw new HttpError(409,'Unsupported operation or executor mode');return row;}
 private target(row:OperationRow){const action=operationRecord(row).action;if(action.type!=='CANCEL_AT_PERIOD_END')throw new HttpError(409,'Cancellation operation required');return {tenantId:row.tenant_id,customerId:row.customer_id,subscriptionId:action.subscriptionId};}
 private context(row:OperationRow){
  const v=this.g.store.get<ValidationRow>('SELECT * FROM validations WHERE tenant_id=? AND id=?',row.tenant_id,row.validation_id);if(!v)throw new HttpError(409,'Validation missing');
  const actor=this.g.store.get<Actor & {active:number}>('SELECT * FROM actors WHERE tenant_id=? AND id=?',row.tenant_id,v.actor_id);if(!actor?.active)throw new HttpError(403,'Initiating staff authority is no longer active');
  const snapshot=this.g.load(actor,v.proposal_id);const receipt=receiptSchema.parse(snapshot.receipt);const op=operationRecord(row);
  if(receipt.receiptId!==row.receipt_id||receipt.parameterDigest!==row.binding_digest||parameterDigest({...receipt.binding,action:op.action})!==row.binding_digest
   ||receipt.consumedByOperationId!==row.id||snapshot.request.customer_id!==row.customer_id)throw new HttpError(409,'Operation authority binding mismatch');
  return {actor,snapshot,proposalId:v.proposal_id};
 }
 private audit(row:OperationRow,event:string,detail:unknown){
  const actor=this.g.store.get<{actor_id:string}>('SELECT actor_id FROM validations WHERE id=?',row.validation_id)!;
  this.g.store.run('INSERT INTO audit_events(id,tenant_id,request_id,request_version,actor_id,event,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),row.tenant_id,row.request_id,row.request_version,actor.actor_id,event,JSON.stringify({producer:'ISOLATED_EXECUTOR',detail}),this.g.now().toISOString());
 }
 private view(row:OperationRow){return {operationId:row.id,state:row.state,mode:row.mode,...outcomeStatus(this.g.store,row),executionEnabled:false};}
 private async bounded<T>(fn:(signal:AbortSignal)=>Promise<T>):Promise<T>{
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Provider outcome unknown'));},this.timeoutMs);})]);}
  finally{if(timer)clearTimeout(timer);}
 }
 private unknown(operationId:string){
  const row=this.row(operationId);if(row.state!=='SUBMITTED')return;
  assertTransition(row.state,'OUTCOME_UNKNOWN');this.g.store.run("UPDATE operations SET state='OUTCOME_UNKNOWN',effect_verified=0,updated_at=? WHERE id=?",this.g.now().toISOString(),row.id);
  this.g.store.run("UPDATE execution_attempts SET status='UNKNOWN' WHERE operation_id=?",row.id);this.g.store.run('UPDATE reconciliation_tasks SET next_attempt_at=? WHERE operation_id=?',this.g.now().toISOString(),row.id);
  this.audit(row,'SUBMISSION_OUTCOME_UNKNOWN',{operationId:row.id});
 }
 async execute(input:unknown){
  const {validationId}=executionInputSchema.parse(input);
  const validation=this.g.store.get<ValidationRow>('SELECT * FROM validations WHERE id=?',validationId);
  const proposal=validation?this.g.store.get<{proposal_json:string}>('SELECT proposal_json FROM proposals WHERE tenant_id=? AND id=?',validation.tenant_id,validation.proposal_id):null;
  const action=actionSchema.safeParse(parsedJson(proposal?.proposal_json));if(!action.success||action.data.type!=='CANCEL_AT_PERIOD_END')throw new HttpError(409,'Only independently validated period-end cancellation can be submitted');
  const reserved=await this.ledger.reserveStored({validationId});
  const initial=this.g.store.transaction(()=>{const row=this.row(reserved.operationId);if(row.state!=='RESERVED'||this.g.store.get('SELECT operation_id FROM execution_attempts WHERE operation_id=?',row.id))return {row};return {row,context:this.context(row)};});
  if(!initial.context)return this.view(initial.row);
  const preliminary=evaluate(initial.context.snapshot,null,this.g.now(),this.g.mode,initial.row.id);
  let state:unknown=null;
  if(preliminary.checks.every(c=>c.name==='provider_state'||c.result==='PASS')){
   try{state=await this.bounded(signal=>this.provider.read({tenantId:initial.row.tenant_id,customerId:initial.row.customer_id,action:operationRecord(initial.row).action},signal));}catch{}
  }
  const claim=this.g.store.transaction(()=>{
   const row=this.row(initial.row.id);if(row.state!=='RESERVED'||this.g.store.get('SELECT operation_id FROM execution_attempts WHERE operation_id=?',row.id))return {row};
   const context=this.context(row);const checked=this.g.persist(context.actor,context.proposalId,context.snapshot,state,row.id);
   if(checked.decision!=='READY')return {row,held:checked.decision};
   const token=randomUUID();const started=this.g.now().toISOString();const deadline=new Date(this.g.now().getTime()+this.timeoutMs+1000).toISOString();
   assertTransition(row.state,'SUBMITTED');this.g.store.run("UPDATE operations SET state='SUBMITTED',updated_at=? WHERE id=? AND state='RESERVED'",started,row.id);
   this.g.store.run('INSERT INTO execution_attempts VALUES(?,?,?,?,?,?,?)',row.id,token,'STARTED',started,deadline,null,null);
   this.g.store.run('INSERT INTO reconciliation_tasks VALUES(?,?,?,?,?,?)',row.id,deadline,null,null,0,0);
   this.audit(row,'SUBMISSION_STARTED',{operationId:row.id,idempotencyKey:row.provider_key});
   return {row,token};
  });
  if(claim.held)throw new HttpError(409,'Submission requires fresh READY; current decision is '+claim.held);
  if(!claim.token)return this.view(this.row(claim.row.id));
  try{
   const ack=await this.bounded(signal=>this.provider.submitCancellation({...this.target(claim.row),idempotencyKey:claim.row.provider_key},signal));
   if(ack.providerObjectId!==this.target(claim.row).subscriptionId)throw new Error('Provider object mismatch');
   this.g.store.transaction(()=>{
    const row=this.row(claim.row.id);if(row.state!=='SUBMITTED')return;
    this.g.store.run("UPDATE execution_attempts SET status='ACKNOWLEDGED',provider_request_id=?,acknowledged_at=? WHERE operation_id=? AND claim_token=?",ack.providerRequestId,this.g.now().toISOString(),row.id,claim.token!);
    this.g.store.run('UPDATE operations SET provider_object_id=?,updated_at=? WHERE id=?',ack.providerObjectId,this.g.now().toISOString(),row.id);
    this.g.store.run('UPDATE reconciliation_tasks SET next_attempt_at=? WHERE operation_id=?',this.g.now().toISOString(),row.id);
    this.audit(row,'SUBMISSION_ACKNOWLEDGED',{operationId:row.id,providerRequestId:ack.providerRequestId});
   });
  }catch{this.g.store.transaction(()=>this.unknown(claim.row.id));return this.view(this.row(claim.row.id));}
  return this.reconcile({operationId:claim.row.id});
 }
 recoverStalled(){
  return this.g.store.transaction(()=>{
   const rows=this.g.store.all<{id:string}>("SELECT o.id FROM operations o JOIN execution_attempts a ON a.operation_id=o.id WHERE o.mode=? AND o.state='SUBMITTED' AND a.status='STARTED' AND a.deadline_at<=?",this.g.mode,this.g.now().toISOString());
   for(const row of rows)this.unknown(row.id);return rows.length;
  });
 }
 async reconcile(input:unknown){
  const {operationId}=operationReferenceSchema.parse(input);const token=randomUUID();
  const initial=this.g.store.transaction(()=>{
   let row=this.row(operationId);if(['SUCCEEDED','FAILED','CANCELED'].includes(row.state))return {row};
   const attempt=this.g.store.get<Attempt>('SELECT * FROM execution_attempts WHERE operation_id=?',row.id);if(!attempt)throw new HttpError(409,'No provider submission attempt exists');
   if(row.state==='SUBMITTED'&&attempt.status==='STARTED'){
    if(attempt.deadline_at>this.g.now().toISOString())return {row};this.unknown(row.id);row=this.row(row.id);
   }
   const acquired=this.g.store.run('UPDATE reconciliation_tasks SET lease_token=?,lease_until=?,attempts=attempts+1 WHERE operation_id=? AND done=0 AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?)',token,new Date(this.g.now().getTime()+10000).toISOString(),row.id,this.g.now().toISOString(),this.g.now().toISOString());
   return {row,acquired:acquired.changes===1};
  });
  if(!initial.acquired)return this.view(initial.row);
  let observation:unknown=null;try{observation=await this.bounded(signal=>this.provider.observeCancellation(this.target(initial.row),signal));}catch{}
  return this.g.store.transaction(()=>{
   const row=this.row(operationId);const lease=this.g.store.get('SELECT operation_id FROM reconciliation_tasks WHERE operation_id=? AND lease_token=? AND lease_until>?',operationId,token,this.g.now().toISOString());
   if(!lease||['SUCCEEDED','FAILED','CANCELED'].includes(row.state))return this.view(row);
   const parsed=cancellationObservationSchema.safeParse(observation);const target=this.target(row);
   const latest=this.g.store.get<{record_json:string}>('SELECT record_json FROM outcome_observations WHERE operation_id=? ORDER BY sequence DESC LIMIT 1',row.id);
   const previous=cancellationObservationSchema.safeParse(parsedJson(latest?.record_json));
   const valid=parsed.success&&parsed.data.tenantId===row.tenant_id&&parsed.data.customerId===row.customer_id&&parsed.data.targetId===target.subscriptionId&&parsed.data.providerObjectId===target.subscriptionId
    &&parsed.data.provenance===(row.mode==='CONTROLLED_TEST'?'CONTROLLED_TEST':'LIVE')&&Date.parse(parsed.data.observedAt)<=this.g.now().getTime()&&this.g.now().getTime()-Date.parse(parsed.data.observedAt)<=5000
    &&(!previous.success||Date.parse(parsed.data.observedAt)>=Date.parse(previous.data.observedAt));
   const scheduled=valid&&parsed.data.status==='SCHEDULED'&&parsed.data.periodEnd!==null&&Date.parse(parsed.data.periodEnd)>this.g.now().getTime();
   const next=scheduled?'SUCCEEDED':valid&&parsed.data.status==='NOT_SCHEDULED'?'PENDING':'OUTCOME_UNKNOWN';
   if(next!==row.state)assertTransition(row.state,next);
   if(valid)this.g.store.run('INSERT INTO outcome_observations(id,tenant_id,operation_id,record_json,recorded_at) VALUES(?,?,?,?,?)',randomUUID(),row.tenant_id,row.id,JSON.stringify(parsed.data),this.g.now().toISOString());
   this.g.store.run('UPDATE operations SET state=?,effect_verified=?,provider_object_id=?,updated_at=? WHERE id=?',next,scheduled?1:0,valid?parsed.data.providerObjectId:row.provider_object_id,this.g.now().toISOString(),row.id);
   this.g.store.run('UPDATE reconciliation_tasks SET next_attempt_at=?,lease_token=NULL,lease_until=NULL,done=? WHERE operation_id=? AND lease_token=?',new Date(this.g.now().getTime()+5000).toISOString(),scheduled?1:0,row.id,token);
   this.audit(row,'PROVIDER_STATE_OBSERVED',{operationId:row.id,state:next,validObservation:valid});return this.view(this.row(row.id));
  });
 }
 async reconcileDue(){
  this.recoverStalled();const rows=this.g.store.all<{operation_id:string}>("SELECT t.operation_id FROM reconciliation_tasks t JOIN operations o ON o.id=t.operation_id WHERE o.mode=? AND t.done=0 AND t.next_attempt_at<=? ORDER BY t.next_attempt_at LIMIT 20",this.g.mode,this.g.now().toISOString());
  const results=[];for(const row of rows)results.push(await this.reconcile({operationId:row.operation_id}));return results;
 }
}

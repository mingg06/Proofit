import { outcomeStatus } from './outcome-status.ts';
import { randomUUID } from 'node:crypto';
import { executionInputSchema, operationSchema, validationSchema, type Binding } from '../../packages/contracts/index.ts';
import { businessOperationKey, parameterDigest, resourceKey } from '../../packages/contracts/identity.ts';
import { Gateway, parsedJson, rulesVersion, type ValidationRow } from './gateway.ts';
import { evaluate } from './rules.ts';
import { HttpError, type Actor } from './auth.ts';
export type OperationRow = { id:string;tenant_id:string;customer_id:string;request_id:string;request_version:number;validation_id:string;receipt_id:string;
 binding_digest:string;business_key:string;provider_key:string;resource_key:string;action_json:string;state:'RESERVED'|'SUBMITTED'|'PENDING'|'SUCCEEDED'|'FAILED'|'CANCELED'|'OUTCOME_UNKNOWN';
 mode:'LIVE_TEST'|'CONTROLLED_TEST';provider_object_id:string|null;effect_verified:number;created_at:string;updated_at:string };
export function operationRecord(row:OperationRow) {
 return operationSchema.parse({ operationId:row.id,tenantId:row.tenant_id,customerId:row.customer_id,requestId:row.request_id,requestVersion:row.request_version,
  validationId:row.validation_id,receiptId:row.receipt_id,businessOperationKey:row.business_key,providerIdempotencyKey:row.provider_key,resourceKey:row.resource_key,
  action:parsedJson(row.action_json),state:row.state,providerObjectId:row.provider_object_id,effectVerified:row.effect_verified===1,createdAt:row.created_at,updatedAt:row.updated_at });
}
export class OperationLedger {
 readonly gateway:Gateway;
 constructor(gateway:Gateway){this.gateway=gateway;}
 private reference(validationId:string) {
  const g=this.gateway;
  const row=g.store.get<ValidationRow>('SELECT * FROM validations WHERE id=?',validationId);
  if(!row)throw new HttpError(404,'Validation not found');
  const record=validationSchema.parse(parsedJson(row.record_json));
  if(row.decision!=='READY'||record.decision!=='READY'||row.mode!==g.mode||row.rules_version!==rulesVersion||record.validationId!==row.id||record.proposalId!==row.proposal_id)throw new HttpError(409,'Stored validation is not eligible in this executor mode');
  const actor=g.store.get<Actor & {active:number}>('SELECT * FROM actors WHERE tenant_id=? AND id=?',row.tenant_id,row.actor_id);
  if(!actor?.active)throw new HttpError(403,'Initiating staff authority is no longer active');
  g.staff(actor);
  const snapshot=g.load(actor,row.proposal_id);
  const receipt= snapshot.receipt as {receiptId?:string;parameterDigest?:string;binding?:Binding}|null;
  if(!receipt?.binding||receipt.receiptId!==record.receiptId||receipt.parameterDigest!==record.bindingDigest||parameterDigest(receipt.binding)!==record.bindingDigest)throw new HttpError(409,'Stored authority no longer matches the validated action');
  return {row,record,actor,snapshot,binding:receipt.binding};
 }
 private existing(binding:Binding,digest:string|null,receiptId:string|null) {
  const row=this.gateway.store.get<OperationRow>('SELECT * FROM operations WHERE business_key=?',businessOperationKey(binding));
  if(!row)return null;
  if(row.binding_digest!==digest||row.receipt_id!==receiptId||row.tenant_id!==binding.tenantId||row.mode!==this.gateway.mode
   ||parameterDigest({...binding,action:operationRecord(row).action})!==digest)throw new HttpError(409,'Business operation already exists with a different exact binding');
  return {...operationRecord(row),mode:row.mode,alreadyReserved:true,executionEnabled:false};
 }
 // Internal-only entry point. Expose solely through the authenticated executor boundary.
 async reserveStored(input:unknown) {
  const {validationId}=executionInputSchema.parse(input); const g=this.gateway;
  const initial=g.store.transaction(()=>{
   const context=this.reference(validationId);
   const existing=this.existing(context.binding,context.record.bindingDigest,context.record.receiptId);
   if(existing)return {existing};
   const before=evaluate(context.snapshot,null,g.now(),g.mode);
   if(!before.checks.every(c=>c.name==='provider_state'||c.result==='PASS'))return {held:g.persist(context.actor,context.row.proposal_id,context.snapshot,null)};
   const key=resourceKey(context.binding);const leaseId=randomUUID();const now=g.now().toISOString();
   g.store.run('DELETE FROM resource_leases WHERE resource_key=? AND expires_at<=?',key,now);
   const acquired=g.store.run('INSERT OR IGNORE INTO resource_leases VALUES(?,?,?,?,?,?)',key,leaseId,context.binding.tenantId,context.binding.customerId,now,new Date(g.now().getTime()+10000).toISOString());
   if(acquired.changes!==1)return {held:g.persist(context.actor,context.row.proposal_id,{...context.snapshot,busyResource:true},null)};
   return {context,leaseId,key};
  });
  if(initial.existing)return initial.existing;
  if(initial.held)throw new HttpError(409,'Reservation held; fresh validation '+initial.held.validationId+' is '+initial.held.decision);
  try {
   const state=await g.observe(initial.context!.snapshot);
   const result=g.store.transaction(()=>{
    const context=this.reference(validationId);
    const existing=this.existing(context.binding,context.record.bindingDigest,context.record.receiptId);
    if(existing)return {operation:existing};
    const lease=g.store.get('SELECT lease_id FROM resource_leases WHERE resource_key=? AND lease_id=? AND expires_at>?',initial.key!,initial.leaseId!,g.now().toISOString());
    const validation=g.persist(context.actor,context.row.proposal_id,lease?context.snapshot:{...context.snapshot,busyResource:true},state);
    if(validation.decision!=='READY')return {held:validation};
    const checked=evaluate(context.snapshot,state,g.now(),g.mode);
    if(!checked.receipt||!checked.action)throw new HttpError(409,'Exact stored action is unavailable');
    const operationId=randomUUID();const createdAt=g.now().toISOString();
    const record=operationSchema.parse({operationId,tenantId:context.binding.tenantId,customerId:context.binding.customerId,
     requestId:context.binding.requestId,requestVersion:context.binding.requestVersion,validationId:validation.validationId,
     receiptId:checked.receipt.receiptId,businessOperationKey:businessOperationKey(context.binding),providerIdempotencyKey:'proofit-'+operationId,
     resourceKey:resourceKey(context.binding),action:checked.action,state:'RESERVED',providerObjectId:null,effectVerified:false,createdAt,updatedAt:createdAt});
    g.store.run('INSERT INTO operations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',record.operationId,record.tenantId,record.customerId,
     record.requestId,record.requestVersion,record.validationId,record.receiptId,context.record.bindingDigest,record.businessOperationKey,
     record.providerIdempotencyKey,record.resourceKey,JSON.stringify(record.action),record.state,g.mode,null,0,createdAt,createdAt);
    const receiptChange=g.store.run('UPDATE receipts SET consumed_by_operation_id=? WHERE id=? AND tenant_id=? AND consumed_by_operation_id IS NULL AND expires_at>?',
     operationId,record.receiptId,record.tenantId,createdAt);
    if(receiptChange.changes!==1)throw new HttpError(409,'Receipt cannot be consumed');
    if(record.action.type==='REFUND_PAYMENT'){
     const approvalChange=g.store.run('UPDATE approvals SET consumed_by_operation_id=? WHERE tenant_id=? AND receipt_id=? AND consumed_by_operation_id IS NULL AND expires_at>?',
      operationId,record.tenantId,record.receiptId,createdAt);
     if(approvalChange.changes!==1)throw new HttpError(409,'Exact approval cannot be consumed');
    }
    g.store.run('INSERT INTO audit_events(id,tenant_id,request_id,request_version,actor_id,event,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)',
     randomUUID(),record.tenantId,record.requestId,record.requestVersion,context.actor.id,'OPERATION_RESERVED',JSON.stringify({operationId,requestedValidationId:validationId,validationId:record.validationId,mode:g.mode}),createdAt);
    return {operation:{...record,mode:g.mode,alreadyReserved:false,executionEnabled:false}};
   });
   if(result.held)throw new HttpError(409,'Reservation held; fresh validation '+result.held.validationId+' is '+result.held.decision);
   return result.operation!;
  }finally{
   // Fencing token prevents a late worker releasing a replacement lease.
   g.store.run('DELETE FROM resource_leases WHERE resource_key=? AND lease_id=?',initial.key!,initial.leaseId!);
  }
 }

 get(token:string,operationId:string){
  const actor=this.gateway.auth.session(token).actor;
  const row=this.gateway.store.get<OperationRow>('SELECT * FROM operations WHERE tenant_id=? AND id=?',actor.tenant_id,operationId);
  if(!row||(actor.role==='CUSTOMER'&&row.customer_id!==actor.customer_id))throw new HttpError(404,'Operation not found');
  const record=operationRecord(row);
  const outcome=outcomeStatus(this.gateway.store,row);
  const base={operationId:record.operationId,requestId:record.requestId,requestVersion:record.requestVersion,state:record.state,mode:row.mode,effectVerified:outcome.effectVerified,
   providerObjectId:record.providerObjectId,statusText:outcome.statusText,observation:outcome.observation,executionEnabled:false};
  return actor.role==='CUSTOMER'?base:{...base,record};
 }
}

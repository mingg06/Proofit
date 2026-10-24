import { z } from 'zod';
import { evidenceSchema } from '../../packages/contracts/index.ts';
import { lookupSchema } from '../../packages/contracts/investigation.ts';
import { Gateway,parsedJson } from '../backend/gateway.ts';
import { HttpError } from '../backend/auth.ts';
export type RunScope={id:string;tenant_id:string;customer_id:string;request_id:string;request_version:number;proposal_id:string;actor_id:string};
export class EvidenceTools {
 readonly gateway:Gateway;readonly scope:RunScope;readonly token:string;
 constructor(gateway:Gateway,scope:RunScope,token:string){this.gateway=gateway;this.scope=scope;this.token=token;}
 authorize(){const run=this.gateway.store.get<{status:string}>('SELECT status FROM investigations WHERE id=?',this.scope.id);if(run?.status!=='RUNNING')throw new HttpError(409,'Investigation is no longer active');const actor=this.gateway.auth.session(this.token).actor;this.gateway.staff(actor);if(actor.id!==this.scope.actor_id||actor.tenant_id!==this.scope.tenant_id)throw new HttpError(403,'Investigation scope changed');return this.gateway.load(actor,this.scope.proposal_id);}
 resolve(evidenceId:string){
  const snapshot=this.authorize();const s=this.scope;const row=this.gateway.store.get<{record_json:string;purpose:string}>('SELECT record_json,purpose FROM evidence_records WHERE tenant_id=? AND request_id=? AND request_version=? AND id=?',s.tenant_id,s.request_id,s.request_version,evidenceId);
  if(!row)throw new HttpError(404,'Evidence unavailable');const record=evidenceSchema.parse(parsedJson(row.record_json));
  if(record.evidenceId!==evidenceId||record.tenantId!==s.tenant_id||record.requestId!==s.request_id||record.requestVersion!==s.request_version||Date.parse(record.retrievedAt)>this.gateway.now().getTime())throw new HttpError(409,'Evidence scope or version mismatch');
  const ref=record.reference;if(row.purpose==='POLICY'&&snapshot.policy?.source_version!==ref.sourceVersion)throw new HttpError(409,'Policy source version changed');const passage=this.gateway.store.get<{excerpt:string;approved:number}>(
   'SELECT p.excerpt,v.approved FROM passages p JOIN source_versions v ON v.tenant_id=p.tenant_id AND v.source_id=p.source_id AND v.version=p.source_version WHERE p.tenant_id=? AND p.source_id=? AND p.source_version=? AND p.id=?',s.tenant_id,ref.sourceId,ref.sourceVersion,ref.passageId);
  if(!passage?.approved||passage.excerpt!==record.excerpt)throw new HttpError(409,'Source passage is unavailable or no longer approved');
  return {purpose:row.purpose,record};
 }
 private remember(evidenceId:string){const item=this.resolve(evidenceId);this.gateway.store.run('INSERT INTO investigation_evidence VALUES(?,?,?) ON CONFLICT(run_id,evidence_id) DO NOTHING',this.scope.id,evidenceId,JSON.stringify(item.record));return item;}
 async call(raw:unknown){
  const call=lookupSchema.parse(raw);const snapshot=this.authorize();const s=this.scope;
  switch(call.tool){
   case 'read_request_receipt':{const ids=this.gateway.store.all<{id:string}>('SELECT id FROM evidence_records WHERE tenant_id=? AND request_id=? AND request_version=? AND purpose=? ORDER BY id LIMIT 5',s.tenant_id,s.request_id,s.request_version,'REQUEST');return {source:'LOCAL_STORED',receipt:snapshot.receipt,requestEvidence:ids.map(row=>this.remember(row.id))};}
   case 'get_prior_attempts':return {source:'LOCAL_LEDGER',operations:this.gateway.store.all('SELECT id,state,provider_object_id FROM operations WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY created_at,id LIMIT 50',s.tenant_id,s.request_id,s.request_version)};
   case 'validate_proposal':{const v=await this.gateway.validate(this.token,{proposalId:s.proposal_id});return {validationId:v.validationId,decision:v.decision,checks:v.checks};}
   case 'read_case_record':return this.remember(call.input.evidenceId);
   case 'search_approved_policy':{
    const rows=this.gateway.store.all<{id:string}>('SELECT id FROM evidence_records WHERE tenant_id=? AND request_id=? AND request_version=? AND purpose=? ORDER BY id LIMIT 50',s.tenant_id,s.request_id,s.request_version,'POLICY');
    const found=[];for(const row of rows){const item=this.resolve(row.id);if(item.record.excerpt.toLowerCase().includes(call.input.query.toLowerCase()))found.push(this.remember(row.id));if(found.length===5)break;}
    return {source:'LOCAL_STORED_APPROVED_PASSAGES',results:found};
   }
  }
 }
 verifyCitations(findings:z.infer<typeof import('../../packages/contracts/index.ts').investigatorOutputSchema>['findings']){
  const saved=this.gateway.store.all<{evidence_id:string;record_json:string}>('SELECT * FROM investigation_evidence WHERE run_id=?',this.scope.id);
  for(const finding of findings)for(const ref of finding.references){
   const match=saved.find(row=>{const e=evidenceSchema.parse(parsedJson(row.record_json));return JSON.stringify(e.reference)===JSON.stringify(ref);});
   if(!match)throw new HttpError(409,'Citation was not retrieved during this investigation');
   const stored=evidenceSchema.parse(parsedJson(match.record_json));const current=this.resolve(match.evidence_id).record;
   if(JSON.stringify(current)!==JSON.stringify(stored))throw new HttpError(409,'Cited evidence changed after retrieval');
  }
 }
}

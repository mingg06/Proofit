import { WorkingMemory } from './memory.ts';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { investigationLimits } from '../../packages/contracts/index.ts';
import { startInvestigationSchema,modelStepSchema,measuredUsageSchema,investigatorPromptVersion,evidenceToolsVersion,investigatorInstructions,type InvestigationModel } from '../../packages/contracts/investigation.ts';
import { Gateway,parsedJson } from '../backend/gateway.ts';
import { evaluate } from '../backend/rules.ts';
import { HttpError,type Actor } from '../backend/auth.ts';
import { EvidenceTools,type RunScope } from './tools.ts';
import type { EvidenceRetrieval } from './retrieval.ts';
type Status='COMPLETE'|'RULES_ONLY'|'UNAVAILABLE'|'BUDGET_EXHAUSTED'|'MALFORMED_OUTPUT'|'EVIDENCE_CHANGED'|'FAILED';
export type InvestigationRow=RunScope & {status:string;mode:string;model_id:string|null;unresolved_json:string;created_at:string;deadline_at:string;finished_at:string|null;validation_id:string|null};
class BudgetError extends Error{}
export class Investigator {
 readonly preloadEvidence:boolean;readonly memory:WorkingMemory|null;readonly gateway:Gateway;readonly model:InvestigationModel|null;readonly limits:{toolCalls:number;modelTurns:number;activeDurationMs:number};
 readonly retrieval:EvidenceRetrieval|undefined;
 constructor(gateway:Gateway,options:{model?:InvestigationModel;retrieval?:EvidenceRetrieval;memory?:boolean;preloadEvidence?:boolean;limits?:{toolCalls?:number;modelTurns?:number;activeDurationMs?:number}}={}){
  this.preloadEvidence=options.preloadEvidence??false;this.retrieval=options.retrieval;
  this.gateway=gateway;this.memory=options.memory===false?null:new WorkingMemory(gateway);this.model=options.model??null;this.limits={...investigationLimits,...options.limits};
  for(const key of ['toolCalls','modelTurns','activeDurationMs'] as const)if(!Number.isSafeInteger(this.limits[key])||this.limits[key]<1||this.limits[key]>investigationLimits[key])throw new Error('Investigation limits cannot exceed locked budgets');
 }
 private event(runId:string,kind:string,data:unknown){this.gateway.store.run('INSERT INTO investigation_events(id,run_id,kind,data_json,created_at) VALUES(?,?,?,?,?)',randomUUID(),runId,kind,JSON.stringify(data),this.gateway.now().toISOString());}
 private audit(actor:Actor,scope:RunScope,event:string,detail:unknown){this.gateway.store.run('INSERT INTO audit_events(id,tenant_id,request_id,request_version,actor_id,event,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)',randomUUID(),actor.tenant_id,scope.request_id,scope.request_version,actor.id,event,JSON.stringify(detail),this.gateway.now().toISOString());}
 get(token:string,runId:string){
  const actor=this.gateway.auth.session(token).actor;this.gateway.staff(actor);
  const row=this.gateway.store.get<InvestigationRow>('SELECT * FROM investigations WHERE tenant_id=? AND id=?',actor.tenant_id,runId);
  if(!row)throw new HttpError(404,'Investigation not found');
  return {run:row,findings:this.gateway.store.all('SELECT kind,text,references_json FROM investigation_findings WHERE run_id=? ORDER BY rowid',row.id),
   evidence:this.gateway.store.all('SELECT evidence_id,record_json FROM investigation_evidence WHERE run_id=? ORDER BY evidence_id',row.id),
   events:this.gateway.store.all('SELECT sequence,kind,data_json,created_at FROM investigation_events WHERE run_id=? ORDER BY sequence',row.id),
   retrievals:this.gateway.store.all('SELECT id,purpose,source_id,source_version,query_reference,provenance,adapter_version,row_count,retrieved_at,latency_ms FROM retrieval_queries WHERE run_id=? ORDER BY purpose,id',row.id),recordedReplay:true,executionEnabled:false};
 }
 async start(token:string,input:unknown){
  const {proposalId}=startInvestigationSchema.parse(input);const g=this.gateway;
  const initial=g.store.transaction(()=>{
   const actor=g.auth.session(token).actor;const snapshot=g.load(actor,proposalId);
   if(snapshot.latestVersion!==snapshot.request.version)throw new HttpError(409,'Investigate the current request version');
   g.store.run("UPDATE investigations SET status='ABANDONED',usage_complete=0,input_tokens=NULL,output_tokens=NULL,finished_at=?,unresolved_json=? WHERE tenant_id=? AND proposal_id=? AND status='RUNNING' AND deadline_at<=?",g.now().toISOString(),JSON.stringify(['Prior investigation stopped before its outcome was recorded.']),actor.tenant_id,proposalId,g.now().toISOString());
   if(g.store.get("SELECT id FROM investigations WHERE tenant_id=? AND proposal_id=? AND status='RUNNING'",actor.tenant_id,proposalId))throw new HttpError(409,'An investigation is already running');
   const scope:RunScope={id:randomUUID(),tenant_id:actor.tenant_id,customer_id:snapshot.request.customer_id,request_id:snapshot.request.id,request_version:snapshot.request.version,proposal_id:proposalId,actor_id:actor.id};
   g.store.run("INSERT INTO investigations(id,tenant_id,customer_id,request_id,request_version,proposal_id,actor_id,mode,status,model_id,prompt_version,tools_version,input_tokens,output_tokens,unresolved_json,created_at,deadline_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    scope.id,scope.tenant_id,scope.customer_id,scope.request_id,scope.request_version,proposalId,actor.id,g.mode,'RUNNING',this.model?.modelId??null,investigatorPromptVersion,evidenceToolsVersion,0,0,'[]',g.now().toISOString(),new Date(g.now().getTime()+this.limits.activeDurationMs).toISOString());
   this.audit(actor,scope,'INVESTIGATION_STARTED',{runId:scope.id,promptVersion:investigatorPromptVersion,toolsVersion:evidenceToolsVersion});this.event(scope.id,'STARTED',{limits:this.limits,mode:g.mode,modelId:this.model?.modelId??null});
   return {scope,actor,snapshot};
  });
  const started=performance.now();const tools=new EvidenceTools(g,initial.scope,token,this.retrieval);const history:unknown[]=[];
  let status:Status='FAILED',turns=0,calls=0,inputTokens=0,outputTokens=0,usageComplete=true;
  let findings:z.infer<typeof import('../../packages/contracts/index.ts').investigatorOutputSchema>['findings']=[];
  let unresolved:string[]=[];
  const checkTime=()=>{if(performance.now()-started>=this.limits.activeDurationMs)throw new BudgetError();};
  const bounded=async<T>(fn:(signal:AbortSignal)=>Promise<T>):Promise<T>=>{
   checkTime();const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
   try{return await Promise.race([fn(controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new BudgetError());},Math.max(1,this.limits.activeDurationMs-(performance.now()-started)));})]);}
   finally{if(timer)clearTimeout(timer);}
  };
  try{
   const preliminary=evaluate(initial.snapshot,null,g.now(),g.mode);
   if(preliminary.decision==='BLOCK'){status='RULES_ONLY';this.event(initial.scope.id,'RULES_SHORTCUT',{reason:'Known structured mismatch; no model call needed.'});}
   else if(!this.model||(g.mode==='LIVE_TEST'&&this.model.provenance!=='LIVE')){status='UNAVAILABLE';unresolved=['Verified investigator/model integration is unavailable.'];}
   else{
    const recalled=this.memory?.recall(tools)??[];
    if(recalled.length)this.event(initial.scope.id,'MEMORY_RECALLED',{implementation:'meterless-hmem-scoped-working-v1',memoryIds:recalled.map(m=>m.memoryId),authority:false});
    for(const evidenceId of new Set(recalled.flatMap(m=>m.evidenceIds))){
     checkTime();if(calls>=this.limits.toolCalls)throw new BudgetError();calls++;
     const call={tool:'read_case_record' as const,input:{evidenceId}};
     this.event(initial.scope.id,'TOOL_STARTED',{call:calls,...call,reason:'REFETCH_AFTER_MEMORY'});
     const result=await bounded(signal=>tools.call(call,signal));
     this.event(initial.scope.id,'TOOL_RESULT',{call:calls,tool:call.tool,result});history.push({call,result});
    }
    if(this.preloadEvidence){
     const ids=(initial.snapshot.manifest?.evidence??[]).map(e=>(e.record as {evidenceId?:string})?.evidenceId).filter((id):id is string=>typeof id==='string');
     for(const evidenceId of new Set(ids)){
      if(history.some(h=>(h as {call:{tool:string;input:{evidenceId?:string}}}).call.input.evidenceId===evidenceId))continue;
      checkTime();if(calls>=this.limits.toolCalls)throw new BudgetError();calls++;
      const call={tool:'read_case_record' as const,input:{evidenceId}};
      this.event(initial.scope.id,'TOOL_STARTED',{call:calls,...call,reason:'ONE_SHOT_EVIDENCE_PACKET'});
      const result=await bounded(signal=>tools.call(call,signal));
      this.event(initial.scope.id,'TOOL_RESULT',{call:calls,tool:call.tool,result});history.push({call,result});
     }
    }
    const context={untrustedMemoryHints:recalled,proposal:initial.snapshot.proposal,confirmedReceipt:initial.snapshot.receipt,requestId:initial.scope.request_id,requestVersion:initial.scope.request_version,toolNames:['read_request_receipt','search_approved_policy','read_case_record','get_prior_attempts','validate_proposal']};
    while(true){
     checkTime();if(turns>=this.limits.modelTurns)throw new BudgetError();turns++;
     let reply:{output:unknown;usage:unknown};
     try{reply=await bounded(signal=>this.model!.next({runId:initial.scope.id,system:investigatorInstructions,context,outputSchema:z.toJSONSchema(modelStepSchema),history},signal));}
     catch(error){usageComplete=false;throw error;}
     const usage=measuredUsageSchema.safeParse(reply.usage);
     if(!usage.success||usage.data.modelId!==this.model.modelId){usageComplete=false;status='MALFORMED_OUTPUT';unresolved=['Measured model usage or model identity is missing/invalid.'];break;}
     inputTokens+=usage.data.inputTokens;outputTokens+=usage.data.outputTokens;
     this.event(initial.scope.id,'MODEL_STEP',{turn:turns,modelId:usage.data.modelId,inputTokens:usage.data.inputTokens,outputTokens:usage.data.outputTokens,provenance:this.model.provenance,...(usage.data.runtime?{runtime:usage.data.runtime}:{})});
     const step=modelStepSchema.safeParse(reply.output);
     if(!step.success){status='MALFORMED_OUTPUT';unresolved=['Model output failed its exact structured schema.'];break;}
     checkTime();
     if(step.data.type==='FINAL'){
      if(step.data.findings.length===0&&step.data.unresolved.length===0){status='MALFORMED_OUTPUT';unresolved=['Final output contains no cited finding or unresolved issue.'];break;}
      findings=step.data.findings;unresolved=step.data.unresolved;status='COMPLETE';break;
     }
     if(step.data.calls.length>this.limits.toolCalls-calls)throw new BudgetError();
     for(const call of step.data.calls){
      checkTime();calls++;this.event(initial.scope.id,'TOOL_STARTED',{call:calls,...call});
      const result=await bounded(signal=>tools.call(call,signal));checkTime();if(JSON.stringify(result).length>32768)throw new BudgetError();
      this.event(initial.scope.id,'TOOL_RESULT',{call:calls,tool:call.tool,result});history.push({call,result});
     }
    }
   }
  }catch(error){
   status=error instanceof BudgetError?'BUDGET_EXHAUSTED':error instanceof HttpError?'EVIDENCE_CHANGED':'FAILED';
   unresolved=[status==='BUDGET_EXHAUSTED'?'Investigation budget exhausted; review required.':status==='EVIDENCE_CHANGED'?'Evidence or authenticated scope changed during investigation.':'Investigation stopped without a valid outcome; review required.'];findings=[];
  }
  g.store.transaction(()=>{
   const active=g.store.get<{status:string}>('SELECT status FROM investigations WHERE id=?',initial.scope.id);if(active?.status!=='RUNNING'){this.event(initial.scope.id,'LATE_RESULT_DISCARDED',{});return;}
   if(status==='COMPLETE'){
    try{checkTime();const current=tools.authorize();if(current.latestVersion!==initial.scope.request_version||current.policy?.version!==initial.snapshot.policy?.version)throw new Error('Case changed');tools.verifyCitations(findings);checkTime();}
    catch(error){status=error instanceof BudgetError?'BUDGET_EXHAUSTED':'EVIDENCE_CHANGED';unresolved=[status==='BUDGET_EXHAUSTED'?'Investigation budget exhausted; review required.':'Request, policy or cited evidence changed; fresh investigation/review required.'];findings=[];}
   }
   if(status==='COMPLETE'&&unresolved.length)this.memory?.capture(tools,unresolved);
   for(const finding of findings)g.store.run('INSERT INTO investigation_findings VALUES(?,?,?,?,?)',randomUUID(),initial.scope.id,finding.kind,finding.text,JSON.stringify(finding.references));
   g.store.run('UPDATE investigations SET status=?,model_turns=?,tool_calls=?,active_duration_ms=?,input_tokens=?,output_tokens=?,usage_complete=?,unresolved_json=?,finished_at=? WHERE id=? AND status=?',status,turns,calls,Math.ceil(performance.now()-started),usageComplete?inputTokens:null,usageComplete?outputTokens:null,usageComplete?1:0,JSON.stringify(unresolved),g.now().toISOString(),initial.scope.id,'RUNNING');
   this.event(initial.scope.id,'FINISHED',{status,unresolved});this.audit(initial.actor,initial.scope,'INVESTIGATION_FINISHED',{runId:initial.scope.id,status});
  });
  const validation=await g.validate(token,{proposalId});
  g.store.run('UPDATE investigations SET validation_id=? WHERE id=?',validation.validationId,initial.scope.id);
  return {...this.get(token,initial.scope.id),validation};
 }
}

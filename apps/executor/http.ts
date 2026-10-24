import { z } from 'zod';
import { actionSchema,executionInputSchema } from '../../packages/contracts/index.ts';
import { parsedJson } from '../backend/gateway.ts';
import type { ProviderReader } from '../backend/gateway.ts';
import type { RefundExecutor } from './refund.ts';
import type { CancellationExecutor } from './cancellation.ts';
import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { ZodError } from 'zod';
import { HttpError } from '../backend/auth.ts';
import { jsonBody,send } from '../backend/http-utils.ts';
import { OperationLedger } from '../backend/operations.ts';
export function createExecutorApi(ledger:OperationLedger,secret:string,options:{cancellation?:CancellationExecutor;refund?:RefundExecutor;reader?:ProviderReader}={}){
 if(secret.length<32)throw new Error('Executor service authentication requires at least 32 characters');
 const hash=(value:string)=>createHash('sha256').update(value).digest();
 const expected=hash('Bearer '+secret);
 const server=createServer(async(req,res)=>{
  try {
   const auth=req.headers.authorization;
   if(typeof auth!=='string'||!timingSafeEqual(hash(auth),expected))throw new HttpError(401,'Executor service authentication required');
   if(req.method==='POST'&&req.url==='/internal/provider-state'&&options.reader){
    const input=z.strictObject({tenantId:z.string().min(1).max(200),customerId:z.string().min(1).max(200),action:actionSchema}).parse(await jsonBody(req));
    return send(res,200,await options.reader.read(input,AbortSignal.timeout(3000)));
   }
   if(req.method==='POST'&&req.url==='/internal/actions'&&(options.cancellation||options.refund)){
    const input=executionInputSchema.parse(await jsonBody(req));
    const proposal=ledger.gateway.store.get<{proposal_json:string}>('SELECT p.proposal_json FROM validations v JOIN proposals p ON p.id=v.proposal_id AND p.tenant_id=v.tenant_id WHERE v.id=?',input.validationId);
    const action=actionSchema.safeParse(parsedJson(proposal?.proposal_json));
    if(!action.success)throw new HttpError(409,'Stored supported action required');
    const executor=action.data.type==='REFUND_PAYMENT'?options.refund:options.cancellation;
    if(!executor)throw new HttpError(409,'This action is not enabled');
    return send(res,200,await executor.execute(input));
   }
   if(req.method==='POST'&&req.url==='/internal/cancellations'&&options.cancellation)return send(res,200,await options.cancellation.execute(await jsonBody(req)));
   if(req.method==='POST'&&req.url==='/internal/refunds'&&options.refund)return send(res,200,await options.refund.execute(await jsonBody(req)));
   if(req.method==='POST'&&req.url==='/internal/refund-reconciliations'&&options.refund)return send(res,200,await options.refund.reconcile(await jsonBody(req)));
   if(req.method==='POST'&&req.url==='/internal/reconciliations'&&options.cancellation)return send(res,200,await options.cancellation.reconcile(await jsonBody(req)));
   if(req.method!=='POST'||req.url!=='/internal/reservations')throw new HttpError(404,'Route not found');
   const operation=await ledger.reserveStored(await jsonBody(req));
   send(res,200,operation);
  }catch(error){
   if(error instanceof HttpError)return send(res,error.status,{error:error.message});
   if(error instanceof ZodError)return send(res,400,{error:'Only a stored validation reference is accepted'});
   send(res,500,{error:'Internal executor error'});
  }
 });
 server.requestTimeout=15000;server.headersTimeout=10000;server.maxHeadersCount=32;
 return server;
}

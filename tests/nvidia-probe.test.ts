import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { probeNvidia } from '../apps/investigator/nvidia-probe.ts';
const modelId='synthetic/model';
test('NVIDIA probe records controlled transport provenance and actual reported usage',async()=>{
 let requests=0;const key=randomBytes(24).toString('hex');
 const stub:typeof fetch=async(url,options)=>{requests++;assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');return new Response(JSON.stringify({model:modelId,choices:[{message:{content:JSON.stringify({kind:'PROOFIT_PROBE',executionAllowed:false})}}],usage:{prompt_tokens:21,completion_tokens:9}}));};
 const result=await probeNvidia(key,modelId,{fetch:stub,provenance:'CONTROLLED_TEST'});assert.equal(result.liveAccess,'CONTROLLED_TEST_PASS');assert.equal(result.usage?.inputTokens,21);assert.equal(result.eveCompatibility,'NOT_TESTED');assert.equal(result.nativeToolCalling,'NOT_TESTED');assert.equal(JSON.stringify(result).includes(key),false);assert.equal(requests,1);
});
test('probe rejects missing usage, model substitution and malformed output without logging raw data',async()=>{
 const key=randomBytes(24).toString('hex');
 for(const variant of ['usage','model','output','http']){
  const stub:typeof fetch=async()=>new Response(JSON.stringify({model:variant==='model'?'other-model':modelId,choices:[{message:{content:variant==='output'?key:JSON.stringify({kind:'PROOFIT_PROBE',executionAllowed:false})}}],...(variant==='usage'?{}:{usage:{prompt_tokens:21,completion_tokens:9}})}),{status:variant==='http'?401:200});
  const result=await probeNvidia(key,modelId,{fetch:stub,provenance:'CONTROLLED_TEST'});assert.equal(result.liveAccess,'FAILED');assert.equal(result.usage,null);assert.equal(JSON.stringify(result).includes(key),false);
 }
});

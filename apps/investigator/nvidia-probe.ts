import { z } from 'zod';
import { performance } from 'node:perf_hooks';
const expected=z.strictObject({kind:z.literal('PROOFIT_PROBE'),executionAllowed:z.literal(false)});
const responseSchema=z.object({model:z.string(),choices:z.array(z.object({message:z.object({content:z.string()})})).min(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative()})});
export async function probeNvidia(key:string,modelId:string,transport:{fetch:typeof fetch;provenance:'LIVE'|'CONTROLLED_TEST'}={fetch,provenance:'LIVE'}){
 const started=performance.now();
 const base={service:'nvidia',modelId,provenance:transport.provenance,probeVersion:'nvidia-json-probe-v1',eveCompatibility:'NOT_TESTED',nativeToolCalling:'NOT_TESTED'};
 try{
  if(!key.trim()||!modelId.trim()||modelId.length>200)throw new Error('Missing configuration');
  const response=await transport.fetch('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',redirect:'error',cache:'no-store',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
   body:JSON.stringify({model:modelId,messages:[{role:'system',content:'Return only this exact JSON object: {"kind":"PROOFIT_PROBE","executionAllowed":false}. No markdown or additional fields.'},{role:'user',content:'Confirm the probe shape. This is not an execution request.'}],temperature:0,max_tokens:256,stream:false}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Provider rejected access');
  const raw=await response.text();if(raw.length>32768)throw new Error('Oversized response');
  const parsed=responseSchema.parse(JSON.parse(raw));if(parsed.model!==modelId)throw new Error('Model identity mismatch');expected.parse(JSON.parse(parsed.choices[0]!.message.content));
  return {...base,liveAccess:transport.provenance==='LIVE'?'STRUCTURED_JSON_VERIFIED':'CONTROLLED_TEST_PASS',latencyMs:Math.ceil(performance.now()-started),usage:{inputTokens:parsed.usage.prompt_tokens,outputTokens:parsed.usage.completion_tokens},checkedAt:new Date().toISOString()};
 }catch{return {...base,liveAccess:'FAILED',latencyMs:Math.ceil(performance.now()-started),usage:null,checkedAt:new Date().toISOString(),reason:'Access, measured usage or exact structured-output verification failed. Credential values, provider errors and raw output are withheld.'};}
}

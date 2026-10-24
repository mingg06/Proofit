import { mkdir,writeFile } from 'node:fs/promises';
import { probeNvidia } from '../apps/investigator/nvidia-probe.ts';
if(Number(process.versions.node.split('.')[0])!==24)throw new Error('PROOFIT requires Node 24');
if(process.env.STRIPE_TEST_SECRET_KEY?.trim())throw new Error('Provider execution credentials must not enter the model process');
const key=process.env.NVIDIA_API_KEY?.trim();const modelId=process.env.NVIDIA_MODEL_ID?.trim();
if(!key||!modelId){console.log(JSON.stringify({service:'nvidia',liveAccess:'NOT_TESTED',missing:[...(!key?['NVIDIA_API_KEY']:[]),...(!modelId?['NVIDIA_MODEL_ID']:[])],eveCompatibility:'NOT_TESTED'}));process.exitCode=1;}
else{const result=await probeNvidia(key,modelId);await mkdir('.local',{recursive:true});await writeFile('.local/nvidia-access.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));if(result.liveAccess!=='STRUCTURED_JSON_VERIFIED')process.exitCode=1;}

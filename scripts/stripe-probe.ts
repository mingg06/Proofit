import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Store } from '../apps/backend/database.ts';
import { StripeCancellationAdapter,stripeTransport,stripeAdapterVersion } from '../apps/executor/stripe-cancellation.ts';
const secret=process.env.STRIPE_TEST_SECRET_KEY?.trim();
if(!secret){console.log(JSON.stringify({service:'stripe',liveAccess:'NOT_TESTED',missing:['STRIPE_TEST_SECRET_KEY']}));process.exitCode=1;}
else{
 if(Number(process.versions.node.split('.')[0])!==24)throw new Error('PROOFIT requires Node 24');
 const store=new Store(':memory:');
 let result:unknown;
 try{const adapter=new StripeCancellationAdapter(store,stripeTransport(secret),{provenance:'LIVE'});result={service:'stripe',liveAccess:'READ_ONLY_VERIFIED',...await adapter.probe()};}
 catch{result={service:'stripe',liveAccess:'FAILED',adapterVersion:stripeAdapterVersion,checkedAt:new Date().toISOString(),reason:'Read-only test account/balance verification failed; credential values and provider error bodies are withheld.'};process.exitCode=1;}
 finally{store.close();}
 await mkdir(resolve('.local'),{recursive:true});await writeFile(resolve('.local/stripe-access.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}

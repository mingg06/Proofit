import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { z } from 'zod';
export function config() {
  const runtime = Number(process.versions.node.split('.')[0]);
  if (runtime !== 24) throw new Error('PROOFIT requires Node 24');
  const port = z.coerce.number().int().min(1).max(65535).parse(process.env.PORT?.trim() || '3000');
  const origin = z.url().parse(process.env.APP_ORIGIN?.trim() || 'http://127.0.0.1:' + port);
  const url = new URL(origin);
  if (url.origin !== origin || url.username || url.password || !['https:', 'http:'].includes(url.protocol)
    || (url.protocol === 'http:' && !['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('APP_ORIGIN must be an HTTPS origin or local loopback HTTP origin');
  const bindHost=z.enum(['127.0.0.1','0.0.0.0']).parse(process.env.BIND_HOST?.trim()||'127.0.0.1');
  if(bindHost==='0.0.0.0'&&url.protocol!=='https:')throw new Error('Network binding requires an explicit HTTPS application origin behind a private reverse proxy');
  const databasePath = resolve(process.env.DATABASE_PATH?.trim() || '.local/proofit.sqlite');
  // Provider credentials belong solely to the future isolated executor.
  if (process.env.STRIPE_TEST_SECRET_KEY?.trim()) throw new Error('Remove provider execution credentials from the backend environment');
  mkdirSync(resolve(databasePath, '..'), { recursive: true });
  const automatedReviewAvailable=process.env.PROOFIT_AUTOMATIC_REVIEW==='verified-runtime-installed';
  return { port, origin, databasePath, bindHost, automatedReviewAvailable };
}

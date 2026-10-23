import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { config } from '../apps/backend/config.ts';
import { Store } from '../apps/backend/database.ts';
import { prepareSeed } from '../apps/backend/seed.ts';
const settings = config();
const store = new Store(settings.databasePath);
const credentialFile = resolve('.local/test-accounts.json');
await (await import('node:fs/promises')).mkdir(resolve('.local'), { recursive: true });
try {
  store.migrate();
  if (store.get<{ count: number }>('SELECT count(*) AS count FROM tenants')?.count !== 0) throw new Error('Database already seeded; credentials and accounts preserved');
  const seed = await prepareSeed();
  // Never overwrite a credential file or print passwords into logs.
  await writeFile(credentialFile, JSON.stringify(seed.credentials.map(({ email, password, role, tenant }) => ({ email, password, role, tenant })), null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  seed.apply(store);
  console.log('Synthetic accounts/resources seeded. Local passwords are in .local/test-accounts.json; keep this file private.');
} finally { store.close(); }

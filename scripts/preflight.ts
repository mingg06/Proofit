import { existsSync } from 'node:fs';
// Configuration presence only: never claims remote access, prints secrets, or submits writes.
const required = {
  nvidia: ['NVIDIA_API_KEY', 'NVIDIA_MODEL_ID'],
  zetaris: ['ZETARIS_BASE_URL', 'ZETARIS_TOKEN', 'ZETARIS_STRUCTURED_SOURCE_ID', 'ZETARIS_POLICY_SOURCE_ID'],
  meterless: ['METERLESS_BASE_URL', 'METERLESS_TOKEN'],
  executor: ['STRIPE_TEST_SECRET_KEY', 'EXECUTOR_SERVICE_SECRET'],
};
let missingAny = false;
console.log(JSON.stringify({ service: 'backend', databaseFilePresent: existsSync(process.env.DATABASE_PATH?.trim() || '.local/proofit.sqlite'), sessionMode: 'OPAQUE_PERSISTENT_TOKENS', remoteAccessRequired: false }));
console.log(JSON.stringify({ node: process.version, compatible: Number(process.versions.node.split('.')[0]) === 24 }));
for (const [service, names] of Object.entries(required)) {
  const missing = names.filter(name => !process.env[name]?.trim());
  missingAny ||= missing.length > 0;
  console.log(JSON.stringify({ service, configuration: missing.length ? 'MISSING' : 'PRESENT', missing, liveAccess: 'NOT_TESTED' }));
}
if (missingAny || Number(process.versions.node.split('.')[0]) !== 24) process.exitCode = 1;

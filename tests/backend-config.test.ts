import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../apps/backend/config.ts';
import { Store } from '../apps/backend/database.ts';

test('local backend configuration rejects provider execution secrets and unsafe origins', () => {
  const names = ['PORT', 'APP_ORIGIN', 'DATABASE_PATH', 'STRIPE_TEST_SECRET_KEY'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    process.env.PORT = ''; process.env.APP_ORIGIN = ''; process.env.DATABASE_PATH = '';
    assert.equal(config().origin, 'http://127.0.0.1:3000');
    process.env.STRIPE_TEST_SECRET_KEY = 'controlled-test-placeholder';
    assert.throws(() => config(), /Remove provider execution credentials/);
    delete process.env.STRIPE_TEST_SECRET_KEY;
    for (const origin of ['http://public.example', 'http://127.0.0.1:3000/path', 'https://user:pass@example.test']) {
      process.env.APP_ORIGIN = origin;
      assert.throws(() => config());
    }
    process.env.APP_ORIGIN = 'https://proofit.example';
    assert.equal(config().origin, 'https://proofit.example');
  } finally {
    for (const name of names) { const value = previous[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  }
});
test('migration identity is checked rather than silently accepting altered applied migrations', () => {
  const store = new Store(':memory:');
  try {
    store.migrate();
    store.run('UPDATE schema_migrations SET digest=? WHERE version=1', 'controlled-mismatch');
    assert.throws(() => store.migrate(), /Applied migration changed/);
    assert.equal(store.get<{ count: number }>('SELECT count(*) AS count FROM tenants')?.count, 0);
  } finally { store.close(); }
});

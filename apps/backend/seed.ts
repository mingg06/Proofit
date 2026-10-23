import { randomBytes } from 'node:crypto';
import { passwordHash } from './auth.ts';
import type { Store } from './database.ts';

const accounts = [
  { id: 'actor_customer_a', tenant: 'tenant_synthetic_a', customer: 'customer_synthetic_a', role: 'CUSTOMER', email: 'customer.a@proofit.test' },
  { id: 'actor_customer_b', tenant: 'tenant_synthetic_a', customer: 'customer_synthetic_b', role: 'CUSTOMER', email: 'customer.b@proofit.test' },
  { id: 'actor_support_a', tenant: 'tenant_synthetic_a', customer: null, role: 'SUPPORT', email: 'support.a@proofit.test' },
  { id: 'actor_approver_a', tenant: 'tenant_synthetic_a', customer: null, role: 'REFUND_APPROVER', email: 'approver.a@proofit.test' },
  { id: 'actor_customer_other', tenant: 'tenant_synthetic_other', customer: 'customer_synthetic_other', role: 'CUSTOMER', email: 'customer.other@proofit.test' },
  { id: 'actor_approver_other', tenant: 'tenant_synthetic_other', customer: null, role: 'REFUND_APPROVER', email: 'approver.other@proofit.test' },
] as const;
export async function prepareSeed() {
  const credentials = accounts.map(account => ({ ...account, password: randomBytes(24).toString('base64url') }));
  const hashes = await Promise.all(credentials.map(account => passwordHash(account.password)));
  return { credentials, apply(store: Store) {
    store.transaction(() => {
      if (store.get<{ count: number }>('SELECT count(*) AS count FROM tenants')?.count !== 0) throw new Error('Seed requires an empty database; existing accounts were preserved');
      for (const tenant of ['tenant_synthetic_a', 'tenant_synthetic_other']) {
        store.run('INSERT INTO tenants VALUES(?,?)', tenant, 'Synthetic test business');
        store.run('INSERT INTO policy_versions VALUES(?,?,?,?,?,?)', tenant, 'policy_v1', 'source_fixture_v1',
          'Synthetic policy: period-end cancellation; fixed MYR refunds require customer confirmation and exact staff approval. Live eligibility must be checked separately.', 1, 'FIXTURE');
      }
      for (const [tenant, customer] of [['tenant_synthetic_a', 'customer_synthetic_a'], ['tenant_synthetic_a', 'customer_synthetic_b'], ['tenant_synthetic_other', 'customer_synthetic_other']]) {
        store.run('INSERT INTO customers VALUES(?,?,?)', tenant!, customer!, 'Synthetic customer');
      }
      credentials.forEach((account, i) => store.run('INSERT INTO actors(id,tenant_id,customer_id,email,password_hash,role) VALUES(?,?,?,?,?,?)',
        account.id, account.tenant, account.customer, account.email, hashes[i]!, account.role));
      for (const [resource, kind] of [['sub_fixture_a','SUBSCRIPTION'], ['pi_fixture_a','PAYMENT'], ['pi_fixture_b','PAYMENT']]) {
        store.run('INSERT INTO resources VALUES(?,?,?,?,?)', 'tenant_synthetic_a', resource!, 'customer_synthetic_a', kind!, 'FIXTURE');
      }
      store.run('INSERT INTO resources VALUES(?,?,?,?,?)', 'tenant_synthetic_a', 'sub_fixture_b', 'customer_synthetic_b', 'SUBSCRIPTION', 'FIXTURE');
      store.run('INSERT INTO resources VALUES(?,?,?,?,?)', 'tenant_synthetic_other', 'sub_fixture_other', 'customer_synthetic_other', 'SUBSCRIPTION', 'FIXTURE');
      const now = new Date().toISOString();
      for (const [id, text] of [
        ['request_cancel_a', 'Cancel my next renewal; keep service until the paid period ends.'],
        ['request_refund_a', 'Please refund exactly MYR 2000 minor units against pi_fixture_b.'],
        ['request_mismatch_a', 'Cancel my next renewal; I did not request a refund.'],
        ['request_ambiguous_a', 'Cancel it and give me my money back.'],
      ]) store.run('INSERT INTO requests VALUES(?,?,?,?,?,?,?)', 'tenant_synthetic_a', id!, 1, 'customer_synthetic_a', 'actor_customer_a', text!, now);
    });
  } };
}

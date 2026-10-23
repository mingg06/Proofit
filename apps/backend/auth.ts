import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Store } from './database.ts';

const derive = promisify(scrypt);
export const loginSchema = z.strictObject({ email: z.string().email().max(254).transform(s => s.toLowerCase()), password: z.string().min(1).max(512) });
export type Actor = { id: string; tenant_id: string; customer_id: string | null; role: 'CUSTOMER' | 'SUPPORT' | 'REFUND_APPROVER' };
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64) as Buffer;
  return salt + ':' + key.toString('hex');
}
async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [salt, expected] = encoded.split(':');
  if (!salt || !expected || !/^[a-f0-9]{128}$/.test(expected)) return false;
  const actual = await derive(password, salt, 64) as Buffer;
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export class Auth {
  readonly store: Store;
  readonly now: () => Date;
  private readonly dummyHash: Promise<string>;
  constructor(store: Store, now: () => Date = () => new Date()) {
    this.store = store; this.now = now;
    this.dummyHash = passwordHash(randomBytes(32).toString('hex'));
  }
  async login(input: unknown) {
    const { email, password } = loginSchema.parse(input);
    const user = this.store.get<Actor & { password_hash: string; active: number }>('SELECT * FROM actors WHERE email=?', email);
    const valid = await verifyPassword(password, user?.password_hash ?? await this.dummyHash);
    if (!user || !valid || !user.active) throw new HttpError(401, 'Invalid credentials');
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const createdAt = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + 8 * 60 * 60 * 1000).toISOString();
    this.store.run('INSERT INTO sessions VALUES(?,?,?,?,?)', tokenHash(token), user.id, csrfToken, createdAt, expiresAt);
    return { token, csrfToken, expiresAt };
  }
  session(token: string | undefined): { actor: Actor; csrfToken: string } {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'Authentication required');
    const row = this.store.get<Actor & { csrf_token: string }>(
      'SELECT a.id,a.tenant_id,a.customer_id,a.role,s.csrf_token FROM sessions s JOIN actors a ON a.id=s.actor_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1',
      tokenHash(token), this.now().toISOString());
    if (!row) throw new HttpError(401, 'Authentication required');
    return { actor: { id: row.id, tenant_id: row.tenant_id, customer_id: row.customer_id, role: row.role }, csrfToken: row.csrf_token };
  }
  logout(token: string): void { this.store.run('DELETE FROM sessions WHERE token_hash=?', tokenHash(token)); }
}

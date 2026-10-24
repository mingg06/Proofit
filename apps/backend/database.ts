import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  }
  get<T>(sql: string, ...args: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...args) as T | undefined;
  }
  all<T>(sql: string, ...args: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...args) as T[];
  }
  run(sql: string, ...args: SQLInputValue[]) { return this.db.prepare(sql).run(...args); }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  migrate(): void {
    this.db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, digest TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
    const migrations = ['001_foundation.sql', '002_gateway.sql', '003_resource_leases.sql', '004_provider_mapping.sql'];
    this.transaction(() => {
      migrations.forEach((file, index) => {
        const version = index + 1;
        const sql = readFileSync(new URL('../../migrations/' + file, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
        const digest = createHash('sha256').update(sql).digest('hex');
        const applied = this.get<{ digest: string }>('SELECT digest FROM schema_migrations WHERE version=?', version);
        if (applied) {
          if (applied.digest !== digest) throw new Error('Applied migration changed; create a new migration');
          return;
        }
        this.db.exec(sql);
        this.run('INSERT INTO schema_migrations VALUES(?,?,?)', version, digest, new Date().toISOString());
      });
    });
  }

  close(): void { this.db.close(); }
}

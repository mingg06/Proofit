import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { id, evidenceSchema } from '../../packages/contracts/index.ts';
import { manifestSchema, policyRulesSchema } from '../../packages/contracts/gateway.ts';
import type { EvidenceTools } from './tools.ts';

export const zetarisAdapterVersion = 'zetaris-evidence-v1';
const sourceSchema = z.strictObject({
  sourceId: id, sourceVersion: id,
  relation: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/),
});
const configSchema = z.strictObject({ tenantId: id, structured: sourceSchema, policy: sourceSchema });
export type ZetarisConfig = z.infer<typeof configSchema>;
const rowSchema = z.strictObject({
  tenant_id: id, customer_id: id, request_id: id, request_version: z.number().int().positive(),
  policy_version: id, source_id: id, source_version: id, passage_id: id,
  excerpt: z.string().min(1).max(20000),
});
const resultSchema = z.strictObject({
  // A durable provider audit/query reference, never the pagination queryToken.
  queryReference: id, rows: z.array(rowSchema).min(1).max(5), complete: z.literal(true),
});

/** Normalized port, NOT a claim about Zetaris's HTTP response format.
 * A verified instance transport must enforce response byte limits, abort signals,
 * cursor cleanup and completeness, and supply a genuine durable query reference.
 */
export interface ZetarisQueryClient {
  readonly provenance: 'LIVE' | 'CONTROLLED_TEST';
  query(input: { select: string; pageLimit: 6 }, signal: AbortSignal): Promise<unknown>;
}
export type { EvidenceRetrieval } from './retrieval.ts';
import type { EvidenceRetrieval } from './retrieval.ts';
// Deliberately restrict identifiers rather than inventing portable SQL escaping.
function literal(value: string | number) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{1,200}$/.test(value))
    throw new Error('Unsupported identifier in retrieval scope');
  return "'" + value + "'";
}

/** Code-injected only: no model-selected SQL, relations, URLs, identity or approval. */
export class ZetarisEvidenceRetrieval implements EvidenceRetrieval {
  #config: ZetarisConfig;
  #client: ZetarisQueryClient;
  constructor(config: ZetarisConfig, client: ZetarisQueryClient) {
    this.#config = configSchema.parse(config);
    if (config.structured.sourceId === config.policy.sourceId || config.structured.relation === config.policy.relation)
      throw new Error('Two separate approved retrieval sources are required');
    this.#client = client;
  }
  async refresh(tools: EvidenceTools, parentSignal: AbortSignal) {
    const g = tools.gateway, s = tools.scope, config = this.#config;
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(10000)]);
    const initial = tools.authorize();
    if (config.tenantId !== s.tenant_id || initial.latestVersion !== s.request_version || !initial.policy)
      throw new Error('Retrieval scope is unavailable');
    if (g.mode === 'LIVE_TEST' && this.#client.provenance !== 'LIVE')
      throw new Error('Controlled retrieval cannot supply live evidence');
    const policy = initial.policy;
    const rules = policyRulesSchema.parse(initial.rules);
    if (rules.sourceId !== config.policy.sourceId || rules.sourceVersion !== config.policy.sourceVersion || policy.source_version !== config.policy.sourceVersion)
      throw new Error('Retrieval policy source does not match current policy');
    const expectedProvenance = this.#client.provenance === 'LIVE' ? 'LIVE' : 'FIXTURE';
    const approved = () => {
      for (const source of [config.structured, config.policy]) {
        const row = g.store.get<{ approved: number; provenance: string }>(
          'SELECT approved,provenance FROM source_versions WHERE tenant_id=? AND source_id=? AND version=?',
          s.tenant_id, source.sourceId, source.sourceVersion);
        if (row?.approved !== 1 || row.provenance !== expectedProvenance) throw new Error('Retrieval source is not approved');
      }
    };
    approved();
    const batches: { purpose: 'REQUEST' | 'POLICY'; source: z.infer<typeof sourceSchema>; result: z.infer<typeof resultSchema>; latencyMs: number }[] = [];
    for (const [purpose, source] of [['REQUEST', config.structured], ['POLICY', config.policy]] as const) {
      signal.throwIfAborted();
      const started = performance.now();
      const select = 'SELECT tenant_id,customer_id,request_id,request_version,policy_version,source_id,source_version,passage_id,excerpt FROM ' + source.relation +
        ' WHERE tenant_id=' + literal(s.tenant_id) + ' AND customer_id=' + literal(s.customer_id) +
        ' AND request_id=' + literal(s.request_id) + ' AND request_version=' + literal(s.request_version) +
        ' AND policy_version=' + literal(policy.version) + ' AND source_id=' + literal(source.sourceId) +
        ' AND source_version=' + literal(source.sourceVersion) +
        (purpose === 'POLICY' ? ' AND passage_id=' + literal(rules.passageId) : '') + ' ORDER BY passage_id LIMIT 6';
      let raw: unknown;
      try {
        // Bound even an uncooperative injected client; no late result can persist.
        raw = await new Promise<unknown>((resolve, reject) => {
          const abort = () => reject(new Error('Retrieval interrupted'));
          signal.addEventListener('abort', abort, { once: true });
          Promise.resolve().then(() => { signal.throwIfAborted(); return this.#client.query({ select, pageLimit: 6 }, signal); })
            .then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
        });
      } catch { throw new Error('Zetaris retrieval unavailable; review required'); }
      signal.throwIfAborted();
      const result = resultSchema.parse(raw);
      if (Buffer.byteLength(JSON.stringify(result)) > 24576) throw new Error('Retrieval result exceeds evidence budget');
      const passages = new Set<string>();
      for (const row of result.rows) {
        if (row.tenant_id !== s.tenant_id || row.customer_id !== s.customer_id || row.request_id !== s.request_id ||
          row.request_version !== s.request_version || row.policy_version !== policy.version || row.source_id !== source.sourceId || row.source_version !== source.sourceVersion ||
          (purpose === 'POLICY' && row.passage_id !== rules.passageId) || passages.has(row.passage_id))
          throw new Error('Retrieved evidence scope/version mismatch');
        passages.add(row.passage_id);
      }
      if (purpose === 'POLICY' && !passages.has(rules.passageId)) throw new Error('Applicable policy passage missing');
      batches.push({ purpose, source, result, latencyMs: Math.ceil(performance.now() - started) });
    }
    if (Buffer.byteLength(JSON.stringify(batches)) > 28672) throw new Error('Combined retrieval exceeds evidence budget');
    g.store.transaction(() => {
      signal.throwIfAborted();
      const current = tools.authorize();
      if (current.latestVersion !== s.request_version || current.policy?.version !== policy.version ||
        current.policy.source_version !== policy.source_version || JSON.stringify(current.rules) !== JSON.stringify(initial.rules))
        throw new Error('Request or policy changed during retrieval');
      approved();
      // Retrieval cannot resolve an existing material hold by replacing its manifest.
      const prior = current.manifest ? manifestSchema.parse(current.manifest.content) : null;
      const evidenceIds: string[] = [];
      for (const batch of batches) {
        const queryId = randomUUID();
        g.store.run('INSERT INTO retrieval_queries VALUES(?,?,?,?,?,?,?,?,?,?,?)', queryId, s.id,
          batch.purpose, batch.source.sourceId, batch.source.sourceVersion, batch.result.queryReference,
          this.#client.provenance, zetarisAdapterVersion, batch.result.rows.length, g.now().toISOString(),
          batch.latencyMs);
        for (const row of batch.result.rows) {
          const existing = g.store.get<{ excerpt: string }>('SELECT excerpt FROM passages WHERE tenant_id=? AND source_id=? AND source_version=? AND id=?', s.tenant_id, row.source_id, row.source_version, row.passage_id);
          if (existing && existing.excerpt !== row.excerpt) throw new Error('Retrieved passage conflicts with pinned source version');
          if (!existing) g.store.run('INSERT INTO passages VALUES(?,?,?,?,?)', s.tenant_id, row.source_id, row.source_version, row.passage_id, row.excerpt);
          const record = evidenceSchema.parse({ evidenceId: randomUUID(), tenantId: s.tenant_id, requestId: s.request_id,
            requestVersion: s.request_version, provenance: expectedProvenance,
            reference: { sourceId: row.source_id, sourceVersion: row.source_version, passageId: row.passage_id },
            excerpt: row.excerpt, retrievedAt: g.now().toISOString(), visibility: 'STAFF' });
          g.store.run('INSERT INTO evidence_records VALUES(?,?,?,?,?,?)', record.evidenceId, s.tenant_id, s.request_id, s.request_version, batch.purpose, JSON.stringify(record));
          g.store.run('INSERT INTO retrieval_evidence VALUES(?,?)', record.evidenceId, queryId);
          evidenceIds.push(record.evidenceId);
        }
      }
      g.store.run('INSERT INTO evidence_manifests VALUES(?,?,?,?,?,?,?)', randomUUID(), s.tenant_id, s.request_id, s.request_version,
        policy.version, JSON.stringify({ evidenceIds, unresolved: prior?.unresolved ?? [], conflicts: prior?.conflicts ?? [] }), g.now().toISOString());
      g.store.run('INSERT INTO investigation_events(id,run_id,kind,data_json,created_at) VALUES(?,?,?,?,?)', randomUUID(), s.id,
        'ZETARIS_RETRIEVAL', JSON.stringify({ adapterVersion: zetarisAdapterVersion, provenance: this.#client.provenance, evidenceIds }), g.now().toISOString());
      signal.throwIfAborted();
    });
  }
}

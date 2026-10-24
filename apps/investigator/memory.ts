import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { id, timestamp } from "../../packages/contracts/index.ts";
import { Gateway } from "../backend/gateway.ts";
import { EvidenceTools } from "./tools.ts";
const recordSchema = z.strictObject({
  id,
  content: z.strictObject({
    unresolved: z.array(z.string().max(1000)).max(30),
    evidenceIds: z.array(id).max(10),
  }),
  type: z.literal("factual"),
  layer: z.literal("working"),
  timestamp,
  lastAccessed: timestamp,
  accessCount: z.number().int().nonnegative(),
  confidence: z.literal(1),
  source: id,
  provenance: z.strictObject({
    origin: z.literal("model_response"),
    learnedAt: timestamp,
    label: z.literal("Untrusted unresolved issues and evidence pointers"),
  }),
  namespace: id,
  derivedFrom: z.array(id).length(1),
});
export const memoryImplementation = "meterless-hmem-scoped-working-v1";
/** Direct-capture working tier based on the Meterless H-MEM spec. Not the complete H-MEM engine. */
export class WorkingMemory {
  readonly gateway: Gateway;
  constructor(gateway: Gateway) {
    this.gateway = gateway;
  }
  private digest(tools: EvidenceTools) {
    const current = tools.authorize();
    return createHash("sha256")
      .update(JSON.stringify({ policy: current.policy, rules: current.rules }))
      .digest("hex");
  }
  recall(tools: EvidenceTools) {
    const s = tools.scope,
      digest = this.digest(tools),
      g = this.gateway;
    const rows = g.store.all<{ id: string; record_json: string }>(
      "SELECT id,record_json FROM working_memories WHERE tenant_id=? AND customer_id=? AND request_id=? AND request_version=? AND mode=? AND policy_digest=? AND expires_at>? ORDER BY created_at DESC,id LIMIT 5",
      s.tenant_id,
      s.customer_id,
      s.request_id,
      s.request_version,
      g.mode,
      digest,
      g.now().toISOString(),
    );
    return g.store.transaction(() => {
      if (this.digest(tools) !== digest)
        throw new Error("Policy changed during recall");
      return rows.map((row) => {
        const record = recordSchema.parse(JSON.parse(row.record_json));
        record.accessCount++;
        record.lastAccessed = g.now().toISOString();
        g.store.run(
          "UPDATE working_memories SET record_json=? WHERE id=?",
          JSON.stringify(record),
          row.id,
        );
        g.store.run(
          "INSERT INTO memory_audit(id,memory_id,actor_id,run_id,event,created_at) VALUES(?,?,?,?,?,?)",
          randomUUID(),
          row.id,
          s.actor_id,
          s.id,
          "RECALLED",
          g.now().toISOString(),
        );
        return {
          memoryId: row.id,
          unresolved: record.content.unresolved,
          evidenceIds: record.content.evidenceIds,
          source: record.source,
          authority: false as const,
        };
      });
    });
  }
  capture(tools: EvidenceTools, unresolved: string[]) {
    // Capture while the run is still active so current scope/policy can be revalidated.
    const s = tools.scope,
      g = this.gateway,
      digest = this.digest(tools);
    if (!unresolved.length) return;
    const evidence = g.store.all<{ evidence_id: string }>(
      "SELECT evidence_id FROM investigation_evidence WHERE run_id=? ORDER BY evidence_id LIMIT 10",
      s.id,
    );
    const now = g.now().toISOString(),
      memoryId = randomUUID();
    const record = recordSchema.parse({
      id: memoryId,
      content: { unresolved, evidenceIds: evidence.map((e) => e.evidence_id) },
      type: "factual",
      layer: "working",
      timestamp: now,
      lastAccessed: now,
      accessCount: 0,
      confidence: 1,
      source: s.id,
      provenance: {
        origin: "model_response",
        learnedAt: now,
        label: "Untrusted unresolved issues and evidence pointers",
      },
      namespace: JSON.stringify([s.tenant_id, s.request_id, s.request_version]),
      derivedFrom: [s.id],
    });
    g.store.run(
      "INSERT INTO working_memories VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      memoryId,
      s.tenant_id,
      s.customer_id,
      s.request_id,
      s.request_version,
      s.id,
      g.mode,
      digest,
      JSON.stringify(record),
      now,
      new Date(g.now().getTime() + 86400000).toISOString(),
    );
    g.store.run(
      "INSERT INTO memory_audit(id,memory_id,actor_id,run_id,event,created_at) VALUES(?,?,?,?,?,?)",
      randomUUID(),
      memoryId,
      s.actor_id,
      s.id,
      "CAPTURED",
      now,
    );
  }
}

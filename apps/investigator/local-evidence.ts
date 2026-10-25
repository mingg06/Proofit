import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { evidenceSchema } from "../../packages/contracts/index.ts";
import {
  manifestSchema,
  policyRulesSchema,
} from "../../packages/contracts/gateway.ts";
import type { EvidenceRetrieval } from "./retrieval.ts";
import type { EvidenceTools } from "./tools.ts";

export const localEvidenceVersion = "local-sqlite-evidence-v1";

/** Snapshot authenticated application records, never an arbitrary file/URL or model-selected SQL. */
export class LocalEvidence implements EvidenceRetrieval {
  async refresh(tools: EvidenceTools, signal: AbortSignal) {
    const { gateway: g, scope: s } = tools;
    const started = performance.now();
    g.store.transaction(() => {
      signal.throwIfAborted();
      const snapshot = tools.authorize();
      const policy = snapshot.policy;
      const rules = policyRulesSchema.parse(snapshot.rules);
      if (
        !policy ||
        snapshot.latestVersion !== s.request_version ||
        policy.source_version !== rules.sourceVersion
      )
        throw new Error("Current local policy is unavailable");
      const clause = g.store.get<{
        excerpt: string;
        approved: number;
        provenance: string;
      }>(
        "SELECT p.excerpt,v.approved,v.provenance FROM passages p JOIN source_versions v ON v.tenant_id=p.tenant_id AND v.source_id=p.source_id AND v.version=p.source_version WHERE p.tenant_id=? AND p.source_id=? AND p.source_version=? AND p.id=?",
        s.tenant_id,
        rules.sourceId,
        rules.sourceVersion,
        rules.passageId,
      );
      if (
        !clause ||
        clause.approved !== 1 ||
        clause.provenance !== policy.provenance
      )
        throw new Error("Applicable policy passage is not approved");
      const request = g.store.get<{
        original_text: string;
        created_at: string;
      }>(
        "SELECT original_text,created_at FROM requests WHERE tenant_id=? AND customer_id=? AND id=? AND version=?",
        s.tenant_id,
        s.customer_id,
        s.request_id,
        s.request_version,
      );
      if (!request) throw new Error("Scoped request is unavailable");
      // Seeded business/resource data stays synthetic, even when a real model reads it.
      const provenance =
        policy.provenance === "FIXTURE" ||
        snapshot.resource?.provenance === "FIXTURE"
          ? "FIXTURE"
          : "LIVE";
      const requestSource =
        provenance === "FIXTURE"
          ? "local-fixture-requests"
          : "local-application-requests";
      const requestVersion = "request-record-v1";
      g.store.run(
        "INSERT INTO source_versions VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
        s.tenant_id,
        requestSource,
        requestVersion,
        1,
        provenance,
      );
      const approvedRequestSource = g.store.get<{
        approved: number;
        provenance: string;
      }>(
        "SELECT approved,provenance FROM source_versions WHERE tenant_id=? AND source_id=? AND version=?",
        s.tenant_id,
        requestSource,
        requestVersion,
      );
      if (
        approvedRequestSource?.approved !== 1 ||
        approvedRequestSource.provenance !== provenance
      )
        throw new Error("Local request source is revoked or inconsistent");
      const prior = snapshot.manifest
        ? manifestSchema.parse(snapshot.manifest.content)
        : null;
      const evidenceIds: string[] = [];
      const batches = [
        {
          purpose: "REQUEST",
          sourceId: requestSource,
          sourceVersion: requestVersion,
          passageId: s.request_id + ":" + s.request_version,
          excerpt: request.original_text,
          provenance,
        },
        {
          purpose: "POLICY",
          sourceId: rules.sourceId,
          sourceVersion: rules.sourceVersion,
          passageId: rules.passageId,
          excerpt: clause.excerpt,
          provenance: policy.provenance as "FIXTURE" | "LIVE",
        },
      ];
      for (const batch of batches) {
        const pinned = g.store.get<{ excerpt: string }>(
          "SELECT excerpt FROM passages WHERE tenant_id=? AND source_id=? AND source_version=? AND id=?",
          s.tenant_id,
          batch.sourceId,
          batch.sourceVersion,
          batch.passageId,
        );
        if (pinned && pinned.excerpt !== batch.excerpt)
          throw new Error("Pinned local passage changed");
        if (!pinned)
          g.store.run(
            "INSERT INTO passages VALUES(?,?,?,?,?)",
            s.tenant_id,
            batch.sourceId,
            batch.sourceVersion,
            batch.passageId,
            batch.excerpt,
          );
        const queryId = randomUUID();
        const record = evidenceSchema.parse({
          evidenceId: randomUUID(),
          tenantId: s.tenant_id,
          requestId: s.request_id,
          requestVersion: s.request_version,
          provenance: batch.provenance,
          reference: {
            sourceId: batch.sourceId,
            sourceVersion: batch.sourceVersion,
            passageId: batch.passageId,
          },
          excerpt: batch.excerpt,
          retrievedAt: g.now().toISOString(),
          visibility: "STAFF",
        });
        // This reference identifies this persisted local read, not a remote provider query.
        g.store.run(
          "INSERT INTO retrieval_queries VALUES(?,?,?,?,?,?,?,?,?,?,?)",
          queryId,
          s.id,
          batch.purpose,
          batch.sourceId,
          batch.sourceVersion,
          "sqlite-read:" + queryId,
          batch.provenance === "FIXTURE" ? "CONTROLLED_TEST" : "LIVE",
          localEvidenceVersion,
          1,
          g.now().toISOString(),
          Math.ceil(performance.now() - started),
        );
        g.store.run(
          "INSERT INTO evidence_records VALUES(?,?,?,?,?,?)",
          record.evidenceId,
          s.tenant_id,
          s.request_id,
          s.request_version,
          batch.purpose,
          JSON.stringify(record),
        );
        g.store.run(
          "INSERT INTO retrieval_evidence VALUES(?,?)",
          record.evidenceId,
          queryId,
        );
        evidenceIds.push(record.evidenceId);
      }
      g.store.run(
        "INSERT INTO evidence_manifests VALUES(?,?,?,?,?,?,?)",
        randomUUID(),
        s.tenant_id,
        s.request_id,
        s.request_version,
        policy.version,
        JSON.stringify({
          evidenceIds,
          unresolved: prior?.unresolved ?? [],
          conflicts: prior?.conflicts ?? [],
        }),
        g.now().toISOString(),
      );
      g.store.run(
        "INSERT INTO investigation_events(id,run_id,kind,data_json,created_at) VALUES(?,?,?,?,?)",
        randomUUID(),
        s.id,
        "LOCAL_EVIDENCE_READ",
        JSON.stringify({
          adapterVersion: localEvidenceVersion,
          evidenceIds,
          storage: "SQLITE",
          requestProvenance: provenance,
        }),
        g.now().toISOString(),
      );
      signal.throwIfAborted();
    });
  }
}

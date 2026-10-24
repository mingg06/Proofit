import { createHash } from "node:crypto";
import { z } from "zod";
import { Foundation } from "./foundation.ts";
import { Gateway } from "./gateway.ts";
import { OperationLedger } from "./operations.ts";
import { Investigator } from "../investigator/runner.ts";
const versionSchema = z.number().int().positive();
const omitted = new Set([
  "providerIdempotencyKey",
  "idempotencyKey",
  "provider_key",
  "businessOperationKey",
  "resourceKey",
  "password_hash",
  "password",
  "csrfToken",
  "token",
  "authorization",
]);
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !omitted.has(key))
        .map(([key, v]) => [key, redact(v)]),
    );
  if (typeof value === "string") {
    // Structured records stored as JSON receive the same key filtering.
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object")
        return JSON.stringify(redact(parsed));
    } catch {}
    return value
      .replace(
        /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,
        "[REDACTED PRIVATE KEY]",
      )
      .replace(
        /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]+|nvapi-[A-Za-z0-9_-]+|\bBearer\s+[^\s"<>]+|\bpi_[A-Za-z0-9]+_secret_[A-Za-z0-9]+/g,
        "[REDACTED CREDENTIAL]",
      );
  }
  return value;
}
export function exportCase(
  foundation: Foundation,
  token: string,
  requestId: string,
  version: number,
) {
  versionSchema.parse(version);
  return foundation.store.transaction(() => {
    const actor = foundation.auth.session(token).actor;
    const caseData = foundation.readCase(token, requestId, version);
    const gateway = new Gateway(foundation.store, { now: foundation.now });
    const ledger = new OperationLedger(gateway);
    const investigator = new Investigator(gateway);
    const operations = caseData.operations as { operationId: string }[];
    const payload = redact({
      schemaVersion: 1,
      kind: "PROOFIT_RECORDED_CASE",
      visibility: actor.role === "CUSTOMER" ? "CUSTOMER" : "STAFF",
      exportedAt: foundation.now().toISOString(),
      executionEnabled: false,
      recordedOnly: true,
      case: caseData,
      operations: operations.map((op) => ledger.get(token, op.operationId)),
      ...(actor.role === "CUSTOMER"
        ? {}
        : {
            investigations: (
              caseData as { investigations: { id: string }[] }
            ).investigations.map((run) => investigator.get(token, run.id)),
            evidence: foundation.store.all(
              "SELECT id,purpose,record_json FROM evidence_records WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY id",
              actor.tenant_id,
              requestId,
              version,
            ),
            manifests: foundation.store.all(
              "SELECT policy_version,manifest_json,created_at FROM evidence_manifests WHERE tenant_id=? AND request_id=? AND request_version=? ORDER BY created_at,id",
              actor.tenant_id,
              requestId,
              version,
            ),
          }),
      redaction: {
        credentialPatterns: true,
        internalOperationKeysRemoved: true,
        originalRecordsUnchanged: true,
      },
    });
    const canonical = JSON.stringify(payload);
    return {
      payload,
      sha256: createHash("sha256").update(canonical).digest("hex"),
    };
  });
}

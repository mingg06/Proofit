import type { Store } from "../backend/database.ts";

/** Upgrade only the named development policy. No fixture is relabeled as real data. */
export function prepareStandaloneFixtures(store: Store) {
  store.transaction(() => {
    const policy = store.get<{ clause_text: string; source_version: string }>(
      "SELECT clause_text,source_version FROM policy_versions WHERE tenant_id='tenant_synthetic_a' AND version='policy_v1' AND provenance='FIXTURE'",
    );
    if (!policy || policy.source_version !== "source_fixture_v1") return;
    if (
      store.get(
        "SELECT policy_version FROM policy_rules WHERE tenant_id='tenant_synthetic_a' AND policy_version='policy_v1'",
      )
    )
      return;
    store.run(
      "INSERT INTO policy_rules VALUES(?,?,?)",
      "tenant_synthetic_a",
      "policy_v1",
      JSON.stringify({
        allowCancellation: true,
        allowRefund: true,
        maxRefundMinor: 20000,
        requiredApprovalRole: "REFUND_APPROVER",
        sourceId: "local-fixture-policy",
        sourceVersion: policy.source_version,
        passageId: "subscription-policy",
      }),
    );
    store.run(
      "INSERT INTO source_versions VALUES(?,?,?,?,?)",
      "tenant_synthetic_a",
      "local-fixture-policy",
      policy.source_version,
      1,
      "FIXTURE",
    );
    store.run(
      "INSERT INTO passages VALUES(?,?,?,?,?)",
      "tenant_synthetic_a",
      "local-fixture-policy",
      policy.source_version,
      "subscription-policy",
      policy.clause_text,
    );
  });
}

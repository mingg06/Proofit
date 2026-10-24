import { randomUUID } from "node:crypto";
import type { Store } from "../apps/backend/database.ts";
import { Foundation } from "../apps/backend/foundation.ts";
import { Gateway } from "../apps/backend/gateway.ts";
import { OperationLedger } from "../apps/backend/operations.ts";
import { CancellationExecutor } from "../apps/executor/cancellation.ts";
import type { CancellationProvider } from "../apps/executor/cancellation-provider.ts";
export async function recordedOutcomes(
  store: Store,
  credentials: { email: string; password: string }[],
) {
  // Isolated browser-test fixtures only. All provider/model provenance stays CONTROLLED_TEST.
  const foundation = new Foundation(store);
  const login = async (email: string) => {
    const a = credentials.find((a) => a.email === email)!;
    return (await foundation.auth.login({ email, password: a.password })).token;
  };
  const customer = await login("customer.a@proofit.test"),
    staff = await login("support.a@proofit.test");
  store.run(
    "INSERT INTO policy_rules VALUES(?,?,?)",
    "tenant_synthetic_a",
    "policy_v1",
    JSON.stringify({
      allowCancellation: true,
      allowRefund: true,
      maxRefundMinor: 20000,
      requiredApprovalRole: "REFUND_APPROVER",
      sourceId: "e2e-policy",
      sourceVersion: "source_fixture_v1",
      passageId: "policy-clause",
    }),
  );
  for (const id of ["e2e-request", "e2e-policy"])
    store.run(
      "INSERT INTO source_versions VALUES(?,?,?,?,?)",
      "tenant_synthetic_a",
      id,
      "source_fixture_v1",
      1,
      "FIXTURE",
    );
  const policy =
    "Controlled browser-test policy: permit simple period-end cancellation.";
  store.run(
    "INSERT INTO passages VALUES(?,?,?,?,?)",
    "tenant_synthetic_a",
    "e2e-policy",
    "source_fixture_v1",
    "policy-clause",
    policy,
  );
  const outcomes = [];
  for (const variant of ["SCHEDULED", "PENDING", "UNKNOWN"] as const) {
    const target = "sub_e2e_" + variant.toLowerCase();
    store.run(
      "INSERT INTO resources VALUES(?,?,?,?,?)",
      "tenant_synthetic_a",
      target,
      "customer_synthetic_a",
      "SUBSCRIPTION",
      "FIXTURE",
    );
    const row = foundation.createRequest(customer, {
      text: "Controlled recorded outcome fixture: " + variant,
    });
    const action = {
      type: "CANCEL_AT_PERIOD_END" as const,
      subscriptionId: target,
      timing: "PERIOD_END" as const,
    };
    foundation.confirm(customer, {
      requestId: row.id,
      requestVersion: 1,
      action,
    });
    const proposal = foundation.propose(staff, {
      requestId: row.id,
      requestVersion: 1,
      proposal: action,
      conversation: "Controlled browser-test provider, no Stripe request.",
    });
    const excerpt = "Controlled request passage for " + row.id;
    store.run(
      "INSERT INTO passages VALUES(?,?,?,?,?)",
      "tenant_synthetic_a",
      "e2e-request",
      "source_fixture_v1",
      row.id,
      excerpt,
    );
    const evidenceIds = [];
    for (const purpose of ["REQUEST", "POLICY"]) {
      const evidenceId = randomUUID();
      evidenceIds.push(evidenceId);
      store.run(
        "INSERT INTO evidence_records VALUES(?,?,?,?,?,?)",
        evidenceId,
        "tenant_synthetic_a",
        row.id,
        1,
        purpose,
        JSON.stringify({
          evidenceId,
          tenantId: "tenant_synthetic_a",
          requestId: row.id,
          requestVersion: 1,
          provenance: "FIXTURE",
          reference: {
            sourceId: purpose === "POLICY" ? "e2e-policy" : "e2e-request",
            sourceVersion: "source_fixture_v1",
            passageId: purpose === "POLICY" ? "policy-clause" : row.id,
          },
          excerpt: purpose === "POLICY" ? policy : excerpt,
          retrievedAt: new Date().toISOString(),
          visibility: "STAFF",
        }),
      );
    }
    store.run(
      "INSERT INTO evidence_manifests VALUES(?,?,?,?,?,?,?)",
      randomUUID(),
      "tenant_synthetic_a",
      row.id,
      1,
      "policy_v1",
      JSON.stringify({ evidenceIds, unresolved: [], conflicts: [] }),
      new Date().toISOString(),
    );
    const provider: CancellationProvider = {
      async read(input) {
        return {
          tenantId: input.tenantId,
          customerId: input.customerId,
          targetId: target,
          environment: "TEST",
          provenance: "CONTROLLED_TEST",
          observedAt: new Date().toISOString(),
          kind: "SUBSCRIPTION",
          currency: "MYR",
          remainingRefundableMinor: null,
          paymentStatus: null,
          subscriptionStatus: "ACTIVE",
          cancelAtPeriodEnd: false,
          complexBilling: false,
        };
      },
      async submitCancellation() {
        if (variant === "UNKNOWN")
          throw new Error("Controlled possible submission, lost response");
        return {
          providerObjectId: target,
          providerRequestId: "req_e2e_fixture",
        };
      },
      async observeCancellation(input) {
        return {
          tenantId: input.tenantId,
          customerId: input.customerId,
          targetId: target,
          providerObjectId: target,
          environment: "TEST",
          provenance: "CONTROLLED_TEST",
          observedAt: new Date().toISOString(),
          status: variant === "SCHEDULED" ? "SCHEDULED" : "NOT_SCHEDULED",
          periodEnd: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          providerRequestId: "req_e2e_fixture",
          adapterVersion: "e2e-controlled-provider-v1",
        };
      },
    };
    const gateway = new Gateway(store, {
      mode: "CONTROLLED_TEST",
      reader: provider,
    });
    const validation = await gateway.validate(staff, {
      proposalId: proposal.proposalId,
    });
    const result = await new CancellationExecutor(
      new OperationLedger(gateway),
      provider,
    ).execute({ validationId: validation.validationId });
    outcomes.push({
      requestId: row.id,
      operationId: result.operationId,
      variant,
      state: result.state,
    });
  }
  return outcomes;
}

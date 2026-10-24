# Cancellation integration work

## Stripe adapter milestone — 24 October 2026

Pinned stripe 23.0.1 with API 2026-09-30.endive after checking official cancellation/idempotency/versioning documentation and the installed SDK types/README. The SDK supports Node 20+; this application uses Node 24.22.1. The installed release uses accounts.retrieveCurrent() and item-level current_period_end. SDK network retries are disabled; requests use a 3-second SDK timeout. The gateway also bounds the overall read.

apps/executor/stripe-cancellation.ts is a narrow typed adapter: only retrieve a trusted subscription, set cancel_at_period_end=true with the stored idempotency key, and retrieve scheduling state. It never uses DELETE, refunds, arbitrary URLs, model-selected methods, entitlement changes or combined actions. The live service has not wired its submit method and continues to refuse provider credentials. No real provider write or successful live access is claimed.

Migration 004 introduces trusted tenant-to-Stripe-account and customer mappings. An approved future onboarding/import tool must populate LIVE mappings from verified records; there is no client ingestion endpoint. The adapter requires mapped resource ownership, the expected account, false livemode on the balance/subscription and the provider customer. Test credential syntax alone is insufficient. Synthetic mappings cannot be used by a LIVE adapter.

The supported simple subscription has one fixed licensed MYR item, quantity 1, a future period end and automatic collection. Taxes, discounts, schedules, pending changes, paused collection, metering, billing thresholds, multiple items, custom cancellation timing and ambiguous/unknown state are held. This is deliberately narrower than Stripe's full billing API.

Read-only access probe, with a test credential supplied only to this isolated command:

~~~powershell
npm.cmd run stripe:probe
# Host fallback:
npx.cmd --yes --package=node@24.22.1 node scripts/stripe-probe.ts
~~~

It retrieves the current account and test-mode balance only. Credential values and raw provider error bodies are never printed. When configured, the sanitized result is saved to gitignored .local/stripe-access.json. On this workspace the probe reported NOT_TESTED because STRIPE_TEST_SECRET_KEY is absent. No network call was made. Read-only verification does not unlock writes or waive evidence/model access gates.

Adapter tests use an explicitly CONTROLLED_TEST SDK transport, not fabricated LIVE records. They cover exact payload/key, scheduled-state observation, ownership, live-object rejection, complex billing and fixture-to-live isolation. Current suite: 57 passing tests plus TypeScript.

Official references checked: https://docs.stripe.com/billing/subscriptions/cancel ; https://docs.stripe.com/api/subscriptions/update ; https://docs.stripe.com/api/idempotent_requests ; https://docs.stripe.com/api/versioning . Provider idempotency retention does not replace the local ledger.

## Durable submission and observation milestone

The code now includes CancellationExecutor, execution_attempts, reconciliation_tasks and outcome_observations (migration 005). Controlled end-to-end tests exercise submission and recovery; no live Stripe cancellation has been performed. The default executable still omits cancellation/reconciliation routes, refuses provider credentials, and cannot submit writes. Optional code-injected service routes are tested with a CONTROLLED_TEST provider; there is no environment or client toggle to bypass live gates.

Submission accepts only a stored validationId and supports period-end cancellation alone. Refunds and unsupported actions are rejected before consuming new authority. Reservation is followed by another fresh provider read and full authority revalidation. Current rules are rules-v2: only the exact operation may reuse the receipt/approval already consumed by that operation; expiry, roles, policy, parameters and ownership still apply. Previous rules-v1 validation records cannot authorize a new reservation and require fresh validation. Existing historical records are retained.

A unique durable attempt, SUBMITTED state, recovery task and audit are committed before the provider call. Two workers cannot create another attempt for the same operation. Provider acknowledgement records a reference only; it does not set success. A later typed retrieval must verify test environment, tenant/customer/target, provenance, a fresh observation and future recorded period-end scheduling before SUCCEEDED/effectVerified. NOT_SCHEDULED stays pending; immediate termination, malformed/mismatched observations and uncertain reads stay unknown. Raw provider error bodies are never stored or printed.

A timed-out or failed submission persists OUTCOME_UNKNOWN and keeps the stable operation/key and resource lock. Repeating execute retrieves the existing state without another write. A persisted overdue SUBMITTED attempt becomes unknown after restart. Reconciliation only retrieves the existing subscription; it never resubmits or changes the idempotency key. An absent scheduling flag is not proof of failed submission, so automatic new-key retry and lock release are intentionally unavailable.

Recovery tasks and their read-only leases are persistent. Expired leases can be reclaimed; a replaced/expired fencing token prevents late observation writes. Older provider observations cannot overwrite newer recorded ones. Success text comes from a matching recorded observation, not HTTP acceptance, an operation flag or model text. It describes provider-recorded renewal cancellation scheduling, never immediate termination or bank receipt.

The code-injected authenticated service exposes POST /internal/cancellations with {validationId} and POST /internal/reconciliations with {operationId}. Both remain absent from the default runtime. CancellationExecutor.recoverStalled()/reconcileDue() are durable worker building blocks; a deployed live worker is not wired. Regular GET /api/operations/:id renders recorded status only and never calls a model/provider. Full recorded replay/export is still pending.

Verification: TypeScript and 68 tests pass. Controlled tests cover one-write claim, acknowledgement-versus-observation, pending/lost-response/timeout behavior, duplicate suppression, expiry/policy/proposal/audit rejection, observer scope failure, restart preserving operation/key, stale SUBMITTED recovery and reconciliation fencing. The crash-state insertion test is explicitly a controlled persisted fixture, not a genuine provider trace.

Remaining live gates: verified Stripe access and mappings; approved live request/policy retrieval through Zetaris; NVIDIA/eve investigation compatibility and real inference; Meterless persistence. A real observed cancellation still needs to run through the application before Phase 3 is complete. React and refund submission remain pending.

Shared execution milestone: CancellationExecutor now supplies a cancellation driver to ActionExecutor (apps/executor/execution.ts). RefundExecutor uses that same coordinator and the existing OperationLedger. Cancellation authority/recovery tests continue to apply; there is no second state machine or migration change to the original operation tables. See REFUNDS.md.

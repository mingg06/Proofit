# Manual integration and release checklist

> This checklist describes the earlier hackathon integration path. The owner's 25 October 2026 [standalone decision](STANDALONE.md) removes Zetaris, Meterless/Nightshift, mandatory eve and competition evaluation as prerequisites. Use that document for the current delivery order. The installation-specific instructions below remain reference for optional integrations; their unfinished gates are not new evidence of working access.

Code ownership: the agent implements the remaining bridge/transport, wiring, verification and deployment work. The user supplies service accounts, securely configured credentials, instance API documentation, hosting access and independent evaluation review. You do not need to write the integration code yourself.

The local business logic is implemented and tested with controlled transports. This is a handoff for the remaining installation-specific work, not evidence that a live phase passed. No credentials belong in source, chat, logs, screenshots or exported evidence. The working local subset is committed as 9dcfb2b; integration activation and deployment drafts remain uncommitted for review.

## 1. Model account and exact runtime compatibility

Update, 25 October: NVIDIA credentials and the isolated eve/NVIDIA two-turn compatibility check are verified for nvidia/nemotron-3.5-bolt-e4b. The nullable proposer hold also passes. See [eve setup](EVE.md) for dev:eve/eve:probe, pinned versions, boundaries and the remaining installation gate. The original account/compatibility checklist below remains relevant when changing the runtime or model; no full retrieval/execution gate is claimed.

- Create NVIDIA access and choose an exact model ID. Configure NVIDIA_API_KEY/NVIDIA_MODEL_ID in the isolated model worker environment. Do not give that process a Stripe execution credential.
- Run nvidia:probe and nvidia:investigation:probe with Node 24. The latter uses a labelled synthetic compatibility exercise and measured usage; success is not substantive investigation or eve proof.
- Verify the selected model's JSON-schema support against our LOOKUP/FINAL schema and nullable action proposal schema. Refusal, truncation, missing usage and model substitution must stay held.
- The isolated eve 0.83.2 bridge is installed with default tools disabled, measured usage and single-step enforcement. Its local compatibility probe passes. Production build/restart behavior and the full investigator with real retrieved evidence remain unverified. Consult EVE.md and the installed versioned docs before changing this configuration.

## 2. Zetaris instance contract and sources

Obtain the instance's versioned API documentation and credentials. The agent will implement ZetarisQueryClient against those exact endpoints/envelopes, including cursor cleanup, bounded responses, cancellation, completeness and genuine durable non-secret query references. Public docs did not expose the complete required contract; see ZETARIS.md.

Provision two distinct sources: structured request/customer/payment records and a separate approved policy/case source. Supply tenant-specific, pinned source versions and qualified relations matching ZetarisConfig. Register approved policy/source versions and ownership mappings through trusted installation code, never a public ingestion route. Do not change FIXTURE records to LIVE just to make a gate pass. Test both source queries and record actual references.

## 3. Stripe test environment and executor

Create a Stripe sandbox/test account, MYR paid payment and simple active subscription. Verify the account/test-mode probe and provider customer/resource ownership mappings. Keep STRIPE_TEST_SECRET_KEY only in the isolated executor environment. Both cancellation and exact-refund adapters exist; no live write route is enabled by default.

After the real access/evidence gates pass, the installed executor runtime may construct StripeCancellationAdapter and StripeRefundAdapter, a Gateway reader dispatching by stored action type, one OperationLedger, and CancellationExecutor/RefundExecutor. Pass these to createExecutorApi through its code-only options (reader, cancellation, refund). Current apps/executor/main.ts deliberately remains reservation-only and rejects a Stripe key. The agent installs the live runtime after you provide access and the gates have evidence; setting an environment flag alone cannot enable it.

The service resolves /internal/actions from validationId only. /internal/provider-state is read-only and service-authenticated. Internal cancellation/refund reconciliation routes accept only operationId. Poll reconcileDue() for both executors after restart and periodically; it observes existing attempts and never creates a new provider key. Keep all service ports private. EXECUTOR_SERVICE_SECRET must be at least 32 random characters and is never model context.

## 4. Install the automatic worker

The agent will connect the verified ports using assembleRuntime in apps/worker/assemble.ts, producing the createRuntime(context) module consumed by apps/worker/main.ts. See RUNTIME_ASSEMBLY.md. This is where the verified eve model, NVIDIA proposer, Zetaris retrieval and isolated ExecutorClient are connected. Return the current staff service-session token, model, proposer, retrieval, providerReader and optional execution service. Use a dedicated server-owned SUPPORT account; no client identity or model field establishes its role. Obtain/renew its opaque session through the existing Auth service; an expired session stops the worker.

Set PROOFIT_RUNTIME_MODULE to that installation module in the worker process. Start it with npm.cmd run start:worker on Node 24. Backend and worker must use the same persistent DATABASE_PATH. The model process must not inherit Stripe keys. Worker startup refuses a missing module or controlled model provenance. Raw startup/provider errors are withheld.

Set PROOFIT_AUTOMATIC_REVIEW=verified-runtime-installed in the backend only after the worker is installed. This is a queue-availability setting, not proof of access, an approval or an execution bypass. Confirmations enqueue once in the same transaction as the exact receipt. A verified worker can pick up still-valid UNAVAILABLE jobs; old/expired authority does not renew itself. Refunds retain required exact-amount human approval. Approval can requeue a held job for fresh validation without substituting parameters.

Actual flow: confirmation -> persisted job -> stored AI proposal -> bounded investigator -> deterministic gateway -> optional isolated stored-reference execution -> recorded observation. A mismatch stops at BLOCKED. Missing/changed evidence stops at review. A lost worker is held, not blindly restarted as a new operation. Default local startup continues to report UNAVAILABLE and disables provider submission.

## 5. Memory

A scoped persistent working-memory subset based on the Meterless H-MEM spec is implemented locally; it needs no hosted account. See MEMORY.md. It captures unresolved issues and evidence pointers, not approvals or execution state. Verify restart/recall and source re-fetching against genuine cases. This subset does not claim full Meterless H-MEM conformance or a hosted API integration.

## 6. Deployment

See DEPLOYMENT.md. Docker/Compose files are prepared and Compose syntax was checked. The Docker Desktop Linux engine was stopped, so image build/container startup are NOT_TESTED. You must start the engine, build/run the image, supply your hostname/HTTPS and persistent volume, and smoke-test session, scope, export and restart behavior. Do not distribute the seeded account credential file or publish the executor.

## 7. Independent evaluation and release

All 12 development dossiers are now authored and runnable; see DEVELOPMENT_CASES.md. Independent review is still required. The 36 held-out dossiers and independent labels (12 legitimate, 16 prohibited, 8 unresolved) remain pending; the agent can prepare case data while reviewers keep labels isolated. Held-out labels remain reviewer-only and are not loaded into agent tools. Freeze prompts, corpus, tools, source/model/runtime versions and controls before running.

apps/evaluation/comparison.ts runs review-only RULES_ONLY, ONE_SHOT and FULL_INVESTIGATION trials through the same gateway. One-shot receives a bounded pre-fetched stored evidence packet and one model turn; full investigation can adapt within the locked budgets. Each variant requires an isolated copy of the same case and consistent source/provider fingerprints. These measurements do not execute providers or evaluate acceptance labels. Run provider safety/duplicate/restart tests and genuine execution acceptance separately. Never report zero prohibited executions merely because a review-only runner issued no writes.

Record actual model IDs, latency, measured usage, known prices/costs, failures and limitations. No held-out result, agent benefit, release deadline verification or phase completion is claimed by the local tests. Final manual tasks include public deployment verification, independent acceptance evaluation, integration evidence, and recording the genuine demonstration.

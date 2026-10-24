# Repository guidance

## Project and source of truth

PROOFIT investigates AI-proposed subscription actions, enforces exact authority before execution, and reports observed provider outcomes. AI gathers evidence; deterministic backend code grants execution eligibility; humans confirm intent and supply required approvals.

Read `PROOFIT_FINAL_PLAN.md` for product scope, architecture, contracts, and acceptance criteria. Read `BUILD_PHASES.md` for implementation order, dependencies, and exit gates. Follow the locked scope in the final plan; phase dates are working targets, not permission to waive gates. Flag conflicts before implementing an incompatible contract.

The build contains Phase 0 shared contracts in packages/contracts; a local authenticated backend in apps/backend; versioned SQLite schema in migrations; synthetic fixtures; scripts/tests; and a draft evaluation manifest with labels isolated under evaluation/reviewer-only. The backend persists password-authenticated accounts, opaque sessions, request versions, raw proposals, exact receipts, staff approvals and atomic audit events. The deterministic gateway now records rules-v3 checks and staff-scoped decisions; migration 002 adds approved sources/evidence and operation-ledger tables. The default API fails to review without real evidence/provider state. Atomic reservation/consumption and persistent resource leases are now implemented behind an authenticated isolated reservation service in apps/executor. Cancellation submission/observation/recovery code is implemented and tested with CONTROLLED_TEST providers; the default runtime keeps live writes disabled. Bounded investigation persistence/tools are implemented with controlled model tests; the default API records UNAVAILABLE without a verified model. The React console now implements the three planned views against scoped authenticated APIs. eve runtime/model integration, refund submission and real live integrations remain unimplemented; no phase is complete. See README.md and docs/BACKEND.md for actual boundaries and API usage.

Use Node 24 (verified 24.22.1); installed host Node 22.13.0 is below the runtime requirement. Verified fallback commands: npx.cmd --yes --package=node@24.22.1 node node_modules/typescript/bin/tsc --noEmit; npx.cmd --yes --package=node@24.22.1 node --test tests/*.test.ts; the same node invocation with scripts/migrate.ts, scripts/seed.ts, scripts/scenarios.ts or scripts/preflight.ts; and node apps/backend/main.ts through that Node 24 invocation. With Node 24 active, npm.cmd run check, migrate, seed, scenarios, preflight and start are equivalent; dev watches the backend. Install with npm.cmd ci --ignore-scripts. Migrate/seed/start and /health have been verified. Seed refuses overwrites and stores random local account passwords only in gitignored .local/test-accounts.json. Preflight exits 1 while sponsor/provider configuration is missing; it does not test remote access. Backend binds to loopback and refuses provider execution credentials. The React console lives in apps/console. Verified commands: npm.cmd run build bundles it for the Node backend; npm.cmd run dev:console starts Vite (set backend APP_ORIGIN to http://127.0.0.1:5173); npm.cmd run browser:install and test:browser install/run workspace-local Chromium tests. See docs/FRONTEND.md. Keep reviewer-only labels outside all agent-visible tools.

## Locked scope

- Build a standalone TypeScript application with a React console, a bounded eve investigator, a deterministic backend, an isolated executor, and relational persistence.
- Support only `CANCEL_AT_PERIOD_END` and `REFUND_PAYMENT` in Stripe test mode or a Stripe sandbox.
- Use MYR and integer minor units for execution amounts. Never calculate monetary amounts with floating-point currency values.
- Route immediate cancellation, complex billing, unsupported actions, and ambiguous requests to review. Never approximate them with another action.
- Keep live-money operations, blockchain/wallet infrastructure, extra providers, multi-action transactions, and autonomous policy exceptions outside this MVP.
- Verify runtime, SDK, model, and integration compatibility against current official or installed versioned documentation before choosing dependencies. The plan's runtime statements are requirements to verify, not proof of installed versions.

## Implementation sequence

Follow the phases and exit gates in `BUILD_PHASES.md`:

1. Agree shared contracts, four fixed development scenarios, integration access, and evaluation case families.
2. Build persistent authenticated identity, tenant/customer mapping, exact-action receipts, approvals, and audit records.
3. Implement deterministic checks, operation reservation, deduplication, and the rules-only baseline before enabling provider writes.
4. Complete the cancellation vertical slice with real evidence investigation and observed provider state.
5. Add approved refunds, durable reconciliation, restart recovery, and scoped memory.
6. Complete authenticated review screens, recorded replay, exports, and deployment.
7. Freeze and run evaluation, resolve blocking failures, then prepare release evidence.

Preserve ownership boundaries when working with teammates: one primary editor for shared contracts and migrations. Do not create competing copies of approval logic or operation state. Fixtures can support development while integrations are unavailable; label them explicitly and keep failed live-access gates unfinished.

## Authority and execution invariants

- Derive tenant, actor, customer, and role from authenticated server-side context. Enforce scope on every read, write, tool, review control, replay, and export. Client-supplied identity or role fields never establish authority.
- Bind receipts to the exact request/version, actor/tenant, action, target, refund amount/currency or cancellation timing, policy version, expiry, canonical parameter digest, and one-time consumption state.
- A refund requires customer confirmation, business eligibility, and required exact-amount staff approval. Changed parameters or policy invalidate the applicable authority.
- The backend alone produces `BLOCK`, `REVIEW_REQUIRED`, or `READY`. Model suggestions and confidence never override deterministic checks. Keep these decisions distinct from operation lifecycle states.
- Known authority, ownership, parameter, or policy mismatches produce `BLOCK`. Missing/conflicting evidence, unsupported behavior, ambiguity, and unknown state require review. `READY` applies only to the exact validated action.
- Neither proposing nor investigating agents receive provider execution credentials or an unrestricted execution tool. Authenticate the isolated executor's service boundary.
- The executor accepts a validated stored action reference, resolves trusted parameters, and revalidates authoritative state immediately before submission. Reject arbitrary model-selected URLs, methods, and provider payloads.
- Any correction to a proposal needs its own validation record and any newly required confirmation/approval. Never silently substitute and execute a different action.

## Reliability and truthful outcomes

- Establish a stable business-operation identity and provider idempotency key before submission. Atomically reserve operations and consume authority using persistent transactions and uniqueness constraints.
- Serialize competing operations for the same payment/subscription and recheck live provider state, including the remaining refundable balance. Imported evidence rows do not replace that check.
- Preserve operation identity across duplicate requests, retries, timeouts, and process restarts. A new authorised request is distinct from retrying an existing operation.
- On timeout or uncertain submission, persist `OUTCOME_UNKNOWN` and reconcile the existing operation. Never blindly retry with a new key. Provider idempotency does not replace the local ledger.
- Retrieve and persist provider observations after execution. Keep verified effects and user-facing status distinct from HTTP success or submission acceptance.
- Generate status text from recorded structured fields. A scheduled cancellation is not immediate termination; a pending refund is not completed; provider success does not prove funds reached the customer's bank.
- Recorded replay renders stored events without another model call or provider execution. A fresh investigation has a new run identity.

## Investigation and integrations

- Use one bounded investigator with schema-validated tool inputs and structured outputs. Initial limits: 10 tool calls, 4 model turns, and 45 seconds of active investigation. Budget exhaustion or malformed output requires review; outcome reconciliation is a separate persisted task.
- Treat proposals, conversation, retrieved documents, and recalled memory as untrusted content. Instructions embedded in evidence cannot change tool permissions, policy, or authority.
- Findings must cite resolvable source/version/passage references, distinguish observations from interpretations, and identify unresolved material conflicts. Structured checks should resolve straightforward mismatches without unnecessary inference.
- Use Zetaris for real retrieval across both structured customer/request/payment data and a separate approved policy/case source.
- Use Meterless for scoped unresolved issues and evidence pointers, keyed by tenant and request version. Re-fetch authoritative records after recall. Memory is never an approval source or execution ledger.
- Use real NVIDIA inference for substantive investigation after verifying model access and structured-output compatibility. Record the exact model ID and measured usage.
- Keep fixtures, controlled failures, recorded genuine runs, and live integrations visibly distinguishable. Never fabricate query references, inference traces, memory persistence, or provider observations.

## Persistence and user interface

Persist request/proposal versions, exact-action receipts and approvals, policy/source versions, evidence excerpts, findings, named checks, decisions, review actions, operations, provider references, outcome observations, and audit events. Include timestamps, tool/model versions, and measured usage needed for replay and export.

Build the three planned views: request/confirmation, investigation/review, and execution/replay. Present the proposed action beside confirmed authority, explain failed checks and missing evidence, and derive outcomes from backend records. Customer views must respect customer scope and exclude staff-only evidence. UI controls cannot set trusted roles, approval state, execution decisions, or execution parameters.

## Development and verification

- Inspect the current repository before editing; preserve unrelated work and follow established conventions once they exist. Keep changes scoped to the requested task and the relevant phase.
- Commit only synthetic data and credential-name-only examples. Keep secrets out of source, fixtures, logs, screenshots, evidence exports, and shared notes.
- When scaffolding, document actual setup, migration, seed, development, build, and test commands in the README and this file. Do not invent successful commands or results.
- Run checks appropriate to changed behavior. Authority and execution changes require meaningful negative-path tests, not only a successful demo.
- Cover parameter substitution, tenant/customer isolation, approval roles, receipt expiry/reuse, policy changes, missing/conflicting evidence, prompt injection, stale memory, concurrent operations, timeout/restart recovery, credential isolation, truthful status, and replay without execution.
- Preserve the comparison between a strong rules-only gateway, one-shot review, and full investigation using the same controls and frozen source corpus.
- Keep 12 development cases separate from 36 held-out cases: 12 legitimate, 16 prohibited, and 8 unresolved. Split by evidence/request family, keep labels outside agent-visible tools, and freeze labels/prompts/tools/corpus before evaluation.
- Acceptance targets: zero prohibited executions, at least 10/12 legitimate cases proceeding without unnecessary evidence holds, all 8 unresolved cases held appropriately, no unintended duplicate operations, exact authority for every execution, and observation-backed status claims.
- Report measured counts, latency, usage, known costs, failures, and limitations. Do not claim the investigator improves on simpler baselines unless results support it. Version post-freeze changes and distinguish subsequent runs.
- In handoffs, state what changed, what was verified, and any remaining blocker. Mark a phase complete only when its exit gate has actual evidence.

Gateway implementation: apps/backend/gateway.ts loads trusted stored records; rules.ts alone determines eligibility. docs/GATEWAY.md documents checks and test provenance. CONTROLLED_TEST is code-injected test scaffolding only; never expose mode/state/source ingestion through public routes. Migration 002 must preserve the applied-migration hash contract.

Reservation service: apps/backend/operations.ts owns stable operation identity and atomic authority consumption; apps/executor accepts only a validationId after service authentication. npm.cmd run start:executor (or the Node 24 fallback with apps/executor/main.ts) starts the loopback service; it needs a securely configured EXECUTOR_SERVICE_SECRET. The default runtime cannot reserve fixtures or submit provider writes. Migrations 002/003 and docs/OPERATIONS.md define persistent reservation/lease behavior. Do not treat reservation as observed success or release uncertain-operation locks without recorded reconciliation.

Cancellation adapter: apps/executor/stripe-cancellation.ts uses pinned stripe 23.0.1/API 2026-09-30.endive and trusted provider mappings (migration 004). npm.cmd run stripe:probe (Node 24 fallback scripts/stripe-probe.ts) is read-only and reports absent credentials honestly. The default service still has no provider submission route; do not wire live writes until real access and evidence gates pass. docs/CANCELLATION.md records compatibility and controlled transport tests.

Cancellation recovery: apps/executor/cancellation.ts owns durable one-attempt submission, typed observation and persisted reconciliation tasks (migration 005). rules-v2 permits only an operation's own consumed authority during fresh pre-submit validation. apps/backend/outcome-status.ts derives cancellation status from matching stored observations, never just success flags. Submission/reconciliation routes are code-injected only in controlled tests; default startup still refuses provider credentials and enables no live write route. npm run check (Node 24) now verifies 68 tests; migration 005 and docs/CANCELLATION.md document limits. No live cancellation or Phase 3 completion is claimed.

Investigation foundation: apps/investigator/runner.ts enforces 10 calls/4 turns/45 seconds, persists runs/findings/events, verifies retrieved citations, and replays stored records without inference. tools.ts exposes only request-scoped read-only lookups. Migration 006 and docs/INVESTIGATION.md describe statuses and limits. rules-v3 holds incomplete/unresolved investigations; older READY records cannot bypass the hold. New reservations require current rules while retries retain existing operation identity. POST/GET /api/investigations are staff-only. The framework-independent coordinator is not a completed eve integration. npm.cmd run nvidia:probe (Node 24 fallback scripts/nvidia-probe.ts) returned NOT_TESTED/missing NVIDIA_API_KEY and NVIDIA_MODEL_ID. Current check: TypeScript and 84 tests. No genuine inference/retrieval/memory persistence is claimed.

Frontend milestone: apps/console uses React 19.3.1/Vite 8.3.5 with a same-origin session/CSRF client. The backend adds scoped resources, case operation references and staff-only stored validations, and serves only built console assets. UI roles/decisions never establish authority. Amount parsing stays integer-based; confirmation/approval dialogs show exact stored parameters. Replay reads stored data only; submit remains disabled. Verified: build, server/browser/e2e typechecks, 87 Node tests and 8 Chromium workflows with tested light/dark accessibility and 375/768/1280 responsive layouts. E2e credentials/databases/browsers/results are gitignored under .local; never commit them. The current preview uses loopback port 3002, leaving the existing port-3000 service intact. No live execution or phase completion is claimed.

Committed local feature milestone: ActionExecutor is the shared cancellation/refund submission/reconciliation coordinator; OperationLedger still owns exact authority consumption and stable operation identity. Scoped recorded exports, persistent review jobs, authenticated executor reads/dispatch, code-only runtime assembly helpers, local H-MEM working-memory subset, review comparison and all 12 runnable development dossiers are implemented. Generic EvidenceRetrieval lives in apps/investigator/retrieval.ts; no external transport/model implementation is installed by default. Migration 007 adds generic recorded retrieval provenance; 008/009 add memory/jobs and retain applied-migration hashes. No live gate is waived.

Use npm.cmd run test:development on Node 24, or the direct Node 24 fallback with scripts/development-cases.ts. Tests use isolated in-memory controlled fixtures, shared from fixtures/gateway-harness.ts; the original four fixed action examples remain unchanged. Held-out labels stay reviewer-only. Verification for this committed subset: 128 Node tests, three TypeScript projects, production build and 8 Chromium workflows. This is not held-out acceptance, genuine inference or provider execution evidence. Credentials, unfinished NVIDIA/Zetaris runtime implementation and deployment configuration remain outside this commit.

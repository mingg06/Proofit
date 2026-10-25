# PROOFIT build phases

> **Owner decision — 25 October 2026:** Follow [the standalone delivery order](docs/STANDALONE.md). Hackathon submission, sponsor access, mandatory eve integration and competition evaluation are no longer release gates. The original phases below remain architectural/historical reference; exact-authority, isolation, recovery and observed-outcome checks still apply. No previously unfinished integration is declared complete by this change.

Standalone review milestone: direct NVIDIA proposal/investigation, approved local SQLite evidence, authenticated queue processing and scoped stored replay are connected in one local process. The real-inference synthetic probe passes and creates zero operations; fixtures and absent provider state retain review holds. Provider execution/deployment remain unfinished. Commands and measured usage are in docs/STANDALONE.md. Major verified steps are committed by owner instruction.

Standalone usability verification: real-browser synthetic confirmation through NVIDIA-backed cited review and replay passes; 162 Node tests, 10 Chromium workflows, all four typechecks and the production build pass. Automatic progress refresh stops at terminal holds and cancels old reads. The standalone review milestone is complete for this local synthetic-data profile; genuine Stripe execution and production installation remain subsequent work.

Based on `PROOFIT_FINAL_PLAN.md` v3.1. This document turns the proposal into an implementation sequence; no phase is complete yet. Dates are working targets in Malaysia time, taken from the source plan. External platform capabilities and submission requirements must be checked during implementation.

## Earlier build evidence — 23 October 2026

These snapshots are historical; later implementation evidence below supersedes their component-status statements. No live exit gate has been waived.

Phase 0 is in progress. Shared schema and lifecycle drafts, canonical bindings, four labelled synthetic action scenarios, a 48-slot evaluation manifest and contract tests are implemented. Contract agreement and independent case labels are still pending. The remaining 44 cases are not authored; the four fixtures are action examples, not complete authenticated gateway runs. NVIDIA, Zetaris, Meterless and Stripe configuration are absent from the checked process; live access is NOT_TESTED. No phase exit gate is complete. See docs/CONTRACTS.md and docs/INTEGRATION_ACCESS.md.

Phase 1 foundation work now includes versioned SQLite migrations, synthetic account/resource seed, persistent password/session authentication, scoped request/version/proposal endpoints, exact customer confirmation, role-restricted refund approval and transactional audits. HTTP negative-path, concurrent authority issuance and file-reopen tests pass. Local migrate/seed/start and /health were verified. Investigation/evidence/operation/outcome persistence, gateway/reservation, React and live integrations remain pending. This is implementation evidence for the foundation slice, not a completed phase.

## Build strategy

Build a narrow working path first: confirmed request → stored proposal → investigation → deterministic decision → protected test execution → observed outcome. Extend that path with refunds, recovery, review, and evaluation.

The execution service is the critical path. Prove NVIDIA, Zetaris, and Meterless access immediately so integration problems surface before the application depends on them. Prepare evaluation data and baseline interfaces from the start.

Keep the locked scope: MYR, integer minor units, `CANCEL_AT_PERIOD_END`, and `REFUND_PAYMENT`. Immediate cancellation and complex billing go to review. Provider execution stays in Stripe test mode.

## Phase 0 — Contracts, access, and acceptance cases

**Target:** 23 October, first joint session and access checks.

**Owners:** both; backend owner edits action/receipt/operation contracts, AI owner edits investigation/evidence contracts.

- Agree on TypeScript project boundaries: console, backend, bounded eve investigator, isolated executor, and shared schemas.
- Define exact action parameters, authenticated tenant/actor context, receipt versions/expiry/consumption, required approval roles, and policy versions.
- Define investigator inputs by stored reference and outputs containing findings, evidence references, unresolved items, and trace events. AI suggestions remain advisory.
- Define decision values separately from operation lifecycle states. Document legal transitions, including uncertain outcomes and recovery.
- Define stable business-operation identity, duplicate semantics, resource serialization, and provider idempotency-key ownership.
- Assign fixed identifiers to four development scenarios: valid cancellation, valid approved refund, cancellation/refund mismatch, and ambiguous intent.
- Verify real NVIDIA schema-valid inference, Zetaris queries over both intended source systems, Meterless write/read, and read-only Stripe test access. Record actual versions/model IDs and credential names.
- Draft the 48-case manifest and split case families into 12 development and 36 held-out cases. Keep labels outside agent-visible data.

**Exit gate:** shared schemas and scenario expectations are agreed; all required services have a recorded access result. Unavailable access is an explicit blocker to the relevant live integration, with fixtures clearly labelled for independent development.

## Phase 1 — Persistent foundation and exact authority

**Target:** 23 October, continuing into 24 October if needed.

**Depends on:** Phase 0 contracts.

**Backend owner:**

- Initialise the application, database migrations, configuration validation, and credential-name-only `.env.example`.
- Implement authenticated isolated test accounts, tenant/customer mapping, and fixed customer/staff roles.
- Persist requests, proposals, approvals, policy/source versions, investigations, operations, observations, and audit events.
- Implement structured customer confirmation and exact-action staff approval receipts, with canonical parameter binding and expiry.
- Add scoped endpoints for proposal submission, confirmation, approval, and case retrieval.

**AI owner:** prepare approved policy clauses, case amendments, evidence manifests, seed scenarios, and typed fixture responses for the evidence UI.

**Exit gate:** an authenticated user can confirm and store an exact request and proposal. Another customer/tenant cannot read or approve it. Client-supplied identity, roles, or altered parameters cannot create valid authority.

## Phase 2 — Deterministic gateway and rules-only baseline

**Target:** 24 October, before enabling provider writes.

**Depends on:** Phase 1 persistence and receipts.

**Backend owner:**

- Implement named checks for ownership, supported action, exact target/amount/currency/timing, policy eligibility, approval roles, receipt integrity, required evidence, and current provider state.
- Produce backend-owned `BLOCK`, `REVIEW_REQUIRED`, or `READY` decisions and persist each check result.
- Implement atomic reservation, local uniqueness constraints, resource serialization, receipt consumption, and stable operation/idempotency identities.
- Revalidate authoritative state at execution time. Make the executor resolve approved stored parameters by reference.
- Restrict executor credentials and service authentication so neither agent has a direct provider-write path.
- Expose the same controls as the rules-only evaluation baseline; all later reviewer variants use this gateway.

**AI owner:** review rule coverage against development cases and implement evidence adapter interfaces against shared contracts.

**Exit gate:** wrong action, target, amount, ownership, expired/reused receipt, or missing approval cannot reach a provider-write call. Concurrent duplicate attempts reserve at most one business operation. A known mismatch can be blocked without requiring a model call.

## Phase 3 — First real vertical slice: cancellation

**Target:** 24 October, daily integration checkpoint.

**Depends on:** Phase 2 gate and live access from Phase 0.

**AI owner:**

- Connect Zetaris to structured customer/request/payment data and the separate approved policy/case source, returning stable source/version/passage references.
- Add a minimal proposing adapter and bounded investigator using real NVIDIA inference through eve, after runtime compatibility verification.
- Implement typed read-only tools, schema validation, evidence-linked findings, and fail-to-review behavior for missing evidence or malformed output.
- Enforce initial budgets: 10 tool calls, 4 model turns, and 45 seconds of active investigation.

**Backend owner:** implement end-of-period cancellation, retrieve the resulting subscription, and persist the observed scheduling state. Wire the request and confirmation screen to the backend.

**Joint demo:** confirmed end-of-period cancellation → conflicting refund proposal → evidence-linked block with zero refund calls → separately validated authorised cancellation → real Stripe test update and retrieval.

**Exit gate:** both the blocked mismatch and successful cancellation run through the application. Any corrected proposal has its own validation record; the system does not silently substitute and execute another action.

## Phase 4 — Refunds, recovery, and durable investigation

**Target:** 25 October.

**Depends on:** working Phase 3 path.

**Backend owner:**

- Add exact-amount refunds with customer confirmation, business eligibility, and required staff approval.
- Retrieve current refundable state before execution and persist provider refund IDs and observations.
- Implement durable reconciliation for pending/unknown outcomes, including restart recovery and safe retries using the original operation identity.
- Separate a new authorised refund request from a retry of an existing request; serialize competing requests for the same payment and recheck remaining balance.
- Generate bounded customer status text from recorded provider fields.

**AI owner:**

- Add adaptive follow-up retrieval for amendments, conflicting notes, approval references, and prior attempts.
- Integrate actual Meterless reads/writes for unresolved issues and evidence pointers, scoped by tenant and request version.
- Re-fetch authoritative evidence after recall; memory never grants approval or replaces the operation ledger.

**Exit gate:** one legitimate refund executes in Stripe test mode with its actual observed status. Duplicate/replay/concurrent attempts create no unintended second operation. A process restart preserves operation identity, and a reopened investigation retrieves actual Meterless memory. An uncertain result remains explicitly uncertain until reconciled.

## Phase 5 — Review console, recorded replay, and deployment

**Target:** develop UI from fixtures during Phases 1–3; complete live wiring on 25 October.

**Depends on:** shared response contracts; final gate requires Phase 4.

**AI owner:** build investigation/review UI showing proposed versus confirmed action, source passages, failed checks, missing evidence, and unresolved questions.

**Backend owner:** complete confirmation/approval/status views, scoped review controls, export endpoints, and a persistent test deployment.

**Both:**

- Connect all three screens to real stored records and enforce customer/staff visibility.
- Implement recorded replay without another model call or provider execution. A fresh investigation receives a new run identity.
- Export request/receipt, evidence versions/excerpts, findings, checks, decisions, review actions, execution parameters, provider observations, and measured usage.
- Make clarification or approval create correctly versioned authority and a new validation path.
- Supply a reproducible synthetic seed and deployment/recovery instructions.

**Exit gate:** a reviewer can trace a case from request to outcome, inspect its cited evidence, reopen it, and replay/export its history. Refreshing or replaying never repeats execution. Final demonstration paths use live integrations and stored records, with simulations labelled explicitly.

## Phase 6 — Evaluation and boundary verification

**Target:** prepare throughout the build; freeze and run on 26 October.

**Depends on:** Phase 5 working system; test harness and case preparation begin in Phase 0.

**AI owner:** implement one-shot and full-investigator runners, freeze prompts/tools/source corpus, and report evidence quality, uncertainty handling, latency, tool/model calls, measured tokens, and known costs.

**Backend owner:** run the rules-only baseline and verify parameter substitution, tenancy, receipt expiry/replay, approval roles, policy changes, concurrent operations, timeouts, recovery, and credential isolation.

**Both:** independently label held-out cases, resolve disagreements before running, and compare all three variants using the same authority controls and source corpus. Exercise prompt injection, stale memory, missing/conflicting evidence, status accuracy, and recorded replay. Label controlled provider failures separately from real provider observations.

**Acceptance gates:**

- Zero prohibited executions across the 16 prohibited held-out cases.
- At least 10 of 12 legitimate cases proceed without an unnecessary evidence hold.
- All 8 unresolved cases stay in review, clarification, or explicit uncertain-outcome states.
- No unintended second operation from duplicate, replay, concurrency, timeout, or restart tests.
- Every execution binds to authentic exact-action authority and required approval.
- Every displayed status claim matches a recorded provider observation.
- Report whether adaptive investigation provides a measured evidence-handling or reviewer-effort benefit over simpler baselines.

Fix safety/correctness failures before proceeding. If the agent offers no measured incremental benefit, report that result. Version any changes after the frozen evaluation and distinguish subsequent runs from the original held-out result.

## Phase 7 — Release freeze and submission package

**Target:** 27 October; aim to submit by 23:00 Malaysia time, subject to checking current event requirements.

**Depends on:** Phase 6 results and resolved blocking defects.

- Verify the current event deadline, track requirements, video duration, repository visibility, and access instructions.
- Freeze the demo deployment and repeat the complete cancellation/refund/mismatch/uncertainty flows using the reproducible seed.
- Package setup instructions, test-provider configuration, integration evidence, evaluation cases/results, exported evidence packet, supported scope, and limitations.
- Rehearse and record the demonstration: mismatch blocked, authorised action executed, truthful outcome, duplicate protection, memory resume, measured comparison.
- Describe live runs, recorded runs, and controlled simulations accurately.

**Exit gate:** another person can follow setup instructions, access the demonstration, inspect real integration/evaluation evidence, and reproduce the supported test flows.

## Dependencies and scope control

Critical path: contracts → persistent identity/authority → deterministic gateway/reservation → cancellation slice → refunds/recovery → complete live console → evaluation → release.

Alongside that path, the AI owner develops evidence integrations/investigation/memory; UI uses typed fixtures until live endpoints are ready; case design and baseline preparation start immediately. Each shared contract and migration has one primary editor. Integrate at the end of every day.

Cut animations, an optional second reviewer, broad ingestion, extra providers, complex billing, and conversational polish first. Preserve exact authority, isolated execution, durable operation identity, truthful outcomes, real required integrations, both simple supported actions, and baseline evaluation. A failed exit gate remains unfinished; it is not waived to meet a date.

## 24 October implementation evidence

First Phase 2 milestone: rules-v1 named checks and persistent staff-scoped validations, structured policy/source/evidence schemas and a bounded read-only provider adapter boundary are implemented. Controlled fixtures demonstrate exact READY, BLOCK and review behavior; default API cannot treat fixtures as live. Reservation/provider execution remain pending. This does not close the Phase 2 exit gate or any live integration gate.

Second Phase 2 milestone: authenticated isolated reservation service, fresh revalidation after persistent target lease acquisition, atomic operation/receipt/approval/audit transaction, permanent business/provider keys and scoped operation reads are implemented. Controlled concurrency, replay, rollback, fencing and two-worker/restart tests pass. Provider submission and uncertain-outcome reconciliation are not implemented; Phase 2 live-executor isolation and real vertical-slice gates remain unfinished.

Cancellation adapter preparation: pinned Stripe SDK/API compatibility verified; trusted provider mappings, a narrow period-end cancellation adapter and sanitized read-only access probe implemented. Controlled transport tests pass; access probe reports missing credential/NOT_TESTED. No real cancellation, evidence integration or live phase gate is complete.

Cancellation execution preparation: migration 005 persists attempts, reconciliation tasks and provider observations. rules-v2 revalidates operation-owned consumed authority before a durably claimed one-time submission. Controlled cancellation/timeout/pending/restart/fencing tests pass (68 tests plus TypeScript); customer status requires a matching observation. Default service submission routes remain unwired and no real provider action or access is claimed. Phase 3 still requires live evidence/model integrations and an observed Stripe test cancellation.

Investigation foundation preparation: migration 006 stores bounded request-scoped runs, events, findings and evidence snapshots. Five read-only tools, citation/freshness checks and staff-only start/replay APIs are implemented. rules-v3 prevents incomplete/unresolved runs from bypassing review through an older READY record. Controlled tests and TypeScript pass (84 tests); default model is unconfigured and NVIDIA access probe reports NOT_TESTED/missing configuration. eve runtime/model integration, real NVIDIA/Zetaris/Meterless access and Phase 3 live gates remain unfinished.

Frontend milestone: the three React views are now wired to authenticated stored records: request/confirmation/versioning, staff proposal/rules/investigation/approval, and observation-backed outcome/recorded replay. New scoped resource and case read DTOs preserve customer/staff separation. Build/typechecks, 87 Node tests and 8 real Chromium workflows pass, with accessibility checks on tested light/dark screens and responsive checks at 375/768/1280 widths. Outcome fixtures use a labelled controlled provider in an isolated test database. Default execution remains disabled; real integrations, exports, live deployment and final Phase 5 gate remain unfinished. See docs/FRONTEND.md.

NVIDIA connection preparation: bounded fixed-endpoint structured model transport and a synthetic two-turn compatibility probe are implemented and tested through the persisted investigator. Credentials remain unconfigured, so genuine inference, eve compatibility and the Phase 3 end-to-end cancellation gate remain unfinished. Backend startup and provider write routes remain unchanged.

Zetaris retrieval preparation: code-injected two-source query construction, scoped/approved-version validation, transactional evidence/query persistence and staff recorded replay are implemented with controlled tests (migration 007). Real transport remains blocked on the instance API contract and credentials; no endpoint/response compatibility or genuine query reference has been verified. Source mappings, real access and the Phase 3 evidence gate remain unfinished. See docs/ZETARIS.md.

Local completion milestone (24 October): shared cancellation/refund executor, exact refund transport/observation contracts, scoped snapshot exports, persistent automatic review queue/worker, local H-MEM working-memory subset, review-only baseline comparison and container deployment files are implemented. Default provider submission remains disabled. Genuine eve/NVIDIA/Zetaris/Stripe checks, full memory integration/conformance, image/runtime deployment verification, independent case freeze and release evaluation remain open. The manual setup handoff is docs/MANUAL_SETUP.md; no phase completion or held-out performance result is claimed.

Verification for this local milestone: production bundle, server/browser/e2e TypeScript, 131 Node tests and 8 Chromium workflows pass. These are controlled application checks, not held-out acceptance counts or genuine provider outcomes. All work remains uncommitted for user review.

Development/code preparation: all 12 development dossiers are now authored as controlled drafts and have a standalone 36-trial review runner. The original four fixed action examples remain unchanged. Worker/executor assembly helpers and authority/source/memory comparison fingerprints are prepared; no default live integration is activated. TypeScript and 148 Node tests pass. Held-out cases/labels, genuine integration access and independent freeze/evaluation remain open. See docs/DEVELOPMENT_CASES.md and RUNTIME_ASSEMBLY.md.

25 October NVIDIA/eve compatibility: real NVIDIA inference through isolated eve 0.83.2 passes the synthetic lookup/final probe; the separate proposer holds an ambiguous unsupported request. The bridge disables default capabilities, enforces one model attempt per eve step, preserves backend investigation limits and persists measured runtime references. Review-only assembly is prepared, but real Zetaris access/provider-state installation and default worker activation remain unfinished. See docs/EVE.md. No production runtime, genuine evidence investigation, Stripe execution or phase exit gate is claimed.

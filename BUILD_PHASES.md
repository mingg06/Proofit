# PROOFIT build phases

Based on `PROOFIT_FINAL_PLAN.md` v3.1. This document turns the proposal into an implementation sequence; no phase is complete yet. Dates are working targets in Malaysia time, taken from the source plan. External platform capabilities and submission requirements must be checked during implementation.

## Current build evidence — 23 October 2026

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

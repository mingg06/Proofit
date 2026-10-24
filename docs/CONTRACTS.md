# Phase 0 contract draft

Status: implemented schemas and synthetic fixtures, awaiting team agreement. The source of truth remains PROOFIT_FINAL_PLAN.md. No phase exit gate is claimed complete.

## Boundaries and ownership

- packages/contracts: single shared action, authority, investigation, and operation definitions; primary editor is the backend owner, with AI/evidence review.
- Planned apps/console: React request/confirmation, investigation/review, execution/replay views. No trusted role, decision, or provider parameters from controls.
- apps/backend (foundation, deterministic gateway and reservation ledger implemented; provider submission pending): authenticated sessions, tenant/customer mapping, receipts, exact staff approvals, deterministic decisions, relational transactions, audits and scoped reads.
- Planned apps/investigator: bounded eve investigation, typed read-only evidence tools, NVIDIA inference, Zetaris retrieval, Meterless pointers. No provider execution credentials.
- apps/executor (authenticated reservation boundary implemented; provider submission pending): authenticated service receiving only a stored validationId, resolving trusted records, revalidating live state, reserving and executing exact test-provider operations.

Executable code exists in packages/contracts and apps/backend. The local backend implements password/session authentication, scoped requests/proposals, confirmations, exact staff approval and transactional audit persistence. See BACKEND.md. Console and investigator remain planned. The isolated executor currently reserves by stored reference and cannot submit provider writes.

## Actions, identity, and authority

Actions are a strict discriminated union: end-of-period subscription cancellation or an exact positive safe-integer MYR refund. Unknown keys, immediate timing, arrays of actions, other currencies and noninteger amounts cannot become executable actions. Unsupported raw proposals can still be stored as untrusted input for review; a parser failure is never permission to substitute another action.

Public confirmation accepts only request/version/action. Public approval accepts a receipt reference. The authenticated server resolves identity, roles, ownership, policy and the stored exact action. Parsing authenticatedContextSchema or receiptSchema does not authenticate their contents. Receipts and approvals must be loaded from trusted persistence, never accepted as authority from a client or model.

Parameter digests use a domain-tagged, explicitly ordered JSON tuple and SHA-256. They bind tenant, confirming actor, customer, request/version, policy and all action parameters. Hashes are identity checks, not signatures. Expiry and consumption are stored receipt fields. The foundation issues receipts and rejects expired/consumed authority for confirmation or approval. Atomic consumption/reservation is now implemented through OperationLedger; actual provider submission remains gated.

Refunds always require customer confirmation, current business eligibility and an unexpired exact-action approval by a server-mapped REFUND_APPROVER. SUPPORT cannot grant approval. Staff approvals bind the stored confirmation digest and staff actor separately. Policy configuration must establish eligibility; the model cannot override it.

## Decisions and lifecycle

BLOCK, REVIEW_REQUIRED and READY belong to backend validation records. Proposal/investigation/review workflow states do not belong in the provider operation ledger. Only after READY and successful atomic reservation is there an operation.

Legal ledger transitions are in packages/contracts/lifecycle.ts:

- RESERVED -> SUBMITTED, FAILED or CANCELED.
- SUBMITTED -> PENDING, SUCCEEDED, FAILED, CANCELED or OUTCOME_UNKNOWN.
- PENDING -> SUCCEEDED, FAILED, CANCELED or OUTCOME_UNKNOWN.
- OUTCOME_UNKNOWN -> an observed PENDING, SUCCEEDED, FAILED or CANCELED state.
- SUCCEEDED, FAILED and CANCELED are terminal in this MVP.

Record SUBMITTED durably before invoking the provider. A crash then requires reconciliation even if the call may not have occurred. Never reset OUTCOME_UNKNOWN to RESERVED or create a fresh provider key to retry it. Future documented same-key retry logic needs an explicit reconciliation record and provider retention checks; this initial contract provides no resubmission permission.

Business identity is tenant/customer/request/version, independent of proposal corrections, policy updates and retry IDs. One confirmed request version authorises at most one business operation. A new authorised action requires a new confirmation/request version and fresh authority. Resource identity is tenant plus target type/ID, so distinct requests for the same resource serialize. Generate and store one provider key on first reservation; the persistent ledger now adds unique constraints, locking and single-use consumption around these pure helpers. Provider submission/reconciliation remains unfinished.

## Investigation and evaluation

Investigation input contains stored references, never trusted authority supplied by a model. Findings require source/version/passage references and distinguish observations from interpretations. Output has no decision or execution tool. The backend must resolve each citation against scoped stored evidence, validate provenance/visibility, enforce budgets (10 calls, 4 turns, 45 seconds), and hold malformed/exhausted runs for review. Schema parsing alone cannot verify citation truth or measured usage.

fixtures/development.ts contains four synthetic action pairs, not authenticated receipts, inference results or provider observations. scripts/scenarios.ts validates their confirmed action shapes and prints executionEnabled=false. Draft expectations live under evaluation/reviewer-only; never expose that directory, repository browsing, or labels through investigator tools. These are provisional authoring slots, not a frozen dataset or measured results. Author the remaining cases, independently review labels, freeze prompts/tools/corpus and preserve family separation before evaluation.

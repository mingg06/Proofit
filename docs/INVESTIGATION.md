# Bounded investigation foundation — investigator-v1

Implemented 24 October 2026. This is the persistence, scoped-tool and budget coordinator needed for the planned eve investigator. The eve runtime/model bridge is not installed or verified; real NVIDIA inference, Zetaris queries and Meterless persistence remain unfinished. Controlled models in tests are labelled CONTROLLED_TEST and are not genuine inference traces. No phase exit gate or evaluation result is claimed.

## Routes and persistence

POST /api/investigations accepts only {proposalId}; the server creates a fresh run ID. GET /api/investigations/:id returns stored run metadata, findings, evidence snapshots and ordered events without a model/provider call. Both require current same-tenant staff authentication; POST also requires Origin/CSRF. Customer views exclude investigation records. Staff case responses link stored run IDs. No route accepts tenant/role, model choice, runtime mode, tool definitions or execution parameters.

Migration 006 stores investigation runs, exact prompt/tool versions, measured counters, elapsed active time, nullable token usage, unresolved issues, events, findings and retrieved evidence snapshots. Completed records survive database reopening. A fresh POST creates a new run; replay cannot repeat execution. One active run per tenant/proposal prevents overwrites. A stale RUNNING record becomes ABANDONED when a later start finds its persisted deadline expired. Late results cannot replace that status. This is conservative stopped-run handling, not a claim of live eve session resume.

## Tools and trust

Five schema-validated tools are implemented: read_request_receipt, search_approved_policy, read_case_record, get_prior_attempts and validate_proposal. Identity/request/version come from the authenticated stored proposal, never tool arguments. Case-record lookup is limited to the same request/version. Policy/request evidence must resolve to approved source/version/passage records with exact excerpts. Source and ledger outputs say LOCAL_STORED or LOCAL_LEDGER; no Zetaris query references are invented.

No model receives SQL, filesystem, shell, URL fetching, account configuration, approval writes or an execution tool. Every lookup rechecks authenticated scope. All proposal/source text is untrusted, including instructions inside synthetic policy passages. Model steps contain only LOOKUP calls or FINAL findings/unresolved fields; decision/confidence/role overrides are rejected. The model receives the exact JSON schema. Token counters and run metadata come from the runtime/transport, not model text.

Final findings distinguish observations from interpretations and must cite passages actually retrieved in that run. Citation references are re-resolved immediately before finalization; changed/revoked evidence, request amendments or policy changes invalidate findings and hold the case. Exact stored evidence remains available for recorded replay. Citation resolution establishes which passage was used; it does not prove that every model interpretation is correct.

## Budgets and deterministic authority

Limits: 10 tool calls, 4 model turns, 45 seconds of active investigation. Test injection can lower these limits, never increase them. A shared deadline bounds outstanding calls. Each tool result is capped at 32 KiB; bounded record lists avoid unrestricted retrieval. Budget exhaustion, malformed output, missing measured usage, unavailable integrations and unresolved issues require review. Unknown usage is stored as null, not a fabricated zero. No-call runs have explicit model/turn metadata; controlled fixture token counts are not NVIDIA measurements.

Known structured mismatches take a RULES_ONLY shortcut with zero model/tool calls and an independently persisted backend BLOCK. Models never grant READY. Current rules-v3 adds investigation_completion: the latest RUNNING, failed, unavailable or unresolved investigation adds a deterministic review hold. An earlier READY record cannot bypass it during reservation/submission. COMPLETE with valid citations does not waive receipt, ownership, policy, staff approval, evidence or live-state checks.

Old rules-v1/v2 validation records remain historical. New reservations require current rules; retries can still retrieve an existing exact operation/key. Submission of a reserved action must pass fresh current authority checks. Baseline evaluation still needs frozen cases/prompts/tools/corpus, with agent-visible sources excluding reviewer-only labels.

## Access probe and eve compatibility

Official eve agent configuration documents direct LanguageModel/OpenAI-compatible providers; npm metadata for eve 0.83.0 requires Node 24+ and AI SDK 7. Package metadata and public docs do not prove NVIDIA/eve compatibility. No eve dependency or replacement runtime is claimed complete here. The bounded coordinator exposes a typed model boundary for that future verified integration.

The standalone NVIDIA probe can be run with securely configured NVIDIA_API_KEY and NVIDIA_MODEL_ID:

~~~powershell
npm.cmd run nvidia:probe
# Verified host fallback:
npx.cmd --yes --package=node@24.22.1 node scripts/nvidia-probe.ts
~~~

It uses the official fixed HTTPS endpoint and asks for a tiny exact JSON object; it validates model identity and reported token usage, and never logs raw provider errors/output or keys. The script rejects Stripe execution credentials in its model process. A configured result is stored in gitignored .local/nvidia-access.json. A successful JSON probe would still leave native tool calling/eveCompatibility NOT_TESTED and would not prove substantive investigation or unlock execution. On this workspace the probe returned NOT_TESTED because both configuration values are absent; no inference request was made. The backend therefore runs without a model and explicitly records UNAVAILABLE rather than simulating a live investigator.

References checked: https://eve.dev/docs/agent-config and https://docs.api.nvidia.com/nim/reference/llm-apis .

Verification: TypeScript and 84 tests pass, covering bounded calls/time, malformed/forged output, citation freshness, injection/tool boundaries, scope isolation, old-READY holds, concurrent starts, fresh run IDs, and file-reopen replay without model/provider calls. Live sponsor integration, scoped Meterless memory, eve adapter and real investigator evaluation remain unfinished.

# Bounded investigation foundation — investigator-v1

The isolated eve/NVIDIA bridge is now implemented and locally verified with genuine inference on synthetic context; see [eve setup and limits](EVE.md). Optional validated runtime references are persisted in MODEL_STEP events. The default API/automatic worker is not activated: real Zetaris retrieval and authoritative provider-state installation remain unavailable. Historical statements below are superseded only for the explicitly verified compatibility checks.

## NVIDIA compatibility verified — 25 October 2026

The standalone synthetic probe passed against real NVIDIA inference using `nvidia/nemotron-3.5-bolt-e4b` and `nvidia-investigation-transport-v2`: two accepted turns (scoped lookup, then final missing-evidence hold), 1,845 ms, 1,656 input tokens and 43 output tokens. This supersedes earlier missing-credential statements for this probe only. Usage/cost from earlier failed diagnostics is not fully accounted for; no monetary cost is claimed.

The initial transport received plain text despite requesting `response_format: json_schema`. Version 2 includes the same locked schema in the trusted system prompt and the API format field. Local strict JSON/schema validation remains mandatory; malformed or fenced output is rejected. This verifies observed schema-valid responses, not provider-enforced schema guarantees. The credential and local probe record remain gitignored.

Verified after the change: server TypeScript and all 11 NVIDIA adapter tests, including malformed output, authority injection, scoped tools, cancellation and replay checks. Default runtime activation, eve compatibility, native tool calling, genuine retrieval and provider execution remain unverified/disabled as applicable. No phase completion or held-out evaluation is claimed. Earlier milestones below describe their original verification state.

Zetaris preparation now adds an optional code-injected retrieval boundary to the existing tools. It queries two approved sources, validates scope/versions and persists query references with evidence atomically (migration 007). Staff replay returns recorded retrieval metadata. No real HTTP client is wired: instance API documentation and credentials remain unavailable. Default investigations remain UNAVAILABLE. See [Zetaris mapping, checks and blocker](ZETARIS.md).

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

## NVIDIA transport preparation — 24 October 2026

apps/investigator/nvidia-model.ts implements the existing model-turn interface using the fixed NVIDIA HTTPS Chat Completions endpoint. It sends the locked investigation JSON schema through response_format.json_schema; request context/history stay in an untrusted user-data message. It supports the existing LOOKUP/FINAL protocol, not native provider tool calls. There is no arbitrary endpoint, execution tool, automatic retry, or provider error logging. Responses require the exact configured model ID, one non-truncated completed choice, schema-valid output and measured input/output token counts. Requests are capped at 512 KiB; streamed response reading is capped at 64 KiB. A turn has a 15-second transport deadline and respects the coordinator's 45-second active budget signal.

This preparation does not install or complete eve, change backend startup, accept credentials through HTTP, enable automatic customer-triggered investigation, or enable provider writes. Default API investigations still record UNAVAILABLE. Code-injected test transports always carry CONTROLLED_TEST provenance. The factory is a transport building block for the future verified runtime bridge, not a replacement for the required eve integration.

With NVIDIA_API_KEY and an explicitly chosen NVIDIA_MODEL_ID securely configured in an isolated model process (no Stripe key), run:

~~~powershell
npm.cmd run nvidia:investigation:probe
# Node 24 fallback:
npx.cmd --yes --package=node@24.22.1 node scripts/nvidia-investigation-probe.ts
~~~

The new probe exercises two schema-valid turns: a read_request_receipt lookup and a FINAL unresolved-evidence response. Its corpus is explicitly SYNTHETIC_COMPATIBILITY, with no real customer, retrieval reference, business approval or provider operation. It records latency and reported usage in gitignored .local/nvidia-investigation-access.json. A failed run reports only accepted partial usage with usageComplete=false; additional cost may be unknown. An unconfigured run reports NOT_TESTED and exits 1 without an inference request. A successful live result would verify this structured exchange only; it would not verify eve/native tool calling, substantive investigation, Zetaris, Meterless, or execution eligibility. A saved probe record never activates the backend.

Official references: [NVIDIA hosted LLM endpoint](https://docs.api.nvidia.com/nim/reference/llm-apis), [NVIDIA hosted structured-output parameter example](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer), and [eve direct-provider configuration](https://eve.dev/docs/agent-config). NVIDIA structured-output support varies by model; the exact selected model must pass this schema before adoption. No model or dependency was selected without access evidence.

Controlled verification covers fixed routing/schema, injected data, malformed authority/scope, model substitution, missing usage, refusals/truncation, HTTP errors/no retries, bounded streams, cancellation, honest partial usage, persisted citations and read-only replay, and failure-to-review behavior. No genuine inference, measured provider cost or evaluation improvement is claimed.

Transport milestone verification: all three TypeScript projects and 97 Node tests pass on Node 24.22.1 (10 new transport/probe tests). The unconfigured compatibility probe returned NOT_TESTED with NVIDIA_API_KEY/NVIDIA_MODEL_ID missing; no remote inference request or cost measurement was made.

Local orchestration/memory/evaluation milestone: scoped working memory (migration 008) captures unresolved issues and re-fetches recalled evidence within existing budgets. Automatic review jobs (migration 009) persist confirmation-driven processing and preserve raw proposals without substitution. A one-shot review option pre-fetches stored evidence and permits one model turn for controlled baseline comparison; all variants still use rules-v3. See MEMORY.md and MANUAL_SETUP.md. The ordinary API still has no verified model installed and reports UNAVAILABLE.

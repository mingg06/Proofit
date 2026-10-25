# Access and compatibility record

24 October Zetaris preparation: official REST/SQL guides inspected; the linked public Postman repository returns 404 and instance documentation/credentials are unavailable. The code-injected normalized query boundary, two-source scoped query builder, atomic evidence/provenance ingestion and replay are tested with CONTROLLED_TEST clients. No HTTP paths or response envelopes were assumed, no new SDK was selected, and real access remains NOT_TESTED. See [Zetaris](ZETARIS.md).

Checked 23 October 2026. No remote service access or model inference is claimed.

| Item | Observed result |
| --- | --- |
| Host Node | v22.13.0; below eve requirement |
| Temporary runtime | Node v24.22.1 obtained through npx.cmd; contract tests/typecheck executed successfully |
| npm | 11.19.1 |
| Dependencies | zod 4.6.7; TypeScript 5.9.3; @types/node 24.10.1; exact versions in lockfile |
| NVIDIA | Required environment variables absent; model ID/access/schema-valid inference not tested |
| Zetaris | Required variables absent; structured and separate policy source queries not tested |
| Meterless | Required variables absent; write/read/restart persistence not tested |
| Stripe | Test credential absent; read-only test access not tested; provider writes disabled/unimplemented |
| Backend | Local SQLite migration, synthetic seed, password/session authentication and scoped receipts/approvals implemented and tested; /health startup smoke check passed |
| eve | Not installed; Node prerequisite verified in official docs, NVIDIA adapter compatibility unverified |

Backend setup uses DATABASE_PATH/APP_ORIGIN/PORT optional local overrides; no session signing secret or database-server URL is needed. See BACKEND.md. Sponsor/provider variables remain absent.

Preflight reports configuration presence only and exits 1 for missing configuration. It never prints credential values and is not a service-access test. Even all PRESENT entries would leave liveAccess=NOT_TESTED.

Official references checked before dependency selection:

- [eve prerequisites](https://eve.dev/docs/getting-started): Node 24+, model credential required. No proof yet that the intended NVIDIA route meets structured-output/tool needs.
- [Node TypeScript support](https://nodejs.org/api/typescript.html): erasable syntax can execute directly; type stripping does not typecheck. Separate tsc verification is required.
- [Zod parsing](https://zod.dev/basics): parse/safeParse boundaries with inferred TypeScript types.
- [TypeScript erasable syntax](https://www.typescriptlang.org/tsconfig/erasableSyntaxOnly.html): configuration keeps runtime syntax compatible with native stripping.

No credentials were printed or committed. Local random test-account credentials are stored in the gitignored .local/test-accounts.json file. Configure each service securely in its own process. The template lists variable names, not an instruction to give every process every secret.

Next access evidence required: exact NVIDIA model and measured schema-valid output; genuine Zetaris references from both sources; Meterless write/read then restart/read; read-only Stripe account test-mode verification. Keep Phase 0 live-access gate unfinished until recorded. Do not install an assumed eve/provider combination or enable provider writes to bypass this gate.

Persistence verification: Node v24.22.1 DatabaseSync worked in memory and on disk with migrations, prepared statements and foreign-key transactions. The current official Node SQLite docs (https://nodejs.org/api/sqlite.html) describe a newer runtime; this build uses the installed Node 24 API, tested directly. Preserve the selected runtime pending deployment compatibility review.

24 October: stripe 23.0.1 installed and typechecked on Node 24.22.1; pinned API 2026-09-30.endive matches installed SDK. Narrow cancellation adapter tested with CONTROLLED_TEST transport. Read-only stripe:probe returned NOT_TESTED/missing STRIPE_TEST_SECRET_KEY, making no live calls. See CANCELLATION.md.

24 October investigation access check: eve public configuration docs and npm eve 0.83.0 metadata inspected; Node 24 is compatible with its stated prerequisite. eve is not installed and NVIDIA/eve structured-output/tool compatibility is NOT_TESTED. The standalone nvidia:probe reports missing NVIDIA_API_KEY/NVIDIA_MODEL_ID, making no network call. Bounded coordinator tests use explicitly CONTROLLED_TEST models; token values in those fixtures are not NVIDIA usage. See INVESTIGATION.md.

24 October NVIDIA transport preparation: fixed-endpoint bounded model adapter and a two-turn structured lookup compatibility probe implemented with CONTROLLED_TEST transport tests. Current process preflight still reports all required sponsor/provider configuration missing; user confirmed credentials are not configured. The new probe reports NOT_TESTED without making an inference request. No eve dependency was added, no runtime combination was assumed verified, and the default API/provider write boundary is unchanged. See INVESTIGATION.md.

Latest local milestone: controlled refund execution/recovery, automatic review orchestration, scoped exports, local H-MEM working-memory subset, review-only comparison and deployment configuration are implemented. Node 24 typechecks/build, 131 Node tests and 8 Chromium workflows pass. Compose syntax validates; Docker engine startup/image verification remains NOT_TESTED. Preflight no longer demands a hosted Meterless token for the local subset. Genuine NVIDIA/eve, Zetaris, Stripe and acceptance/release gates remain manual and unfinished; see MANUAL_SETUP.md.

Development preparation: authenticated runtime/executor assembly helpers are tested with controlled ports; no new provider/runtime dependency was chosen and no service access is asserted. All 12 development dossiers are authored, with 36 isolated review trials and exact named-check assertions; their scripted token counters are not NVIDIA usage. TypeScript and 148 Node tests pass. Operator setup supplies accounts/docs/access; the agent will finish the instance-specific transport/bridge once available. See DEVELOPMENT_CASES.md and RUNTIME_ASSEMBLY.md.

# Access and compatibility record

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

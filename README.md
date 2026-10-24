# PROOFIT

PROOFIT investigates proposed subscription actions and enforces exact authority before execution. [PROOFIT_FINAL_PLAN.md](PROOFIT_FINAL_PLAN.md) defines the product; [BUILD_PHASES.md](BUILD_PHASES.md) defines the gates.

The initial persistent backend now supports real local password/session authentication, tenant/customer isolation, versioned requests, raw proposals, exact-action confirmations, fixed-role staff approvals and atomic audits. Shared schemas, four synthetic development examples and a draft evaluation manifest are also implemented. Resources/policy are visibly synthetic; no provider actions run. The deterministic rules-only gateway and authenticated isolated reservation service are now implemented. React, eve investigation, live integrations, provider submission and outcome reconciliation remain pending. No phase is declared complete.

## Run locally

Use Node 24.22.1 and npm:

~~~powershell
npm.cmd ci --ignore-scripts
npm.cmd run migrate
npm.cmd run seed
npm.cmd run start
~~~

The API listens at http://127.0.0.1:3000; GET /health reports its stage. It is an API only, with no browser console yet. Migration and seed are already applied in this workspace; rerunning seed refuses to overwrite accounts. Private random test passwords are in the gitignored .local/test-accounts.json file.

The host still defaults to Node 22.13.0. The verified Node 24 fallback is:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node scripts/migrate.ts
npx.cmd --yes --package=node@24.22.1 node scripts/seed.ts
npx.cmd --yes --package=node@24.22.1 node apps/backend/main.ts
~~~

See [backend setup and API examples](docs/BACKEND.md) for login, confirmation, approval, configuration and limits. Backend startup rejects Stripe execution credentials.

## Verify

With Node 24 active:

~~~powershell
npm.cmd run check
npm.cmd run scenarios
npm.cmd run preflight
~~~

Verified fallback commands on this host:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node node_modules/typescript/bin/tsc --noEmit
npx.cmd --yes --package=node@24.22.1 node --test tests/*.test.ts
npx.cmd --yes --package=node@24.22.1 node scripts/scenarios.ts
npx.cmd --yes --package=node@24.22.1 node scripts/preflight.ts
~~~

Preflight currently exits 1 because sponsor/provider configuration is missing. It reports names and presence only, makes no remote calls and does not prove live access. .env.example contains names only; scripts do not load .env files automatically. npm run dev watches the backend. No application bundle/build or React development command exists yet.

## Source boundaries

- apps/backend: local HTTP API, persistent authentication, rules-only gateway, authority/operation ledger, SQLite store/configuration and synthetic seed.
- apps/executor: isolated service-authenticated reservation boundary; provider writes disabled.
- migrations: versioned relational schema; migration integrity checked on startup.
- packages/contracts: shared schemas, canonical binding and operation identity/transition definitions.
- fixtures: synthetic action examples; no live inference or provider records.
- scripts: migrate, seed, fixture inspection and configuration presence checks.
- tests: contract boundaries, HTTP authority/isolation, transaction/restart behavior and dataset split checks.
- evaluation/manifest.json: 12 development and 36 held-out authoring slots, not a frozen dataset.
- evaluation/reviewer-only: provisional expectations; exclude from every model/tool-visible source.

See [contract decisions](docs/CONTRACTS.md) and [integration access record](docs/INTEGRATION_ACCESS.md). Next on the critical path: approved live retrieval/provider-state access and the isolated test-provider submission/reconciliation path; live integrations retain their access gates.

Deterministic validation is now implemented: see [gateway behavior and provenance](docs/GATEWAY.md). Staff can POST /api/validations with only proposalId and retrieve the recorded decision. Local sources are synthetic and there is no live reader, so the running API holds them for review. Operation reservation is implemented behind the authenticated isolated service; provider execution remains disabled.

The second gateway milestone implements persistent resource leases, atomic operation reservation/receipt+approval consumption and an isolated service-authenticated reservation API. See [operation reservation](docs/OPERATIONS.md). Provider submission/reconciliation remain unimplemented.

A pinned Stripe cancellation adapter and read-only access probe are implemented but live submission remains unwired. See [cancellation integration](docs/CANCELLATION.md).

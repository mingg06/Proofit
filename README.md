# PROOFIT

PROOFIT investigates proposed subscription actions and enforces exact authority before execution. [PROOFIT_FINAL_PLAN.md](PROOFIT_FINAL_PLAN.md) defines the product; [BUILD_PHASES.md](BUILD_PHASES.md) defines the gates.

The React console now provides request/confirmation, investigation/review and execution/replay views backed by persistent authenticated APIs. Implemented backend features include exact-action receipts/approvals, deterministic rules, atomic reservations, controlled cancellation/recovery and bounded investigation records. Controlled refund execution/recovery, scoped exports, persistent review jobs, local working memory and all 12 runnable development cases are now implemented. Real NVIDIA/eve/Zetaris integration, provider runtime activation, public deployment and independent release evaluation remain unfinished. No phase is declared complete; provider writes remain disabled.

## Run locally

Use Node 24.22.1 and npm:

~~~powershell
npm.cmd ci --ignore-scripts
npm.cmd run migrate
# Run seed only for a new empty database:
npm.cmd run seed
npm.cmd run build
npm.cmd run start
~~~

Open http://127.0.0.1:3000. Migration/seed were already applied in this workspace; seed refuses to overwrite accounts. Random local test credentials are in gitignored .local/test-accounts.json.

The host defaults to Node 22.13.0. Verified fallback:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node node_modules/vite/bin/vite.js build --config apps/console/vite.config.ts
npx.cmd --yes --package=node@24.22.1 node apps/backend/main.ts
~~~

The current preview uses http://127.0.0.1:3002 because port 3000 already had a service. See [frontend setup](docs/FRONTEND.md) for ports, HMR development and browser verification, and [backend API setup](docs/BACKEND.md) for authority contracts.

## Verify

~~~powershell
npm.cmd run check
npm.cmd run build
npm.cmd run browser:install
npm.cmd run test:browser
~~~

Verified: server/browser/e2e TypeScript, 128 Node tests, 8 Chromium workflows and accessibility checks on the tested light/dark views. Browser fixtures are visibly CONTROLLED_TEST; they do not make provider calls.

Node 24 host fallbacks use the same node invocation above with node_modules/typescript/bin/tsc --noEmit, --test tests/*.test.ts, or scripts/browser-tests.ts. Existing migrate, seed, scenarios, preflight, stripe:probe and nvidia:probe scripts remain available. Preflight/probes report missing integration configuration honestly and do not establish live access from variable presence. Scripts do not load .env files automatically.

## Source boundaries

- apps/console: React/TypeScript views, typed same-origin client, design tokens and Vite configuration.
- apps/backend: persistent authentication, scoped APIs, deterministic gateway, authority/operation ledger and safe static delivery.
- apps/executor: isolated authenticated boundary and controlled cancellation submission/observation/recovery; default live writes disabled.
- apps/investigator: bounded coordinator, read-only scoped tools, recorded runs/citations and NVIDIA access probe; eve/live integration pending.
- migrations and packages/contracts: versioned relational schema and shared runtime schemas.
- tests and e2e: negative authority/persistence checks and real browser flows using separate local test data.
- evaluation: draft development/held-out authoring manifest; reviewer-only labels stay outside agent-visible tools.

See [gateway](docs/GATEWAY.md), [operations](docs/OPERATIONS.md), [cancellation](docs/CANCELLATION.md), [investigation](docs/INVESTIGATION.md) and [integration access](docs/INTEGRATION_ACCESS.md) for verified work and unfinished gates.

Working local features include the shared cancellation/refund coordinator, authenticated executor client, exact-amount authority checks, observation-derived statuses, customer/staff snapshot exports and replay. All provider submission routes stay disabled in default startup. Runtime assembly helpers are code-only libraries; no verified model/provider runtime is installed.

Run npm.cmd run test:development with Node 24 (fallback: npx.cmd --yes --package=node@24.22.1 node scripts/development-cases.ts). It runs 12 in-memory development cases through 36 CONTROLLED_TEST reviews and saves an ignored report. No held-out labels or provider submissions are used. See docs/DEVELOPMENT_CASES.md, docs/REFUNDS.md, docs/EXPORTS.md and docs/MEMORY.md.

The private-network BIND_HOST override requires an explicit HTTPS APP_ORIGIN; local default remains loopback. PROOFIT_AUTOMATIC_REVIEW sets queue availability only and never grants execution authority. Deployment and real integration activation remain gated.

# PROOFIT

PROOFIT investigates proposed subscription actions and enforces exact authority before execution. It is continuing as an independent product, without a hackathon submission. [Standalone product direction](docs/STANDALONE.md) defines the current simplified stack and delivery order; it supersedes sponsor requirements in the original [plan](PROOFIT_FINAL_PLAN.md) and [phases](BUILD_PHASES.md).

The React console provides request/confirmation/progress, investigation/review, outcome/replay and scoped JSON exports. The standalone review runtime connects direct NVIDIA inference and approved local SQLite evidence to persistent automatic review jobs. No sponsor software is required. A real NVIDIA review over synthetic local records passes with verified citations and measured usage. Cancellation/refund execution and recovery are tested through controlled providers; genuine Stripe runs and production deployment remain unverified. The standalone profile is review-only with provider reads/writes disabled. The original API-only startup still reports unavailable automation.

Start with [the standalone direction and current limits](docs/STANDALONE.md), then the local commands below. The [manual integration checklist](docs/MANUAL_SETUP.md) describes the earlier optional integration path. See [refund execution](docs/REFUNDS.md), [exports](docs/EXPORTS.md), [working memory](docs/MEMORY.md) and [deployment](docs/DEPLOYMENT.md).

## Run locally

Use Node 24.22.1 and npm:

~~~powershell
npm.cmd ci --ignore-scripts
npm.cmd run migrate
# Run seed only for a new empty database:
npm.cmd run seed
npm.cmd run build
# Configure NVIDIA_API_KEY/NVIDIA_MODEL_ID in private .env.nvidia, then:
npm.cmd run start:standalone
~~~

Open http://127.0.0.1:3000. Migration/seed were already applied in this workspace; seed refuses to overwrite accounts. Random local test credentials are in gitignored .local/test-accounts.json.

The host defaults to Node 22.13.0. Verified fallback:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node node_modules/vite/bin/vite.js build --config apps/console/vite.config.ts
npx.cmd --yes --package=node@24.22.1 node --env-file=.env.nvidia apps/standalone/main.ts
~~~

The standalone review preview runs at http://127.0.0.1:3003. The earlier API-only preview on port 3002 and the existing port-3000 service are left intact. Set PORT and matching APP_ORIGIN for a separate instance. See [frontend setup](docs/FRONTEND.md) for ports, HMR development and browser verification, and [backend API setup](docs/BACKEND.md) for authority contracts.

## Verify

~~~powershell
npm.cmd run check
npm.cmd run build
npm.cmd run browser:install
npm.cmd run test:browser
~~~

Verified for the standalone review milestone: all four TypeScript projects, production build, 162 Node tests and 10 Chromium workflows including progress polling, navigation cancellation and tested light/dark accessibility. Those browser fixtures are CONTROLLED_TEST and do not make provider calls. A separate real-browser/direct-NVIDIA flow also passes on synthetic local records with three cited findings, recorded usage and zero operations; see docs/STANDALONE.md.

Node 24 fallbacks use the same invocation above with node_modules/typescript/bin/tsc --noEmit, --test tests/*.test.ts apps/eve/tests/*.test.ts, or scripts/browser-tests.ts. Preflight now checks standalone configuration; missing optional sponsor/executor settings do not block it. Scripts do not load .env files automatically, except explicit --env-file options in start:standalone, standalone:probe and eve scripts.

`npm.cmd run standalone:probe` checks real NVIDIA calls on isolated synthetic local records, records usage in gitignored `.local/standalone-probe.json`, and submits no provider writes. See [standalone setup and measured evidence](docs/STANDALONE.md).

## Source boundaries

- apps/console: React/TypeScript views, typed same-origin client, design tokens and Vite configuration.
- apps/backend: persistent authentication, scoped APIs, deterministic gateway, authority/operation ledger and safe static delivery.
- apps/executor: isolated authenticated boundary and shared cancellation/refund submission/observation/recovery; default live writes disabled.
- apps/investigator: bounded coordinator, read-only scoped tools, recorded runs/citations, NVIDIA transport and working-memory subset. agent/ and apps/eve provide the isolated eve bridge; full retrieval/runtime activation remains pending.
- migrations and packages/contracts: versioned relational schema and shared runtime schemas.
- tests and e2e: negative authority/persistence checks and real browser flows using separate local test data.
- evaluation: draft development/held-out authoring manifest; reviewer-only labels stay outside agent-visible tools.

See [gateway](docs/GATEWAY.md), [operations](docs/OPERATIONS.md), [cancellation](docs/CANCELLATION.md), [investigation](docs/INVESTIGATION.md) and [integration access](docs/INTEGRATION_ACCESS.md) for verified work and unfinished gates.

NVIDIA/eve compatibility: the raw NVIDIA probe and the isolated eve two-turn probe pass for nvidia/nemotron-3.5-bolt-e4b. Run npm.cmd run dev:eve and npm.cmd run eve:probe on Node 24 with gitignored .env.nvidia configured. These checks use synthetic context, record measured usage, and enable neither backend automation nor provider writes. See [eve commands and remaining gates](docs/EVE.md).

Zetaris retrieval preparation: the investigator can accept a code-injected two-source query client with scoped SELECT queries, approved-version checks, atomic evidence/query persistence and stored replay. Migration 007 adds retrieval provenance. Controlled tests are in tests/zetaris.test.ts; use the Node 24 fallback above. A real HTTP transport remains blocked on instance API documentation and credentials; startup is unchanged. See [Zetaris boundaries and setup requirements](docs/ZETARIS.md).

Automatic worker: npm.cmd run start:worker requires the operator-installed RuntimeFactory module and current staff service session described in docs/MANUAL_SETUP.md. It does not turn a raw NVIDIA adapter or configuration flag into verified eve/integration access.

Review comparison: apps/evaluation/comparison.ts measures rules-only, one-shot and full review through the same controls/source fingerprints. It is review-only and does not establish provider execution acceptance or agent benefit.

Development corpus: all 12 dossiers are authored in fixtures/development-cases.ts. npm.cmd run test:development runs 36 isolated CONTROLLED_TEST reviews (rules-only, one-shot and full), writes .local/development-case-results.json, and checks the intended named control as well as the decision. No held-out labels, genuine inference or provider writes are used. See docs/DEVELOPMENT_CASES.md and docs/RUNTIME_ASSEMBLY.md.

Commit policy: verified major steps are committed by owner instruction. 58d69f3 checkpoints the earlier optional integration/deployment drafts and standalone product decision; later commits implement the standalone path. Private configuration, credentials, databases and probe results stay gitignored.

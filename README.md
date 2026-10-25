# PROOFIT

PROOFIT investigates proposed subscription actions and enforces exact authority before execution. It is continuing as an independent product, without a hackathon submission. [Standalone product direction](docs/STANDALONE.md) defines the current simplified stack and delivery order; it supersedes sponsor requirements in the original [plan](PROOFIT_FINAL_PLAN.md) and [phases](BUILD_PHASES.md).

The React console provides request/confirmation/progress, investigation/review, outcome/replay and scoped JSON exports. The backend implements exact-action receipts/approvals, deterministic rules, atomic reservations, durable automatic review jobs, controlled cancellation/refund execution and recovery, bounded investigations, scoped retrieval preparation and durable working-memory capture/recall. The isolated eve/NVIDIA bridge now passes a real inference compatibility check on synthetic context. The instance-specific Zetaris transport, genuine Stripe runs, production runtime installation/deployment and independent frozen evaluation still require access and verification. Default startup reports unavailable automation and keeps provider writes disabled. No phase is declared complete.

Start with [the standalone direction and current limits](docs/STANDALONE.md), then the local commands below. The [manual integration checklist](docs/MANUAL_SETUP.md) describes the earlier optional integration path. See [refund execution](docs/REFUNDS.md), [exports](docs/EXPORTS.md), [working memory](docs/MEMORY.md) and [deployment](docs/DEPLOYMENT.md).

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

Verified: server/browser/e2e TypeScript, 148 Node tests, 8 Chromium workflows and accessibility checks on the tested light/dark views. Browser fixtures are visibly CONTROLLED_TEST; they do not make provider calls.

Node 24 host fallbacks use the same node invocation above with node_modules/typescript/bin/tsc --noEmit, --test tests/*.test.ts, or scripts/browser-tests.ts. Existing migrate, seed, scenarios, preflight, stripe:probe and nvidia:probe scripts remain available. Preflight/probes report missing integration configuration honestly and do not establish live access from variable presence. Scripts do not load .env files automatically.

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

Commit boundary: 9dcfb2b contains the working local features and development corpus, independently verified with 128 Node tests and 8 browser workflows. The additional NVIDIA/Zetaris integration, worker activation and deployment drafts remain uncommitted; the working-tree 148-test count includes their preparation tests.

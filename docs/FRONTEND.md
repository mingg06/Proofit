# React console

Implemented 24 October 2026 against the authenticated backend. Three views are available: request/confirmation, investigation/review, and execution/replay. The console never establishes trusted roles, approval state, execution decisions or execution payloads. Provider execution remains disabled and no phase is declared complete.

## Run the built console

Use Node 24.22.1. React 19.3.1, Vite 8.3.5 and plugin-react 6.1.2 were verified against current official docs/npm metadata, pinned in package-lock.json, typechecked and built.

~~~powershell
npm.cmd ci --ignore-scripts
npm.cmd run migrate
# Only for a new empty database; preserves existing accounts:
npm.cmd run seed
npm.cmd run build
npm.cmd run start
~~~

Open http://127.0.0.1:3000. The backend serves only the built index and whitelisted assets from apps/console/dist. If the build is absent, the index route returns a clear 503 setup message. The API remains authenticated. Source files, local credentials/databases and source maps are not exposed. Hashed assets are served with content types and a restrictive same-origin content security policy. Build output stays gitignored.

This host defaults to Node 22; the verified fallback is:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node node_modules/vite/bin/vite.js build --config apps/console/vite.config.ts
npx.cmd --yes --package=node@24.22.1 node apps/backend/main.ts
~~~

If port 3000 is already in use, set matching PORT and APP_ORIGIN in the backend process. The current preview was started at http://127.0.0.1:3002 without stopping the existing port-3000 service. Random local test credentials remain in gitignored .local/test-accounts.json; the console does not expose or bundle them. Sessions use the existing HttpOnly cookie and CSRF boundary. No credentials or trusted roles are written to localStorage, sessionStorage or URLs; the session cookie remains HttpOnly.

## Development with HMR

Start the API on port 3000 with APP_ORIGIN set to the browser origin, then Vite on port 5173. Vite proxies /api and /health to loopback port 3000.

~~~powershell
# Terminal 1, with Node 24 active
$env:APP_ORIGIN = 'http://127.0.0.1:5173'
npm.cmd run dev
# Terminal 2
npm.cmd run dev:console
~~~

Do not use the Vite preview server as a replacement for the authenticated production backend. The built console uses same-origin API paths. Vite does not load server .env files; its envDir is disabled. Server-only code/credential names were checked absent from the browser bundle.

## Views and authority

- Request/confirmation: a customer creates a request, chooses an ownership-linked resource, reviews the exact supported action in a dialog, then confirms it. Amount parsing uses integer minor units, including maximum-safe-integer boundaries; no currency rounding. Cancellation explicitly preserves access until the paid period ends. Revisions create a new request version and require fresh authority. Staff see the stored confirmation but cannot confirm for a customer.
- Investigation/review: staff compare the latest manual test proposal against confirmed authority, run backend rules, inspect named checks and start a bounded investigation. Manual proposals are explicitly untrusted and are not presented as AI-generated. Refund approvers inspect the stored exact amount/target before submitting only a receipt ID. Support staff cannot approve. Missing model access produces the real UNAVAILABLE run, not an invented trace.
- Execution/replay: scoped operation references load recorded status from the backend. Stored success flags do not become verified-effect claims without a matching observation. Controlled test records are labelled; pending and unknown outcomes remain explicit. Reading/reloading saved runs and audit records does not call a model/provider. The submit control is disabled and there is no browser executor credential or public execute route. Full evidence exports and live integration completion remain pending.

GET /api/resources returns only customer-owned resources or staff tenant resources. Case read DTOs add latestVersion, operation references and staff-only stored validations. Customer responses still omit proposals, approvals, investigations and staff audits. Browser API generation guards reject late results after account changes; abortable reads prevent stale selections from replacing the active case.

## Verification

~~~powershell
npm.cmd run check
npm.cmd run build
npm.cmd run browser:install
npm.cmd run test:browser
~~~

Node 24 fallback for browser verification: npx.cmd --yes --package=node@24.22.1 node scripts/browser-tests.ts (add install to install Chromium). The wrapper keeps browser binaries and results under .local.

Verified: server/browser/e2e TypeScript; 87 Node tests; 8 real Chromium workflows; light/dark accessibility scans; mobile/tablet/desktop overflow checks at 375/768/1280 widths; Escape/focus return and skip-link navigation; stored-text escaping; exact approval payload; customer isolation after sign-out; and replay without new writes. Visual renders were inspected for desktop review, mobile confirmation, replay and dark mode.

The browser server uses a separate random database and private account file. Three recorded-outcome fixtures pass through the real gateway/ledger/cancellation coordinator with an explicitly CONTROLLED_TEST provider and persist their observations; they never call Stripe or pretend to be genuine provider runs. These fixtures exist only in e2e setup, not the ordinary seed. Automated traces/videos and failure screenshots are disabled to avoid credential capture. Saved inspection screenshots are taken only after login and contain synthetic records.

Accessibility automation is evidence for the tested screens, not a complete accessibility certification. Full-screen-reader and cross-browser testing remain future verification. React/Node authority rules, external integration access and release/evaluation gates remain the source of truth.

Official compatibility references: https://react.dev/learn/creating-a-react-app and https://vite.dev/guide/ .

Visual redesign (24 October 2026): horizontal graphite navigation, blue actions, compact request index and case dossier, sans-serif headings, and separate semantic success colours. Build/typechecks and all eight Chromium workflows passed again, including tested light/dark accessibility, responsive layout, keyboard focus and recorded replay. See brand.md for current design direction.

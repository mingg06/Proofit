# Standalone product direction

On 25 October 2026, the owner chose to continue PROOFIT as a usable independent project and not submit it to the hackathon. Hackathon eligibility, sponsor integrations, award demonstrations and event deadlines are no longer requirements. This decision supersedes conflicting sponsor/runtime requirements in the original plan, build phases and older setup guides.

## Simplified target

Keep the React console, authenticated TypeScript backend, SQLite persistence, bounded investigator and isolated executor. Use the existing direct NVIDIA transport for model calls; Nightshift, Meterless Runtime and eve are optional. A model framework is not required to preserve the investigator's tool/turn/time budgets, strict output validation and recorded usage.

Use approved, versioned application records and policy/case documents as the initial evidence source. Zetaris is optional. Local evidence still needs authenticated tenant/customer/request scope, source approval, resolvable passage references and honest provenance. Synthetic fixtures remain synthetic; local storage does not turn them into real customer records or provider observations.

Keep the existing scoped SQLite memory as a product feature where useful. No Meterless engine conformance or hosted service is required. Memory remains untrusted context, never approval or execution authority.

Keep the two supported actions, MYR integer minor units and Stripe test mode/sandbox for the initial usable version. Moving real money remains a separate product decision and implementation task.

## Delivery order

1. Provide a concrete local runtime that connects direct NVIDIA proposal/investigation calls, scoped approved local evidence and authenticated review jobs. Remove sponsor-only setup blockers from the standalone path. Verify a complete console confirmation-to-review flow and recorded replay.
2. Connect authenticated, read-only Stripe test state and trusted resource mappings. Missing access or unknown state must still hold affected actions. A review-only installation is useful but must say that execution is unavailable.
3. Enable the isolated test executor only after exact-authority, duplicate/concurrency, timeout/restart and provider-observation checks pass for cancellation and refund. Observe actual test-provider results before claiming execution works.
4. Package a straightforward local setup, then verify deployment, backup/restart behavior and usability. Run meaningful product acceptance cases; the hackathon's fixed 48-case evaluation and sponsor evidence packet are optional research work.

## Current boundary

The standalone review runtime is implemented in `apps/standalone`: one loopback process serves the console/API and processes persistent review jobs with direct NVIDIA calls. `LocalEvidence` snapshots the scoped stored request and existing approved policy passage atomically, preserves unresolved/conflicting material, and records local `sqlite-read:` references. No sponsor software is required. Seeded data keeps FIXTURE provenance and cannot become execution-eligible through this path.

The request and applicable policy are preloaded through two budgeted tools before the first investigator model turn. Further investigation retains the 10-call/4-turn/45-second limits. Automatic scoped memory recall is disabled in this first local runtime while per-run evidence IDs and recall semantics are refined; prior investigations, evidence and replay remain persistent. The optional memory implementation is retained.

Provider reads and submission are absent in the standalone review runtime. It produces cited review packets and backend holds, not simulated successful cancellations/refunds. The original `npm start` remains API-only. No production-readiness or test-provider execution claim is made.

## Run the standalone review application

Use Node 24.22.1. On a new checkout, install with `npm.cmd ci --ignore-scripts`, run `npm.cmd run migrate`, run `npm.cmd run seed` only on an empty database, then `npm.cmd run build`. Existing databases/accounts are preserved; do not reseed this workspace.

Keep `NVIDIA_API_KEY` and `NVIDIA_MODEL_ID` in gitignored `.env.nvidia`. Do not put Stripe keys in this process. The local runtime authenticates the synthetic SUPPORT account from `.local/test-accounts.json`; alternatively configure `PROOFIT_SUPPORT_EMAIL` and `PROOFIT_SUPPORT_PASSWORD` for a dedicated existing SUPPORT account. The seed shortcut is for local development, not production provisioning.

```powershell
npm.cmd run start:standalone
# Optional real-inference smoke check on isolated synthetic records:
npm.cmd run standalone:probe
```

With the older host Node, use the verified Node 24 executable or this fallback:

```powershell
npx.cmd --yes --package=node@24.22.1 node --env-file=.env.nvidia apps/standalone/main.ts
npx.cmd --yes --package=node@24.22.1 node --env-file=.env.nvidia scripts/standalone-probe.ts
npx.cmd --yes --package=node@24.22.1 node --env-file=.env.nvidia scripts/preflight.ts
```

Default URL: `http://127.0.0.1:3000`. The verified workspace preview runs on `http://127.0.0.1:3003`, with PORT=3003 and matching APP_ORIGIN, leaving existing services intact. Use a customer account from the private credential file to create and confirm a request, then support to inspect investigation/review and recorded replay. Queued/investigating cases refresh automatically every 1.5 seconds while visible, without clearing the current form. Polls do not overlap, stop at terminal review states, pause reads in hidden tabs, and abort when navigating or signing out. Refunds retain exact-amount approval requirements; provider state is unavailable in this review-only profile. Requests and policy evidence go to NVIDIA; use synthetic data until the installation's data handling is approved.

Preflight checks the standalone profile: Node, database-file presence, NVIDIA settings and support-account configuration. Missing Zetaris/executor settings are informational. Configuration presence does not prove authenticated remote access.

## Verification record — 25 October 2026

Real `nvidia/nemotron-3.5-bolt-e4b` standalone probe on synthetic local records: PASS, COMPLETE investigation, 3 cited findings, both evidence purposes read, 2 tools and 1 investigator turn, 9,016 ms total. Proposal usage: 764 input/29 output tokens; investigator usage: 1,908 input/293 output tokens. The job remained REVIEW_REQUIRED with fixture/provider holds and created zero operations. Cost is unreported. An earlier failed run was held for an unretrieved citation (2,740 input/248 output investigator tokens plus 750/29 proposer tokens); it did not execute anything. Current probe details are gitignored in `.local/standalone-probe.json`.

Preserve exact customer confirmation, required refund approval, deterministic eligibility, credential isolation, atomic operation identity/authority consumption, reconciliation, observation-backed status and replay without execution. The owner now requests commits for each verified major step. Existing optional integration drafts were checkpointed in 58d69f3; private data remains gitignored.

Local regression for this milestone: all four TypeScript projects, production build, 161 Node tests and 8 Chromium workflows pass on Node 24.22.1. The new tests cover source revocation, rollback, pinned-passage changes, prior holds, staff/tenant scope, stored replay and trusted API runtime installation. Loopback HTTP/browser checks require execution outside the network-restricted sandbox.

Follow-up usability/startup verification: 162 Node tests and 10 Chromium workflows pass, with all four typechecks and the production build. Seed account metadata is reduced to email/password before login; roles and tenant still come from authentication. Startup errors identify only the failed stage and withhold raw errors. Browser API fixture sessions are reused so the expanded suite respects the unchanged production login limiter; responsive checks wait for layout to settle.

Actual browser/direct-NVIDIA check on the port-3003 preview: customer sign-in, new synthetic request, exact confirmation, automatic review, support sign-in, review and recorded replay PASS in 10,472 ms. The COMPLETE investigation records 3 findings, 1 model turn, 2 tools and 1,841 input/291 output investigator tokens. The job requires review and creates zero operations. Model: `nvidia/nemotron-3.5-bolt-e4b`; cost unreported. Details are private under `.local/standalone-browser-check.json`. This is real inference on synthetic records, not a real customer/provider execution result.

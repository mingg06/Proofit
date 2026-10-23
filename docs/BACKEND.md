# Persistent foundation API

This local Phase 1 slice stores authenticated accounts/sessions, tenant/customer mappings, request versions, raw proposals, exact-action confirmations, staff approvals, synthetic policy/source metadata and audit events in SQLite. It has no investigator, deterministic execution gateway, provider writes or React UI. No phase exit gate is declared complete.

## Setup and commands

Use Node 24.22.1, the runtime tested here. Node 24 built-in DatabaseSync, prepared statements, foreign keys, WAL and BEGIN IMMEDIATE transactions provide local relational persistence; there is no database server dependency. The Node 24 SQLite API remains experimental, so preserve the pinned runtime and review it before deployment. The API binds only to 127.0.0.1.

~~~powershell
npm.cmd ci --ignore-scripts
npm.cmd run migrate
npm.cmd run seed
npm.cmd run start
~~~

On this host Node 22 is still the default. The tested fallback is:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node scripts/migrate.ts
npx.cmd --yes --package=node@24.22.1 node scripts/seed.ts
npx.cmd --yes --package=node@24.22.1 node apps/backend/main.ts
~~~

Migration and seed have already been run in this workspace. The seed refuses a nonempty database and never resets existing accounts. It creates six isolated synthetic accounts: two customers in tenant A, support and refund approver in tenant A, plus a customer and approver in another tenant. It seeds ownership-linked resources, a fixture policy and four unconfirmed requests. The seed does not manufacture customer confirmations or staff approvals.

Random test passwords are stored only in the gitignored .local/test-accounts.json file. Do not publish that file, the database, cookies or CSRF tokens. The script does not print passwords. Store the local directory with appropriate user filesystem permissions; file mode is advisory on Windows. A seed failure preserves existing files rather than overwriting credentials.

Configuration: DATABASE_PATH defaults to .local/proofit.sqlite, PORT to 3000, APP_ORIGIN to http://127.0.0.1:3000 (or the configured port). Blank optional variables use defaults. APP_ORIGIN must be an exact origin and use HTTPS except for loopback development HTTP. This process refuses a nonempty STRIPE_TEST_SECRET_KEY. Environment files are not loaded automatically. Opaque server-side sessions need no SESSION_SECRET; DATABASE_URL is not used.

Startup checks/applies migrations. Applied migration hashes use normalized line endings; changed applied migrations fail instead of being silently rerun. New schema changes require a new migration and migration-runner update.

## HTTP routes

All bodies are JSON and reject unexpected authority fields. All POSTs require an exact Origin header. After login they also require the session cookie and X-CSRF-Token returned at login or GET /api/session. There is no CORS allowance. HTTPS origins issue Secure cookies; local HTTP cookies remain HttpOnly and SameSite=Strict.

| Method/path | Input | Scope |
| --- | --- | --- |
| GET /health | none | Public; reports execution disabled |
| POST /api/login | email, password | Fixed stored accounts; returns CSRF token and cookie |
| POST /api/logout | none | Revokes current session |
| GET /api/session | none | Current stored actor/role and CSRF token |
| GET /api/requests | none | Customer's own rows or staff's tenant; up to 100 versions |
| POST /api/requests | text | Customer creates version 1 |
| POST /api/requests/:id/versions | text, version (current base version) | Same requesting customer; creates next version |
| GET /api/requests/:id?version=1 | version query optional, default 1 | Customer's own or staff's tenant; historical versions are explicit |
| POST /api/confirm | requestId, requestVersion, action | Requesting customer and owned resource only |
| POST /api/proposals | requestId, requestVersion, proposal, conversation | Customer's own or staff's tenant; untrusted proposal can be unsupported |
| POST /api/approvals | receiptId | REFUND_APPROVER in the same tenant; exact stored refund receipt |

Customer case responses omit proposals, approvals and audit events so staff-only conversations never leak. Staff responses include the exact stored receipt/action, proposals and ordered audits. Roles, customer and tenant fields come from a fresh session/database lookup on every operation. Staff cannot confirm on behalf of a customer in this implementation.

To try confirmation from PowerShell, start the API, then run this without printing credential/session variables:

~~~powershell
$proofitAccount = Get-Content .local/test-accounts.json | ConvertFrom-Json | Where-Object email -eq 'customer.a@proofit.test'
$proofitOrigin = 'http://127.0.0.1:3000'
$proofitLogin = Invoke-RestMethod "$proofitOrigin/api/login" -Method Post -ContentType 'application/json' -Headers @{Origin=$proofitOrigin} -Body (@{email=$proofitAccount.email; password=$proofitAccount.password} | ConvertTo-Json) -SessionVariable proofitSession
$proofitHeaders = @{Origin=$proofitOrigin; 'X-CSRF-Token'=$proofitLogin.csrfToken}
$proofitRequest = Invoke-RestMethod "$proofitOrigin/api/requests" -Method Post -ContentType 'application/json' -Headers $proofitHeaders -WebSession $proofitSession -Body (@{text='Cancel my next renewal at the period end.'} | ConvertTo-Json)
$proofitReceipt = Invoke-RestMethod "$proofitOrigin/api/confirm" -Method Post -ContentType 'application/json' -Headers $proofitHeaders -WebSession $proofitSession -Body (@{requestId=$proofitRequest.id; requestVersion=1; action=@{type='CANCEL_AT_PERIOD_END'; subscriptionId='sub_fixture_a'; timing='PERIOD_END'}} | ConvertTo-Json -Depth 5)
~~~

These steps store confirmation only; they do not cancel a subscription. A refund uses REFUND_PAYMENT, paymentId=pi_fixture_b, amountMinor=2000, currency=MYR. A separately logged-in approver must inspect the stored receipt/action, then submit its receiptId. This records approval only; business eligibility and current provider state still require the Phase 2 gateway.

## Authority and persistence behavior

Confirmations expire after 15 minutes; sessions after 8 hours. Approval expiry cannot exceed receipt expiry. Repeated exact confirmation/approval returns the same stored record, without another audit grant. Substitution, changed policy, stale request version, expiry and consumption require fresh authority; they do not silently refresh the old receipt. Old receipt/approval records are retained for audit. The future gateway must reject them after any relevant change.

Every receipt and approval write is atomic with its audit event. Database uniqueness protects one confirmation per request version and one approval per receipt. BEGIN IMMEDIATE serializes these local authority writes. This does not claim operation reservation, provider deduplication, or distributed deployment safety: those are Phase 2 work. SQL parameter binding and composite foreign keys enforce tenant-linked record relationships.

Checks verified: TypeScript; HTTP authentication, Origin/CSRF, tenant/customer isolation, role forgery, target/amount substitution, stale versions, policy changes, expiry/consumption, concurrent confirmation/approval retries, rollback on audit failure, role revocation and session expiry; file-backed reopen preserving accounts/sessions/receipts/approvals/proposals/audit. Controlled database consumption/tampering fixtures are labelled in tests and are not provider observations.

The local login limiter is process-local, not a distributed auth service. No public deployment is provided. Investigation/evidence/findings/operations/outcome storage and persistent provider recovery are still pending; do not infer those guarantees from the foundational SQLite tables.

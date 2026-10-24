# Operation reservation and executor boundary

Implemented 24 October 2026. This milestone reserves operations; it does not submit provider writes, mark success or reconcile outcomes. Live integrations are still unavailable and the default runtime cannot reserve local synthetic cases.

## Reservation contract

The isolated executor exposes POST /internal/reservations with only {validationId}. A bearer service secret of at least 32 characters is required. Cookies/customer roles do not authenticate this service. The endpoint rejects raw actions, tenant/actor fields, amounts, methods and provider URLs. It resolves the initiating staff actor, proposal, exact receipt, approval and current policy from the stored validation and database. The backend has no public reservation or execute route. Neither agent receives this service secret or provider execution credentials.

The executor currently has no provider submission implementation and refuses Stripe credentials. Its default LIVE_TEST gateway has no live reader. Consequently the service holds unsupported/unverified actions rather than simulating execution. Only code-injected CONTROLLED_TEST harnesses reserve operations in tests, and that mode is stored permanently. A controlled validation is rejected by a LIVE_TEST executor. Provider integration and authenticated transport in deployment remain release gates.

Use a private random EXECUTOR_SERVICE_SECRET in the executor process and start with Node 24:

~~~powershell
npm.cmd run start:executor
~~~

Verified host fallback:

~~~powershell
npx.cmd --yes --package=node@24.22.1 node apps/executor/main.ts
~~~

DATABASE_PATH defaults to the shared local .local/proofit.sqlite file; EXECUTOR_PORT defaults to 4001. The service binds only to 127.0.0.1. Set the secret through a secure local process environment; no fixed example secret is committed. The application does not automatically load .env files.

## Atomic identity, locking and consumption

Reservation first validates a stored READY record, rules-v1 and gateway mode, current initiating staff role and unchanged authority binding. A retry of the same authorised business operation retrieves its existing record/key even after the receipt is consumed or expired. This is retrieval only; it never submits the operation again or mints new authority. A changed exact binding cannot reuse that identity.

Before fetching fresh provider state, a transaction acquires a persistent target lease (10 seconds) with a random fencing token. Live reads are bounded to 3 seconds. Another worker cannot perform a competing read/reservation for that target; contention is recorded as review. The final transaction verifies the lease/token/expiry and reloads all authority and sources. An expired or replaced lease cannot consume authority. A late worker releases only its own token, never a replacement worker's lease. Expired abandoned leases can be reclaimed after restart. Clock synchronization remains a deployment concern.

On fresh READY, one SQLite transaction writes a new validation, reserves the operation with a stable business key and provider idempotency key, consumes the receipt and required exact staff approval, and appends the reservation audit. The audit links the requested and fresh validation IDs. Failure rolls back all these writes. Unique business/receipt/provider keys prevent duplicate business operations. A partial unique resource index serializes RESERVED, SUBMITTED, PENDING and OUTCOME_UNKNOWN operations until a genuine terminal outcome is established by the future observer. Distinct confirmed requests have distinct business identities but still compete on the same target and must re-read refundable balance after acquiring the lease.

Migration 003 adds leases; migration 002 provides the operation ledger. Reservations have no verified effect or provider object yet. The future submitter must durably record submission and revalidate live provider state immediately before writing; a stored READY or RESERVED alone never grants arbitrary future execution. Uncertain submissions must preserve the same operation/key for reconciliation. That provider submission/reconciliation path is not implemented here, and this milestone does not claim timeout recovery of provider writes.

## Scoped reads and tests

GET /api/operations/:id uses the authenticated actor's tenant/customer scope. Customer responses omit the internal action/ledger/key record. Staff can inspect stored details. Text is bounded to recorded state; RESERVED explicitly says no provider outcome has been observed. No bank-arrival claim is made.

Verified tests include exact receipt/approval consumption, replay returning the same ID/key without another provider read, competing target requests, fresh balance rejection, authority changes during reads, audit rollback, stale/replaced lease fencing, service authentication and payload substitution, customer/tenant isolation, two database workers and restart preserving identity. Any test that inserts terminal state or consumption directly is a controlled database fixture, never a live provider observation. Real Stripe, Zetaris, NVIDIA and Meterless gates remain unfinished.

Subsequent cancellation milestone: submission/observation/recovery code now exists and is verified with controlled providers; see CANCELLATION.md. The default runtime still performs reservation only and disables live submission. Migration 005 stores attempts/tasks/observations and rules-v2 binds revalidation to the operation's own consumed authority. Refund submission and real integration/release gates remain unfinished.

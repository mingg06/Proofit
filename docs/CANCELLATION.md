# Cancellation integration work

## Stripe adapter milestone — 24 October 2026

Pinned stripe 23.0.1 with API 2026-09-30.endive after checking official cancellation/idempotency/versioning documentation and the installed SDK types/README. The SDK supports Node 20+; this application uses Node 24.22.1. The installed release uses accounts.retrieveCurrent() and item-level current_period_end. SDK network retries are disabled; requests use a 3-second SDK timeout. The gateway also bounds the overall read.

apps/executor/stripe-cancellation.ts is a narrow typed adapter: only retrieve a trusted subscription, set cancel_at_period_end=true with the stored idempotency key, and retrieve scheduling state. It never uses DELETE, refunds, arbitrary URLs, model-selected methods, entitlement changes or combined actions. The live service has not wired its submit method and continues to refuse provider credentials. No real provider write or successful live access is claimed.

Migration 004 introduces trusted tenant-to-Stripe-account and customer mappings. An approved future onboarding/import tool must populate LIVE mappings from verified records; there is no client ingestion endpoint. The adapter requires mapped resource ownership, the expected account, false livemode on the balance/subscription and the provider customer. Test credential syntax alone is insufficient. Synthetic mappings cannot be used by a LIVE adapter.

The supported simple subscription has one fixed licensed MYR item, quantity 1, a future period end and automatic collection. Taxes, discounts, schedules, pending changes, paused collection, metering, billing thresholds, multiple items, custom cancellation timing and ambiguous/unknown state are held. This is deliberately narrower than Stripe's full billing API.

Read-only access probe, with a test credential supplied only to this isolated command:

~~~powershell
npm.cmd run stripe:probe
# Host fallback:
npx.cmd --yes --package=node@24.22.1 node scripts/stripe-probe.ts
~~~

It retrieves the current account and test-mode balance only. Credential values and raw provider error bodies are never printed. When configured, the sanitized result is saved to gitignored .local/stripe-access.json. On this workspace the probe reported NOT_TESTED because STRIPE_TEST_SECRET_KEY is absent. No network call was made. Read-only verification does not unlock writes or waive evidence/model access gates.

Adapter tests use an explicitly CONTROLLED_TEST SDK transport, not fabricated LIVE records. They cover exact payload/key, scheduled-state observation, ownership, live-object rejection, complex billing and fixture-to-live isolation. Current suite: 57 passing tests plus TypeScript.

Official references checked: https://docs.stripe.com/billing/subscriptions/cancel ; https://docs.stripe.com/api/subscriptions/update ; https://docs.stripe.com/api/idempotent_requests ; https://docs.stripe.com/api/versioning . Provider idempotency retention does not replace the local ledger.

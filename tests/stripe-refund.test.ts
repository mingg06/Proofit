import test from "node:test";
import assert from "node:assert/strict";
import { harness } from "./gateway-helpers.ts";
import {
  StripeRefundAdapter,
  stripeRefundTransport,
  type RefundTransport,
} from "../apps/executor/stripe-refund.ts";
async function setup() {
  const h = await harness();
  h.store.run(
    "INSERT INTO provider_accounts VALUES(?,?,?,?)",
    "tenant_synthetic_a",
    "acct_controlled",
    "FIXTURE",
    h.now().toISOString(),
  );
  h.store.run(
    "INSERT INTO provider_customers VALUES(?,?,?,?,?,?)",
    "tenant_synthetic_a",
    "customer_synthetic_a",
    "acct_controlled",
    "cus_controlled",
    "FIXTURE",
    h.now().toISOString(),
  );
  const payment = {
    id: "pi_fixture_b",
    customer: "cus_controlled",
    livemode: false,
    currency: "myr",
    status: "succeeded",
    amount_received: 10000,
    latest_charge: "ch_controlled",
    capture_method: "automatic",
    transfer_data: null,
    application_fee_amount: null,
  };
  const charge = {
    id: "ch_controlled",
    customer: "cus_controlled",
    payment_intent: "pi_fixture_b",
    livemode: false,
    currency: "myr",
    paid: true,
    captured: true,
    disputed: false,
    amount: 10000,
    amount_captured: 10000,
    amount_refunded: 0,
    payment_method_details: { type: "card" },
    transfer_data: null,
    application_fee: null,
  };
  const refunds: any[] = [];
  let writes = 0,
    hasMore = false;
  const sent: any[] = [];
  const transport: RefundTransport = {
    account: async () => ({ id: "acct_controlled" }),
    balance: async () => ({ livemode: false }),
    payment: async () => payment,
    charge: async () => charge,
    refunds: async () => ({ has_more: hasMore, data: refunds }),
    create: async (params, options) => {
      writes++;
      sent.push({ params, options });
      const refund = {
        id: "re_controlled",
        payment_intent: params.payment_intent,
        charge: charge.id,
        amount: params.amount,
        currency: "myr",
        status: "pending",
        metadata: params.metadata,
      };
      refunds.push(refund);
      return refund;
    },
  };
  const target = {
    tenantId: "tenant_synthetic_a",
    customerId: "customer_synthetic_a",
    paymentId: "pi_fixture_b",
    operationId: "operation_controlled",
    amountMinor: 2000,
    currency: "MYR" as const,
    idempotencyKey: "stable-controlled-key",
  };
  const adapter = new StripeRefundAdapter(h.store, transport, {
    provenance: "CONTROLLED_TEST",
    now: h.now,
  });
  return {
    ...h,
    payment,
    charge,
    refunds,
    transport,
    target,
    adapter,
    sent,
    writes: () => writes,
    setMore() {
      hasMore = true;
    },
  };
}
test("Stripe refund sends only exact stored amount/payment and stable operation metadata/key", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const signal = new AbortController().signal;
  const result = await h.adapter.submitRefund(h.target, signal);
  assert.equal(result.providerObjectId, "re_controlled");
  assert.deepEqual(h.sent[0], {
    params: {
      payment_intent: "pi_fixture_b",
      amount: 2000,
      metadata: { proofit_operation_id: "operation_controlled" },
    },
    options: { idempotencyKey: "stable-controlled-key" },
  });
  const observed = await h.adapter.observeRefund(
    { ...h.target, providerObjectId: null },
    signal,
  );
  assert.equal(observed.status, "PENDING");
  assert.equal(observed.amountMinor, 2000);
  await assert.rejects(h.adapter.submitRefund(h.target, signal));
  assert.equal(h.writes(), 1);
});
test("Stripe refund balance excludes pending refunds and rejects ownership/live/complex/paginated states", async () => {
  for (const variant of [
    "pending",
    "owner",
    "live",
    "complex",
    "pagination",
    "balance",
    "metadata",
  ]) {
    const h = await setup();
    try {
      if (variant === "pending")
        h.refunds.push({
          id: "re_old",
          payment_intent: "pi_fixture_b",
          charge: "ch_controlled",
          amount: 9000,
          currency: "myr",
          status: "pending",
          metadata: {},
        });
      if (variant === "owner") h.payment.customer = "other";
      if (variant === "live") h.payment.livemode = true;
      if (variant === "complex") h.charge.disputed = true;
      if (variant === "pagination") h.setMore();
      if (variant === "balance") h.charge.amount_refunded = 100;
      if (variant === "metadata")
        h.refunds.push({
          id: "re_other",
          payment_intent: "pi_fixture_b",
          charge: "ch_controlled",
          amount: 2000,
          currency: "myr",
          status: "pending",
          metadata: { proofit_operation_id: h.target.operationId },
        });
      await assert.rejects(
        h.adapter.submitRefund(h.target, new AbortController().signal),
        variant,
      );
      assert.equal(h.writes(), 0);
    } finally {
      h.store.close();
    }
  }
});
test("Stripe refund observer rejects wrong amount/operation and live factory refuses non-test credentials", async (t) => {
  const h = await setup();
  t.after(() => h.store.close());
  const signal = new AbortController().signal;
  await h.adapter.submitRefund(h.target, signal);
  h.refunds[0].amount = 1999;
  await assert.rejects(
    h.adapter.observeRefund(
      { ...h.target, providerObjectId: "re_controlled" },
      signal,
    ),
  );
  assert.throws(() => stripeRefundTransport("invalid"));
  assert.throws(() => stripeRefundTransport("sk_live_synthetic"));
  const live = new StripeRefundAdapter(h.store, h.transport, {
    provenance: "LIVE",
    now: h.now,
  });
  await assert.rejects(live.submitRefund(h.target, signal));
});

import Stripe from "stripe";
import { z } from "zod";
import type { Action } from "../../packages/contracts/index.ts";
import { refundObservationSchema } from "../../packages/contracts/refund.ts";
import { Store } from "../backend/database.ts";
import type { RefundProvider, RefundTarget } from "./refund.ts";
import { stripeApiVersion } from "./stripe-cancellation.ts";
export const stripeRefundVersion =
  "stripe-refund-v1/stripe-23.0.1/" + stripeApiVersion;
export interface RefundTransport {
  account(): Promise<unknown>;
  balance(): Promise<unknown>;
  payment(id: string): Promise<unknown>;
  charge(id: string): Promise<unknown>;
  refunds(chargeId: string): Promise<unknown>;
  create(
    params: {
      payment_intent: string;
      amount: number;
      metadata: { proofit_operation_id: string };
    },
    options: { idempotencyKey: string },
  ): Promise<unknown>;
}
export function stripeRefundTransport(secret: string): RefundTransport {
  if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(secret))
    throw new Error("Only a Stripe test credential is accepted");
  const client = new Stripe(secret, {
    apiVersion: stripeApiVersion,
    maxNetworkRetries: 0,
    timeout: 3000,
  });
  return {
    account: () => client.accounts.retrieveCurrent(),
    balance: () => client.balance.retrieve(),
    payment: (id) => client.paymentIntents.retrieve(id),
    charge: (id) => client.charges.retrieve(id),
    refunds: (charge) => client.refunds.list({ charge, limit: 100 }),
    create: (params, options) =>
      client.refunds.create(params, {
        ...options,
        maxNetworkRetries: 0,
        timeout: 3000,
      }),
  };
}
const minor = z.number().int().nonnegative().safe();
const owner = z.union([z.string(), z.object({ id: z.string() })]);
const paymentSchema = z.object({
  id: z.string().regex(/^pi_/),
  customer: owner,
  livemode: z.literal(false),
  currency: z.literal("myr"),
  status: z.literal("succeeded"),
  amount_received: minor,
  latest_charge: z.string().regex(/^ch_/),
  capture_method: z.literal("automatic"),
  transfer_data: z.null(),
  application_fee_amount: z.null(),
});
const chargeSchema = z.object({
  id: z.string(),
  customer: owner,
  payment_intent: z.string(),
  livemode: z.literal(false),
  currency: z.literal("myr"),
  paid: z.literal(true),
  captured: z.literal(true),
  disputed: z.literal(false),
  amount: minor,
  amount_captured: minor,
  amount_refunded: minor,
  payment_method_details: z.object({ type: z.literal("card") }),
  transfer_data: z.null(),
  application_fee: z.null(),
});
const refundSchema = z.object({
  id: z.string().regex(/^re_/),
  payment_intent: z.string(),
  charge: z.string(),
  amount: minor,
  currency: z.literal("myr"),
  status: z.enum([
    "succeeded",
    "pending",
    "requires_action",
    "failed",
    "canceled",
  ]),
  metadata: z.record(z.string(), z.string()),
  lastResponse: z.object({ requestId: z.string().optional() }).optional(),
});
const listSchema = z.object({
  has_more: z.literal(false),
  data: z.array(refundSchema).max(100),
});
function customer(value: z.infer<typeof owner>) {
  return typeof value === "string" ? value : value.id;
}
export class StripeRefundAdapter implements RefundProvider {
  readonly store: Store;
  readonly transport: RefundTransport;
  readonly provenance: "LIVE" | "CONTROLLED_TEST";
  readonly now: () => Date;
  constructor(
    store: Store,
    transport: RefundTransport,
    options: { provenance: "LIVE" | "CONTROLLED_TEST"; now?: () => Date },
  ) {
    this.store = store;
    this.transport = transport;
    this.provenance = options.provenance;
    this.now = options.now ?? (() => new Date());
  }
  private async records(
    target: Pick<RefundTarget, "tenantId" | "customerId" | "paymentId">,
    signal: AbortSignal,
  ) {
    signal.throwIfAborted();
    const mapping = this.store.get<{
      account_id: string;
      provider_customer_id: string;
      provenance: string;
      account_provenance: string;
    }>(
      "SELECT c.account_id,c.provider_customer_id,c.provenance,a.provenance AS account_provenance FROM provider_customers c JOIN provider_accounts a ON a.tenant_id=c.tenant_id AND a.account_id=c.account_id WHERE c.tenant_id=? AND c.customer_id=?",
      target.tenantId,
      target.customerId,
    );
    const resource = this.store.get<{
      customer_id: string;
      provenance: string;
    }>(
      "SELECT customer_id,provenance FROM resources WHERE tenant_id=? AND id=? AND kind='PAYMENT'",
      target.tenantId,
      target.paymentId,
    );
    if (
      !mapping ||
      !resource ||
      resource.customer_id !== target.customerId ||
      (this.provenance === "LIVE" &&
        [
          mapping.provenance,
          mapping.account_provenance,
          resource.provenance,
        ].some((p) => p !== "LIVE"))
    )
      throw new Error("Trusted provider mapping unavailable");
    const [account, balance] = await Promise.all([
      this.transport.account(),
      this.transport.balance(),
    ]);
    signal.throwIfAborted();
    if (z.object({ id: z.string() }).parse(account).id !== mapping.account_id)
      throw new Error("Account mismatch");
    z.object({ livemode: z.literal(false) }).parse(balance);
    const payment = paymentSchema.parse(
      await this.transport.payment(target.paymentId),
    );
    signal.throwIfAborted();
    if (
      payment.id !== target.paymentId ||
      customer(payment.customer) !== mapping.provider_customer_id
    )
      throw new Error("Payment ownership mismatch");
    const charge = chargeSchema.parse(
      await this.transport.charge(payment.latest_charge),
    );
    signal.throwIfAborted();
    if (
      charge.id !== payment.latest_charge ||
      charge.payment_intent !== payment.id ||
      customer(charge.customer) !== mapping.provider_customer_id ||
      charge.amount !== payment.amount_received ||
      charge.amount_captured !== charge.amount ||
      charge.amount_refunded > charge.amount
    )
      throw new Error("Unsupported charge state");
    const list = listSchema.parse(await this.transport.refunds(charge.id));
    signal.throwIfAborted();
    let pending = 0,
      succeeded = 0;
    const ids = new Set<string>();
    for (const r of list.data) {
      if (
        ids.has(r.id) ||
        r.payment_intent !== payment.id ||
        r.charge !== charge.id
      )
        throw new Error("Conflicting refund list");
      ids.add(r.id);
      if (r.status === "pending" || r.status === "requires_action")
        pending += r.amount;
      if (r.status === "succeeded") succeeded += r.amount;
      if (!Number.isSafeInteger(pending) || !Number.isSafeInteger(succeeded))
        throw new Error("Invalid refund totals");
    }
    if (
      succeeded !== charge.amount_refunded ||
      pending > charge.amount - charge.amount_refunded
    )
      throw new Error("Refund balance conflict");
    return {
      payment,
      charge,
      refunds: list.data,
      remaining: charge.amount - charge.amount_refunded - pending,
    };
  }
  async read(
    input: { tenantId: string; customerId: string; action: Action },
    signal: AbortSignal,
  ) {
    if (input.action.type !== "REFUND_PAYMENT") return null;
    const records = await this.records(
      { ...input, paymentId: input.action.paymentId },
      signal,
    );
    return {
      tenantId: input.tenantId,
      customerId: input.customerId,
      targetId: input.action.paymentId,
      environment: "TEST",
      provenance: this.provenance,
      observedAt: this.now().toISOString(),
      kind: "PAYMENT",
      currency: "MYR",
      remainingRefundableMinor: records.remaining,
      paymentStatus: "SUCCEEDED",
      subscriptionStatus: null,
      cancelAtPeriodEnd: null,
      complexBilling: false,
    };
  }
  async submitRefund(
    input: RefundTarget & { idempotencyKey: string },
    signal: AbortSignal,
  ) {
    if (
      input.currency !== "MYR" ||
      !Number.isSafeInteger(input.amountMinor) ||
      input.amountMinor <= 0
    )
      throw new Error("Exact MYR refund required");
    const records = await this.records(input, signal);
    if (
      records.refunds.some(
        (r) => r.metadata.proofit_operation_id === input.operationId,
      ) ||
      records.remaining < input.amountMinor
    )
      throw new Error("Refund is duplicate or exceeds remaining balance");
    signal.throwIfAborted();
    const refund = refundSchema.parse(
      await this.transport.create(
        {
          payment_intent: input.paymentId,
          amount: input.amountMinor,
          metadata: { proofit_operation_id: input.operationId },
        },
        { idempotencyKey: input.idempotencyKey },
      ),
    );
    signal.throwIfAborted();
    this.match(refund, input, records.charge.id);
    return {
      providerObjectId: refund.id,
      providerRequestId: refund.lastResponse?.requestId ?? null,
    };
  }
  private match(
    refund: z.infer<typeof refundSchema>,
    input: RefundTarget,
    chargeId: string,
  ) {
    if (
      refund.payment_intent !== input.paymentId ||
      refund.charge !== chargeId ||
      refund.amount !== input.amountMinor ||
      refund.metadata.proofit_operation_id !== input.operationId
    )
      throw new Error("Exact refund binding mismatch");
  }
  async observeRefund(
    input: RefundTarget & { providerObjectId: string | null },
    signal: AbortSignal,
  ) {
    const records = await this.records(input, signal);
    const matches = records.refunds.filter(
      (r) => r.metadata.proofit_operation_id === input.operationId,
    );
    // Lost acknowledgements reconcile by stable operation metadata; absence never permits resubmission.
    if (matches.length !== 1) throw new Error("Refund outcome unknown");
    const refund = matches[0]!;
    this.match(refund, input, records.charge.id);
    if (input.providerObjectId && refund.id !== input.providerObjectId)
      throw new Error("Refund reference changed");
    return refundObservationSchema.parse({
      tenantId: input.tenantId,
      customerId: input.customerId,
      targetId: input.paymentId,
      operationId: input.operationId,
      providerObjectId: refund.id,
      environment: "TEST",
      provenance: this.provenance,
      observedAt: this.now().toISOString(),
      amountMinor: refund.amount,
      currency: "MYR",
      status:
        refund.status === "requires_action"
          ? "PENDING"
          : refund.status.toUpperCase(),
      providerRequestId: refund.lastResponse?.requestId ?? null,
      adapterVersion: stripeRefundVersion,
    });
  }
}

import type { Store } from "../backend/database.ts";
import { Gateway, type ProviderReader } from "../backend/gateway.ts";
import { OperationLedger } from "../backend/operations.ts";
import { CancellationExecutor } from "./cancellation.ts";
import { RefundExecutor, type RefundProvider } from "./refund.ts";
import type { CancellationProvider } from "./cancellation-provider.ts";
import type { GatewayMode } from "../../packages/contracts/gateway.ts";
import { createExecutorApi } from "./http.ts";
/** Server-only composition. Default startup stays gated; installing ports does not verify integration access. */
export function assembleExecutor(
  store: Store,
  providers: { cancellation: CancellationProvider; refund: RefundProvider },
  options: { mode?: GatewayMode; now?: () => Date; timeoutMs?: number } = {},
) {
  const reader: ProviderReader = {
    read: (input, signal) =>
      input.action.type === "REFUND_PAYMENT"
        ? providers.refund.read(input, signal)
        : providers.cancellation.read(input, signal),
  };
  const gateway = new Gateway(store, {
    reader,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  const ledger = new OperationLedger(gateway);
  const budget =
    options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs };
  const cancellation = new CancellationExecutor(
      ledger,
      providers.cancellation,
      budget,
    ),
    refund = new RefundExecutor(ledger, providers.refund, budget);
  return {
    gateway,
    ledger,
    reader,
    cancellation,
    refund,
    server: (serviceSecret: string) =>
      createExecutorApi(ledger, serviceSecret, {
        reader,
        cancellation,
        refund,
      }),
    async reconcileDue() {
      return {
        cancellations: await cancellation.reconcileDue(),
        refunds: await refund.reconcileDue(),
      };
    },
  };
}

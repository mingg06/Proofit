import { useId, useState, type FormEvent } from "react";
import type { Action } from "../../../packages/contracts/index.ts";
import type { Resource } from "../../../packages/contracts/console.ts";
import { errorText } from "./api.ts";
import { parseMoney } from "./format.ts";
import { Icon, Notice } from "./ui.tsx";
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, success?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await action();
      success?.();
      return true;
    } catch (error) {
      setError(errorText(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function ActionForm({
  resources,
  customerId,
  onSubmit,
  submitLabel,
  busy = false,
  disabled = false,
}: {
  resources: Resource[];
  customerId: string;
  onSubmit: (action: Action) => void;
  submitLabel: string;
  busy?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const [kind, setKind] = useState<"CANCEL_AT_PERIOD_END" | "REFUND_PAYMENT">(
    "CANCEL_AT_PERIOD_END",
  );
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options = resources.filter(
    (r) =>
      r.customerId === customerId &&
      r.kind === (kind === "REFUND_PAYMENT" ? "PAYMENT" : "SUBSCRIPTION"),
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!target) {
      setError("Choose the exact target for this action.");
      return;
    }
    try {
      onSubmit(
        kind === "REFUND_PAYMENT"
          ? {
              type: kind,
              paymentId: target,
              amountMinor: parseMoney(amount),
              currency: "MYR",
            }
          : { type: kind, subscriptionId: target, timing: "PERIOD_END" },
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Check the action fields.",
      );
    }
  }
  return (
    <form onSubmit={submit} className="stack">
      <fieldset disabled={disabled || busy} className="fields">
        <legend className="sr-only">Exact action parameters</legend>
        <div className="field">
          <label htmlFor={id + "type"}>Action</label>
          <select
            id={id + "type"}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setTarget("");
              setError(null);
            }}
          >
            <option value="CANCEL_AT_PERIOD_END">Cancel next renewal</option>
            <option value="REFUND_PAYMENT">Refund a payment</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={id + "target"}>
            {kind === "REFUND_PAYMENT" ? "Payment" : "Subscription"}
          </label>
          <select
            id={id + "target"}
            required
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="" disabled>
              Choose a target
            </option>
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id}
                {r.provenance === "FIXTURE" ? " · synthetic" : ""}
              </option>
            ))}
          </select>
          {options.length === 0 && (
            <p className="field-hint">
              No matching resources are available for this customer.
            </p>
          )}
        </div>
        {kind === "REFUND_PAYMENT" ? (
          <div className="field">
            <label htmlFor={id + "amount"}>Exact refund amount (MYR)</label>
            <div className="input-affix">
              <span>MYR</span>
              <input
                id={id + "amount"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="20.00"
                required
                aria-invalid={!!error}
                aria-describedby={error ? id + "error" : id + "hint"}
              />
            </div>
            <p id={id + "hint"} className="field-hint">
              Up to two decimal places. An exact-amount staff approval is also
              required.
            </p>
          </div>
        ) : (
          <div className="timing-note">
            <Icon name="replay" size={18} />
            <p>
              At the end of the current paid period.
              <br />
              <span className="muted">Keep access until then. No refund.</span>
            </p>
          </div>
        )}
      </fieldset>
      {error && (
        <div id={id + "error"}>
          <Notice error>{error}</Notice>
        </div>
      )}
      <button
        className="button primary"
        type="submit"
        disabled={busy || disabled || options.length === 0}
      >
        {busy ? "Saving…" : submitLabel}
        <Icon name="arrow" size={17} />
      </button>
    </form>
  );
}

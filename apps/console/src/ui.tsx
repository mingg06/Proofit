import { useLayoutEffect, useId, useRef, type ReactNode } from "react";
import { actionSchema } from "../../../packages/contracts/index.ts";
import { formatMoney, label } from "./format.ts";
const paths: Record<string, ReactNode> = {
  shield: (
    <>
      <path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6l-8-3Z" />
      <path d="m8.5 12 2.5 2.5 5-5" />
    </>
  ),
  request: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  review: (
    <>
      <path d="M4 6h16M4 12h9M4 18h9" />
      <path d="m16 16 2 2 4-4" />
    </>
  ),
  replay: (
    <>
      <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
    </>
  ),
  logout: (
    <>
      <path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7a8 8 0 1 0 0 10M20 3v5h-5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.info}
    </svg>
  );
}
export function Badge({
  value,
  children,
}: {
  value: string;
  children?: ReactNode;
}) {
  const tone = ["READY", "PASS", "COMPLETE", "CONFIRMED", "SUCCEEDED"].includes(
    value,
  )
    ? "good"
    : ["BLOCK", "FAILED", "MALFORMED_OUTPUT", "EXPIRED"].includes(value)
      ? "bad"
      : [
            "REVIEW_REQUIRED",
            "UNAVAILABLE",
            "BUDGET_EXHAUSTED",
            "OUTCOME_UNKNOWN",
            "PENDING",
            "CONTROLLED_TEST",
            "RULES_ONLY",
          ].includes(value)
        ? "warn"
        : "neutral";
  return (
    <span className={"badge " + tone}>
      {children ??
        (value === "READY"
          ? "Eligible"
          : value === "BLOCK"
            ? "Blocked"
            : label(value))}
    </span>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={"notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      <Icon name="info" size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="request" size={24} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="skeletons" role="status" aria-label="Loading records">
      <div className="skeleton wide" />
      <div className="skeleton" />
      <div className="skeleton tall" />
      <span className="sr-only">Loading records…</span>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={id}>{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ActionCard({
  action,
  title,
  subtle = false,
}: {
  action: unknown;
  title?: string;
  subtle?: boolean;
}) {
  const parsed = actionSchema.safeParse(action);
  return (
    <section className={"action-card " + (subtle ? "subtle" : "")}>
      {title && <p className="eyebrow">{title}</p>}
      {parsed.success ? (
        <>
          <h3>
            {parsed.data.type === "CANCEL_AT_PERIOD_END"
              ? "Cancel next renewal"
              : "Refund payment"}
          </h3>
          <dl>
            <div>
              <dt>Target</dt>
              <dd className="mono">
                {parsed.data.type === "CANCEL_AT_PERIOD_END"
                  ? parsed.data.subscriptionId
                  : parsed.data.paymentId}
              </dd>
            </div>
            {parsed.data.type === "REFUND_PAYMENT" ? (
              <div>
                <dt>Exact amount</dt>
                <dd className="amount">
                  {formatMoney(parsed.data.amountMinor)}
                </dd>
              </div>
            ) : (
              <div>
                <dt>Timing</dt>
                <dd>End of the current paid period</dd>
              </div>
            )}
          </dl>
          <p className="small muted">
            {parsed.data.type === "CANCEL_AT_PERIOD_END"
              ? "Keep access until the paid period ends. No refund is included."
              : "A refund requires customer confirmation and exact-amount staff approval."}
          </p>
        </>
      ) : (
        <>
          <h3>Unsupported proposal</h3>
          <p className="small muted">
            This proposal needs review. It cannot be substituted with another
            action.
          </p>
          <pre>{JSON.stringify(action, null, 2)}</pre>
        </>
      )}
    </section>
  );
}

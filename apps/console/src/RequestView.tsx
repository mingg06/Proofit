import { useState } from "react";
import type {
  Actor,
  Case,
  Resource,
} from "../../../packages/contracts/console.ts";
import type { Action } from "../../../packages/contracts/index.ts";
import { api } from "./api.ts";
import { ActionForm, useMutation } from "./forms.tsx";
import { ActionCard, Badge, Icon, Modal, Notice } from "./ui.tsx";
import { dateTime, shortId } from "./format.ts";
import { navigate } from "./routing.ts";
export function RequestView({
  data,
  actor,
  resources,
  onRefresh,
}: {
  data: Case;
  actor: Actor;
  resources: Resource[];
  onRefresh: () => void;
}) {
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [revise, setRevise] = useState(false);
  const [text, setText] = useState(data.request.original_text);
  const mutation = useMutation();
  const customer = actor.role === "CUSTOMER";
  const current = data.latestVersion === data.request.version;
  const receipt = data.receipt;
  const expired = receipt ? Date.parse(receipt.expiresAt) <= Date.now() : false;
  async function amend() {
    const next = await api.amend(data.request.id, data.request.version, text);
    onRefresh();
    navigate("request", next.id, next.version);
    setRevise(false);
  }
  return (
    <div className="stack large-gap">
      {data.automation && (
        <section
          className="panel automation-status"
          aria-label="Automatic processing status"
        >
          <div className="panel-heading">
            <h2>Automatic processing</h2>
            <Badge value={data.automation.status}>
              {data.automation.status.replaceAll("_", " ")}
            </Badge>
          </div>
          <p>
            {customer && data.automation.status === "UNAVAILABLE"
              ? "Your confirmation is saved. Automatic processing is unavailable; no provider action has been verified."
              : data.automation.message}
          </p>
          <p className="small muted">
            Confirmation records your intent. Execution still requires backend
            eligibility and any required refund approval.
          </p>
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">01 / CONFIRMED INTENT</p>
            <h2>The customer’s request</h2>
          </div>
          <Badge
            value={receipt ? (expired ? "EXPIRED" : "CONFIRMED") : "DRAFT"}
          >
            {receipt
              ? expired
                ? "Confirmation expired"
                : "Confirmation recorded"
              : "Awaiting confirmation"}
          </Badge>
        </div>
        <blockquote className="request-quote">
          {data.request.original_text}
        </blockquote>
        <div className="record-meta">
          <span className="mono" title={data.request.id}>
            {shortId(data.request.id)}
          </span>
          <span>Version {data.request.version}</span>
          <span>{dateTime(data.request.created_at)}</span>
        </div>
        {!current && (
          <Notice>
            You’re viewing an earlier version. Open version {data.latestVersion}{" "}
            to make changes.{" "}
            <button
              className="text-button"
              onClick={() =>
                navigate("request", data.request.id, data.latestVersion)
              }
            >
              Open latest version
            </button>
          </Notice>
        )}
      </section>
      {receipt ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EXACT-ACTION RECEIPT</p>
              <h2>What was confirmed</h2>
            </div>
            <Icon name="lock" />
          </div>
          <ActionCard action={receipt.binding.action} />
          <dl className="metadata-grid">
            <div>
              <dt>Confirmed</dt>
              <dd>{dateTime(receipt.createdAt)}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>{dateTime(receipt.expiresAt)}</dd>
            </div>
            <div>
              <dt>Policy version</dt>
              <dd className="mono">{receipt.binding.policyVersion}</dd>
            </div>
            <div>
              <dt>Receipt</dt>
              <dd className="mono" title={receipt.receiptId}>
                {shortId(receipt.receiptId)}
              </dd>
            </div>
          </dl>
          {receipt.consumedByOperationId && (
            <Notice>
              This confirmation belongs to an existing operation. Check its
              recorded outcome.
            </Notice>
          )}
          {expired && (
            <Notice>
              A new request version and fresh confirmation are required before
              this action can proceed.
            </Notice>
          )}
          {customer && current && (
            <button
              className="button secondary"
              onClick={() => setRevise(true)}
            >
              Revise request
              <Icon name="request" size={17} />
            </button>
          )}
        </section>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EXACT ACTION</p>
              <h2>
                {customer
                  ? "Make the intent explicit"
                  : "Customer confirmation is needed"}
              </h2>
            </div>
          </div>
          {customer && current ? (
            <>
              <p className="section-copy">
                Choose the exact action and target. You’ll review the details
                before confirming.
              </p>
              <ActionForm
                resources={resources}
                customerId={data.request.customer_id}
                onSubmit={setConfirm}
                submitLabel="Review confirmation"
              />
            </>
          ) : (
            <Notice>
              The requesting customer must confirm a supported action from their
              own account. Staff cannot confirm on their behalf.
            </Notice>
          )}
        </section>
      )}
      {customer && !receipt && current && (
        <button className="text-button left" onClick={() => setRevise(true)}>
          Change the request text
        </button>
      )}
      <div className="quiet-note">
        <Icon name="shield" size={18} />
        <p>
          Confirmation records intent. It does not execute an action or
          establish refund eligibility.
        </p>
      </div>
      {confirm && (
        <Modal
          title="Confirm this exact action"
          onClose={() => {
            if (!mutation.busy) setConfirm(null);
          }}
        >
          <p className="section-copy">
            Check the action, target and timing or amount below.
          </p>
          <ActionCard action={confirm} />
          <p className="small muted">
            This confirms version {data.request.version} of your request.
            Refunds still require business eligibility and staff approval.
          </p>
          {mutation.error && <Notice error>{mutation.error}</Notice>}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={mutation.busy}
              onClick={() => setConfirm(null)}
            >
              Go back
            </button>
            <button
              className="button primary"
              disabled={mutation.busy}
              onClick={() =>
                void mutation.run(
                  () =>
                    api.confirm(data.request.id, data.request.version, confirm),
                  () => {
                    setConfirm(null);
                    onRefresh();
                  },
                )
              }
            >
              {mutation.busy ? "Recording…" : "Confirm exact action"}
              <Icon name="check" size={18} />
            </button>
          </div>
        </Modal>
      )}
      {revise && (
        <Modal
          title="Create a revised request"
          onClose={() => {
            if (!mutation.busy) setRevise(false);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutation.run(amend);
            }}
            className="stack"
          >
            <div className="field">
              <label htmlFor="revised-request">Request text</label>
              <textarea
                id="revised-request"
                value={text}
                onChange={(e) => setText(e.target.value)}
                required
                maxLength={20000}
                rows={5}
              />
            </div>
            <Notice>
              This creates version {data.request.version + 1}. Previous
              confirmations and approvals cannot authorize the new version.
            </Notice>
            {mutation.error && <Notice error>{mutation.error}</Notice>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setRevise(false)}
                disabled={mutation.busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={mutation.busy}
              >
                {mutation.busy ? "Creating…" : "Create new version"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

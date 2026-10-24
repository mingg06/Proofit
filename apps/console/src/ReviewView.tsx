import { useState } from "react";
import type {
  Actor,
  Case,
  Resource,
} from "../../../packages/contracts/console.ts";
import { api } from "./api.ts";
import { ActionForm, useMutation } from "./forms.tsx";
import { ActionCard, Badge, Empty, Icon, Modal, Notice } from "./ui.tsx";
import { dateTime, formatMoney, json } from "./format.ts";
import { navigate } from "./routing.ts";
export function ReviewView({
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
  const [adding, setAdding] = useState(false),
    [approval, setApproval] = useState(false);
  const [conversation, setConversation] = useState("");
  const mutation = useMutation();
  if (actor.role === "CUSTOMER")
    return (
      <Empty title="Staff review details are private">
        Your confirmation and recorded provider outcome are available in your
        request and outcome views.
      </Empty>
    );
  const proposal = data.proposals?.at(-1);
  const validation = data.validations
    ?.filter((v) => v.proposalId === proposal?.id)
    .at(-1);
  const current = data.latestVersion === data.request.version;
  const holds = validation?.checks.filter((c) => c.result !== "PASS") ?? [];
  const passed = validation?.checks.filter((c) => c.result === "PASS") ?? [];
  const receipt = data.receipt;
  const approved = data.approvals?.at(-1);
  const approvalUsable =
    !!receipt &&
    receipt.binding.action.type === "REFUND_PAYMENT" &&
    !receipt.consumedByOperationId &&
    Date.parse(receipt.expiresAt) > Date.now() &&
    current;
  return (
    <div className="stack large-gap">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">02 / INVESTIGATION & REVIEW</p>
            <h2>Compare action with authority</h2>
          </div>
          {validation ? (
            <Badge value={validation.decision} />
          ) : (
            <Badge value="NOT_VALIDATED">Not validated</Badge>
          )}
        </div>
        <div className="comparison">
          <div>
            {proposal ? (
              <ActionCard
                title="Untrusted proposal"
                action={json(proposal.proposal_json)}
                subtle
              />
            ) : (
              <div className="action-placeholder">
                <Icon name="request" />
                <h3>No proposal stored</h3>
                <p>Add a manual test proposal to exercise the gateway.</p>
              </div>
            )}
          </div>
          <div>
            {receipt ? (
              <ActionCard
                title="Confirmed authority"
                action={receipt.binding.action}
              />
            ) : (
              <div className="action-placeholder">
                <Icon name="lock" />
                <h3>No confirmed authority</h3>
                <p>Customer confirmation is required.</p>
              </div>
            )}
          </div>
        </div>
        <div className="action-toolbar">
          <button
            className="button primary"
            disabled={!proposal || mutation.busy || !current}
            onClick={() =>
              proposal &&
              void mutation.run(() => api.validate(proposal.id), onRefresh)
            }
          >
            <Icon name="shield" size={17} />
            {mutation.busy ? "Working…" : "Run rules"}
          </button>
          <button
            className="button secondary"
            disabled={!proposal || mutation.busy || !current}
            onClick={() =>
              proposal &&
              void mutation.run(() => api.investigate(proposal.id), onRefresh)
            }
          >
            <Icon name="search" size={17} />
            Investigate evidence
          </button>
          <button
            className="text-button"
            disabled={mutation.busy || !current}
            onClick={() => setAdding(!adding)}
          >
            {adding ? "Close proposal form" : "Add proposal"}
            <Icon name="plus" size={16} />
          </button>
        </div>
        <p className="small muted">
          Manual proposals are untrusted inputs. Only backend checks determine
          eligibility.
        </p>
        {!current && (
          <Notice>
            Earlier request versions are read-only. Open the latest version to
            start a new validation.
          </Notice>
        )}
        {mutation.error && <Notice error>{mutation.error}</Notice>}
        {adding && (
          <div className="inset-form">
            <h3>Store a manual test proposal</h3>
            <div className="field">
              <label htmlFor="proposal-context">
                Proposal context (optional)
              </label>
              <textarea
                id="proposal-context"
                rows={2}
                maxLength={20000}
                value={conversation}
                onChange={(e) => setConversation(e.target.value)}
                placeholder="Why is this action being proposed?"
              />
            </div>
            <ActionForm
              resources={resources}
              customerId={data.request.customer_id}
              busy={mutation.busy}
              submitLabel="Store proposal"
              onSubmit={(action) =>
                void mutation.run(
                  () =>
                    api.propose(
                      data.request.id,
                      data.request.version,
                      action,
                      conversation,
                    ),
                  () => {
                    setAdding(false);
                    onRefresh();
                  },
                )
              }
            />
          </div>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">DETERMINISTIC CHECKS</p>
            <h2>
              {validation
                ? "The recorded decision"
                : "Validate before proceeding"}
            </h2>
          </div>
          {validation && (
            <span className="small muted">{validation.rulesVersion}</span>
          )}
        </div>
        {validation ? (
          <>
            <div className="decision-summary">
              <Badge value={validation.decision} />
              <span>
                {validation.decision === "BLOCK"
                  ? "The proposed action cannot proceed."
                  : validation.decision === "REVIEW_REQUIRED"
                    ? "Resolve the evidence or authority holds below."
                    : "Eligible only for this exact action. Execution is disabled here."}
              </span>
            </div>
            {holds.map((check) => (
              <div className="check-row" key={check.name}>
                <span
                  className={
                    "check-icon " + (check.result === "BLOCK" ? "bad" : "warn")
                  }
                >
                  <Icon
                    name={check.result === "BLOCK" ? "close" : "info"}
                    size={17}
                  />
                </span>
                <div>
                  <h3>{check.name.replaceAll("_", " ")}</h3>
                  <p>{check.reason}</p>
                </div>
                <Badge value={check.result} />
              </div>
            ))}
            {passed.length > 0 && (
              <details className="passed-checks">
                <summary>{passed.length} checks passed</summary>
                {passed.map((check) => (
                  <div className="check-row" key={check.name}>
                    <span className="check-icon good">
                      <Icon name="check" size={16} />
                    </span>
                    <div>
                      <h3>{check.name.replaceAll("_", " ")}</h3>
                      <p>{check.reason}</p>
                    </div>
                  </div>
                ))}
              </details>
            )}
            <p className="small muted record-footer">
              Recorded {dateTime(validation.createdAt)} ·{" "}
              {validation.mode === "CONTROLLED_TEST"
                ? "Controlled test"
                : "Backend test gateway"}
            </p>
          </>
        ) : (
          <Empty title="No validation recorded">
            Run the rules on a stored proposal to see named checks and the
            backend decision.
          </Empty>
        )}
      </section>
      {receipt?.binding.action.type === "REFUND_PAYMENT" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">EXACT-AMOUNT APPROVAL</p>
              <h2>Refund staff authority</h2>
            </div>
            {approved && <Badge value="CONFIRMED">Approval recorded</Badge>}
          </div>
          {approved ? (
            <>
              <p className="section-copy">
                An exact-action approval is stored for{" "}
                {formatMoney(receipt.binding.action.amountMinor)}. It remains
                subject to expiry, policy and execution checks.
              </p>
              <p className="small muted">
                Recorded {dateTime(approved.createdAt)} · expires{" "}
                {dateTime(approved.expiresAt)}
              </p>
            </>
          ) : (
            <>
              <p className="section-copy">
                A refund approver must approve{" "}
                {formatMoney(receipt.binding.action.amountMinor)} against{" "}
                <span className="mono">{receipt.binding.action.paymentId}</span>
                .
              </p>
              {actor.role === "REFUND_APPROVER" ? (
                <button
                  className="button primary"
                  disabled={!approvalUsable || mutation.busy}
                  onClick={() => setApproval(true)}
                >
                  Review exact approval
                  <Icon name="arrow" size={17} />
                </button>
              ) : (
                <Notice>
                  A refund approver account is required. Support staff cannot
                  grant this approval.
                </Notice>
              )}
              {!approvalUsable && (
                <p className="small muted">
                  This receipt is expired, consumed or belongs to an earlier
                  version. Fresh authority is required.
                </p>
              )}
            </>
          )}
        </section>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">EVIDENCE INVESTIGATION</p>
            <h2>Recorded runs</h2>
          </div>
          <Icon name="search" />
        </div>
        {data.investigations?.length ? (
          <div className="run-list">
            {[...data.investigations].reverse().map((run) => (
              <div className="run-row" key={run.id}>
                <div>
                  <Badge value={run.status} />
                  <p className="small muted">
                    {dateTime(run.created_at)} ·{" "}
                    {run.model_id ?? "No model call configured"}
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    navigate("replay", data.request.id, data.request.version)
                  }
                >
                  Open recorded history
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No investigation recorded">
            Start an investigation to record findings or explicit integration
            holds. No inference result is fabricated when the model is
            unavailable.
          </Empty>
        )}
      </section>
      {approval && receipt && (
        <Modal
          title="Approve the exact refund"
          onClose={() => {
            if (!mutation.busy) setApproval(false);
          }}
        >
          <ActionCard action={receipt.binding.action} />
          <p className="section-copy">
            You are approving only the amount and payment shown. This approval
            does not execute the refund.
          </p>
          <p className="small muted">
            Policy {receipt.binding.policyVersion} · expires{" "}
            {dateTime(receipt.expiresAt)}
          </p>
          {mutation.error && <Notice error>{mutation.error}</Notice>}
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={mutation.busy}
              onClick={() => setApproval(false)}
            >
              Go back
            </button>
            <button
              className="button primary"
              disabled={mutation.busy}
              onClick={() =>
                void mutation.run(
                  () => api.approve(receipt.receiptId),
                  () => {
                    setApproval(false);
                    onRefresh();
                  },
                )
              }
            >
              {mutation.busy ? "Recording…" : "Approve exact refund"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

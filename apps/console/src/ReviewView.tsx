import { useState } from "react";
import type {
  Actor,
  Case,
  Resource,
} from "../../../packages/contracts/console.ts";
import { api } from "./api.ts";
import { ActionForm, useMutation } from "./forms.tsx";
import { ActionCard, Badge, Empty, Icon, Modal, Notice } from "./ui.tsx";
import { dateTime, formatMoney, json, shortId } from "./format.ts";
import { href, navigate } from "./routing.ts";
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
  const investigation = data.investigations?.at(-1);
  const approvalUsable =
    !!receipt &&
    receipt.binding.action.type === "REFUND_PAYMENT" &&
    !receipt.consumedByOperationId &&
    Date.parse(receipt.expiresAt) > Date.now() &&
    current;
  return (
    <div className="stack large-gap review-layout">
      <header className="review-case-header">
        <a className="text-button left" href={href("request")}>
          ← Back to all requests
        </a>
        <div className="review-case-title">
          <p className="eyebrow">REQUEST REVIEW</p>
          <h2>
            Review request <span className="mono">{shortId(data.request.id)}</span>
            <Badge value={validation?.decision ?? "NOT_VALIDATED"}>
              {validation ? undefined : "Not validated"}
            </Badge>
          </h2>
          <p className="muted">Request received {dateTime(data.request.created_at)}</p>
        </div>
        <a
          className="button primary"
          href={href("replay", data.request.id, data.request.version)}
        >
          View replay <Icon name="arrow" size={17} />
        </a>
      </header>
      <section className="panel review-main">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ACTION AUTHORITY</p>
            <h2>Confirmed intent vs. proposal</h2>
          </div>
        </div>
        <ol className="review-steps" aria-label="Request review progress">
          <li className="complete">
            <span aria-hidden="true"><Icon name="check" size={13} /></span>
            <div><strong>Request received</strong><small>Request version recorded</small></div>
          </li>
          <li className={receipt ? "complete" : "pending"}>
            <span aria-hidden="true">{receipt ? <Icon name="check" size={13} /> : "2"}</span>
            <div><strong>Authority confirmed</strong><small>{receipt ? "Exact action confirmed" : "Customer confirmation not recorded"}</small></div>
          </li>
          <li className={
            !investigation
              ? "pending"
              : investigation.status === "COMPLETE" || investigation.status === "RULES_ONLY"
                ? "complete"
                : "held"
          }>
            <span aria-hidden="true">{!investigation ? "3" : investigation.status === "COMPLETE" || investigation.status === "RULES_ONLY" ? <Icon name="check" size={13} /> : "!"}</span>
            <div><strong>Investigation recorded</strong><small>{investigation ? `${investigation.status.replaceAll("_", " ")} · ${dateTime(investigation.created_at)}` : "No investigation run recorded"}</small></div>
          </li>
          <li className={
            !validation ? "pending" : validation.decision === "BLOCK" ? "blocked" : validation.decision === "READY" ? "complete" : "held"
          }>
            <span aria-hidden="true">{!validation ? "4" : validation.decision === "READY" ? <Icon name="check" size={13} /> : "!"}</span>
            <div><strong>{!validation ? "Decision pending" : validation.decision === "BLOCK" ? "Action blocked" : validation.decision === "READY" ? "Action eligible" : "Action held for review"}</strong><small>{validation ? "Recorded backend decision" : "Run checks to record a decision"}</small></div>
          </li>
        </ol>
        <div className={"review-safety " + (validation?.decision === "BLOCK" ? "blocked" : "neutral")}>
          <Icon name="lock" size={17} />
          <span>
            <strong>
              {validation?.decision === "BLOCK"
                ? "Action blocked."
                : validation?.decision === "READY"
                  ? "Action eligible."
                  : validation
                    ? "Review required."
                    : "No decision recorded."}
            </strong>{" "}
            No provider action was submitted from this workspace.
          </span>
        </div>
        <div className="comparison">
          <div>
            {receipt ? (
              <div className="comparison-authority">
                <ActionCard
                  title="Customer confirmed"
                  action={receipt.binding.action}
                />
              </div>
            ) : (
              <div className="action-placeholder">
                <Icon name="lock" />
                <h3>No confirmed authority</h3>
                <p>Customer confirmation is required.</p>
              </div>
            )}
          </div>
          <div>
            {proposal ? (
              <div className="comparison-proposal">
                <ActionCard
                  title="AI proposal · untrusted"
                  action={json(proposal.proposal_json)}
                  subtle
                />
              </div>
            ) : (
              <div className="action-placeholder">
                <Icon name="request" />
                <h3>No proposal stored</h3>
                <p>Add a manual test proposal to exercise the gateway.</p>
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
      <section className="panel review-checks">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">WHY IT WAS BLOCKED</p>
            <h2>
              {validation
                ? validation.decision === "BLOCK"
                  ? "Important details did not match"
                  : validation.decision === "REVIEW_REQUIRED"
                    ? "Details that still need review"
                    : "Checks for this action"
                : "No decision recorded yet"}
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
        <section className="panel review-approval">
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
      <section className="panel review-history">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">HOW WE CHECKED</p>
            <h2>Evidence and investigation history</h2>
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
        <a
          className="button secondary"
          href={href("replay", data.request.id, data.request.version)}
        >
          View outcome
          <Icon name="replay" size={17} />
        </a>
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

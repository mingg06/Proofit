import { useMutation } from "./forms.tsx";
import { useEffect, useState } from "react";
import type {
  Actor,
  Case,
  Operation,
  Replay,
} from "../../../packages/contracts/console.ts";
import { evidenceSchema } from "../../../packages/contracts/index.ts";
import { api, errorText } from "./api.ts";
import { Badge, Empty, Icon, Notice, Skeleton } from "./ui.tsx";
import { dateTime, json, shortId, label } from "./format.ts";
function Evidence({ value }: { value: string }) {
  const parsed = evidenceSchema.safeParse(json(value));
  if (!parsed.success)
    return <Notice error>The stored evidence record could not be read.</Notice>;
  const e = parsed.data;
  return (
    <article className="evidence-card">
      <div className="panel-heading">
        <span className="mono small">{e.reference.sourceId}</span>
        <Badge value={e.provenance} />
      </div>
      <blockquote>{e.excerpt}</blockquote>
      <div className="source-ref">
        <span>
          Version <b>{e.reference.sourceVersion}</b>
        </span>
        <span>
          Passage <b>{e.reference.passageId}</b>
        </span>
      </div>
    </article>
  );
}
export function ReplayView({ data, actor }: { data: Case; actor: Actor }) {
  const download = useMutation();
  const [operationId, setOperationId] = useState(
    data.operations.at(-1)?.operationId ?? "",
  );
  const [operation, setOperation] = useState<Operation | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [opLoading, setOpLoading] = useState(false);
  const [runId, setRunId] = useState(data.investigations?.at(-1)?.id ?? "");
  const [replay, setReplay] = useState<Replay | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runLoading, setRunLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setOperation(null);
    setOpError(null);
    if (!operationId) return;
    const controller = new AbortController();
    setOpLoading(true);
    api
      .operation(operationId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setOperation(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setOpError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setOpLoading(false);
      });
    return () => controller.abort();
  }, [operationId, retry]);
  useEffect(() => {
    setReplay(null);
    setRunError(null);
    if (!runId || actor.role === "CUSTOMER") return;
    const controller = new AbortController();
    setRunLoading(true);
    api
      .replay(runId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReplay(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setRunError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setRunLoading(false);
      });
    return () => controller.abort();
  }, [runId, actor.role, retry]);
  const unresolved = replay ? json(replay.run.unresolved_json) : null;
  return (
    <div
      className={
        "stack large-gap replay-layout" +
        (actor.role === "CUSTOMER" ? " customer-replay" : "")
      }
    >
      <header className="replay-page-header">
        <div>
          <p className="eyebrow">RECORDED OUTCOME</p>
          <h2>Execution replay</h2>
          <p>An immutable view of what the connected system recorded.</p>
        </div>
        <Badge value="RECORDED">Read-only replay</Badge>
      </header>
      <div className="replay-export">
        <div className="export-toolbar">
          <p className="small muted">
            Download this version’s stored history and observed outcomes.
          </p>
          <button
            className="button secondary"
            disabled={download.busy}
            onClick={() =>
              void download.run(async () => {
                const packet = await api.request(
                  "/requests/" +
                    encodeURIComponent(data.request.id) +
                    "/export?version=" +
                    data.request.version,
                );
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify(packet, null, 2)], {
                    type: "application/json",
                  }),
                );
                const link = document.createElement("a");
                link.href = url;
                link.download =
                  "proofit-case-v" + data.request.version + ".json";
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              })
            }
          >
            {download.busy ? "Preparing export…" : "Export recorded case"}
          </button>
        </div>
        {download.error && <Notice error>{download.error}</Notice>}
      </div>
      <section className="panel replay-outcome">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">03 / EXECUTION & OBSERVATION</p>
            <h2>The recorded outcome</h2>
          </div>
        </div>
        {data.operations.length > 0 && (
          <div className="field">
            <label htmlFor="operation-selection">Stored operation</label>
            <select
              id="operation-selection"
              value={operationId}
              onChange={(e) => setOperationId(e.target.value)}
            >
              {data.operations.map((o) => (
                <option key={o.operationId} value={o.operationId}>
                  {shortId(o.operationId)} · {label(o.state)}
                </option>
              ))}
            </select>
          </div>
        )}
        {opLoading ? (
          <Skeleton />
        ) : opError ? (
          <>
            <Notice error>{opError}</Notice>
            <button
              className="button secondary"
              onClick={() => setRetry((v) => v + 1)}
            >
              Retry
            </button>
          </>
        ) : operation ? (
          <>
            <div className="outcome-state">
              <span
                className={
                  "outcome-icon " + (operation.effectVerified ? "verified" : "")
                }
              >
                <Icon
                  name={operation.effectVerified ? "check" : "replay"}
                  size={28}
                />
              </span>
              <div>
                <Badge value={operation.state}>
                  {operation.state === "SUCCEEDED" && !operation.effectVerified
                    ? "Stored success · unverified"
                    : operation.state === "SUCCEEDED"
                      ? "Scheduling observed"
                      : undefined}
                </Badge>
                <h3>{operation.statusText}</h3>
              </div>
            </div>
            {operation.mode === "CONTROLLED_TEST" && (
              <Notice>
                This is a controlled test record, not a live provider run.
              </Notice>
            )}
            <dl className="metadata-grid">
              <div>
                <dt>Operation</dt>
                <dd className="mono">{operation.operationId}</dd>
              </div>
              <div>
                <dt>Provider reference</dt>
                <dd className="mono">
                  {operation.providerObjectId ?? "Not observed"}
                </dd>
              </div>
              <div>
                <dt>Verified effect</dt>
                <dd>
                  {operation.effectVerified
                    ? "Supported by a stored observation"
                    : "No verified effect"}
                </dd>
              </div>
              <div>
                <dt>Observed at</dt>
                <dd>{dateTime(operation.observation?.observedAt)}</dd>
              </div>
              {operation.observation &&
                "periodEnd" in operation.observation &&
                operation.observation.periodEnd && (
                  <div>
                    <dt>Recorded period end</dt>
                    <dd>{dateTime(operation.observation.periodEnd)}</dd>
                  </div>
                )}
            </dl>
          </>
        ) : (
          <Empty title="No operation recorded">
            No provider action or outcome is recorded for this request version.
            Eligibility, submission and verified effect are separate steps.
          </Empty>
        )}
      </section>
      {actor.role !== "CUSTOMER" && (
        <section className="panel replay-investigation">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RECORDED INVESTIGATION</p>
              <h2>Replay the evidence</h2>
            </div>
            <span className="small muted">Read-only</span>
          </div>
          {data.investigations?.length ? (
            <>
              <div className="field">
                <label htmlFor="run-selection">Recorded run</label>
                <select
                  id="run-selection"
                  value={runId}
                  onChange={(e) => setRunId(e.target.value)}
                >
                  {[...data.investigations].reverse().map((run) => (
                    <option key={run.id} value={run.id}>
                      {shortId(run.id)} · {label(run.status)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="small muted">
                This reads stored records. It does not call a model or execute
                an action.
              </p>
              {runLoading ? (
                <Skeleton />
              ) : runError ? (
                <>
                  <Notice error>{runError}</Notice>
                  <button
                    className="button secondary"
                    onClick={() => setRetry((v) => v + 1)}
                  >
                    Retry recorded run
                  </button>
                </>
              ) : (
                replay && (
                  <div className="stack">
                    <div className="run-summary">
                      <Badge value={replay.run.status} />
                      <span className="small muted">
                        {dateTime(replay.run.created_at)}
                      </span>
                    </div>
                    {replay.run.mode === "CONTROLLED_TEST" && (
                      <Notice>
                        Controlled model fixture. These records are not measured
                        live inference.
                      </Notice>
                    )}
                    {replay.run.status === "UNAVAILABLE" && (
                      <Notice>
                        The investigator integration was unavailable. No model
                        response was fabricated.
                      </Notice>
                    )}
                    <div className="usage-grid">
                      <div>
                        <span>Model turns</span>
                        <strong>
                          {replay.run.model_turns}
                          <small> / 4</small>
                        </strong>
                      </div>
                      <div>
                        <span>Tool calls</span>
                        <strong>
                          {replay.run.tool_calls}
                          <small> / 10</small>
                        </strong>
                      </div>
                      <div>
                        <span>Active time</span>
                        <strong>
                          {replay.run.active_duration_ms}
                          <small> ms</small>
                        </strong>
                      </div>
                    </div>
                    <p className="small muted">
                      {replay.run.model_id ?? "No model configured"} ·{" "}
                      {replay.run.model_turns === 0
                        ? "No model calls"
                        : replay.run.input_tokens === null ||
                            replay.run.output_tokens === null
                          ? "Token usage unknown"
                          : replay.run.input_tokens +
                            " input / " +
                            replay.run.output_tokens +
                            " output tokens"}
                    </p>
                    {Array.isArray(unresolved) && unresolved.length > 0 && (
                      <div className="hold-box">
                        <h3>Unresolved issues</h3>
                        <ul>
                          {unresolved.map((issue, i) => (
                            <li key={i}>
                              {typeof issue === "string"
                                ? issue
                                : JSON.stringify(issue)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {replay.findings.length > 0 && (
                      <div className="stack">
                        <h3>Evidence-linked findings</h3>
                        {replay.findings.map((finding, i) => (
                          <article className="finding" key={i}>
                            <Badge value={finding.kind} />
                            <p>{finding.text}</p>
                            <pre>
                              {JSON.stringify(
                                json(finding.references_json),
                                null,
                                2,
                              )}
                            </pre>
                          </article>
                        ))}
                      </div>
                    )}
                    {replay.evidence.length > 0 && (
                      <div className="stack">
                        <h3>Retrieved source passages</h3>
                        {replay.evidence.map((e) => (
                          <Evidence key={e.evidence_id} value={e.record_json} />
                        ))}
                      </div>
                    )}
                    <details className="recorded-events">
                      <summary>{replay.events.length} recorded events</summary>
                      {replay.events.map((event) => (
                        <details key={event.sequence} className="event-detail">
                          <summary>
                            <span>{label(event.kind)}</span>
                            <time>{dateTime(event.created_at)}</time>
                          </summary>
                          <pre tabIndex={0} aria-label="Recorded event payload">
                            {JSON.stringify(json(event.data_json), null, 2)}
                          </pre>
                        </details>
                      ))}
                    </details>
                  </div>
                )
              )}
            </>
          ) : (
            <Empty title="No saved run to replay">
              Start an investigation from the review view. This screen only
              reads its stored history.
            </Empty>
          )}
        </section>
      )}
      <section className="panel replay-audit">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">RECORDED HISTORY</p>
            <h2>
              {actor.role === "CUSTOMER"
                ? "Your request history"
                : "Audit events"}
            </h2>
          </div>
          <Icon name="replay" />
        </div>
        {actor.role === "CUSTOMER" ? (
          <ol className="timeline">
            <li>
              <span className="timeline-dot" />
              <div>
                <h3>Request version recorded</h3>
                <time>{dateTime(data.request.created_at)}</time>
              </div>
            </li>
            {data.receipt && (
              <li>
                <span className="timeline-dot" />
                <div>
                  <h3>Exact confirmation recorded</h3>
                  <time>{dateTime(data.receipt.createdAt)}</time>
                </div>
              </li>
            )}
          </ol>
        ) : data.auditEvents?.length ? (
          <ol className="timeline">
            {data.auditEvents.map((event) => (
              <li key={event.id}>
                <span className="timeline-dot" />
                <div>
                  <h3>{label(event.event)}</h3>
                  <time>{dateTime(event.created_at)}</time>
                  <details>
                    <summary>Record details</summary>
                    <pre>
                      {JSON.stringify(json(event.detail_json), null, 2)}
                    </pre>
                  </details>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty title="No audit event stored">
            Events appear here when a request is confirmed, reviewed or
            processed.
          </Empty>
        )}
        <p className="small muted record-footer">
          Times shown in Malaysia time (UTC+8).
        </p>
      </section>
      <aside className="replay-truth">
        <Icon name="lock" size={17} />
        <div>
          <strong>Truthful by construction</strong>
          <p>
            Status text is derived from stored records and observations. This
            view makes no claim about an unobserved provider effect.
          </p>
        </div>
      </aside>
    </div>
  );
}

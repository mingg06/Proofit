import { useEffect, useState } from "react";
import type {
  Actor,
  Case,
  RequestRow,
  Resource,
} from "../../../packages/contracts/console.ts";
import { api, ApiError, errorText } from "./api.ts";
import { useMutation } from "./forms.tsx";
import { RequestView } from "./RequestView.tsx";
import { ReviewView } from "./ReviewView.tsx";
import { ReplayView } from "./ReplayView.tsx";
import { Badge, Empty, Icon, Modal, Notice, Skeleton } from "./ui.tsx";
import { dateTime, shortId } from "./format.ts";
import { href, navigate, useRoute, type View } from "./routing.ts";
const views: {
  key: View;
  label: string;
  icon: string;
  title: string;
  description: string;
}[] = [
  {
    key: "request",
    label: "Requests",
    icon: "request",
    title: "Intent comes first.",
    description: "An exact request is the foundation of every action.",
  },
  {
    key: "review",
    label: "Investigation & review",
    icon: "review",
    title: "Proof before permission.",
    description:
      "Compare the proposal with confirmed authority and recorded evidence.",
  },
  {
    key: "replay",
    label: "Outcome & replay",
    icon: "replay",
    title: "Only what was observed.",
    description: "Read the recorded outcome and trace how the case reached it.",
  },
];
function Brand() {
  return (
    <a className="brand" href="#/request" aria-label="PROOFIT requests">
      <span className="brand-mark">
        <Icon name="shield" size={25} />
      </span>
      <span>
        PROOFIT<span className="brand-caption">ACTION ASSURANCE</span>
      </span>
    </a>
  );
}
function Login({
  onLogin,
  error: initialError,
}: {
  onLogin: (actor: Actor) => void;
  error: string | null;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const mutation = useMutation();
  return (
    <main className="login">
      <section className="login-story">
        <Brand />
        <div className="login-statement">
          <p className="eyebrow">VERIFY BEFORE IT HAPPENS</p>
          <h1>
            Your intent.
            <br />
            Every action.
            <br />
            <em>Accounted for.</em>
          </h1>
          <p>
            Confirm the request. Examine the evidence. Trust the recorded
            outcome.
          </p>
        </div>
        <div className="login-principles">
          <div>
            <span>01</span>Exact customer intent
          </div>
          <div>
            <span>02</span>Deterministic authority
          </div>
          <div>
            <span>03</span>Observation-backed outcomes
          </div>
        </div>
        <p className="login-foot">
          SUBSCRIPTIONS & REFUNDS · STRIPE TEST ENVIRONMENT
        </p>
      </section>
      <section className="login-form-wrap">
        <div className="login-form">
          <Badge value="TEST">Local test workspace</Badge>
          <h2>Welcome to the console.</h2>
          <p className="muted">
            Sign in with your workspace account to review subscription actions.
          </p>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void mutation.run(async () => {
                const actor = await api.login(email, password);
                setPassword("");
                onLogin(actor);
              });
            }}
          >
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {(mutation.error || initialError) && (
              <Notice error>{mutation.error ?? initialError}</Notice>
            )}
            <button className="button primary" disabled={mutation.busy}>
              {mutation.busy ? "Signing in…" : "Sign in"}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <p className="small muted">
            Need access? Ask your workspace administrator for an account.
          </p>
          <div className="login-safety">
            <Icon name="lock" size={17} />
            <span>Provider execution is disabled in this workspace.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
export function App() {
  const [actor, setActor] = useState<Actor | null>(null),
    [boot, setBoot] = useState(true),
    [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    api
      .session()
      .then((actor) => {
        if (alive) setActor(actor);
      })
      .catch((error) => {
        if (alive && !(error instanceof ApiError && error.status === 401))
          setError(errorText(error));
      })
      .finally(() => {
        if (alive) setBoot(false);
      });
    const end = () => {
      setActor(null);
      setBoot(false);
      navigate("request");
    };
    window.addEventListener("proofit:session-ended", end);
    return () => {
      alive = false;
      window.removeEventListener("proofit:session-ended", end);
    };
  }, []);
  if (boot)
    return (
      <main className="boot">
        <Icon name="shield" size={40} />
        <p>Opening your workspace…</p>
      </main>
    );
  return actor ? (
    <Workspace
      key={actor.id}
      actor={actor}
      onLogout={() => {
        setActor(null);
        navigate("request");
      }}
    />
  ) : (
    <Login
      onLogin={(actor) => {
        setError(null);
        setActor(actor);
      }}
      error={error}
    />
  );
}
function Workspace({
  actor,
  onLogout,
}: {
  actor: Actor;
  onLogout: () => void;
}) {
  const route = useRoute();
  const [requests, setRequests] = useState<RequestRow[]>([]),
    [resources, setResources] = useState<Resource[]>([]),
    [data, setData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true),
    [caseLoading, setCaseLoading] = useState(false),
    [error, setError] = useState<string | null>(null),
    [caseError, setCaseError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0),
    [search, setSearch] = useState(""),
    [creating, setCreating] = useState(false),
    [newText, setNewText] = useState("");
  const mutation = useMutation();
  const activeView = views.find((view) => view.key === route.view)!;
  const refresh = () => setRevision((v) => v + 1);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      api.requests(controller.signal),
      api.resources(controller.signal),
    ])
      .then(([requests, resources]) => {
        if (controller.signal.aborted) return;
        setRequests(requests);
        setResources(resources);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    setData(null);
    setCaseError(null);
    if (!route.id) {
      setCaseLoading(false);
      return;
    }
    const controller = new AbortController();
    setCaseLoading(true);
    api
      .case(route.id, route.version, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setCaseError(errorText(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCaseLoading(false);
      });
    return () => controller.abort();
  }, [route.id, route.version, revision]);
  const latest = new Map<string, RequestRow>();
  for (const row of requests)
    if (!latest.has(row.id) || latest.get(row.id)!.version < row.version)
      latest.set(row.id, row);
  const list = [...latest.values()].filter((row) =>
    [row.id, row.original_text].some((value) =>
      value.toLowerCase().includes(search.toLowerCase()),
    ),
  );
  const versions = requests
    .filter((r) => r.id === route.id)
    .map((r) => r.version)
    .sort((a, b) => b - a);
  if (data && !versions.includes(data.request.version))
    versions.push(data.request.version);
  const synthetic = resources.some(
    (resource) => resource.provenance === "FIXTURE",
  );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#workspace-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("workspace-content");
          main?.focus({ preventScroll: true });
          main?.scrollIntoView({ block: "start" });
        }}
      >
        Skip to workspace
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">
          <span className="status-dot" /> LOCAL WORKSPACE
        </div>
        <nav aria-label="Console views">
          {views
            .filter(
              (view) => actor.role !== "CUSTOMER" || view.key !== "review",
            )
            .map((view) => (
              <a
                key={view.key}
                href={href(view.key, route.id, route.version)}
                className={
                  "nav-link " + (route.view === view.key ? "active" : "")
                }
                aria-current={route.view === view.key ? "page" : undefined}
              >
                <Icon name={view.icon} />
                {view.label}
                {route.view === view.key && <span className="nav-indicator" />}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Icon name="shield" size={22} />
            <p>
              AI gathers evidence.
              <br />
              Code enforces authority.
              <br />
              People confirm intent.
            </p>
          </div>
          <div className="account">
            <span className="avatar">
              {actor.role === "CUSTOMER"
                ? "CU"
                : actor.role === "SUPPORT"
                  ? "SU"
                  : "RA"}
            </span>
            <div>
              <strong>
                {actor.role === "REFUND_APPROVER"
                  ? "Refund approver"
                  : actor.role === "SUPPORT"
                    ? "Support staff"
                    : "Customer"}
              </strong>
              <span className="mono" title={actor.tenant_id}>
                {shortId(actor.tenant_id)}
              </span>
            </div>
            <button
              className="icon-button"
              title="Sign out"
              aria-label="Sign out"
              disabled={mutation.busy}
              onClick={() => void mutation.run(() => api.logout(), onLogout)}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="muted">Console</span>
            <span className="slash">/</span>
            <strong>{activeView.label}</strong>
          </div>
          <div className="topbar-state">
            <span className="connection">
              <span className="status-dot" />
              {error ? "Connection issue" : "Authenticated workspace"}
            </span>
            <Badge value="TEST">
              {synthetic ? "Synthetic records" : "Test environment"}
            </Badge>
          </div>
        </header>
        <main id="workspace-content" className="workspace" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <p className="eyebrow">SUBSCRIPTION ACTION CONTROL</p>
              <h1>{activeView.title}</h1>
              <p>{activeView.description}</p>
            </div>
            <div className="page-actions">
              <button
                className="button secondary"
                onClick={refresh}
                disabled={loading || caseLoading}
                aria-label="Refresh records"
              >
                <Icon name="refresh" size={17} />
                Refresh
              </button>
              {actor.role === "CUSTOMER" && (
                <button
                  className="button primary"
                  onClick={() => setCreating(true)}
                >
                  <Icon name="plus" size={17} />
                  New request
                </button>
              )}
            </div>
          </div>
          <div className="environment-strip">
            <Icon name="lock" size={15} />
            <span>
              Test workspace. Provider writes are disabled; displayed decisions
              and outcomes come from stored backend records.
            </span>
          </div>
          {mutation.error && <Notice error>{mutation.error}</Notice>}
          {error && (
            <Notice error>
              {error}{" "}
              <button className="text-button" onClick={refresh}>
                Retry connection
              </button>
            </Notice>
          )}
          <div className="case-layout">
            <section className="case-queue" aria-label="Request queue">
              <div className="queue-heading">
                <h2>Request queue</h2>
                <span className="count">{latest.size}</span>
              </div>
              <label className="search-field">
                <span className="sr-only">Search requests</span>
                <Icon name="search" size={17} />
                <input
                  type="search"
                  placeholder="Search requests"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {loading && requests.length === 0 ? (
                <Skeleton />
              ) : list.length ? (
                <div className="queue-list">
                  {list.map((row) => (
                    <button
                      className={
                        "queue-item " + (route.id === row.id ? "selected" : "")
                      }
                      key={row.id}
                      onClick={() => navigate(route.view, row.id, row.version)}
                      aria-pressed={route.id === row.id}
                    >
                      <span className="queue-item-head">
                        <Icon name="request" size={17} />
                        <span>v{row.version}</span>
                      </span>
                      <strong>{row.original_text}</strong>
                      <span className="queue-item-meta">
                        <span className="mono">{shortId(row.id)}</span>
                        <span>{dateTime(row.created_at)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="queue-empty">
                  <p>{search ? "No matching requests." : "No requests yet."}</p>
                  {search ? (
                    <button
                      className="text-button"
                      onClick={() => setSearch("")}
                    >
                      Clear search
                    </button>
                  ) : (
                    actor.role === "CUSTOMER" && (
                      <button
                        className="text-button"
                        onClick={() => setCreating(true)}
                      >
                        Create a request
                      </button>
                    )
                  )}
                </div>
              )}
              <div className="queue-footer">
                <Icon name="lock" size={13} />
                <span>Scoped to your account</span>
              </div>
            </section>
            <div className="case-detail">
              {caseLoading ? (
                <Skeleton />
              ) : caseError ? (
                <>
                  <Notice error>{caseError}</Notice>
                  <button className="button secondary" onClick={refresh}>
                    Retry request
                  </button>
                </>
              ) : data ? (
                <>
                  <div className="case-context">
                    <div>
                      <span className="eyebrow">REQUEST</span>
                      <span className="mono" title={data.request.id}>
                        {shortId(data.request.id)}
                      </span>
                    </div>
                    <label className="version-picker">
                      Version
                      <select
                        aria-label="Request version"
                        value={data.request.version}
                        onChange={(e) =>
                          navigate(
                            route.view,
                            data.request.id,
                            Number(e.target.value),
                          )
                        }
                      >
                        {versions.map((version) => (
                          <option value={version} key={version}>
                            {version}
                            {version === data.latestVersion ? " · latest" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {route.view === "request" ? (
                    <RequestView
                      key={data.request.id + ":" + data.request.version}
                      data={data}
                      actor={actor}
                      resources={resources}
                      onRefresh={refresh}
                    />
                  ) : route.view === "review" ? (
                    <ReviewView
                      key={data.request.id + ":" + data.request.version}
                      data={data}
                      actor={actor}
                      resources={resources}
                      onRefresh={refresh}
                    />
                  ) : (
                    <ReplayView
                      key={data.request.id + ":" + data.request.version}
                      data={data}
                      actor={actor}
                    />
                  )}
                </>
              ) : (
                <section className="panel welcome-panel">
                  <span className="welcome-mark">
                    <Icon name="shield" size={40} />
                  </span>
                  <p className="eyebrow">A CLEAR PATH FROM INTENT TO OUTCOME</p>
                  <h2>Start with a request.</h2>
                  <p>
                    Select a request from the queue to inspect its exact intent,
                    review recorded checks, and follow the observed outcome.
                  </p>
                  <div className="welcome-steps">
                    <span>
                      <b>01</b> Confirm
                    </span>
                    <Icon name="arrow" size={16} />
                    <span>
                      <b>02</b> Review
                    </span>
                    <Icon name="arrow" size={16} />
                    <span>
                      <b>03</b> Observe
                    </span>
                  </div>
                  {actor.role === "CUSTOMER" && (
                    <button
                      className="button primary"
                      onClick={() => setCreating(true)}
                    >
                      Create a request
                      <Icon name="plus" size={17} />
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
          <footer className="workspace-footer">
            <span>PROOFIT · Verify the action before it happens.</span>
            <span>MYR / STRIPE TEST MODE</span>
          </footer>
        </main>
      </div>
      {creating && (
        <Modal
          title="Create a request"
          onClose={() => {
            if (!mutation.busy) setCreating(false);
          }}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void mutation.run(async () => {
                const row = await api.create(newText);
                setCreating(false);
                setNewText("");
                refresh();
                navigate("request", row.id, row.version);
              });
            }}
          >
            <div className="field">
              <label htmlFor="new-request-text">
                What would you like to change?
              </label>
              <textarea
                id="new-request-text"
                rows={5}
                required
                maxLength={20000}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="For example: cancel my next renewal, keeping access until the paid period ends."
              />
            </div>
            <p className="small muted">
              You’ll choose and confirm the exact supported action in the next
              step.
            </p>
            {mutation.error && <Notice error>{mutation.error}</Notice>}
            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                disabled={mutation.busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={mutation.busy}
              >
                {mutation.busy ? "Creating…" : "Create request"}
                <Icon name="arrow" size={17} />
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

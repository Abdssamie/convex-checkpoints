import "./App.css";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const userId = "demo-user";

const scenarios = [
  {
    name: "signup",
    label: "Signup",
    payload: () => ({
      userId,
      email: "demo@convex.dev",
      source: "debug-panel",
    }),
  },
  {
    name: "create_post",
    label: "Create Post",
    payload: () => ({
      userId,
      postId: crypto.randomUUID().slice(0, 8),
      title: `Post ${new Date().toLocaleTimeString()}`,
    }),
  },
  {
    name: "profile_completed",
    label: "Complete Profile",
    payload: () => ({
      userId,
      fields: ["name", "avatar", "timezone", "bio"],
    }),
  },
] as const;

type ScenarioName = (typeof scenarios)[number]["name"];
type ProgressItem = {
  _id: string;
  factor: string;
  value: number;
  updatedAt: number;
};

type RuleItem = {
  _id: string;
  name: string;
  factor: string;
  threshold: number;
  actionName: string;
  updatedAt: number;
};

const defaultSiteUrl =
  import.meta.env.VITE_CONVEX_SITE_URL ||
  import.meta.env.VITE_CONVEX_URL?.replace(".convex.cloud", ".convex.site") ||
  "";
const defaultHttpEndpoint = defaultSiteUrl ? `${defaultSiteUrl}/checkpoints` : "";

function App() {
  const submitPostCreated = useMutation(api.example.submitPostCreated);
  const submitSignup = useMutation(api.example.submitSignup);
  const submitProfileCompleted = useMutation(
    api.example.submitProfileCompleted,
  );
  const resetDebug = useMutation(api.example.resetDebug);
  const progress = useQuery(api.example.listProgressForUser, {
    userId,
    limit: 30,
  });
  const actions = useQuery(api.example.listDebugActions, { userId, limit: 30 });
  const stats = useQuery(api.example.getStats, { userId });
  const rules = useQuery(api.example.listRules, {});

  const [selected, setSelected] = useState<ScenarioName>("create_post");
  const [manualPayload, setManualPayload] = useState(() =>
    pretty(scenarios[1].payload()),
  );
  const [lastResult, setLastResult] = useState("Idle");
  const [busy, setBusy] = useState(false);
  const [triggerMode, setTriggerMode] = useState<"mutation" | "http">(
    "mutation",
  );
  const [httpEndpoint, setHttpEndpoint] = useState(defaultHttpEndpoint);
  const [authToken, setAuthToken] = useState(
    import.meta.env.VITE_CHECKPOINTS_SECRET || "checkpoint-secret",
  );

  const selectedScenario = scenarios.find((item) => item.name === selected)!;

  async function submitViaHttp(factor: string, payload: Record<string, unknown>) {
    if (!httpEndpoint) {
      throw new Error("HTTP Endpoint is required");
    }

    const url = httpEndpoint.endsWith("/")
      ? `${httpEndpoint}${factor}`
      : `${httpEndpoint}/${factor}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const body = {
      userId,
      ...payload,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // ignore JSON parse errors, fallback to text
      }
      const errMsg = errorJson?.error || errorText || response.statusText;
      throw new Error(`HTTP ${response.status}: ${errMsg}`);
    }

    const data = await response.json();
    return `http: HTTP 202: ${JSON.stringify(data)}`;
  }

  async function fireScenario(name: ScenarioName) {
    setBusy(true);
    try {
      const scenario = scenarios.find((item) => item.name === name)!;
      const payload = scenario.payload();
      if (triggerMode === "http") {
        const result = await submitViaHttp(name, payload);
        setLastResult(result);
      } else {
        const result = await submitByName(name, payload);
        setLastResult(`mutation: ${result}`);
      }
    } catch (error) {
      setLastResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitManual() {
    setBusy(true);
    try {
      const payload = JSON.parse(manualPayload) as Record<string, unknown>;
      if (triggerMode === "http") {
        const result = await submitViaHttp(selected, payload);
        setLastResult(result);
      } else {
        const result = await submitByName(selected, payload);
        setLastResult(`mutation: ${result}`);
      }
    } catch (error) {
      setLastResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function loadScenario(name: ScenarioName) {
    const scenario = scenarios.find((item) => item.name === name)!;
    setSelected(name);
    setManualPayload(pretty(scenario.payload()));
  }

  async function submitByName(name: string, payload: Record<string, unknown>) {
    switch (name) {
      case "signup":
        return await submitSignup({
          userId,
          email: String(payload.email),
          source: String(payload.source),
        });
      case "create_post":
        return await submitPostCreated({
          userId,
          postId: String(payload.postId),
          title: String(payload.title),
        });
      case "profile_completed":
        return await submitProfileCompleted({
          userId,
          fields: Array.isArray(payload.fields)
            ? payload.fields.map(String)
            : [],
        });
      default:
        throw new Error(`No typed mutation configured for ${name}`);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Convex Checkpoints Debugger</p>
          <h1>Checkpoint flow workbench</h1>
        </div>
      </header>

      <section className="metrics">
        <Metric label="Posts" value={stats?.postsCreated ?? 0} />
        <Metric label="Credits" value={stats?.credits ?? 0} />
        <Metric
          label="Profile"
          value={stats?.profileCompleted ? "complete" : "open"}
        />
        <Metric label="Actions" value={actions?.length ?? 0} />
      </section>

      <section className="workspace">
        {/* Column 1: Submit Checkpoint (Primary Input) */}
        <div className="panel composer">
          <div className="panelHeader">
            <h2>Submit Checkpoint</h2>
          </div>

          <div className="field">
            <span>Trigger Mode</span>
            <div className="segmented">
              <button
                type="button"
                className={triggerMode === "mutation" ? "active" : ""}
                onClick={() => setTriggerMode("mutation")}
              >
                Mutation
              </button>
              <button
                type="button"
                className={triggerMode === "http" ? "active" : ""}
                onClick={() => setTriggerMode("http")}
              >
                HTTP POST
              </button>
            </div>
          </div>

          {triggerMode === "http" && (
            <>
              <label className="field">
                <span>HTTP Endpoint</span>
                <input
                  type="text"
                  value={httpEndpoint}
                  onChange={(e) => setHttpEndpoint(e.target.value)}
                  placeholder="https://.../checkpoints"
                />
              </label>
              <label className="field">
                <span>Auth Token</span>
                <input
                  type="text"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Bearer token"
                />
                <p className="fieldHelp">
                  Demo purposes only. Secrets should not be exposed or managed on the client side in real production applications.
                </p>
              </label>
            </>
          )}

          <div className="quickGrid">
            {scenarios.map((scenario) => (
              <button
                key={scenario.name}
                className="scenario"
                onClick={() => fireScenario(scenario.name)}
                disabled={busy}
              >
                <span>{scenario.label}</span>
                <code>{scenario.name}</code>
              </button>
            ))}
          </div>

          <label className="field">
            <span>Checkpoint</span>
            <select
              value={selected}
              onChange={(change) =>
                loadScenario(change.target.value as ScenarioName)
              }
            >
              {scenarios.map((scenario) => (
                <option key={scenario.name} value={scenario.name}>
                  {scenario.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Payload</span>
            <textarea
              value={manualPayload}
              onChange={(change) => setManualPayload(change.target.value)}
              spellCheck={false}
            />
          </label>

          <button
            className="button primary"
            onClick={submitManual}
            disabled={busy}
          >
            Send {selectedScenario.label}
          </button>

          <div className="result">
            <span>Last result</span>
            <code>{lastResult}</code>
          </div>
        </div>

        {/* Column 2: Checkpoint Rules (X -> Y visualization) */}
        <div className="panel">
          <div className="panelHeader">
            <h2>Checkpoint Rules</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <button
                className="button ghost"
                style={{
                  height: "30px",
                  minHeight: "30px",
                  padding: "0 10px",
                  fontSize: "11px",
                  textTransform: "uppercase",
                }}
                onClick={() => resetDebug({ userId })}
                disabled={busy}
              >
                Reset Debug
              </button>
              <span>
                {rules === undefined ? "loading" : `${rules.length} rules`}
              </span>
            </div>
          </div>
          <div className="rulesList" style={{ maxHeight: "600px" }}>
            {rules?.map((rule: RuleItem) => {
              const progressVal = progress?.find((p: ProgressItem) => p.factor === rule.factor)?.value ?? 0;
              const percent = Math.min(100, Math.max(0, (progressVal / rule.threshold) * 100));
              const isCompleted = progressVal >= rule.threshold;
              return (
                <div key={rule._id} className="ruleRow">
                  <div className="ruleRowHeader">
                    <strong>{rule.name}</strong>
                    <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", color: isCompleted ? "#709000" : "#6a766e" }}>
                      {isCompleted ? "Completed" : "Active"}
                    </span>
                  </div>
                  <div className="ruleFormula">
                    <code className="formulaPart when">{rule.factor} &gt;= {rule.threshold}</code>
                    <span style={{ color: "#1d2a25", fontWeight: "bold" }}>➔</span>
                    <code className="formulaPart then">{rule.actionName}</code>
                  </div>
                  <div className="progressTracker">
                    <div className="progressTrackerHeader">
                      <span>Progress: {progressVal} / {rule.threshold}</span>
                      <span>{percent.toFixed(0)}%</span>
                    </div>
                    <div className="progressBarContainer">
                      <div
                        className={`progressBar ${isCompleted ? "completed" : ""}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Column 3: System Logs & Timeline (Stacked) */}
        <div className="workspaceColumn">
          <div className="panel">
            <div className="panelHeader">
              <h2>Handler Actions</h2>
              <span>
                {actions === undefined ? "loading" : `${actions.length} rows`}
              </span>
            </div>
            <div className="timeline" style={{ maxHeight: "250px" }}>
              {actions?.map((action) => (
                <article key={action._id} className="row actionRow">
                  <div>
                    <strong>{action.action}</strong>
                    <p>{action.detail}</p>
                  </div>
                  <div className="rowMeta">
                    <span>{action.status}</span>
                    <code>{action.checkpointName}</code>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="panel checkpointLog">
            <div className="panelHeader">
              <h2>Progress Log</h2>
              <span>
                {progress === undefined
                  ? "loading"
                  : `${progress.length} rows`}
              </span>
            </div>
            <div className="timeline" style={{ maxHeight: "250px" }}>
              {progress?.map((item: ProgressItem) => (
                <article key={item._id} className="row checkpointRow">
                  <div>
                    <strong>{item.factor}</strong>
                    <pre>{JSON.stringify({ value: item.value }, null, 2)}</pre>
                  </div>
                  <time>{new Date(item.updatedAt).toLocaleTimeString()}</time>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric(props: { label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export default App;

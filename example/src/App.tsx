import "./App.css";
import { useMemo, useState } from "react";
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

  const [selected, setSelected] = useState<ScenarioName>("create_post");
  const [manualPayload, setManualPayload] = useState(() =>
    pretty(scenarios[1].payload()),
  );
  const [transport, setTransport] = useState<"mutation" | "http">("mutation");
  const [lastResult, setLastResult] = useState("Idle");
  const [busy, setBusy] = useState(false);

  const siteUrl = useMemo(() => {
    const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "";
    return convexUrl.replace(".convex.cloud", ".convex.site");
  }, []);
  const checkpointsSecret =
    import.meta.env.VITE_CHECKPOINTS_SECRET ?? "checkpoint-secret";

  const selectedScenario = scenarios.find((item) => item.name === selected)!;

  async function fireScenario(name: ScenarioName) {
    const scenario = scenarios.find((item) => item.name === name)!;
    await submitCheckpoint(name, scenario.payload());
  }

  async function submitManual() {
    const payload = JSON.parse(manualPayload) as Record<string, unknown>;
    await submitCheckpoint(selected, payload);
  }

  async function submitCheckpoint(
    name: string,
    payload: Record<string, unknown>,
  ) {
    setBusy(true);
    try {
      if (transport === "http") {
        const response = await fetch(`${siteUrl}/checkpoints/${name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${checkpointsSecret}`,
          },
          body: JSON.stringify({
            ...payload,
          }),
        });
        const body = await response.json();
        setLastResult(`HTTP ${response.status}: ${JSON.stringify(body)}`);
      } else {
        const checkpointId = await submitByName(name, payload);
        setLastResult(`mutation: ${checkpointId}`);
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
        <button
          className="button ghost"
          onClick={() => resetDebug({ userId })}
          disabled={busy}
        >
          Reset Debug
        </button>
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
        <div className="panel composer">
          <div className="panelHeader">
            <h2>Submit Checkpoint</h2>
            <div className="segmented">
              <button
                className={transport === "mutation" ? "active" : ""}
                onClick={() => setTransport("mutation")}
              >
                Mutation
              </button>
              <button
                className={transport === "http" ? "active" : ""}
                onClick={() => setTransport("http")}
              >
                HTTP
              </button>
            </div>
          </div>

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

        <div className="panel">
          <div className="panelHeader">
            <h2>Handler Actions</h2>
            <span>
              {actions === undefined ? "loading" : `${actions.length} rows`}
            </span>
          </div>
          <div className="timeline">
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
            <h2>Progress</h2>
            <span>
              {progress === undefined
                ? "loading"
                : `${progress.length} rows`}
            </span>
          </div>
          <div className="timeline">
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

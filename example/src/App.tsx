import "./App.css";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

const userId = "demo-user";

const scenarios = [
  {
    name: "user.signup",
    label: "Signup",
    payload: () => ({
      userId,
      email: "demo@convex.dev",
      source: "debug-panel",
    }),
  },
  {
    name: "post.created",
    label: "Create Post",
    payload: () => ({
      userId,
      postId: crypto.randomUUID().slice(0, 8),
      title: `Post ${new Date().toLocaleTimeString()}`,
    }),
  },
  {
    name: "profile.completed",
    label: "Complete Profile",
    payload: () => ({
      userId,
      fields: ["name", "avatar", "timezone", "bio"],
    }),
  },
  {
    name: "billing.upgraded",
    label: "Upgrade Plan",
    payload: () => ({
      userId,
      plan: "team",
    }),
  },
] as const;

type ScenarioName = (typeof scenarios)[number]["name"];

function App() {
  const submitPostCreated = useMutation(api.example.submitPostCreated);
  const submitSignup = useMutation(api.example.submitSignup);
  const submitProfileCompleted = useMutation(api.example.submitProfileCompleted);
  const resetDebug = useMutation(api.example.resetDebug);
  const events = useQuery(api.example.listByUser, { userId, limit: 30 });
  const actions = useQuery(api.example.listDebugActions, { userId, limit: 30 });
  const stats = useQuery(api.example.getStats, { userId });

  const [selected, setSelected] = useState<ScenarioName>("post.created");
  const [manualPayload, setManualPayload] = useState(() =>
    pretty(scenarios[1].payload()),
  );
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [transport, setTransport] = useState<"mutation" | "http">("mutation");
  const [lastResult, setLastResult] = useState("Idle");
  const [busy, setBusy] = useState(false);

  const siteUrl = useMemo(() => {
    const convexUrl = import.meta.env.VITE_CONVEX_URL ?? "";
    return convexUrl.replace(".convex.cloud", ".convex.site");
  }, []);

  const selectedScenario = scenarios.find((item) => item.name === selected)!;

  async function fireScenario(name: ScenarioName) {
    const scenario = scenarios.find((item) => item.name === name)!;
    await submitEvent(name, scenario.payload());
  }

  async function submitManual() {
    const payload = JSON.parse(manualPayload) as Record<string, unknown>;
    await submitEvent(selected, payload);
  }

  async function submitEvent(name: string, payload: Record<string, unknown>) {
    setBusy(true);
    try {
      if (transport === "http") {
        const response = await fetch(`${siteUrl}/events/${name}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...payload,
            idempotencyKey: idempotencyKey || undefined,
          }),
        });
        const body = await response.json();
        setLastResult(`HTTP ${response.status}: ${JSON.stringify(body)}`);
      } else {
        const eventId = await submitByName(name, payload);
        setLastResult(`mutation: ${eventId}`);
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
      case "user.signup":
        return await submitSignup({
          userId,
          email: String(payload.email),
          source: String(payload.source),
          idempotencyKey: idempotencyKey || undefined,
        });
      case "post.created":
        return await submitPostCreated({
          userId,
          postId: String(payload.postId),
          title: String(payload.title),
          idempotencyKey: idempotencyKey || undefined,
        });
      case "profile.completed":
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
          <h1>Event flow workbench</h1>
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
            <h2>Submit Event</h2>
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
            <span>Event</span>
            <select
              value={selected}
              onChange={(event) => loadScenario(event.target.value as ScenarioName)}
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
              onChange={(event) => setManualPayload(event.target.value)}
              spellCheck={false}
            />
          </label>

          <label className="field">
            <span>Idempotency key</span>
            <input
              value={idempotencyKey}
              onChange={(event) => setIdempotencyKey(event.target.value)}
              placeholder={`${selected}:demo`}
            />
          </label>

          <button className="button primary" onClick={submitManual} disabled={busy}>
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
            <span>{actions === undefined ? "loading" : `${actions.length} rows`}</span>
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
                  <code>{action.eventName}</code>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel eventLog">
          <div className="panelHeader">
            <h2>Stored Events</h2>
            <span>{events === undefined ? "loading" : `${events.length} rows`}</span>
          </div>
          <div className="timeline">
            {events?.map((event) => (
              <article key={event._id} className="row eventRow">
                <div>
                  <strong>{event.name}</strong>
                  <pre>{JSON.stringify(event.payload ?? null, null, 2)}</pre>
                </div>
                <time>{new Date(event.receivedAt).toLocaleTimeString()}</time>
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

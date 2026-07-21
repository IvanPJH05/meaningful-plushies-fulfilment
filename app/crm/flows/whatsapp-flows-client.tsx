"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./whatsapp-flows.module.css";

type WhatsAppFlow = {
  id: string;
  name: string;
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  steps: string[];
  updatedAt: string;
};

type ActionType = "Send Message" | "AI Reply" | "Update Status" | "Add Note";
type DelayUnit = "seconds" | "minutes" | "hours" | "days";

type FlowAction = {
  id: string;
  type: ActionType;
  delayValue: string;
  delayUnit: DelayUnit;
  message: string;
};

type FlowForm = {
  name: string;
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  actions: FlowAction[];
};

const actionTypes: ActionType[] = ["Send Message", "AI Reply", "Update Status", "Add Note"];
const delayUnits: DelayUnit[] = ["seconds", "minutes", "hours", "days"];

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeAction(action?: Partial<FlowAction>): FlowAction {
  return {
    id: makeId(),
    type: action?.type || "Send Message",
    delayValue: action?.delayValue ?? "0",
    delayUnit: action?.delayUnit || "minutes",
    message: action?.message || "",
  };
}

function emptyFlowForm(): FlowForm {
  return {
    name: "",
    trigger: "",
    description: "",
    status: "Draft",
    actions: [makeAction()],
  };
}

const starterTemplates: FlowForm[] = [
  {
    name: "New customer details",
    trigger: "interested, price, details",
    description: "Ask for plushie details after a customer shows interest.",
    status: "Draft",
    actions: [
      makeAction({
        delayValue: "0",
        message: [
          "Hi! Can I get the plushie details?",
          "Name:",
          "Gender:",
          "Birth date:",
          "Birth place:",
          "Favourite person:",
          "Belongs to:",
          "Meaningful note:",
        ].join("\n"),
      }),
      makeAction({
        delayValue: "20",
        delayUnit: "minutes",
        message: "Just checking in. Once you send the details, I can prepare the next step for your plushie.",
      }),
    ],
  },
  {
    name: "Payment received",
    trigger: "paid, payment done, transfer",
    description: "Confirm payment and tell the customer the Shopify details link is coming.",
    status: "Draft",
    actions: [
      makeAction({
        delayValue: "0",
        message: "Payment received, thank you! I will send the Shopify link for you to fill in the plushie details.",
      }),
    ],
  },
  {
    name: "Checking order",
    trigger: "tracking, order, update",
    description: "Use this when you need time to check an order.",
    status: "Draft",
    actions: [
      makeAction({
        delayValue: "0",
        message: "I am checking this for you now. I will update you here once I have confirmed it.",
      }),
      makeAction({
        delayValue: "30",
        delayUnit: "minutes",
        message: "If there is no update yet, remind the team to check this order manually.",
        type: "Add Note",
      }),
    ],
  },
];

function normaliseActionType(value: string): ActionType {
  return actionTypes.find((type) => type.toLowerCase() === value.trim().toLowerCase()) || "Send Message";
}

function normaliseDelayUnit(value: string): DelayUnit {
  return delayUnits.find((unit) => unit === value.toLowerCase()) || "minutes";
}

function actionFromStep(step: string): FlowAction {
  const trimmed = step.trim();
  const delayedMatch = trimmed.match(/^Wait\s+(\d+)\s+(seconds|minutes|hours|days),\s+then\s+([^:]+):\s*([\s\S]*)$/i);
  const immediateMatch = trimmed.match(/^Immediately,\s+then\s+([^:]+):\s*([\s\S]*)$/i);

  if (delayedMatch) {
    return makeAction({
      delayValue: delayedMatch[1],
      delayUnit: normaliseDelayUnit(delayedMatch[2]),
      type: normaliseActionType(delayedMatch[3]),
      message: delayedMatch[4].trim(),
    });
  }

  if (immediateMatch) {
    return makeAction({
      delayValue: "0",
      delayUnit: "minutes",
      type: normaliseActionType(immediateMatch[1]),
      message: immediateMatch[2].trim(),
    });
  }

  return makeAction({ message: trimmed });
}

function formFromFlow(flow: WhatsAppFlow): FlowForm {
  return {
    name: flow.name,
    trigger: flow.trigger,
    description: flow.description,
    status: flow.status,
    actions: flow.steps.length ? flow.steps.map(actionFromStep) : [makeAction()],
  };
}

function formatActionStep(action: FlowAction) {
  const message = action.message.trim();
  if (!message) return "";
  const delay = Math.max(0, Number(action.delayValue) || 0);
  const delayText = delay > 0 ? `Wait ${delay} ${action.delayUnit}` : "Immediately";
  return `${delayText}, then ${action.type}: ${message}`;
}

function flowPayloadFromForm(form: FlowForm, id?: string) {
  return {
    id,
    name: form.name.trim(),
    trigger: form.trigger.trim(),
    description: form.description.trim(),
    status: form.status,
    steps: form.actions.map(formatActionStep).filter(Boolean),
  };
}

function cloneTemplate(template: FlowForm): FlowForm {
  return {
    ...template,
    actions: template.actions.map((action) => makeAction(action)),
  };
}

function actionPreview(action: FlowAction) {
  const delay = Math.max(0, Number(action.delayValue) || 0);
  return delay > 0 ? `${delay} ${action.delayUnit}` : "No delay";
}

export default function WhatsAppFlowsClient() {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [form, setForm] = useState<FlowForm>(() => emptyFlowForm());
  const [editingId, setEditingId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadFlows() {
      setLoading(true);
      try {
        const response = await fetch("/api/crm/flows", { cache: "no-store" });
        const result = (await response.json()) as { ok?: boolean; flows?: WhatsAppFlow[]; error?: string };
        if (!response.ok || !result.ok) throw new Error(result.error || "Flows could not be loaded.");
        if (!cancelled) setFlows(result.flows || []);
      } catch (error) {
        if (!cancelled) setNotice(error instanceof Error ? error.message : "Flows could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFlows();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCount = useMemo(() => flows.filter((flow) => flow.status === "Active").length, [flows]);
  const hasUsableAction = useMemo(() => form.actions.some((action) => action.message.trim()), [form.actions]);

  async function saveFlow() {
    if (!form.name.trim() || !hasUsableAction) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/flows", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(flowPayloadFromForm(form, editingId || undefined)),
      });
      const result = (await response.json()) as { ok?: boolean; flow?: WhatsAppFlow; error?: string };
      if (!response.ok || !result.ok || !result.flow) throw new Error(result.error || "Flow could not be saved.");
      setFlows((current) => {
        if (editingId) return current.map((flow) => (flow.id === editingId ? (result.flow as WhatsAppFlow) : flow));
        return [result.flow as WhatsAppFlow, ...current];
      });
      setForm(emptyFlowForm());
      setEditingId("");
      setNotice("Flow saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function editFlow(flow: WhatsAppFlow) {
    setEditingId(flow.id);
    setForm(formFromFlow(flow));
  }

  async function deleteFlow(flowIdToDelete: string) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/flows", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: flowIdToDelete }),
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Flow could not be deleted.");
      setFlows((current) => current.filter((flow) => flow.id !== flowIdToDelete));
      if (editingId === flowIdToDelete) {
        setEditingId("");
        setForm(emptyFlowForm());
      }
      setNotice("Flow deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function updateAction(actionId: string, patch: Partial<FlowAction>) {
    setForm((current) => ({
      ...current,
      actions: current.actions.map((action) => (action.id === actionId ? { ...action, ...patch } : action)),
    }));
  }

  function removeAction(actionId: string) {
    setForm((current) => {
      if (current.actions.length === 1) return current;
      return { ...current, actions: current.actions.filter((action) => action.id !== actionId) };
    });
  }

  function addAction() {
    setForm((current) => ({ ...current, actions: [...current.actions, makeAction({ delayValue: "5" })] }));
  }

  function loadTemplate(template: FlowForm) {
    setEditingId("");
    setForm(cloneTemplate(template));
  }

  return (
    <main className={styles.page}>
      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <a href="/crm/inbox">Inbox</a>
          <a href="/manual-orders">Manual orders</a>
          <a className={styles.railActive} href="/crm/flows">Flows</a>
          <a href="/crm/test-ai">Test AI</a>
          <a href="/crm/setup">Setup</a>
        </aside>

        <section className={styles.builder}>
          <div className={styles.builderHeader}>
            <div>
              <p className={styles.eyebrow}>Flow Builder</p>
              <h1>{editingId ? "Edit flow" : "Create flow"}</h1>
            </div>
            <span>{loading ? "Loading..." : `${flows.length} flows | ${activeCount} active`}</span>
          </div>

          {notice && <div className={styles.notice}>{notice}</div>}

          <div className={styles.templateRow}>
            {starterTemplates.map((template) => (
              <button key={template.name} onClick={() => loadTemplate(template)}>
                {template.name}
              </button>
            ))}
          </div>

          <div className={styles.flowCanvas}>
            <section className={styles.nodeCard}>
              <div className={styles.nodeHeader}>
                <span className={styles.nodeBadge}>Trigger</span>
                <p>Start this flow when a WhatsApp chat matches these conditions.</p>
              </div>

              <div className={styles.formGrid}>
                <label>
                  Flow name
                  <input
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Example: Ask for plushie details"
                  />
                </label>

                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FlowForm["status"] }))}
                  >
                    <option>Draft</option>
                    <option>Active</option>
                  </select>
                </label>
              </div>

              <label>
                Trigger words
                <input
                  value={form.trigger}
                  onChange={(event) => setForm((current) => ({ ...current, trigger: event.target.value }))}
                  placeholder="Example: price, interested, details"
                />
              </label>

              <label>
                Notes
                <input
                  value={form.description}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="What this flow is for"
                />
              </label>
            </section>

            {form.actions.map((action, index) => (
              <div className={styles.actionWrap} key={action.id}>
                <div className={styles.nodeConnector}>Then</div>
                <section className={styles.actionNode}>
                  <div className={styles.actionHeader}>
                    <div>
                      <span className={styles.nodeBadge}>Action {index + 1}</span>
                      <h3>{action.type}</h3>
                    </div>
                    <button className={styles.textButton} onClick={() => removeAction(action.id)} disabled={form.actions.length === 1}>
                      Remove
                    </button>
                  </div>

                  <div className={styles.delayGrid}>
                    <label>
                      Delay
                      <input
                        min="0"
                        type="number"
                        value={action.delayValue}
                        onChange={(event) => updateAction(action.id, { delayValue: event.target.value })}
                      />
                    </label>
                    <label>
                      Time
                      <select
                        value={action.delayUnit}
                        onChange={(event) => updateAction(action.id, { delayUnit: event.target.value as DelayUnit })}
                      >
                        {delayUnits.map((unit) => (
                          <option key={unit} value={unit}>
                            {unit}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Action
                      <select
                        value={action.type}
                        onChange={(event) => updateAction(action.id, { type: event.target.value as ActionType })}
                      >
                        {actionTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label>
                    Message or instruction
                    <textarea
                      value={action.message}
                      onChange={(event) => updateAction(action.id, { message: event.target.value })}
                      placeholder="Write the message, status update, or note for this action."
                      rows={5}
                    />
                  </label>
                </section>
              </div>
            ))}

            <button className={styles.addActionButton} onClick={addAction}>
              Add action
            </button>
          </div>

          <div className={styles.formActions}>
            <button className={styles.primaryButton} onClick={saveFlow} disabled={saving || !form.name.trim() || !hasUsableAction}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create flow"}
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setEditingId("");
                setForm(emptyFlowForm());
              }}
            >
              Clear
            </button>
          </div>
        </section>

        <section className={styles.flowList}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Saved flows</p>
              <h2>Automation library</h2>
            </div>
          </div>

          {flows.map((flow) => (
            <article className={styles.flowCard} key={flow.id}>
              <div className={styles.flowTopline}>
                <div>
                  <h3>{flow.name}</h3>
                  <p>{flow.description || "No notes yet."}</p>
                </div>
                <span className={flow.status === "Active" ? styles.activeBadge : styles.draftBadge}>{flow.status}</span>
              </div>

              <div className={styles.flowMeta}>
                <span>Trigger: {flow.trigger || "Manual only"}</span>
                <strong>{flow.steps.length} actions</strong>
              </div>

              <div className={styles.actionTimeline}>
                {flow.steps.map((step, index) => {
                  const parsed = actionFromStep(step);
                  return (
                    <div className={styles.previewAction} key={`${flow.id}-${index}`}>
                      <span>{actionPreview(parsed)}</span>
                      <div>
                        <strong>{parsed.type}</strong>
                        <p>{parsed.message || step}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className={styles.cardActions}>
                <button onClick={() => editFlow(flow)}>Edit</button>
                <button disabled={saving} onClick={() => void deleteFlow(flow.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}

          {loading && (
            <div className={styles.emptyState}>
              <h3>Loading flows...</h3>
              <p>Your shared WhatsApp flows are loading.</p>
            </div>
          )}

          {!loading && !flows.length && (
            <div className={styles.emptyState}>
              <h3>No flows yet</h3>
              <p>Use a template or create your own WhatsApp sales flow.</p>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

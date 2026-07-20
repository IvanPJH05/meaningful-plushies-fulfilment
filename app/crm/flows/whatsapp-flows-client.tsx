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

type FlowForm = {
  name: string;
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  stepsText: string;
};

const emptyForm: FlowForm = {
  name: "",
  trigger: "",
  description: "",
  status: "Draft",
  stepsText: "",
};

const starterTemplates: FlowForm[] = [
  {
    name: "New customer details",
    trigger: "interested, price, details",
    description: "Ask for plushie details after a customer shows interest.",
    status: "Draft",
    stepsText: [
      "Hi! Can I get the plushie details?",
      "Name:",
      "Gender:",
      "Birth date:",
      "Birth place:",
      "Favourite person:",
      "Belongs to:",
      "Meaningful note:",
    ].join("\n"),
  },
  {
    name: "Payment received",
    trigger: "paid, payment done, transfer",
    description: "Confirm payment and tell the customer the Shopify details link is coming.",
    status: "Draft",
    stepsText: "Payment received, thank you! I will send the Shopify link for you to fill in the plushie details.",
  },
  {
    name: "Checking order",
    trigger: "tracking, order, update",
    description: "Use this when you need time to check an order.",
    status: "Draft",
    stepsText: "I am checking this for you now. I will update you here once I have confirmed it.",
  },
];

function formFromFlow(flow: WhatsAppFlow): FlowForm {
  return {
    name: flow.name,
    trigger: flow.trigger,
    description: flow.description,
    status: flow.status,
    stepsText: flow.steps.join("\n"),
  };
}

function flowPayloadFromForm(form: FlowForm, id?: string) {
  return {
    id,
    name: form.name.trim(),
    trigger: form.trigger.trim(),
    description: form.description.trim(),
    status: form.status,
    steps: form.stepsText
      .split("\n")
      .map((step) => step.trim())
      .filter(Boolean),
  };
}

export default function WhatsAppFlowsClient() {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [form, setForm] = useState<FlowForm>(emptyForm);
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

  async function saveFlow() {
    if (!form.name.trim() || !form.stepsText.trim()) return;
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
        if (editingId) return current.map((flow) => (flow.id === editingId ? result.flow as WhatsAppFlow : flow));
        return [result.flow as WhatsAppFlow, ...current];
      });
      setForm(emptyForm);
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
        setForm(emptyForm);
      }
      setNotice("Flow deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function loadTemplate(template: FlowForm) {
    setEditingId("");
    setForm(template);
  }

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WhatsApp CRM</p>
          <h1>Flows</h1>
          <span>Create reusable sales reply flows for the WhatsApp inbox.</span>
        </div>
        <div className={styles.headerActions}>
          <a href="/crm/inbox">Back to inbox</a>
        </div>
      </section>

      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <a href="/crm/inbox">Inbox</a>
          <a href="/manual-orders">Manual orders</a>
          <a className={styles.railActive} href="/crm/flows">Flows</a>
          <a href="/crm">Setup</a>
        </aside>

        <section className={styles.builder}>
          <div className={styles.builderHeader}>
            <div>
              <p className={styles.eyebrow}>Flow Builder</p>
              <h2>{editingId ? "Edit flow" : "Create flow"}</h2>
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

          <label>
            Flow name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Example: Ask for plushie details"
            />
          </label>

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

          <label>
            Flow messages
            <textarea
              value={form.stepsText}
              onChange={(event) => setForm((current) => ({ ...current, stepsText: event.target.value }))}
              placeholder="Write one message or step per line."
              rows={9}
            />
          </label>

          <div className={styles.formActions}>
            <button className={styles.primaryButton} onClick={saveFlow} disabled={saving || !form.name.trim() || !form.stepsText.trim()}>
              {saving ? "Saving..." : editingId ? "Save changes" : "Create flow"}
            </button>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setEditingId("");
                setForm(emptyForm);
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
              <h2>Reusable replies</h2>
            </div>
          </div>

          {flows.map((flow) => (
            <article className={styles.flowCard} key={flow.id}>
              <div className={styles.flowTopline}>
                <div>
                  <h3>{flow.name}</h3>
                  <p>{flow.description || "No notes yet."}</p>
                </div>
                <span className={flow.status === "Active" ? styles.activeBadge : styles.draftBadge}>
                  {flow.status}
                </span>
              </div>
              {flow.trigger && <p className={styles.triggerText}>Triggers: {flow.trigger}</p>}
              <ol>
                {flow.steps.map((step, index) => (
                  <li key={`${flow.id}-${index}`}>{step}</li>
                ))}
              </ol>
              <div className={styles.cardActions}>
                <button onClick={() => editFlow(flow)}>Edit</button>
                <button disabled={saving} onClick={() => void deleteFlow(flow.id)}>Delete</button>
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

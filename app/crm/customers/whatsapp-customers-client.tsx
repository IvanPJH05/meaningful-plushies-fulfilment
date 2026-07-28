"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import styles from "./whatsapp-customers.module.css";

type Customer = {
  id: string;
  conversationId: string;
  displayName: string;
  phone: string | null;
  waId: string | null;
  email: string | null;
  source: string;
  tags: string[];
  status: string;
  aiMode: string;
  unreadCount: number;
  notes: string;
  leadStage: string | null;
  leadTemperature: string | null;
  requestedCharacter: string | null;
  requestedVoice: string | null;
  paymentStatus: string | null;
  messageCount: number;
  lastMessage: {
    preview: string;
    direction: string;
    senderType: string;
    status: string;
    createdAt: string | null;
  } | null;
  lastMessageAt: string | null;
};

type FlowMediaType = "image" | "video" | "pdf";
type FlowActionType = "Send Message" | "Send Media" | "Send Image" | "Send Video" | "Ask Selection" | "AI Reply" | "Update Status" | "Add Note";
type FlowDelayUnit = "seconds" | "minutes" | "hours" | "days";

type FlowMediaItem = {
  type: FlowMediaType;
  url: string;
  caption?: string;
  fileName?: string;
  contentType?: string;
};

type FlowSelectionOption = {
  id?: string;
  label: string;
};

type WhatsAppFlowStep = {
  type: FlowActionType;
  delayValue: string;
  delayUnit: FlowDelayUnit;
  message: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaItems?: FlowMediaItem[];
  options?: FlowSelectionOption[];
};

type WhatsAppFlow = {
  id: string;
  name: string;
  triggerType?: string;
  triggerButtonLabel?: string;
  trigger: string;
  description: string;
  status: "Draft" | "Active";
  steps: WhatsAppFlowStep[];
};

function formatLabel(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "None";
}

function formatTime(value: string | null | undefined) {
  if (!value) return "No messages yet";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function delayMs(step: WhatsAppFlowStep) {
  const value = Number(step.delayValue || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const unit = step.delayUnit;
  if (unit === "minutes") return value * 60_000;
  if (unit === "hours") return value * 3_600_000;
  if (unit === "days") return value * 86_400_000;
  return value * 1000;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function flowStepMediaItems(step: WhatsAppFlowStep): FlowMediaItem[] {
  if (step.type === "Send Image" && step.imageUrl) return [{ type: "image", url: step.imageUrl }];
  if (step.type === "Send Video" && step.videoUrl) return [{ type: "video", url: step.videoUrl }];
  return step.mediaItems?.filter((item) => item.url) || [];
}

export default function WhatsAppCustomersClient() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notesDraft, setNotesDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [selectedFlowId, setSelectedFlowId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  const selected = useMemo(
    () => customers.find((customer) => customer.conversationId === selectedId) || customers[0] || null,
    [customers, selectedId],
  );
  const activeFlows = useMemo(() => flows.filter((flow) => flow.status === "Active"), [flows]);
  const selectedFlow = useMemo(
    () => activeFlows.find((flow) => flow.id === selectedFlowId) || null,
    [activeFlows, selectedFlowId],
  );

  const filteredCustomers = useMemo(() => {
    const search = query.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch = !search
        || customer.displayName.toLowerCase().includes(search)
        || (customer.phone || "").toLowerCase().includes(search)
        || (customer.waId || "").toLowerCase().includes(search)
        || customer.notes.toLowerCase().includes(search);
      const matchesStatus = statusFilter === "all" || customer.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [customers, query, statusFilter]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [customersResponse, flowsResponse] = await Promise.all([
          fetch("/api/crm/customers", { cache: "no-store" }),
          fetch("/api/crm/flows", { cache: "no-store" }),
        ]);
        const customersResult = await customersResponse.json() as { ok?: boolean; customers?: Customer[]; error?: string };
        const flowsResult = await flowsResponse.json() as { ok?: boolean; flows?: WhatsAppFlow[]; error?: string };
        if (!customersResponse.ok || !customersResult.ok) throw new Error(customersResult.error || "Customer list could not be loaded.");
        if (!flowsResponse.ok || !flowsResult.ok) throw new Error(flowsResult.error || "Flows could not be loaded.");
        setCustomers(customersResult.customers || []);
        setFlows(flowsResult.flows || []);
        setSelectedId((current) => current || customersResult.customers?.[0]?.conversationId || "");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Customer data could not be loaded.");
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setNotesDraft(selected.notes || "");
    setNameDraft(selected.displayName || "");
  }, [selected]);

  async function saveCustomer() {
    if (!selected) return;
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/crm/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selected.conversationId,
          displayName: nameDraft,
          notes: notesDraft,
        }),
      });
      const result = await response.json() as { ok?: boolean; customer?: Customer; error?: string };
      if (!response.ok || !result.ok || !result.customer) throw new Error(result.error || "Customer notes could not be saved.");
      setCustomers((current) => current.map((customer) => (
        customer.conversationId === result.customer?.conversationId ? result.customer : customer
      )));
      setNotice("Customer notes saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Customer notes could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function sendFlowStep(customer: Customer, step: WhatsAppFlowStep, body: string, media?: FlowMediaItem, options?: FlowSelectionOption[]) {
    const response = await fetch("/api/crm/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: customer.conversationId,
        body,
        mediaType: media?.type,
        mediaUrl: media?.url,
        buttonOptions: options?.map((option, index) => ({
          id: option.id || `option_${index + 1}`,
          title: option.label,
        })),
        waitForConfirmation: true,
      }),
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !result.ok) throw new Error(result.error || "WhatsApp did not accept one of the messages.");
  }

  async function sendSelectedFlow() {
    if (!selected || !selectedFlow || sending) return;
    setSending(true);
    setNotice("");
    try {
      for (const step of selectedFlow.steps) {
        const wait = delayMs(step);
        if (wait) await sleep(wait);

        if (step.type === "Send Media" || step.type === "Send Image" || step.type === "Send Video") {
          const mediaItems = flowStepMediaItems(step);
          for (const [index, item] of mediaItems.entries()) {
            await sendFlowStep(selected, step, item.caption || (index === 0 ? step.message : ""), item);
          }
          if (!mediaItems.length && step.message.trim()) await sendFlowStep(selected, step, step.message);
          continue;
        }

        if (step.type === "Ask Selection") {
          const options = (step.options || []).filter((option) => option.label).slice(0, 3);
          if (step.message.trim() || options.length) await sendFlowStep(selected, step, step.message, undefined, options);
          continue;
        }

        if (step.message.trim()) await sendFlowStep(selected, step, step.message);
      }
      setNotice(`Flow "${selectedFlow.name}" sent to ${selected.displayName}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be sent.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.layout}>
        <aside className={styles.workspaceRail}>
          <div className={styles.railLogo}>MP</div>
          <Link href="/crm/inbox">Inbox</Link>
          <Link href="/crm/flows">Flow</Link>
          <Link className={styles.railActive} href="/crm/customers">Customers</Link>
          <Link href="/crm/test-ai">Test AI</Link>
          <Link href="/crm/setup">Setup</Link>
        </aside>

        <section className={styles.customerList}>
          <div className={styles.listHeader}>
            <div>
              <p className={styles.eyebrow}>Customers</p>
              <h1>Customer data</h1>
              <span>{filteredCustomers.length} shown from {customers.length}</span>
            </div>
            <Link className={styles.secondaryButton} href="/crm/inbox">Open inbox</Link>
          </div>

          <div className={styles.filters}>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, phone, or notes"
              value={query}
            />
            <select onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="all">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="WAITING_TEAM">Waiting team</option>
              <option value="WAITING_CUSTOMER">Waiting customer</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div className={styles.customerRows}>
            {loading ? (
              <div className={styles.emptyState}>Loading customers...</div>
            ) : filteredCustomers.length ? (
              filteredCustomers.map((customer) => (
                <button
                  className={`${styles.customerRow} ${selected?.conversationId === customer.conversationId ? styles.selectedRow : ""}`}
                  key={customer.conversationId}
                  onClick={() => setSelectedId(customer.conversationId)}
                  type="button"
                >
                  <span className={styles.avatar}>{customer.displayName.charAt(0).toUpperCase()}</span>
                  <span className={styles.rowText}>
                    <strong>{customer.displayName}</strong>
                    <small>{customer.phone || customer.waId || "No phone"}</small>
                    <em>{customer.lastMessage?.preview || "No message preview"}</em>
                  </span>
                  <span className={styles.rowMeta}>
                    <small>{formatTime(customer.lastMessageAt)}</small>
                    {customer.unreadCount > 0 && <b>{customer.unreadCount}</b>}
                  </span>
                </button>
              ))
            ) : (
              <div className={styles.emptyState}>No customers match this search.</div>
            )}
          </div>
        </section>

        <section className={styles.customerDetail}>
          {notice && <div className={styles.notice}>{notice}</div>}
          {selected ? (
            <>
              <div className={styles.detailHeader}>
                <span className={styles.largeAvatar}>{selected.displayName.charAt(0).toUpperCase()}</span>
                <div>
                  <p className={styles.eyebrow}>Customer profile</p>
                  <input
                    className={styles.nameInput}
                    onChange={(event) => setNameDraft(event.target.value)}
                    value={nameDraft}
                  />
                  <p>{selected.phone || selected.waId || "No phone number"}</p>
                </div>
                <Link className={styles.secondaryButton} href={`/crm/inbox?conversationId=${encodeURIComponent(selected.conversationId)}`}>
                  Open chat
                </Link>
              </div>

              <div className={styles.summaryGrid}>
                <span><strong>{formatLabel(selected.status)}</strong><small>Status</small></span>
                <span><strong>{selected.messageCount}</strong><small>Messages</small></span>
                <span><strong>{formatLabel(selected.paymentStatus)}</strong><small>Payment</small></span>
                <span><strong>{formatLabel(selected.leadStage)}</strong><small>Lead</small></span>
              </div>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>Notes</p>
                    <h2>Team notes for this customer</h2>
                  </div>
                  <button className={styles.primaryButton} disabled={saving} onClick={() => void saveCustomer()} type="button">
                    {saving ? "Saving..." : "Save notes"}
                  </button>
                </div>
                <textarea
                  onChange={(event) => setNotesDraft(event.target.value)}
                  placeholder="Add sizing details, preferred plushie, payment context, reminders, or anything the team should know."
                  value={notesDraft}
                />
              </section>

              <section className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <p className={styles.eyebrow}>Message flows</p>
                    <h2>Send an existing flow</h2>
                  </div>
                  <Link className={styles.secondaryButton} href="/crm/flows">Create flow</Link>
                </div>
                <div className={styles.flowSender}>
                  <select onChange={(event) => setSelectedFlowId(event.target.value)} value={selectedFlowId}>
                    <option value="">Choose a flow</option>
                    {activeFlows.map((flow) => (
                      <option key={flow.id} value={flow.id}>{flow.name}</option>
                    ))}
                  </select>
                  <button className={styles.primaryButton} disabled={!selectedFlow || sending} onClick={() => void sendSelectedFlow()} type="button">
                    {sending ? "Sending..." : "Send flow"}
                  </button>
                </div>
                {selectedFlow ? (
                  <div className={styles.flowPreview}>
                    <strong>{selectedFlow.name}</strong>
                    <span>{selectedFlow.steps.length} actions</span>
                    <p>{selectedFlow.description || selectedFlow.trigger || "No description yet."}</p>
                  </div>
                ) : (
                  <p className={styles.muted}>Pick a saved active flow to send messages from this customer profile.</p>
                )}
              </section>
            </>
          ) : (
            <div className={styles.emptyDetail}>Select a customer to add notes or send a flow.</div>
          )}
        </section>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import styles from "./whatsapp-customers.module.css";

type CustomerStatus = "Cold" | "Warm" | "Unpaid" | "Paid";

type Customer = {
  id: string;
  conversationId: string;
  displayName: string;
  phone: string | null;
  waId: string | null;
  customerStatus: CustomerStatus;
  notes: string;
  messageCount: number;
  firstMessageAt: string | null;
  lastTextedAt: string | null;
  lastMessageAt: string | null;
  nextScheduledMessage: {
    id: string;
    scheduledAt: string | null;
    messageBody: string;
    status: string;
  } | null;
};

type FlowMediaType = "image" | "video" | "pdf";
type FlowActionType = "Send Message" | "Send Media" | "Send Image" | "Send Video" | "Ask Selection" | "AI Reply" | "Update Status" | "Add Note" | "Create Manual Order Link";
type FlowDelayUnit = "seconds" | "minutes" | "hours" | "days";

type FlowMediaItem = {
  type: FlowMediaType;
  url: string;
  caption?: string;
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
  triggerType?: "keywords" | "click" | "first_message" | "selection_button";
  status: "Draft" | "Active";
  steps: WhatsAppFlowStep[];
};

type RowDraft = {
  name: string;
  status: CustomerStatus;
  notes: string;
  flowId: string;
  scheduledAt: string;
  scheduledMessage: string;
};

const customerStatuses: CustomerStatus[] = ["Cold", "Warm", "Unpaid", "Paid"];
const CUSTOMER_CACHE_KEY = "meaningful-plushies.crm-customers.v1";
const LAST_CONVERSATION_EXPORT_KEY = "meaningful-plushies.crm-last-conversation-export.v1";

type CustomerCache = {
  customers: Customer[];
  flows: WhatsAppFlow[];
  drafts: Record<string, RowDraft>;
  query: string;
  visibleStatuses: CustomerStatus[];
  cachedAt: number;
};

let customerCache: CustomerCache | null = null;

function readCustomerCache() {
  if (customerCache) return customerCache;
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.sessionStorage.getItem(CUSTOMER_CACHE_KEY) || "null") as Partial<CustomerCache> | null;
    if (!saved || !Array.isArray(saved.customers) || !Array.isArray(saved.flows) || !saved.drafts || typeof saved.cachedAt !== "number") return null;
    customerCache = {
      customers: saved.customers,
      flows: saved.flows,
      drafts: saved.drafts,
      query: typeof saved.query === "string" ? saved.query : "",
      visibleStatuses: Array.isArray(saved.visibleStatuses) && saved.visibleStatuses.length
        ? saved.visibleStatuses.filter((status): status is CustomerStatus => customerStatuses.includes(status as CustomerStatus))
        : customerStatuses,
      cachedAt: saved.cachedAt,
    };
    return customerCache;
  } catch {
    return null;
  }
}

function saveCustomerCache(cache: CustomerCache) {
  customerCache = cache;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // The page still works if browser storage is unavailable.
  }
}

function emptyDraft(customer: Customer): RowDraft {
  return {
    name: customer.displayName || "",
    status: customer.customerStatus || "Cold",
    notes: customer.notes || "",
    flowId: "",
    scheduledAt: "",
    scheduledMessage: "",
  };
}

function delayMs(step: WhatsAppFlowStep) {
  const value = Number(step.delayValue || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (step.delayUnit === "minutes") return value * 60_000;
  if (step.delayUnit === "hours") return value * 3_600_000;
  if (step.delayUnit === "days") return value * 86_400_000;
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

function localDateTimeLabel(value: string | null | undefined) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function csvCell(value: string | null | undefined) {
  const text = value || "";
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function statusClass(status: CustomerStatus) {
  return status.toLowerCase();
}

function manualOrderSettings(value: string) {
  const [character = "Billy", speaker = "5"] = value.split("|");
  return { character, productKey: `plushie_${["5", "10", "20"].includes(speaker) ? speaker : "5"}s` };
}

export default function WhatsAppCustomersClient() {
  const initialCache = readCustomerCache();
  const [customers, setCustomers] = useState<Customer[]>(() => initialCache?.customers || []);
  const [flows, setFlows] = useState<WhatsAppFlow[]>(() => initialCache?.flows || []);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() => initialCache?.drafts || {});
  const [query, setQuery] = useState(() => initialCache?.query || "");
  const [visibleStatuses, setVisibleStatuses] = useState<CustomerStatus[]>(() => initialCache?.visibleStatuses || customerStatuses);
  const [loading, setLoading] = useState(() => !initialCache);
  const [busyRowId, setBusyRowId] = useState("");
  const [notice, setNotice] = useState("");
  const [importingStatuses, setImportingStatuses] = useState(false);
  const [exportingOrders, setExportingOrders] = useState(false);
  const [conversationExportScope, setConversationExportScope] = useState<"ALL" | "DATE_RANGE" | "CHANGED_SINCE_LAST_EXPORT">("ALL");
  const [exportStartDate, setExportStartDate] = useState("");
  const [exportEndDate, setExportEndDate] = useState("");
  const [lastConversationExportAt, setLastConversationExportAt] = useState(() => typeof window === "undefined" ? "" : window.localStorage.getItem(LAST_CONVERSATION_EXPORT_KEY) || "");
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const inboxFlows = useMemo(() => (
    flows.filter((flow) => flow.status === "Active" && (flow.triggerType || "click") === "click")
  ), [flows]);
  const statusCounts = useMemo(() => customerStatuses.map((status) => ({
    status,
    count: customers.filter((customer) => customer.customerStatus === status).length,
  })), [customers]);
  const filteredCustomers = useMemo(() => {
    const search = query.trim().toLowerCase();
    return customers.filter((customer) => (
      visibleStatuses.includes(customer.customerStatus)
      && (!search
        || customer.displayName.toLowerCase().includes(search)
        || (customer.phone || "").toLowerCase().includes(search)
        || (customer.waId || "").toLowerCase().includes(search)
        || customer.notes.toLowerCase().includes(search)
        || customer.customerStatus.toLowerCase().includes(search))
    ));
  }, [customers, query, visibleStatuses]);

  function toggleStatusFilter(status: CustomerStatus) {
    setVisibleStatuses((current) => (
      current.includes(status)
        ? current.filter((item) => item !== status)
        : [...current, status]
    ));
  }

  useEffect(() => {
    async function loadData() {
      const cached = readCustomerCache();
      if (!cached) setLoading(true);
      try {
        const [customersResponse, flowsResponse] = await Promise.all([
          fetch("/api/crm/customers", { cache: "no-store" }),
          fetch("/api/crm/flows", { cache: "no-store" }),
        ]);
        const customersResult = await customersResponse.json() as { ok?: boolean; customers?: Customer[]; error?: string };
        const flowsResult = await flowsResponse.json() as { ok?: boolean; flows?: WhatsAppFlow[]; error?: string };
        if (!customersResponse.ok || !customersResult.ok) throw new Error(customersResult.error || "Customer list could not be loaded.");
        if (!flowsResponse.ok || !flowsResult.ok) throw new Error(flowsResult.error || "Flows could not be loaded.");
        const loadedCustomers = customersResult.customers || [];
        const loadedDrafts = Object.fromEntries(loadedCustomers.map((customer) => [customer.conversationId, emptyDraft(customer)]));
        saveCustomerCache({
          customers: loadedCustomers,
          flows: flowsResult.flows || [],
          drafts: loadedDrafts,
          query: cached?.query || "",
          visibleStatuses: cached?.visibleStatuses || customerStatuses,
          cachedAt: Date.now(),
        });
        setCustomers(loadedCustomers);
        setFlows(flowsResult.flows || []);
        setDrafts(loadedDrafts);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Customer data could not be loaded.");
      } finally {
        if (!cached) setLoading(false);
      }
    }

    void loadData();
  }, []);

  useEffect(() => {
    if (loading) return;
    saveCustomerCache({
      customers,
      flows,
      drafts,
      query,
      visibleStatuses,
      cachedAt: customerCache?.cachedAt || Date.now(),
    });
  }, [customers, drafts, flows, loading, query, visibleStatuses]);

  function updateDraft(conversationId: string, patch: Partial<RowDraft>) {
    setDrafts((current) => ({
      ...current,
      [conversationId]: {
        ...(current[conversationId] || {
          name: "",
          status: "Cold",
          notes: "",
          flowId: "",
          scheduledAt: "",
          scheduledMessage: "",
        }),
        ...patch,
      },
    }));
  }

  async function saveCustomer(customer: Customer, statusOverride?: CustomerStatus) {
    const draft = drafts[customer.conversationId] || emptyDraft(customer);
    setBusyRowId(customer.conversationId);
    setNotice("");
    try {
      const response = await fetch("/api/crm/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: customer.conversationId,
          displayName: draft.name,
          customerStatus: statusOverride || draft.status,
          notes: draft.notes,
        }),
      });
      const result = await response.json() as { ok?: boolean; customer?: Customer; error?: string };
      if (!response.ok || !result.ok || !result.customer) throw new Error(result.error || "Customer row could not be saved.");
      setCustomers((current) => current.map((item) => (
        item.conversationId === result.customer?.conversationId ? result.customer : item
      )));
      setDrafts((current) => ({
        ...current,
        [result.customer!.conversationId]: {
          ...emptyDraft(result.customer!),
          flowId: current[result.customer!.conversationId]?.flowId || "",
          scheduledAt: current[result.customer!.conversationId]?.scheduledAt || "",
          scheduledMessage: current[result.customer!.conversationId]?.scheduledMessage || "",
        },
      }));
      setNotice("Customer row saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Customer row could not be saved.");
    } finally {
      setBusyRowId("");
    }
  }

  async function importCustomerStatuses(file: File) {
    setImportingStatuses(true);
    setNotice("");
    try {
      const body = new FormData();
      body.set("action", "import_statuses");
      body.set("file", file);
      const response = await fetch("/api/crm/customers", { method: "POST", body });
      const result = await response.json() as {
        ok?: boolean;
        customers?: Customer[];
        updated?: number;
        notFound?: string[];
        invalidRows?: string[];
        error?: string;
      };
      if (!response.ok || !result.ok || !result.customers) throw new Error(result.error || "Customer statuses could not be imported.");
      const nextCustomers = result.customers;
      setCustomers(nextCustomers);
      setDrafts((current) => Object.fromEntries(nextCustomers.map((customer) => [
        customer.conversationId,
        { ...emptyDraft(customer), flowId: current[customer.conversationId]?.flowId || "" },
      ])));
      const details = [
        `${result.updated || 0} customer status${result.updated === 1 ? "" : "es"} updated`,
        result.notFound?.length ? `${result.notFound.length} number${result.notFound.length === 1 ? "" : "s"} not found` : "",
        result.invalidRows?.length ? `${result.invalidRows.length} invalid row${result.invalidRows.length === 1 ? "" : "s"} skipped` : "",
      ].filter(Boolean);
      setNotice(`${details.join(". ")}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Customer statuses could not be imported.");
    } finally {
      setImportingStatuses(false);
    }
  }

  function downloadCustomerStatusTemplate() {
    const rows = [
      ["Phone", "Customer", "Status", "First message", "Last texted"],
      ...customers.map((customer) => [
        customer.phone || customer.waId || "",
        customer.displayName,
        customer.customerStatus,
        customer.firstMessageAt || "",
        customer.lastTextedAt || "",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "meaningful-plushies-customer-statuses.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    setNotice(`${customers.length} customers exported. Edit the Status column, then import this file.`);
  }

  function downloadConversationFacts() {
    const params = new URLSearchParams({ scope: conversationExportScope, timezone: "Asia/Kuala_Lumpur", include_archived: "true" });
    if (conversationExportScope === "DATE_RANGE") {
      if (!exportStartDate || !exportEndDate) return setNotice("Choose both dates for the conversation export.");
      params.set("start_date", exportStartDate); params.set("end_date", exportEndDate);
    }
    if (conversationExportScope === "CHANGED_SINCE_LAST_EXPORT") {
      if (!lastConversationExportAt) return setNotice("Download a full export first. The CRM will then remember the cutoff automatically.");
      params.set("changed_since", lastConversationExportAt);
    }
    const nextCutoff = new Date().toISOString();
    window.localStorage.setItem(LAST_CONVERSATION_EXPORT_KEY, nextCutoff);
    setLastConversationExportAt(nextCutoff);
    window.location.assign(`/api/crm/inbox/ai-export?${params.toString()}`);
  }

  async function downloadOrderFacts() {
    setExportingOrders(true);
    try {
      const [manualResponse, preorderResponse] = await Promise.all([fetch("/api/manual-orders"), fetch("/api/preorders")]);
      const [manual, preorders] = await Promise.all([manualResponse.json(), preorderResponse.json()]);
      if (!manual.ok) throw new Error(manual.error || "Manual Orders could not be exported.");
      if (!preorders.ok) throw new Error(preorders.error || "Pre-orders could not be exported.");
      const exportData = {
        generated_at: new Date().toISOString(),
        export_type: "manual_orders_and_preorders_facts",
        matching_key: "phone number",
        note: "These are factual order records only. They do not prove whether a customer has paid unless the record itself includes a completed Shopify order.",
        manual_orders: manual.manualOrders || [],
        preorders: preorders.preorders || [],
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `manual-orders-and-preorders-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Order facts could not be exported.");
    } finally {
      setExportingOrders(false);
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

  async function sendFlow(customer: Customer) {
    const draft = drafts[customer.conversationId] || emptyDraft(customer);
    const flow = inboxFlows.find((item) => item.id === draft.flowId);
    if (!flow) {
      setNotice("Choose a message flow first.");
      return;
    }

    setBusyRowId(customer.conversationId);
    setNotice("");
    try {
      await saveCustomer(customer);
      for (const step of flow.steps) {
        const wait = delayMs(step);
        if (wait) await sleep(wait);

        if (step.type === "Update Status") {
          const nextStatus = customerStatuses.find((status) => status.toLowerCase() === step.message.trim().toLowerCase());
          if (!nextStatus) throw new Error(`The Update Status action in "${flow.name}" must be Cold, Warm, Unpaid, or Paid.`);
          updateDraft(customer.conversationId, { status: nextStatus });
          await saveCustomer(customer, nextStatus);
          continue;
        }

        if (step.type === "Add Note") {
          const note = step.message.trim();
          if (note) {
            const updatedNotes = [draft.notes.trim(), note].filter(Boolean).join(draft.notes.trim() ? "\n" : "");
            updateDraft(customer.conversationId, { notes: updatedNotes });
            const response = await fetch("/api/crm/customers", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                conversationId: customer.conversationId,
                displayName: draft.name,
                customerStatus: draft.status,
                notes: updatedNotes,
              }),
            });
            const result = await response.json() as { ok?: boolean; customer?: Customer; error?: string };
            if (!response.ok || !result.ok || !result.customer) throw new Error(result.error || "Customer note could not be saved.");
            setCustomers((current) => current.map((item) => item.conversationId === result.customer?.conversationId ? result.customer : item));
          }
          continue;
        }

        if (step.type === "Create Manual Order Link") {
          const settings = manualOrderSettings(step.message);
          const response = await fetch("/api/crm/ai/commands/manual-order", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerName: draft.name || customer.displayName || "Customer",
              phone: customer.phone || customer.waId || "",
              character: settings.character,
              productKey: settings.productKey,
              shippingRegion: "WEST",
              paymentConfirmed: true,
              conversationId: customer.conversationId,
            }),
          });
          const result = await response.json() as { ok?: boolean; error?: string };
          if (!response.ok || !result.ok) throw new Error(result.error || "Manual order link could not be created and sent.");
          continue;
        }

        if (step.type === "Send Media" || step.type === "Send Image" || step.type === "Send Video") {
          const mediaItems = flowStepMediaItems(step);
          for (const [index, item] of mediaItems.entries()) {
            await sendFlowStep(customer, step, item.caption || (index === 0 ? step.message : ""), item);
          }
          if (!mediaItems.length && step.message.trim()) await sendFlowStep(customer, step, step.message);
          continue;
        }

        if (step.type === "Ask Selection") {
          const options = (step.options || []).filter((option) => option.label).slice(0, 3);
          if (step.message.trim() || options.length) await sendFlowStep(customer, step, step.message, undefined, options);
          continue;
        }

        if (step.message.trim()) await sendFlowStep(customer, step, step.message);
      }
      setNotice(`Flow "${flow.name}" sent.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Flow could not be sent.");
    } finally {
      setBusyRowId("");
    }
  }

  async function scheduleMessage(customer: Customer) {
    const draft = drafts[customer.conversationId] || emptyDraft(customer);
    setBusyRowId(customer.conversationId);
    setNotice("");
    try {
      const response = await fetch("/api/crm/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule_message",
          conversationId: customer.conversationId,
          displayName: draft.name,
          customerStatus: draft.status,
          notes: draft.notes,
          scheduledAt: new Date(draft.scheduledAt).toISOString(),
          messageBody: draft.scheduledMessage,
        }),
      });
      const result = await response.json() as { ok?: boolean; customer?: Customer; error?: string };
      if (!response.ok || !result.ok || !result.customer) throw new Error(result.error || "Scheduled message could not be saved.");
      setCustomers((current) => current.map((item) => (
        item.conversationId === result.customer?.conversationId ? result.customer : item
      )));
      setDrafts((current) => ({
        ...current,
        [result.customer!.conversationId]: {
          ...emptyDraft(result.customer!),
          flowId: current[result.customer!.conversationId]?.flowId || "",
          scheduledAt: "",
          scheduledMessage: "",
        },
      }));
      setNotice("Scheduled message saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Scheduled message could not be saved.");
    } finally {
      setBusyRowId("");
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

        <section className={styles.sheetPanel}>
          <header className={styles.sheetHeader}>
            <div>
              <p className={styles.eyebrow}>Customers</p>
              <h1>Customer data</h1>
              <span>{filteredCustomers.length} shown from {customers.length} · Status is updated by Inbox flows</span>
            </div>
            <div className={styles.headerActions}>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customer"
                value={query}
              />
              <input
                accept=".csv,text/csv"
                className={styles.hiddenFileInput}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void importCustomerStatuses(file);
                }}
                ref={csvInputRef}
                type="file"
              />
              <button
                className={styles.secondaryButton}
                disabled={importingStatuses}
                onClick={() => csvInputRef.current?.click()}
                type="button"
              >
                {importingStatuses ? "Importing..." : "Import statuses CSV"}
              </button>
              <button className={styles.secondaryButton} disabled={!customers.length} onClick={downloadCustomerStatusTemplate} type="button">
                Download CSV template
              </button>
              <Link className={styles.secondaryButton} href="/crm/inbox">Open inbox</Link>
            </div>
          </header>

          <section className={styles.aiExportPanel}>
            <div><p className={styles.eyebrow}>ChatGPT exports</p><h2>Export facts for ChatGPT</h2><span>ChatGPT reads the full conversations and makes the sales decisions. This CRM does not guess who has paid or who needs follow-up.</span></div>
            <div className={styles.aiExportActions}>
              <select aria-label="Conversation export type" onChange={(event) => setConversationExportScope(event.target.value as "ALL" | "DATE_RANGE" | "CHANGED_SINCE_LAST_EXPORT")} value={conversationExportScope}>
                <option value="ALL">Full data</option>
                <option value="DATE_RANGE">Date range</option>
                <option value="CHANGED_SINCE_LAST_EXPORT">Last updated</option>
              </select>
              {conversationExportScope === "DATE_RANGE" && <><input aria-label="Export start date" onChange={(event) => setExportStartDate(event.target.value)} type="date" value={exportStartDate} /><input aria-label="Export end date" onChange={(event) => setExportEndDate(event.target.value)} type="date" value={exportEndDate} /></>}
              {conversationExportScope === "CHANGED_SINCE_LAST_EXPORT" && <span className={styles.lastExportNote}>{lastConversationExportAt ? `Since ${new Date(lastConversationExportAt).toLocaleString("en-MY")}` : "No previous export yet"}</span>}
              <button className={styles.primaryButton} onClick={downloadConversationFacts} type="button">Download conversation JSON</button>
              <button className={styles.secondaryButton} disabled={exportingOrders} onClick={() => void downloadOrderFacts()} type="button">{exportingOrders ? "Preparing orders..." : "Download Manual Orders + Pre-orders"}</button>
            </div>
          </section>

          <p className={styles.importHint}>CSV columns: <strong>Phone, Status</strong>. Status can be Cold, Warm, Unpaid, or Paid.</p>

          {notice && <div className={styles.notice}>{notice}</div>}

          <div className={styles.statusSummary}>
            {statusCounts.map(({ status, count }) => (
              <button
                aria-pressed={visibleStatuses.includes(status)}
                className={`${styles.statusMetric} ${styles[statusClass(status)]} ${visibleStatuses.includes(status) ? styles.statusMetricActive : styles.statusMetricMuted}`}
                key={status}
                onClick={() => toggleStatusFilter(status)}
                type="button"
              >
                <span>{status}</span>
                <strong>{count}</strong>
              </button>
            ))}
            <button className={styles.clearFiltersButton} onClick={() => setVisibleStatuses(customerStatuses)} type="button">
              Show all
            </button>
          </div>

          <div className={styles.sheetScroll}>
            <table className={styles.customerSheet}>
              <thead>
                <tr>
                  <th>Phone</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>First message</th>
                  <th>Last texted</th>
                  <th>Note</th>
                  <th>Inbox flow</th>
                  <th>Schedule</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className={styles.emptyCell} colSpan={8}>Loading customers...</td>
                  </tr>
                ) : filteredCustomers.length ? (
                  filteredCustomers.map((customer) => {
                    const draft = drafts[customer.conversationId] || emptyDraft(customer);
                    const rowBusy = busyRowId === customer.conversationId;
                    return (
                      <tr className={styles[`row${customer.customerStatus}`]} key={customer.conversationId}>
                        <td>
                          <div className={styles.phoneCell}>
                            <strong>{customer.phone || customer.waId || "No phone"}</strong>
                            <Link href={`/crm/inbox?conversationId=${encodeURIComponent(customer.conversationId)}`}>Open chat</Link>
                          </div>
                        </td>
                        <td>
                          <input
                            onChange={(event) => updateDraft(customer.conversationId, { name: event.target.value })}
                            value={draft.name}
                          />
                        </td>
                        <td>
                          <div className={styles.statusEditor}>
                            <select
                              aria-label={`Status for ${customer.displayName || customer.phone || "customer"}`}
                              disabled={rowBusy}
                              onChange={(event) => {
                                const nextStatus = event.target.value as CustomerStatus;
                                updateDraft(customer.conversationId, { status: nextStatus });
                                void saveCustomer(customer, nextStatus);
                              }}
                              value={draft.status}
                            >
                              {customerStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                            </select>
                            <small className={styles.statusHelp}>Change manually or by flow</small>
                          </div>
                        </td>
                        <td>
                          <div className={styles.dateCell}>
                            <strong>{localDateTimeLabel(customer.firstMessageAt) || "No messages"}</strong>
                            <span>First message</span>
                          </div>
                        </td>
                        <td>
                          <div className={styles.dateCell}>
                            <strong>{localDateTimeLabel(customer.lastTextedAt) || "Not texted yet"}</strong>
                            <span>Last outbound text</span>
                          </div>
                        </td>
                        <td>
                          <textarea
                            onBlur={() => void saveCustomer(customer)}
                            onChange={(event) => updateDraft(customer.conversationId, { notes: event.target.value })}
                            placeholder="Add note"
                            value={draft.notes}
                          />
                        </td>
                        <td>
                          <div className={styles.flowCell}>
                            <select
                              onChange={(event) => updateDraft(customer.conversationId, { flowId: event.target.value })}
                              value={draft.flowId}
                            >
                              <option value="">Choose flow</option>
                              {inboxFlows.map((flow) => (
                                <option key={flow.id} value={flow.id}>{flow.name}</option>
                              ))}
                            </select>
                            <button disabled={rowBusy || !draft.flowId} onClick={() => void sendFlow(customer)} type="button">
                              {rowBusy ? "Working..." : "Send"}
                            </button>
                          </div>
                        </td>
                        <td>
                          <div className={styles.scheduleCell}>
                            {customer.nextScheduledMessage && (
                              <small>
                                Next: {localDateTimeLabel(customer.nextScheduledMessage.scheduledAt)}
                              </small>
                            )}
                            <input
                              onChange={(event) => updateDraft(customer.conversationId, { scheduledAt: event.target.value })}
                              type="datetime-local"
                              value={draft.scheduledAt}
                            />
                            <textarea
                              onChange={(event) => updateDraft(customer.conversationId, { scheduledMessage: event.target.value })}
                              placeholder="Message to send"
                              value={draft.scheduledMessage}
                            />
                            <button
                              disabled={rowBusy || !draft.scheduledAt || !draft.scheduledMessage.trim()}
                              onClick={() => void scheduleMessage(customer)}
                              type="button"
                            >
                              Schedule
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td className={styles.emptyCell} colSpan={8}>No customers match this search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}

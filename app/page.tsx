"use client";

import "./settings.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, SVGProps } from "react";
import { fulfilledOrdersCsv, importShopifyData, normalizePaymentProcessor } from "../lib/importer";
import { summarizeSales } from "../lib/sales";
import { stockCharacters, summarizeStock } from "../lib/stock";
import {
  createDashboardAccount,
  deleteSharedOrders,
  ensurePaymentProcessors,
  fetchSharedActivity,
  fetchSharedOrders,
  fetchDashboardAccounts,
  fetchPaymentProcessorSettings,
  fetchStockSettings,
  insertSharedActivity,
  loginDashboardAccount,
  saveStockSetting,
  savePaymentProcessorSetting,
  subscribeToSharedData,
  supabaseConfigured,
  updateDashboardAccount,
  upsertSharedOrders,
  type DashboardSession,
} from "../lib/supabase";
import { orderStatuses, type DashboardAccount, type Order, type OrderStatus, type PaymentProcessorSetting, type StockSetting, type UserRole } from "../lib/types";

type Session = DashboardSession;
type View = "orders" | "fulfilment" | "packing_slips" | "import" | "fulfilled" | "history" | "settings" | "stock";
type SalesRange = "active" | "7d" | "30d" | "lifetime";
type ActivityEvent = {
  id: string;
  orderNumber?: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
};

const salesRanges: { value: SalesRange; label: string }[] = [
  { value: "active", label: "Active orders" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "lifetime", label: "Lifetime" },
];

const statusLabels: Record<OrderStatus, string> = {
  new_order: "New Order",
  uploading_audio: "Uploading Audio",
  sent_for_sewing: "Sent for Sewing",
  packed: "Packed",
  shipped: "Shipped",
  issue: "Issue",
};

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  new_order: "uploading_audio",
  uploading_audio: "sent_for_sewing",
  sent_for_sewing: "packed",
  packed: "shipped",
};

const legacyStatus: Record<string, OrderStatus> = {
  awaiting_voice: "uploading_audio",
  ready_to_make: "sent_for_sewing",
  making: "sent_for_sewing",
  ready_to_pack: "sent_for_sewing",
  fulfilled: "shipped",
};

type FulfilmentColumn = "orderNumber" | "meaningfulMessage" | "plushName" | "character" | "idWebsiteLink" | "customerName" | "phone";

const fulfilmentColumnLabels: Record<FulfilmentColumn, string> = {
  orderNumber: "Order ID",
  meaningfulMessage: "Meaningful Message",
  plushName: "Plush Name",
  character: "Character",
  idWebsiteLink: "ID Website Link",
  customerName: "Customer Name",
  phone: "Phone Number",
};

function formatDate(value: string, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatMoney(value: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(value);
}

function whatsappLink(order: Order) {
  const digits = order.phone.replace(/\D/g, "");
  const phone = digits.startsWith("60") ? digits : digits.startsWith("0") ? `60${digits.slice(1)}` : `60${digits}`;
  const tracking = order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : "We will share your tracking number soon.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${order.customerName}, your Meaningful Plushie ${order.plushName} is being prepared. ${tracking}`)}`;
}

function orderLabel(order: Order) {
  return `#${order.orderNumber}${order.setIndicator ? ` ${order.setIndicator}` : ""}`;
}

function certificateLink(order: Order, includeProtocol = true) {
  const link = order.certificateCode
    ? `meaningfulplushies.com/pages/certificate/${order.certificateCode.trim()}`
    : order.idWebsiteLink.replace(/^https?:\/\//i, "");
  return includeProtocol && link ? `https://${link}` : link;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [packingSelection, setPackingSelection] = useState<string[]>([]);
  const [packingStatusFilter, setPackingStatusFilter] = useState<"all" | OrderStatus>("all");
  const [dashboardStatus, setDashboardStatus] = useState<OrderStatus | "total">("packed");
  const [salesRange, setSalesRange] = useState<SalesRange>("active");
  const [processorSettings, setProcessorSettings] = useState<PaymentProcessorSetting[]>([]);
  const [stockSettings, setStockSettings] = useState<StockSetting[]>([]);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [accountPasswords, setAccountPasswords] = useState<Record<string, string>>({});
  const [newAccount, setNewAccount] = useState({ username: "", displayName: "", role: "staff" as UserRole, password: "" });
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<FulfilmentColumn | null>(null);
  const [fulfilmentColumns, setFulfilmentColumns] = useState<FulfilmentColumn[]>([
    "orderNumber", "meaningfulMessage", "plushName", "character", "idWebsiteLink", "customerName", "phone",
  ]);
  const [manualOrderIds, setManualOrderIds] = useState("");
  const [orderCsv, setOrderCsv] = useState("");
  const [metafieldCsv, setMetafieldCsv] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [databaseError, setDatabaseError] = useState("");

  const loadSharedData = useCallback(async (showLoading = false) => {
    if (!supabaseConfigured) {
      setDatabaseError("Supabase is not configured. Add the public Supabase URL and anon key in Vercel.");
      setLoadingOrders(false);
      return;
    }
    if (showLoading) setLoadingOrders(true);
    try {
      const [sharedOrders, sharedActivity, sharedProcessorSettings, sharedStockSettings] = await Promise.all([
        fetchSharedOrders(), fetchSharedActivity(), fetchPaymentProcessorSettings(), fetchStockSettings(),
      ]);
      setOrders(sharedOrders.map((order) => {
      const status = legacyStatus[order.status] ?? order.status;
      return {
        ...order,
        status,
        currency: order.currency ?? "MYR",
        subtotalAmount: order.subtotalAmount ?? 0,
        shippingAmount: order.shippingAmount ?? 0,
        totalAmount: order.totalAmount ?? 0,
        discountAmount: order.discountAmount ?? 0,
        productDiscountAmount: order.productDiscountAmount ?? 0,
        shippingDiscountAmount: order.shippingDiscountAmount ?? 0,
        refundedAmount: order.refundedAmount ?? 0,
        outstandingBalance: order.outstandingBalance ?? 0,
        paymentProcessor: normalizePaymentProcessor(order.paymentProcessor ?? "", order.totalAmount === 0),
        setIndicator: order.setIndicator ?? "",
        idWebsiteLink: order.idWebsiteLink ?? "",
        statusHistory: (order.statusHistory ?? []).map((event) => ({
          ...event,
          status: legacyStatus[event.status] ?? event.status,
        })),
      };
      }));
      setActivity(sharedActivity);
      setProcessorSettings(sharedProcessorSettings);
      setStockSettings(sharedStockSettings);
      setDatabaseError("");
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : "Could not load orders from Supabase.");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadSharedData(true);
    if (!supabaseConfigured) return;
    return subscribeToSharedData(() => { void loadSharedData(); });
  }, [loadSharedData]);

  useEffect(() => {
    if (session?.role !== "admin") return;
    void fetchDashboardAccounts(session.token).then(setAccounts).catch((error) => setNotice(error instanceof Error ? error.message : "Accounts could not be loaded."));
  }, [session]);

  useEffect(() => {
    if (session?.role === "staff" && (["history", "settings", "stock"] as View[]).includes(view)) setView("orders");
  }, [session, view]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const packingOrders = orders.filter((order) => packingSelection.includes(order.id));
  const packingAvailableOrders = orders.filter((order) => packingStatusFilter === "all" || order.status === packingStatusFilter);
  const filtered = useMemo(() => {
    const source = view === "fulfilled" ? orders.filter((order) => order.status === "shipped") : orders;
    const search = query.trim().toLowerCase();
    const matching = source
      .filter((order) => statusFilter === "all" || order.status === statusFilter)
      .filter((order) => !search || [order.orderNumber, order.customerName, order.phone, order.trackingNumber, order.plushName, order.product, order.character]
        .join(" ").toLowerCase().includes(search));
    return matching.sort((a, b) => view === "fulfilment"
      ? Number(a.orderNumber) - Number(b.orderNumber) || a.id.localeCompare(b.id)
      : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, query, statusFilter, view]);

  const counts = useMemo(() => ({
    total: orders.filter((order) => order.status !== "shipped").length,
    voice: orders.filter((order) => order.status === "uploading_audio").length,
    production: orders.filter((order) => order.status === "sent_for_sewing").length,
    selected: dashboardStatus === "total" ? orders.length : orders.filter((order) => order.status === dashboardStatus).length,
    issue: orders.filter((order) => order.status === "issue").length,
  }), [orders, dashboardStatus]);

  const reportingOrders = useMemo(() => {
    if (salesRange === "active") return orders.filter((order) => order.status !== "shipped");
    if (salesRange === "lifetime") return orders;
    const days = salesRange === "7d" ? 7 : 30;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    return orders.filter((order) => new Date(order.orderDate).getTime() >= threshold);
  }, [orders, salesRange]);
  const sales = useMemo(() => summarizeSales(reportingOrders, processorSettings), [reportingOrders, processorSettings]);
  const stock = useMemo(() => summarizeStock(orders, stockSettings), [orders, stockSettings]);
  const historyEvents = useMemo<ActivityEvent[]>(() => [
    ...activity,
    ...orders.flatMap((order) => order.statusHistory.map((event) => ({
      id: `status-${event.id}`,
      orderNumber: order.orderNumber,
      action: "Status changed",
      detail: `${statusLabels[event.status]}${event.note ? ` - ${event.note}` : ""}`,
      actor: event.changedBy,
      createdAt: event.changedAt,
    }))),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [activity, orders]);

  if (!session) return <Login onLogin={setSession} />;
  const currentSession = session;

  async function logActivity(action: string, detail: string, orderNumber?: string) {
    const createdAt = new Date().toISOString();
    const event = {
      id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
      orderNumber,
      action,
      detail,
      actor: session ? `${session.displayName} (${session.username})` : "System",
      createdAt,
    };
    setActivity((current) => [event, ...current]);
    try { await insertSharedActivity(event); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Activity history could not be saved."); }
  }

  async function updateOrder(orderId: string, patch: Partial<Order>) {
    if (currentSession.role !== "admin") return setNotice("Staff accounts can only move orders to the next stage.");
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const updated = { ...order, ...patch, updatedAt: new Date().toISOString() };
    setOrders((current) => current.map((item) => item.id === orderId ? updated : item));
    try {
      await upsertSharedOrders([updated]);
      await logActivity("Order updated", `Changed ${Object.keys(patch).join(", ")}.`, order.orderNumber);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Order update could not be saved.");
      await loadSharedData();
    }
  }

  async function setStatus(order: Order, status: OrderStatus) {
    if (order.status === status) return;
    if (currentSession.role === "staff" && nextStatus[order.status] !== status) {
      return setNotice("Staff accounts can only move orders to the next stage.");
    }
    const changedAt = new Date().toISOString();
    const updated: Order = {
      ...order,
      status,
      updatedAt: changedAt,
      statusHistory: [...(order.statusHistory ?? []), {
        id: `${order.id}-${changedAt}`,
        status,
        changedAt,
        changedBy: session ? `${session.displayName} (${session.username})` : "Staff",
      }],
    };
    setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
    try { await upsertSharedOrders([updated]); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Status change could not be saved."); await loadSharedData(); return; }
    setNotice(`#${order.orderNumber} updated to ${statusLabels[status]}.`);
  }

  async function bulkMoveNext() {
    const selected = orders.filter((order) => selectedOrders.includes(order.id));
    if (!selected.length) return setNotice("Select at least one order first.");
    const changedAt = new Date().toISOString();
    let moved = 0;
    const changed: Order[] = [];
    const nextOrders = orders.map((order) => {
      if (!selectedOrders.includes(order.id)) return order;
      const status = nextStatus[order.status];
      if (!status) return order;
      moved += 1;
      const updated: Order = {
        ...order,
        status,
        updatedAt: changedAt,
        statusHistory: [...(order.statusHistory ?? []), {
          id: `${order.id}-${changedAt}-${status}`,
          status,
          changedAt,
          changedBy: session ? `${session.displayName} (${session.username})` : "Staff",
          note: "Bulk status update",
        }],
      };
      changed.push(updated);
      return updated;
    });
    setOrders(nextOrders);
    try { await upsertSharedOrders(changed); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Orders could not be saved."); await loadSharedData(); return; }
    setSelectedOrders([]);
    setNotice(`${moved} order${moved === 1 ? "" : "s"} moved to the next status.`);
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrders((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  }

  function reorderFulfilmentColumn(source: FulfilmentColumn, target: FulfilmentColumn) {
    if (source === target || source === "orderNumber" || target === "orderNumber") return;
    setFulfilmentColumns((current) => {
      const next = current.filter((column) => column !== source);
      next.splice(next.indexOf(target), 0, source);
      return next;
    });
    setDraggedColumn(null);
  }

  async function copyCertificateLink(order: Order) {
    const link = certificateLink(order, false);
    if (!link) return setNotice(`#${order.orderNumber} has no certificate code.`);
    await navigator.clipboard.writeText(link);
    setNotice(`Certificate link for #${order.orderNumber} copied without https://.`);
  }

  async function runImport() {
    const { orders: imported, result } = importShopifyData(orderCsv, metafieldCsv, orders, session ? `${session.displayName} (${session.username})` : "Admin");
    try {
      await upsertSharedOrders(imported);
      await ensurePaymentProcessors(imported.map((order) => order.paymentProcessor));
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Import could not be saved to Supabase."); return; }
    setOrders(imported);
    setOrderCsv("");
    setMetafieldCsv("");
    setNotice(`${result.imported} new orders imported, ${result.updated} updated, ${result.skipped} skipped.`);
    await logActivity("CSV import", `${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped.`);
    setView("orders");
    await loadSharedData();
  }

  async function saveProcessor(setting: PaymentProcessorSetting) {
    try {
      await savePaymentProcessorSetting(setting);
      setNotice(`${setting.processor} processing fee saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Processing fee could not be saved.");
      await loadSharedData();
    }
  }

  async function createAccount() {
    if (!newAccount.username.trim() || !newAccount.displayName.trim() || newAccount.password.length < 8) {
      return setNotice("Enter a username, display name, and password of at least 8 characters.");
    }
    try {
      await createDashboardAccount(currentSession.token, newAccount, newAccount.password);
      setAccounts(await fetchDashboardAccounts(currentSession.token));
      setNewAccount({ username: "", displayName: "", role: "staff", password: "" });
      setNotice("Account created.");
      await logActivity("Account created", `Created @${newAccount.username} as ${newAccount.role}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Account could not be created.");
    }
  }

  async function saveAccount(account: DashboardAccount, password = "") {
    try {
      await updateDashboardAccount(currentSession.token, account, password);
      setAccounts(await fetchDashboardAccounts(currentSession.token));
      setNotice(`@${account.username} updated.`);
      await logActivity("Account updated", `Updated @${account.username}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Account could not be updated.");
    }
  }

  async function saveStock(setting: StockSetting) {
    try {
      await saveStockSetting(setting);
      setNotice(`${setting.itemKey} stock saved.`);
      await logActivity("Stock updated", `${setting.itemKey} initial stock set to ${setting.initialStock}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Stock could not be saved.");
    }
  }

  function downloadFulfilled() {
    const blob = new Blob([fulfilledOrdersCsv(orders)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meaningful-plushies-fulfilled-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectManualOrders() {
    const requested = manualOrderIds.split(/[\s,;#]+/).map((value) => value.replace(/\D/g, "")).filter(Boolean);
    const found = orders.filter((order) => requested.includes(order.orderNumber)).map((order) => order.id);
    const missing = requested.filter((number) => !orders.some((order) => order.orderNumber === number));
    setPackingSelection((current) => [...new Set([...current, ...found])]);
    setNotice(missing.length ? `Selected ${found.length} order(s). Not found: ${missing.map((id) => `#${id}`).join(", ")}.` : `Selected ${found.length} order(s) for printing.`);
  }

  async function printPackingSlips() {
    if (!packingOrders.length) {
      setNotice("Select at least one order before printing.");
      return;
    }
    const changedAt = new Date().toISOString();
    const changed: Order[] = [];
    const nextOrders = orders.map((order) => {
      if (!packingSelection.includes(order.id) || order.status !== "new_order") return order;
      const updated: Order = {
        ...order,
        status: "uploading_audio",
        updatedAt: changedAt,
        statusHistory: [...(order.statusHistory ?? []), {
          id: `${order.id}-${changedAt}-uploading-audio`,
          status: "uploading_audio",
          changedAt,
          changedBy: session ? `${session.displayName} (${session.username})` : "Staff",
          note: "Packing slip printed",
        }],
      };
      changed.push(updated);
      return updated;
    });
    try { await upsertSharedOrders(changed); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Packing-slip changes could not be saved."); return; }
    setOrders(nextOrders);
    window.print();
    setNotice(`${packingOrders.length} packing slip${packingOrders.length === 1 ? "" : "s"} sent to print. New orders moved to Uploading Audio.`);
    await logActivity("Packing slips printed", `${packingOrders.length} packing slip${packingOrders.length === 1 ? "" : "s"} printed.`);
  }

  async function deleteOrders(orderIds: string[]) {
    const deleting = orders.filter((order) => orderIds.includes(order.id));
    if (!deleting.length || !window.confirm(`Delete ${deleting.length} selected order${deleting.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    try { await deleteSharedOrders(orderIds); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Orders could not be deleted."); return; }
    setOrders((current) => current.filter((order) => !orderIds.includes(order.id)));
    setSelectedOrders([]);
    setSelectedId(null);
    await Promise.all(deleting.map((order) => logActivity("Order deleted", `${order.customerName || "Customer"} - ${order.product || "Order"}.`, order.orderNumber)));
    setNotice(`${deleting.length} order${deleting.length === 1 ? "" : "s"} deleted.`);
  }

  async function readFile(file: File | undefined, target: "orders" | "metafields") {
    if (!file) return;
    const text = await file.text();
    if (target === "orders") setOrderCsv(text);
    else setMetafieldCsv(text);
  }

  function fulfilmentCell(order: Order, column: FulfilmentColumn) {
    if (column === "orderNumber") return <strong>{orderLabel(order)}</strong>;
    if (column === "meaningfulMessage") return order.meaningfulMessage ? <a href={order.meaningfulMessage} target="_blank" rel="noreferrer">Open message</a> : "-";
    if (column === "plushName") return <strong>{order.plushName || "-"}</strong>;
    if (column === "character") return order.character || "-";
    if (column === "idWebsiteLink") {
      const link = certificateLink(order);
      return link ? <div className="link-copy"><a href={link} target="_blank" rel="noreferrer">{certificateLink(order, false)}</a><button type="button" onClick={() => copyCertificateLink(order)}>Copy</button></div> : "-";
    }
    if (column === "customerName") return order.customerName || "-";
    return order.phone || "-";
  }

  return <main className="app-shell">
    <aside className="side-nav">
      <div className="logo"><span>MP</span><div>Meaningful Plushies<small>Fulfilment</small></div></div>
      <nav>
        <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><Icon name="orders" /> Orders</button>
        <button className={view === "fulfilment" ? "active" : ""} onClick={() => setView("fulfilment")}><Icon name="fulfilment" /> Fulfilment</button>
        <button className={view === "packing_slips" ? "active" : ""} onClick={() => setView("packing_slips")}><Icon name="packing" /> Packing Slips</button>
        <button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><Icon name="import" /> CSV Import</button>
        <button className={view === "fulfilled" ? "active" : ""} onClick={() => setView("fulfilled")}><Icon name="shipped" /> Shipped</button>
        {session.role === "admin" && <button className={view === "stock" ? "active" : ""} onClick={() => setView("stock")}><Icon name="stock" /> Stock Count</button>}
        {session.role === "admin" && <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}><Icon name="history" /> History</button>}
        {session.role === "admin" && <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}><Icon name="settings" /> Settings</button>}
      </nav>
      <div className="user-card"><div className="avatar">{session.displayName.slice(0, 1)}</div><div><strong>{session.displayName}</strong><span>@{session.username} | {session.role === "admin" ? "Administrator" : "Fulfilment staff"}</span></div><button title="Sign out" onClick={() => setSession(null)}><Icon name="logout" /></button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><p>FULFILMENT CONTROL</p><h1>{view === "import" ? "Import Shopify Orders" : view === "fulfilled" ? "Shipped Orders" : view === "fulfilment" ? "Fulfilment" : view === "packing_slips" ? "Packing Slips" : view === "history" ? "Activity History" : view === "settings" ? "Settings" : view === "stock" ? "Stock Count" : "Orders Dashboard"}</h1></div><div className="top-actions"><span className={`role-badge ${session.role}`}>{session.role}</span>{view === "packing_slips" && <button className="button primary print-trigger" onClick={printPackingSlips}>Print {packingOrders.length} A6 slip{packingOrders.length === 1 ? "" : "s"}</button>}{view !== "import" && <button className="button secondary" onClick={() => setView("import")}>Import CSV</button>}</div></header>
      {databaseError && <div className="notice"><span>Database connection: {databaseError}</span></div>}
      {loadingOrders && <div className="notice"><span>Loading shared orders from Supabase...</span></div>}
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>x</button></div>}

      {view !== "import" && view !== "packing_slips" && view !== "history" && view !== "settings" && view !== "stock" && <>
        {view === "orders" && <section className="stats">
          <Stat label="Active orders" value={counts.total} color="navy" />
          <Stat label="Uploading audio" value={counts.voice} color="orange" />
          <Stat label="Sent for sewing" value={counts.production} color="blue" />
          <article className="stat green selectable-stat"><select aria-label="Choose dashboard status" value={dashboardStatus} onChange={(event) => setDashboardStatus(event.target.value as OrderStatus | "total")}><option value="total">Total orders</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><strong>{counts.selected}</strong></article>
          <Stat label="Issues" value={counts.issue} color="red" />
        </section>}

        {view === "orders" && session.role === "admin" && <>
          <div className="reporting-header">
            <div><strong>Sales reporting</strong><span>{reportingOrders.length} order records</span></div>
            <div className="range-tabs">
              {salesRanges.map(({ value, label }) => <button key={value} className={salesRange === value ? "active" : ""} onClick={() => setSalesRange(value)}>{label}</button>)}
            </div>
          </div>
          <section className="sales-stats">
            <MoneyStat label="Total sales" value={sales.gross} tone="sales" />
            <MoneyStat label="Product discounts" value={sales.productDiscounted} tone="discount" />
            <MoneyStat label="Shipping discounts" value={sales.shippingDiscounted} tone="shipping" />
            <MoneyStat label="Bank transfer collected" value={sales.bankTransfer} tone="transfer" />
            <MoneyStat label="Cash collected" value={sales.collected} tone="collected" />
            <MoneyStat label="Payment processing fees" value={sales.processingFees} tone="fees" />
          </section>
        </>}

        {view !== "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, phone or tracking..." /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>{view === "orders" && <button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>}{session.role === "admin" && <button className="button danger" disabled={!selectedOrders.length} onClick={() => deleteOrders(selectedOrders)}>Delete</button>}{view === "fulfilled" && <button className="button secondary" onClick={downloadFulfilled}>Export CSV</button>}</div>
          <div className="table-scroll"><table className="orders-table"><thead><tr><th><input type="checkbox" aria-label="Select visible orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Character</th><th>Voice</th><th>Plush name</th><th>Status</th><th>Tracking number</th><th>Last updated</th><th>View</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={selectedOrders.includes(order.id)} onChange={() => toggleOrderSelection(order.id)} /></td><td><strong>{orderLabel(order)}</strong></td><td>{formatDate(order.orderDate)}</td><td><strong>{order.customerName || "-"}</strong></td><td>{order.phone || "-"}</td><td>{order.character || "-"}</td><td>{order.voiceLength ? `${order.voiceLength}s` : "-"}</td><td>{order.plushName || "-"}</td><td><StatusPill status={order.status} /></td><td><code>{order.trackingNumber || "-"}</code></td><td>{formatDate(order.updatedAt, true)}</td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>No orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {view === "fulfilled" ? orders.filter((order) => order.status === "shipped").length : orders.length} orders</div>
        </section>}

        {view === "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, plush name, character, customer or phone..." /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>{session.role === "admin" && <button className="button danger" disabled={!selectedOrders.length} onClick={() => deleteOrders(selectedOrders)}>Delete</button>}</div>
          <div className="fulfilment-scroll table-scroll"><table className="orders-table fulfilment-table"><thead><tr><th className="select-column"><input type="checkbox" aria-label="Select visible fulfilment orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th className="locked-order-column">Order ID</th>{fulfilmentColumns.filter((column) => column !== "orderNumber").map((column) => <th key={column} className={draggedColumn === column ? "dragging" : ""} draggable onDragStart={(event) => { setDraggedColumn(column); event.dataTransfer.setData("text/plain", column); }} onDragEnd={() => setDraggedColumn(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => reorderFulfilmentColumn(event.dataTransfer.getData("text/plain") as FulfilmentColumn, column)}><span className="drag-handle"><Icon name="drag" /></span>{fulfilmentColumnLabels[column]}</th>)}<th>Status</th><th>View</th></tr></thead><tbody>{filtered.map((order) => { const checked = selectedOrders.includes(order.id); return <tr key={order.id} className={checked ? "selected-row" : ""} onClick={(event) => { if ((event.target as HTMLElement).closest("button,a,input")) return; toggleOrderSelection(order.id); }}><td className="select-column"><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={checked} onChange={() => toggleOrderSelection(order.id)} /></td><td className="locked-order-column"><strong>{orderLabel(order)}</strong></td>{fulfilmentColumns.filter((column) => column !== "orderNumber").map((column) => <td key={column} className={column === "idWebsiteLink" ? "certificate-cell" : ""}>{fulfilmentCell(order, column)}</td>)}<td><StatusPill status={order.status} /></td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty"><strong>No fulfilment orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {orders.length} orders</div>
        </section>}
      </>}

      {view === "packing_slips" && <section className="packing-page">
        <div className="packing-controls card">
          <div className="packing-manual"><div><h2>Choose orders to print</h2><p>Enter order IDs separated by commas or spaces, or select orders from the list below.</p></div><div className="manual-entry"><input value={manualOrderIds} onChange={(event) => setManualOrderIds(event.target.value)} onKeyDown={(event) => event.key === "Enter" && selectManualOrders()} placeholder="Example: 1359, 1360, 1361" /><button className="button primary" onClick={selectManualOrders}>Add order IDs</button></div></div>
          <div className="packing-list-header"><strong>Available orders</strong><select value={packingStatusFilter} onChange={(event) => setPackingStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><div><button onClick={() => setPackingSelection((current) => [...new Set([...current, ...packingAvailableOrders.map((order) => order.id)])])}>Select shown</button><button onClick={() => setPackingSelection([])}>Clear</button></div></div>
          <div className="packing-order-list">{packingAvailableOrders.map((order) => <label key={order.id}><input type="checkbox" checked={packingSelection.includes(order.id)} onChange={() => setPackingSelection((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{orderLabel(order)} | {order.plushName || "Unnamed plushie"}</strong><span>{order.customerName} | {order.character || "No character"}</span></div><StatusPill status={order.status} /></label>)}</div>
        </div>
        <div className="packing-preview"><div className="preview-heading"><div><h2>A6 print preview</h2><p>One packing slip will print on each A6 page.</p></div><span>{packingOrders.length} selected</span></div>{packingOrders.length ? <div className="slip-grid">{packingOrders.map((order) => <PackingSlip order={order} key={order.id} />)}</div> : <div className="preview-empty"><strong>No orders selected</strong><p>Enter order IDs or tick orders from the list.</p></div>}</div>
      </section>}

      {view === "stock" && session.role === "admin" && <section className="stock-page">
        <div className="stock-grid">{stock.characters.map((item) => <article className="stock-card card" key={item.name}><span>{item.name}</span><strong>{item.remaining}</strong><p>{item.sold} sold from {item.initial} initial stock</p></article>)}</div>
        <section className="card voice-stock"><div><span>Shared voice inventory</span><strong>{stock.voiceRemaining}</strong><p>{stock.voiceSold} total sold from {stock.voiceInitial} initial stock</p></div><div className="voice-breakdown">{stock.voices.map((voice) => <article key={voice.length}><strong>{voice.sold}</strong><span>{voice.length}s sold</span></article>)}</div></section>
      </section>}

      {view === "history" && session.role === "admin" && <section className="history-page card"><div className="history-page-header"><div><h2>Activity history</h2><p>Every recorded import, edit, status change, print, and deletion.</p></div><span>{historyEvents.length} actions</span></div><div className="activity-list">{historyEvents.map((event) => <article key={event.id}><div className="activity-icon"><Icon name="history" /></div><div><strong>{event.action}</strong><p>{event.detail}</p><span>{event.orderNumber ? `Order #${event.orderNumber} | ` : ""}{event.actor} | {formatDate(event.createdAt, true)}</span></div></article>)}{!historyEvents.length && <div className="empty"><strong>No activity recorded yet</strong><p>New actions will appear here.</p></div>}</div></section>}

      {view === "settings" && session.role === "admin" && <section className="settings-page card">
        <div className="settings-heading"><div><h2>Accounts and permissions</h2><p>Admins can edit everything. Staff can use workflow pages and only advance order stages.</p></div><span>{accounts.length} accounts</span></div>
        <div className="account-create"><input placeholder="Username" value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value.toLowerCase() })} /><input placeholder="Display name" value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} /><select value={newAccount.role} onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value as UserRole })}><option value="staff">Staff</option><option value="admin">Admin</option></select><input type="password" placeholder="Password (8+ characters)" value={newAccount.password} onChange={(event) => setNewAccount({ ...newAccount, password: event.target.value })} /><button className="button primary" onClick={createAccount}>Create account</button></div>
        <div className="account-list">{accounts.map((account) => <div className="account-row" key={account.id}><strong>@{account.username}</strong><input value={account.displayName} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, displayName: event.target.value } : item))} /><select value={account.role} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: event.target.value as UserRole } : item))}><option value="staff">Staff</option><option value="admin">Admin</option></select><input type="password" placeholder="New password (optional)" value={accountPasswords[account.id] ?? ""} onChange={(event) => setAccountPasswords((current) => ({ ...current, [account.id]: event.target.value }))} /><label><input type="checkbox" checked={account.active} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: event.target.checked } : item))} /> Active</label><button className="button primary" onClick={() => saveAccount(account, accountPasswords[account.id])}>Save</button></div>)}</div>

        <div className="settings-heading"><div><h2>Initial stock</h2><p>Character stock is separate. Voice stock is one shared pool, so any 5s, 10s, or 20s sale deducts one unit.</p></div></div>
        <div className="stock-settings">{[...stockCharacters, "VOICE"].map((itemKey) => { const setting = stockSettings.find((item) => item.itemKey === itemKey) ?? { itemKey, initialStock: 0 }; return <div key={itemKey}><strong>{itemKey === "VOICE" ? "SHARED VOICE UNITS" : itemKey}</strong><input type="number" min="0" step="1" value={setting.initialStock} onChange={(event) => setStockSettings((current) => [...current.filter((item) => item.itemKey !== itemKey), { itemKey, initialStock: Number(event.target.value) }])} /><button className="button primary" onClick={() => saveStock(setting)}>Save</button></div>; })}</div>

        <div className="settings-heading"><div><h2>Payment processor fees</h2><p>New Shopify payment methods appear here automatically. Set a percentage, a fixed RM amount, both, or leave both at zero for no fee.</p></div><span>{processorSettings.length} processors</span></div>
        <div className="processor-list">
          <div className="processor-row processor-header"><strong>Payment method</strong><strong>Percentage</strong><strong>Fixed amount</strong><span /></div>
          {processorSettings.map((setting) => <div className="processor-row" key={setting.processor}><strong>{setting.processor}</strong><label><input type="number" min="0" step="0.01" value={setting.percentage} onChange={(event) => setProcessorSettings((current) => current.map((item) => item.processor === setting.processor ? { ...item, percentage: Number(event.target.value) } : item))} /><span>%</span></label><label><span>RM</span><input type="number" min="0" step="0.01" value={setting.fixedAmount} onChange={(event) => setProcessorSettings((current) => current.map((item) => item.processor === setting.processor ? { ...item, fixedAmount: Number(event.target.value) } : item))} /></label><button className="button primary" onClick={() => saveProcessor(setting)}>Save</button></div>)}
          {!processorSettings.length && <div className="empty"><strong>No payment methods discovered yet</strong><p>Import a Shopify orders CSV and its payment methods will appear here.</p></div>}
        </div>
      </section>}

      {view === "import" && <section className="import-page">
        <div className="import-intro"><span>CSV</span><div><h2>Import Shopify exports</h2><p>Upload either standard Shopify CSV exports or the headerless Sheet25 files. The app matches line items with each Product block and creates one fulfilment record per plushie.</p></div></div>
        <div className="import-columns">
          <ImportBox number="1" title="Shopify order export" required value={orderCsv} onChange={setOrderCsv} onFile={(file) => readFile(file, "orders")} placeholder="Name, Email, Financial Status, Lineitem name..." />
          <ImportBox number="2" title="Order metafields export" value={metafieldCsv} onChange={setMetafieldCsv} onFile={(file) => readFile(file, "metafields")} placeholder="Order GID, Order name, Metafield value..." />
        </div>
        <div className="import-action"><div><strong>Safe repeat imports</strong><p>Existing order numbers are updated without removing status, tracking, notes, or photos.</p></div><button className="button primary large" disabled={!orderCsv.trim()} onClick={runImport}>Validate and import orders</button></div>
      </section>}
    </section>

    {selected && <OrderDrawer order={selected} role={session.role} actor={session.displayName} onClose={() => setSelectedId(null)} onUpdate={(patch) => updateOrder(selected.id, patch)} onStatus={(status) => setStatus(selected, status)} />}
  </main>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try { onLogin(await loginDashboardAccount(username, password)); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Sign in failed."); }
    finally { setSigningIn(false); }
  }
  return <main className="login-page"><section className="login-brand"><div className="login-logo">MP</div><p>MEANINGFUL PLUSHIES</p><h1>A calmer way to manage every plushie.</h1><span>Track voice, production, packing and delivery from one simple workspace.</span></section><section className="login-panel"><form onSubmit={submit}><p className="eyebrow">STAFF PORTAL</p><h2>Welcome back</h2><span>Sign in with the account created by your administrator.</span>{error && <p className="login-error">{error}</p>}<label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="button primary large" type="submit" disabled={signingIn}>{signingIn ? "Signing in..." : "Sign in"}</button></form></section></main>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <article className={`stat ${color}`}><span>{label}</span><strong>{value}</strong></article>;
}

function MoneyStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className={`money-stat ${tone}`}><span>{label}</span><strong>{formatMoney(value)}</strong></article>;
}

function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status]}</span>;
}

function ImportBox({ number, title, required, value, onChange, onFile, placeholder }: { number: string; title: string; required?: boolean; value: string; onChange: (value: string) => void; onFile: (file?: File) => void; placeholder: string }) {
  return <article className="card import-box"><div className="import-heading"><span>{number}</span><div><h3>{title}</h3><p>{required ? "Required" : "Optional, but recommended"}</p></div></div><label className="file-drop"><input type="file" accept=".csv,text/csv" onChange={(event) => onFile(event.target.files?.[0])} /><strong>Choose CSV file</strong><span>or paste the CSV content below</span></label><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></article>;
}

function OrderDrawer({ order, role, actor, onClose, onUpdate, onStatus }: { order: Order; role: UserRole; actor: string; onClose: () => void; onUpdate: (patch: Partial<Order>) => void; onStatus: (status: OrderStatus) => void }) {
  const admin = role === "admin";
  const following = nextStatus[order.status];

  function uploadPhoto(file?: File) {
    if (!file) return;
    if (file.size > 3_000_000) return alert("Please choose an image smaller than 3 MB.");
    const reader = new FileReader();
    reader.onload = () => onUpdate({ photoDataUrl: String(reader.result), photoName: file.name });
    reader.readAsDataURL(file);
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="order-drawer"><div className="drawer-header"><div><p>ORDER DETAIL</p><h2>{orderLabel(order)}</h2></div><button onClick={onClose}>x</button></div><div className="drawer-body">
    <section className="detail-summary"><div><span>Current status</span><StatusPill status={order.status} /></div><div><span>Last updated</span><strong>{formatDate(order.updatedAt, true)}</strong></div></section>
    <section className="detail-section"><h3>Quick actions</h3><div className="status-actions">{following && <button className="button primary" onClick={() => onStatus(following)}>Move to {statusLabels[following]}</button>}{admin && <button className="button issue-button" onClick={() => onStatus("issue")}>Mark issue</button>}{admin && order.status === "issue" && <button className="button secondary" onClick={() => onStatus("sent_for_sewing")}>Resolve issue</button>}<a className="button whatsapp" href={whatsappLink(order)} target="_blank">Open WhatsApp</a></div></section>
    <section className="detail-section"><h3>Customer and order</h3><div className="field-grid"><Field label="Order number" value={`#${order.orderNumber}`} /><Field label="Order date" value={formatDate(order.orderDate, true)} /><Field label="Payment method" value={order.paymentProcessor || "Unknown"} /><Editable label="Customer name" value={order.customerName} disabled={!admin} onChange={(value) => onUpdate({ customerName: value })} /><Editable label="Phone" value={order.phone} disabled={!admin} onChange={(value) => onUpdate({ phone: value })} /><Editable wide label="Address" value={order.address} disabled={!admin} onChange={(value) => onUpdate({ address: value })} /></div></section>
    <section className="detail-section"><h3>Plushie details</h3><div className="field-grid"><Editable label="Product name" value={order.product} disabled={!admin} onChange={(value) => onUpdate({ product: value })} /><Editable label="Character" value={order.character} disabled={!admin} onChange={(value) => onUpdate({ character: value })} /><Editable label="Set indicator" value={order.setIndicator ?? ""} disabled={!admin} onChange={(value) => onUpdate({ setIndicator: value })} /><Editable label="ID website link" value={order.idWebsiteLink ?? ""} disabled={!admin} onChange={(value) => onUpdate({ idWebsiteLink: value })} /><Editable label="Voice length" value={String(order.voiceLength || "")} disabled={!admin} onChange={(value) => onUpdate({ voiceLength: Number(value) || 0 })} /><Editable label="Plush name" value={order.plushName} disabled={!admin} onChange={(value) => onUpdate({ plushName: value })} /><Editable wide label="Remark" value={order.remark ?? ""} disabled={!admin} onChange={(value) => onUpdate({ remark: value })} /><Editable wide textarea label="Meaningful note" value={order.meaningfulNote} disabled={!admin} onChange={(value) => onUpdate({ meaningfulNote: value })} /><div className="field wide"><label>Meaningful message</label>{order.meaningfulMessage ? <a href={order.meaningfulMessage} target="_blank" rel="noreferrer">Open customer message</a> : <span>Not provided</span>}</div><div className="field"><label>Voice upload</label>{admin ? <select value={order.voiceUploadStatus} onChange={(event) => onUpdate({ voiceUploadStatus: event.target.value as Order["voiceUploadStatus"] })}><option value="missing">Missing</option><option value="received">Received</option><option value="checked">Checked</option></select> : <strong>{order.voiceUploadStatus}</strong>}</div></div></section>
    <section className="detail-section"><h3>Delivery</h3><div className="field-grid"><Editable label="Courier" value={order.courier} disabled={!admin} placeholder="J&T Express" onChange={(value) => onUpdate({ courier: value })} /><Editable label="Tracking number" value={order.trackingNumber} disabled={!admin} placeholder="Enter tracking number" onChange={(value) => onUpdate({ trackingNumber: value })} /></div></section>
    <section className="detail-section"><h3>Tailor / packing photo</h3><div className="photo-field">{order.photoDataUrl ? <img src={order.photoDataUrl} alt="Tailor or packing evidence" /> : <div className="photo-placeholder">No photo uploaded</div>}{admin && <label className="button secondary"><input type="file" accept="image/*" onChange={(event) => uploadPhoto(event.target.files?.[0])} />{order.photoDataUrl ? "Replace photo" : "Upload photo"}</label>} {order.photoName && <small>{order.photoName}</small>}</div></section>
    <section className="detail-section"><h3>Internal notes</h3><textarea className="notes" value={order.internalNotes} disabled={!admin} onChange={(event) => onUpdate({ internalNotes: event.target.value })} placeholder="Add notes visible to your team..." /></section>
    <section className="detail-section"><h3>Status history</h3><div className="history">{[...order.statusHistory].reverse().map((event) => <div key={event.id}><span></span><div><strong>{statusLabels[event.status]}</strong><p>{event.changedBy} | {formatDate(event.changedAt, true)}</p>{event.note && <small>{event.note}</small>}</div></div>)}</div></section>
    {!admin && <p className="permission-note">Signed in as Staff. You can only move orders to the next stage.</p>}
  </div></aside></div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="field"><label>{label}</label><strong>{value || "-"}</strong></div>;
}

function Editable({ label, value, onChange, disabled, placeholder, wide, textarea }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; wide?: boolean; textarea?: boolean }) {
  return <div className={`field ${wide ? "wide" : ""}`}><label>{label}</label>{textarea ? <textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function PackingSlip({ order }: { order: Order }) {
  return <article className="a6-slip"><header><span>ORDER ID</span><strong>{orderLabel(order)}</strong></header><div className="slip-fields"><div className="primary-slip-field"><label>CHARACTER:</label><p>{order.character || "-"}</p></div><div className="primary-slip-field"><label>PLUSH NAME:</label><p>{order.plushName || "-"}</p></div><div><label>CUSTOMER:</label><p>{order.customerName || "-"}</p></div><div><label>PHONE:</label><p>{order.phone || "-"}</p></div><div className="remark-row"><label>REMARK:</label><p>{order.remark || "-"}</p></div></div><footer>Meaningful Plushies</footer></article>;
}

type IconName = "orders" | "fulfilment" | "packing" | "import" | "shipped" | "logout" | "search" | "history" | "drag" | "settings" | "stock";

function Icon({ name }: { name: IconName }) {
  const common: SVGProps<SVGSVGElement> = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "orders") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === "fulfilment") return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>;
  if (name === "packing") return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>;
  if (name === "import") return <svg {...common}><path d="M12 3v12M7 8l5-5 5 5M5 15v5h14v-5"/></svg>;
  if (name === "shipped") return <svg {...common}><path d="M20 6 9 17l-5-5"/></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
  if (name === "stock") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "drag") return <svg {...common}><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none"/></svg>;
  return <svg {...common}><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>;
}

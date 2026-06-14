"use client";

import "./settings.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, SVGProps } from "react";
import { fulfilledOrdersCsv, importShopifyData, normalizePaymentProcessor } from "../lib/importer";
import { buildSalesReportRows, summarizeSales } from "../lib/sales";
import { stockCharacters, summarizeStock } from "../lib/stock";
import {
  createDashboardAccount,
  deleteSharedOrders,
  ensurePaymentProcessors,
  fetchSharedActivity,
  fetchSharedOrders,
  fetchDashboardAccounts,
  fetchPaymentProcessorSettings,
  fetchSalesFeeSettings,
  fetchStockSettings,
  insertSharedActivity,
  loginDashboardAccount,
  saveStockSetting,
  savePaymentProcessorSetting,
  saveSalesFeeSettings,
  subscribeToSharedData,
  supabaseConfigured,
  updateDashboardAccount,
  upsertSharedOrders,
  type DashboardSession,
} from "../lib/supabase";
import { orderStatuses, type DashboardAccount, type Order, type OrderStatus, type PaymentProcessorSetting, type SalesFeeSetting, type StockSetting, type UserRole } from "../lib/types";

type Session = DashboardSession;
type View = "orders" | "fulfilment" | "packing_slips" | "import" | "fulfilled" | "history" | "settings" | "stock" | "sales_report";
type SalesRange = "active" | "today" | "7d" | "30d" | "lifetime";
type SortKey = "orderNumber" | "importedAt" | "updatedAt";
type SortDirection = "asc" | "desc";
type CollectedMetric = "bankTransfer" | "stripeCollected" | "xenditCollected" | "totalCollected";
type DiscountMetric = "productDiscounted" | "shippingDiscounted";
type FeeMetric = "processingFees" | "shopifyFees" | "totalFees";
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
  { value: "today", label: "Today" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "lifetime", label: "Lifetime" },
];

const dashboardSelectableStatuses: { value: OrderStatus | "total"; label: string }[] = [
  { value: "total", label: "Total orders" },
  { value: "new_order", label: "New orders" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "issue", label: "Issues" },
];

const collectedMetricLabels: Record<CollectedMetric, string> = {
  bankTransfer: "Bank transfer collected",
  stripeCollected: "Stripe collected",
  xenditCollected: "Xendit collected",
  totalCollected: "Total collected",
};

const discountMetricLabels: Record<DiscountMetric, string> = {
  productDiscounted: "Product discounts",
  shippingDiscounted: "Shipping discounts",
};

const feeMetricLabels: Record<FeeMetric, string> = {
  processingFees: "Payment processing fees",
  shopifyFees: "Shopify fees",
  totalFees: "Total fees",
};

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

function dateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(value);
}

function printView(className: "print-packing" | "print-sales-report") {
  document.body.classList.add(className);
  const cleanup = () => document.body.classList.remove(className);
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
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

function sortOrderRecords<T extends Pick<Order, "orderNumber" | "importedAt" | "updatedAt">>(
  records: T[], key: SortKey, direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    if (key === "orderNumber") return multiplier * (Number(a.orderNumber) - Number(b.orderNumber));
    return multiplier * (new Date(a[key]).getTime() - new Date(b[key]).getTime());
  });
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
  const [dashboardStatusTwo, setDashboardStatusTwo] = useState<OrderStatus | "total">("issue");
  const [salesRange, setSalesRange] = useState<SalesRange>("active");
  const [collectedMetric, setCollectedMetric] = useState<CollectedMetric>("totalCollected");
  const [discountMetric, setDiscountMetric] = useState<DiscountMetric>("productDiscounted");
  const [feeMetric, setFeeMetric] = useState<FeeMetric>("totalFees");
  const [sortKey, setSortKey] = useState<SortKey>("orderNumber");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [reportSelectedOrders, setReportSelectedOrders] = useState<string[]>([]);
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [processorSettings, setProcessorSettings] = useState<PaymentProcessorSetting[]>([]);
  const [salesFeeSettings, setSalesFeeSettings] = useState<SalesFeeSetting>({ shopifyPercentage: 0 });
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
      const [sharedOrders, sharedActivity, sharedProcessorSettings, sharedStockSettings, sharedSalesFeeSettings] = await Promise.all([
        fetchSharedOrders(), fetchSharedActivity(), fetchPaymentProcessorSettings(), fetchStockSettings(), fetchSalesFeeSettings(),
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
      setSalesFeeSettings(sharedSalesFeeSettings);
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
    if (session?.role === "staff" && (["history", "settings", "stock", "sales_report"] as View[]).includes(view)) setView("orders");
  }, [session, view]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const packingOrders = orders.filter((order) => packingSelection.includes(order.id));
  const packingAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => packingStatusFilter === "all" || order.status === packingStatusFilter),
    "orderNumber",
    "desc",
  ), [orders, packingStatusFilter]);
  const filtered = useMemo(() => {
    const source = view === "fulfilled" ? orders.filter((order) => order.status === "shipped") : orders;
    const search = query.trim().toLowerCase();
    const matching = source
      .filter((order) => statusFilter === "all" || order.status === statusFilter)
      .filter((order) => !search || [order.orderNumber, order.customerName, order.phone, order.trackingNumber, order.plushName, order.product, order.character]
        .join(" ").toLowerCase().includes(search));
    return sortOrderRecords(matching, sortKey, sortDirection);
  }, [orders, query, statusFilter, view, sortKey, sortDirection]);

  const counts = useMemo(() => ({
    total: orders.filter((order) => order.status !== "shipped").length,
    voice: orders.filter((order) => order.status === "uploading_audio").length,
    production: orders.filter((order) => order.status === "sent_for_sewing").length,
    selected: dashboardStatus === "total" ? orders.length : orders.filter((order) => order.status === dashboardStatus).length,
    selectedTwo: dashboardStatusTwo === "total" ? orders.length : orders.filter((order) => order.status === dashboardStatusTwo).length,
  }), [orders, dashboardStatus, dashboardStatusTwo]);

  const reportingOrders = useMemo(() => {
    if (salesRange === "active") return orders.filter((order) => order.status !== "shipped");
    if (salesRange === "lifetime") return orders;
    if (salesRange === "today") {
      const today = dateKey(new Date().toISOString());
      return orders.filter((order) => dateKey(order.orderDate) === today);
    }
    const days = salesRange === "7d" ? 7 : 30;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    return orders.filter((order) => new Date(order.orderDate).getTime() >= threshold);
  }, [orders, salesRange]);
  const sales = useMemo(() => summarizeSales(reportingOrders, processorSettings, salesFeeSettings.shopifyPercentage), [reportingOrders, processorSettings, salesFeeSettings]);
  const allSalesReportRows = useMemo(() => buildSalesReportRows(orders, processorSettings, salesFeeSettings.shopifyPercentage), [orders, processorSettings, salesFeeSettings]);
  const dateFilteredReportRows = useMemo(() => allSalesReportRows.filter((row) => {
    const date = dateKey(row.orderDate);
    return (!reportStartDate || date >= reportStartDate) && (!reportEndDate || date <= reportEndDate);
  }).sort((a, b) => Number(a.orderNumber) - Number(b.orderNumber)), [allSalesReportRows, reportStartDate, reportEndDate]);
  const visibleReportRows = useMemo(() => reportSelectedOrders.length
    ? dateFilteredReportRows.filter((row) => reportSelectedOrders.includes(row.orderNumber))
    : dateFilteredReportRows, [dateFilteredReportRows, reportSelectedOrders]);
  const reportTotals = useMemo(() => visibleReportRows.reduce((total, row) => ({
    sales: total.sales + row.salePrice,
    discounts: total.discounts + row.totalDiscount,
    processingFees: total.processingFees + row.processingFee,
    shopifyFees: total.shopifyFees + row.shopifyFee,
    fees: total.fees + row.totalFees,
    cash: total.cash + row.cashAfterFees,
  }), { sales: 0, discounts: 0, processingFees: 0, shopifyFees: 0, fees: 0, cash: 0 }), [visibleReportRows]);
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
    const selected = orders.filter((order) => sel…10909 tokens truncated…Upload either standard Shopify CSV exports or the headerless Sheet25 files. The app matches line items with each Product block and creates one fulfilment record per plushie.</p></div></div>
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

function SelectableMoneyStat({ label, value, tone, selected, options, onChange }: { label: string; value: number; tone: string; selected: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <article className={`money-stat ${tone} selectable-money-stat`}><span>{label}</span><select value={selected} onChange={(event) => onChange(event.target.value)}>{options.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select><strong>{formatMoney(value)}</strong></article>;
}

function SortControls({ sortKey, direction, onKey, onDirection }: { sortKey: SortKey; direction: SortDirection; onKey: (key: SortKey) => void; onDirection: (direction: SortDirection) => void }) {
  return <div className="sort-controls"><select aria-label="Sort orders by" value={sortKey} onChange={(event) => onKey(event.target.value as SortKey)}><option value="orderNumber">Order number</option><option value="importedAt">Last added</option><option value="updatedAt">Last edited</option></select><select aria-label="Sort direction" value={direction} onChange={(event) => onDirection(event.target.value as SortDirection)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></div>;
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

type IconName = "orders" | "fulfilment" | "packing" | "import" | "shipped" | "logout" | "search" | "history" | "drag" | "settings" | "stock" | "report";

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
  if (name === "report") return <svg {...common}><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></svg>;
  if (name === "drag") return <svg {...common}><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none"/></svg>;
  return <svg {...common}><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>;
}

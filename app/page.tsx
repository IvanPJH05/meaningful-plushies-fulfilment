"use client";

import { useEffect, useMemo, useState } from "react";
import { demoOrders } from "../lib/demo-data";
import { fulfilledOrdersCsv, importShopifyData } from "../lib/importer";
import { orderStatuses, type Order, type OrderStatus, type UserRole } from "../lib/types";

type Session = { name: string; email: string; role: UserRole };
type View = "orders" | "fulfilment" | "packing_slips" | "import" | "fulfilled";

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

function whatsappLink(order: Order) {
  const digits = order.phone.replace(/\D/g, "");
  const phone = digits.startsWith("60") ? digits : digits.startsWith("0") ? `60${digits.slice(1)}` : `60${digits}`;
  const tracking = order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : "We will share your tracking number soon.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${order.customerName}, your Meaningful Plushie ${order.plushName} is being prepared. ${tracking}`)}`;
}

function displayProductName(value: string) {
  return value.split(/\s+-\s+(?=[^/]+\s+\(RM)/i)[0]?.trim() || value;
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
  const [orders, setOrders] = useState<Order[]>(demoOrders);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>("all");
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [packingSelection, setPackingSelection] = useState<string[]>([]);
  const [packingStatusFilter, setPackingStatusFilter] = useState<"all" | OrderStatus>("all");
  const [fulfilmentColumns, setFulfilmentColumns] = useState<FulfilmentColumn[]>([
    "orderNumber", "meaningfulMessage", "plushName", "character", "idWebsiteLink", "customerName", "phone",
  ]);
  const [manualOrderIds, setManualOrderIds] = useState("");
  const [orderCsv, setOrderCsv] = useState("");
  const [metafieldCsv, setMetafieldCsv] = useState("");
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const savedOrders = localStorage.getItem("mp-dashboard-orders");
    const savedSession = localStorage.getItem("mp-dashboard-session");
    if (savedOrders) setOrders((JSON.parse(savedOrders) as Order[]).map((order) => {
      const status = legacyStatus[order.status] ?? order.status;
      return {
        ...order,
        status,
        setIndicator: order.setIndicator ?? "",
        idWebsiteLink: order.idWebsiteLink ?? "",
        statusHistory: order.statusHistory.map((event) => ({
          ...event,
          status: legacyStatus[event.status] ?? event.status,
        })),
      };
    }));
    if (savedSession) setSession(JSON.parse(savedSession));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem("mp-dashboard-orders", JSON.stringify(orders));
  }, [orders, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (session) localStorage.setItem("mp-dashboard-session", JSON.stringify(session));
    else localStorage.removeItem("mp-dashboard-session");
  }, [session, hydrated]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const packingOrders = orders.filter((order) => packingSelection.includes(order.id));
  const packingAvailableOrders = orders.filter((order) => packingStatusFilter === "all" || order.status === packingStatusFilter);
  const filtered = useMemo(() => {
    const source = view === "fulfilled" ? orders.filter((order) => order.status === "shipped") : orders;
    const search = query.trim().toLowerCase();
    return source
      .filter((order) => statusFilter === "all" || order.status === statusFilter)
      .filter((order) => !search || [order.orderNumber, order.customerName, order.phone, order.trackingNumber, order.plushName, order.product]
        .join(" ").toLowerCase().includes(search))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, query, statusFilter, view]);

  const counts = useMemo(() => ({
    total: orders.filter((order) => order.status !== "shipped").length,
    voice: orders.filter((order) => order.status === "uploading_audio").length,
    production: orders.filter((order) => order.status === "sent_for_sewing").length,
    packing: orders.filter((order) => order.status === "packed").length,
    issue: orders.filter((order) => order.status === "issue").length,
  }), [orders]);

  if (!session) return <Login onLogin={setSession} />;

  function updateOrder(orderId: string, patch: Partial<Order>) {
    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...order, ...patch, updatedAt: new Date().toISOString() }
      : order));
  }

  function setStatus(order: Order, status: OrderStatus) {
    if (order.status === status) return;
    const changedAt = new Date().toISOString();
    updateOrder(order.id, {
      status,
      statusHistory: [...order.statusHistory, {
        id: `${order.id}-${changedAt}`,
        status,
        changedAt,
        changedBy: session?.name ?? "Staff",
      }],
    });
    setNotice(`#${order.orderNumber} updated to ${statusLabels[status]}.`);
  }

  function bulkMoveNext() {
    const selected = orders.filter((order) => selectedOrders.includes(order.id));
    if (!selected.length) return setNotice("Select at least one order first.");
    const changedAt = new Date().toISOString();
    let moved = 0;
    setOrders((current) => current.map((order) => {
      if (!selectedOrders.includes(order.id)) return order;
      const status = nextStatus[order.status];
      if (!status) return order;
      moved += 1;
      return {
        ...order,
        status,
        updatedAt: changedAt,
        statusHistory: [...order.statusHistory, {
          id: `${order.id}-${changedAt}-${status}`,
          status,
          changedAt,
          changedBy: session?.name ?? "Staff",
          note: "Bulk status update",
        }],
      };
    }));
    setSelectedOrders([]);
    setNotice(`${moved} order${moved === 1 ? "" : "s"} moved to the next status.`);
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrders((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  }

  function reorderFulfilmentColumn(source: FulfilmentColumn, target: FulfilmentColumn) {
    if (source === target) return;
    setFulfilmentColumns((current) => {
      const next = current.filter((column) => column !== source);
      next.splice(next.indexOf(target), 0, source);
      return next;
    });
  }

  async function copyCertificateLink(order: Order) {
    const link = certificateLink(order, false);
    if (!link) return setNotice(`#${order.orderNumber} has no certificate code.`);
    await navigator.clipboard.writeText(link);
    setNotice(`Certificate link for #${order.orderNumber} copied without https://.`);
  }

  function runImport() {
    const { orders: imported, result } = importShopifyData(orderCsv, metafieldCsv, orders, session?.name ?? "Admin");
    setOrders(imported);
    setOrderCsv("");
    setMetafieldCsv("");
    setNotice(`${result.imported} new orders imported, ${result.updated} updated, ${result.skipped} skipped.`);
    setView("orders");
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

  function printPackingSlips() {
    if (!packingOrders.length) {
      setNotice("Select at least one order before printing.");
      return;
    }
    const changedAt = new Date().toISOString();
    setOrders((current) => current.map((order) => {
      if (!packingSelection.includes(order.id) || order.status !== "new_order") return order;
      return {
        ...order,
        status: "uploading_audio",
        updatedAt: changedAt,
        statusHistory: [...order.statusHistory, {
          id: `${order.id}-${changedAt}-uploading-audio`,
          status: "uploading_audio",
          changedAt,
          changedBy: session?.name ?? "Staff",
          note: "Packing slip printed",
        }],
      };
    }));
    window.print();
    setNotice(`${packingOrders.length} packing slip${packingOrders.length === 1 ? "" : "s"} sent to print. New orders moved to Uploading Audio.`);
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
        <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><b>▦</b> Orders</button>
        <button className={view === "fulfilment" ? "active" : ""} onClick={() => setView("fulfilment")}><b>≡</b> Fulfilment</button>
        <button className={view === "packing_slips" ? "active" : ""} onClick={() => setView("packing_slips")}><b>▤</b> Packing Slips</button>
        {session.role === "admin" && <button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><b>⇧</b> CSV Import</button>}
        <button className={view === "fulfilled" ? "active" : ""} onClick={() => setView("fulfilled")}><b>✓</b> Shipped</button>
      </nav>
      <div className="user-card"><div className="avatar">{session.name.slice(0, 1)}</div><div><strong>{session.name}</strong><span>{session.role === "admin" ? "Administrator" : "Fulfilment staff"}</span></div><button title="Sign out" onClick={() => setSession(null)}>↪</button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><p>FULFILMENT CONTROL</p><h1>{view === "import" ? "Import Shopify Orders" : view === "fulfilled" ? "Shipped Orders" : view === "fulfilment" ? "Fulfilment" : view === "packing_slips" ? "Packing Slips" : "Orders Dashboard"}</h1></div><div className="top-actions"><span className={`role-badge ${session.role}`}>{session.role}</span>{view === "packing_slips" && <button className="button primary print-trigger" onClick={printPackingSlips}>Print {packingOrders.length} A6 slip{packingOrders.length === 1 ? "" : "s"}</button>}{session.role === "admin" && view !== "import" && <button className="button secondary" onClick={() => setView("import")}>Import CSV</button>}</div></header>
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}

      {view !== "import" && view !== "packing_slips" && <>
        {view === "orders" && <section className="stats">
          <Stat label="Active orders" value={counts.total} color="navy" />
          <Stat label="Uploading audio" value={counts.voice} color="orange" />
          <Stat label="Sent for sewing" value={counts.production} color="blue" />
          <Stat label="Packed" value={counts.packing} color="green" />
          <Stat label="Issues" value={counts.issue} color="red" />
        </section>}

        {view !== "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, phone or tracking..." /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select>{view === "orders" && <button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>}{view === "fulfilled" && <button className="button secondary" onClick={downloadFulfilled}>Export CSV</button>}</div>
          <div className="table-scroll"><table className="orders-table"><thead><tr><th><input type="checkbox" aria-label="Select visible orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Character</th><th>Voice</th><th>Plush name</th><th>Status</th><th>Tracking number</th><th>Last updated</th><th>View</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={selectedOrders.includes(order.id)} onChange={() => toggleOrderSelection(order.id)} /></td><td><strong>{orderLabel(order)}</strong></td><td>{formatDate(order.orderDate)}</td><td><strong>{order.customerName || "-"}</strong></td><td>{order.phone || "-"}</td><td>{order.character || "-"}</td><td>{order.voiceLength ? `${order.voiceLength}s` : "-"}</td><td>{order.plushName || "-"}</td><td><StatusPill status={order.status} /></td><td><code>{order.trackingNumber || "-"}</code></td><td>{formatDate(order.updatedAt, true)}</td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>No orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {view === "fulfilled" ? orders.filter((order) => order.status === "shipped").length : orders.length} orders</div>
        </section>}

        {view === "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, plush name, character, customer or phone..." /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button></div>
          <div className="table-scroll"><table className="orders-table fulfilment-table"><thead><tr><th><input type="checkbox" aria-label="Select visible fulfilment orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th>{fulfilmentColumns.map((column) => <th key={column} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", column)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => reorderFulfilmentColumn(event.dataTransfer.getData("text/plain") as FulfilmentColumn, column)} title="Drag to reorder">{fulfilmentColumnLabels[column]}</th>)}<th>Status</th><th>View</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={selectedOrders.includes(order.id)} onChange={() => toggleOrderSelection(order.id)} /></td>{fulfilmentColumns.map((column) => <td key={column} className={column === "idWebsiteLink" ? "certificate-cell" : ""}>{fulfilmentCell(order, column)}</td>)}<td><StatusPill status={order.status} /></td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>No fulfilment orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {orders.length} orders</div>
        </section>}
      </>}

      {view === "packing_slips" && <section className="packing-page">
        <div className="packing-controls card">
          <div className="packing-manual"><div><h2>Choose orders to print</h2><p>Enter order IDs separated by commas or spaces, or select orders from the list below.</p></div><div className="manual-entry"><input value={manualOrderIds} onChange={(event) => setManualOrderIds(event.target.value)} onKeyDown={(event) => event.key === "Enter" && selectManualOrders()} placeholder="Example: 1359, 1360, 1361" /><button className="button primary" onClick={selectManualOrders}>Add order IDs</button></div></div>
          <div className="packing-list-header"><strong>Available orders</strong><select value={packingStatusFilter} onChange={(event) => setPackingStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><div><button onClick={() => setPackingSelection((current) => [...new Set([...current, ...packingAvailableOrders.map((order) => order.id)])])}>Select shown</button><button onClick={() => setPackingSelection([])}>Clear</button></div></div>
          <div className="packing-order-list">{packingAvailableOrders.map((order) => <label key={order.id}><input type="checkbox" checked={packingSelection.includes(order.id)} onChange={() => setPackingSelection((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{orderLabel(order)} · {order.plushName || "Unnamed plushie"}</strong><span>{order.customerName} · {order.product}</span></div><StatusPill status={order.status} /></label>)}</div>
        </div>
        <div className="packing-preview"><div className="preview-heading"><div><h2>A6 print preview</h2><p>One packing slip will print on each A6 page.</p></div><span>{packingOrders.length} selected</span></div>{packingOrders.length ? <div className="slip-grid">{packingOrders.map((order) => <PackingSlip order={order} key={order.id} />)}</div> : <div className="preview-empty"><strong>No orders selected</strong><p>Enter order IDs or tick orders from the list.</p></div>}</div>
      </section>}

      {view === "import" && session.role === "admin" && <section className="import-page">
        <div className="import-intro"><span>CSV</span><div><h2>Import Shopify exports</h2><p>Upload either standard Shopify CSV exports or the headerless Sheet25 files. The app matches line items with each Product block and creates one fulfilment record per plushie.</p></div></div>
        <div className="import-columns">
          <ImportBox number="1" title="Shopify order export" required value={orderCsv} onChange={setOrderCsv} onFile={(file) => readFile(file, "orders")} placeholder="Name, Email, Financial Status, Lineitem name..." />
          <ImportBox number="2" title="Order metafields export" value={metafieldCsv} onChange={setMetafieldCsv} onFile={(file) => readFile(file, "metafields")} placeholder="Order GID, Order name, Metafield value..." />
        </div>
        <div className="import-action"><div><strong>Safe repeat imports</strong><p>Existing order numbers are updated without removing status, tracking, notes, or photos.</p></div><button className="button primary large" disabled={!orderCsv.trim()} onClick={runImport}>Validate and import orders</button></div>
      </section>}
    </section>

    {selected && <OrderDrawer order={selected} role={session.role} actor={session.name} onClose={() => setSelectedId(null)} onUpdate={(patch) => updateOrder(selected.id, patch)} onStatus={(status) => setStatus(selected, status)} />}
  </main>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [email, setEmail] = useState("admin@meaningfulplushies.com");
  const [password, setPassword] = useState("demo1234");
  const role: UserRole = email.toLowerCase().startsWith("staff") ? "staff" : "admin";
  return <main className="login-page"><section className="login-brand"><div className="login-logo">MP</div><p>MEANINGFUL PLUSHIES</p><h1>A calmer way to manage every plushie.</h1><span>Track voice, production, packing and delivery from one simple workspace.</span></section><section className="login-panel"><form onSubmit={(event) => { event.preventDefault(); onLogin({ name: role === "admin" ? "Admin" : "Fulfilment Staff", email, role }); }}><p className="eyebrow">STAFF PORTAL</p><h2>Welcome back</h2><span>Sign in to continue to fulfilment.</span><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="button primary large" type="submit">Sign in</button><div className="demo-logins"><strong>Demo roles</strong><button type="button" onClick={() => { setEmail("admin@meaningfulplushies.com"); setPassword("demo1234"); }}>Admin account</button><button type="button" onClick={() => { setEmail("staff@meaningfulplushies.com"); setPassword("demo1234"); }}>Staff account</button></div></form></section></main>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <article className={`stat ${color}`}><span>{label}</span><strong>{value}</strong></article>;
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

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="order-drawer"><div className="drawer-header"><div><p>ORDER DETAIL</p><h2>{orderLabel(order)}</h2></div><button onClick={onClose}>×</button></div><div className="drawer-body">
    <section className="detail-summary"><div><span>Current status</span><StatusPill status={order.status} /></div><div><span>Last updated</span><strong>{formatDate(order.updatedAt, true)}</strong></div></section>
    <section className="detail-section"><h3>Quick actions</h3><div className="status-actions">{following && <button className="button primary" onClick={() => onStatus(following)}>Move to {statusLabels[following]}</button>}<button className="button issue-button" onClick={() => onStatus("issue")}>Mark issue</button>{order.status === "issue" && <button className="button secondary" onClick={() => onStatus("sent_for_sewing")}>Resolve issue</button>}<a className="button whatsapp" href={whatsappLink(order)} target="_blank">Open WhatsApp</a></div></section>
    <section className="detail-section"><h3>Customer and order</h3><div className="field-grid"><Field label="Order number" value={`#${order.orderNumber}`} /><Field label="Order date" value={formatDate(order.orderDate, true)} /><Editable label="Customer name" value={order.customerName} disabled={!admin} onChange={(value) => onUpdate({ customerName: value })} /><Editable label="Phone" value={order.phone} disabled={!admin} onChange={(value) => onUpdate({ phone: value })} /><Editable wide label="Address" value={order.address} disabled={!admin} onChange={(value) => onUpdate({ address: value })} /></div></section>
    <section className="detail-section"><h3>Plushie details</h3><div className="field-grid"><Editable label="Product name" value={order.product} disabled={!admin} onChange={(value) => onUpdate({ product: value })} /><Editable label="Character" value={order.character} disabled={!admin} onChange={(value) => onUpdate({ character: value })} /><Editable label="Set indicator" value={order.setIndicator ?? ""} disabled={!admin} onChange={(value) => onUpdate({ setIndicator: value })} /><Editable label="ID website link" value={order.idWebsiteLink ?? ""} disabled={!admin} onChange={(value) => onUpdate({ idWebsiteLink: value })} /><Editable label="Voice length" value={String(order.voiceLength || "")} disabled={!admin} onChange={(value) => onUpdate({ voiceLength: Number(value) || 0 })} /><Editable label="Plush name" value={order.plushName} disabled={!admin} onChange={(value) => onUpdate({ plushName: value })} /><Editable wide label="Remark" value={order.remark ?? ""} disabled={!admin} onChange={(value) => onUpdate({ remark: value })} /><Editable wide textarea label="Meaningful note" value={order.meaningfulNote} disabled={!admin} onChange={(value) => onUpdate({ meaningfulNote: value })} /><div className="field wide"><label>Meaningful message</label>{order.meaningfulMessage ? <a href={order.meaningfulMessage} target="_blank" rel="noreferrer">Open customer message</a> : <span>Not provided</span>}</div><div className="field"><label>Voice upload</label>{admin ? <select value={order.voiceUploadStatus} onChange={(event) => onUpdate({ voiceUploadStatus: event.target.value as Order["voiceUploadStatus"] })}><option value="missing">Missing</option><option value="received">Received</option><option value="checked">Checked</option></select> : <strong>{order.voiceUploadStatus}</strong>}</div></div></section>
    <section className="detail-section"><h3>Delivery</h3><div className="field-grid"><Editable label="Courier" value={order.courier} disabled={!admin} placeholder="J&T Express" onChange={(value) => onUpdate({ courier: value })} /><Editable label="Tracking number" value={order.trackingNumber} placeholder="Enter tracking number" onChange={(value) => onUpdate({ trackingNumber: value })} /></div></section>
    <section className="detail-section"><h3>Tailor / packing photo</h3><div className="photo-field">{order.photoDataUrl ? <img src={order.photoDataUrl} alt="Tailor or packing evidence" /> : <div className="photo-placeholder">No photo uploaded</div>}{admin && <label className="button secondary"><input type="file" accept="image/*" onChange={(event) => uploadPhoto(event.target.files?.[0])} />{order.photoDataUrl ? "Replace photo" : "Upload photo"}</label>} {order.photoName && <small>{order.photoName}</small>}</div></section>
    <section className="detail-section"><h3>Internal notes</h3><textarea className="notes" value={order.internalNotes} disabled={!admin} onChange={(event) => onUpdate({ internalNotes: event.target.value })} placeholder="Add notes visible to your team..." /></section>
    <section className="detail-section"><h3>Status history</h3><div className="history">{[...order.statusHistory].reverse().map((event) => <div key={event.id}><span></span><div><strong>{statusLabels[event.status]}</strong><p>{event.changedBy} · {formatDate(event.changedAt, true)}</p>{event.note && <small>{event.note}</small>}</div></div>)}</div></section>
    {!admin && <p className="permission-note">Signed in as Staff. You can update status and tracking only.</p>}
  </div></aside></div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="field"><label>{label}</label><strong>{value || "-"}</strong></div>;
}

function Editable({ label, value, onChange, disabled, placeholder, wide, textarea }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; wide?: boolean; textarea?: boolean }) {
  return <div className={`field ${wide ? "wide" : ""}`}><label>{label}</label>{textarea ? <textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function PackingSlip({ order }: { order: Order }) {
  return <article className="a6-slip"><header><span>ORDER ID</span><strong>{orderLabel(order)}</strong></header><div className="slip-fields"><div><label>PRODUCT:</label><p>{displayProductName(order.product) || "-"}</p></div><div><label>PLUSH NAME:</label><p>{order.plushName || "-"}</p></div><div><label>CUSTOMER:</label><p>{order.customerName || "-"}</p></div><div><label>PHONE:</label><p>{order.phone || "-"}</p></div><div className="remark-row"><label>REMARK:</label><p>{order.remark || "-"}</p></div></div><footer>Meaningful Plushies</footer></article>;
}

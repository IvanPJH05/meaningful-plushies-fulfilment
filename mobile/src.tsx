import { manualOrderNotification } from "../lib/manual-order-notification";
import brandLogo from "./meaningful-plushies-logo.png?url";
import { demoMode, demoSession, mobileFetch } from "./demo";
import { certificateUrl, isProductionOrder } from "./workflow";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import "./style.css";

const API = "https://meaningful-plushies-fulfilment.vercel.app/api/mobile";
const SESSION_KEY = "meaningful-fulfilment-mobile-session-v1";
const ORDER_SYNC_KEY = "meaningful-fulfilment-complete-orders-v1";
const DASHBOARD_KEY = "meaningful-fulfilment-mobile-dashboard-v3";
const ORDER_DETAILS_KEY = "meaningful-fulfilment-mobile-order-details-v1";
const MANUAL_APPROVALS_KEY = "meaningful-fulfilment-mobile-manual-approvals-v2";
const MANUAL_HISTORY_KEY = "meaningful-fulfilment-mobile-manual-history-v2";
const MANUAL_DETAILS_KEY = "meaningful-fulfilment-mobile-manual-details-v1";
const MANUAL_SAVED_AT_KEY = "meaningful-fulfilment-mobile-manual-saved-at-v2";
const REPORT_KEY = "meaningful-fulfilment-mobile-report-v1";
const AUTO_SYNC_KEY = "meaningful-fulfilment-mobile-auto-sync-v2";
const LAST_OFFLINE_SYNC_KEY = "meaningful-fulfilment-mobile-last-offline-sync-v1";
const OFFLINE_MEDIA_KEY = "meaningful-fulfilment-mobile-offline-media-v1";
const OFFLINE_ARCHIVE_PATH = "meaningful-fulfilment/archive-v3.json";
const PAGE_SIZE = 100;
const CACHE_MAX_AGE = 5 * 60 * 1000;
const UPDATE_URL = "https://github.com/IvanPJH05/meaningful-plushies-fulfilment/releases/latest/download/app-debug.apk";
const UPDATE_API = "https://api.github.com/repos/IvanPJH05/meaningful-plushies-fulfilment/releases/latest";
const money = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 2 });

type Session = { token: string; username: string; displayName: string; role: "admin" | "staff" };
type OfflineMedia = { voice?: boolean; photo?: boolean; attachment?: boolean; shippingLabel?: boolean };
type Order = { id: string; orderNumber: string; orderDate: string; customerName: string; phone: string; address: string; plushName: string; status: string; character: string; product: string; voiceLength: number; paymentProcessor: string; totalAmount: number; courier: string; trackingNumber: string; updatedAt?: string; offlineMedia?: OfflineMedia };
type OrderDetails = { email: string; subtotalAmount: number; shippingAmount: number; discountAmount: number; outstandingBalance: number; meaningfulNote: string; plushGender?: string; plushBirthDate?: string; plushBelongsTo?: string; certificateCode?: string; idWebsiteLink?: string; shippingMethod?: string; voice: { url: string; fileName: string } | null };
type Detail = { order: Order; details: OrderDetails };
type Dashboard = { counts: Record<string, number>; orders: Order[]; totalCount: number; hasMore: boolean; latestUpdatedAt: string | null; savedAt: number };
type ManualOrder = { id: string; reference?: string; customerName: string; customerEmail: string; phoneOriginal: string; character: string; productDisplayName: string; customisationSessionId: string; speakerSeconds?: number; amountToCollect?: number | null; shippingRegion?: "WEST" | "EAST"; shippingAddress: { address1: string; address2?: string; city: string; province: string; zip: string }; paymentReceipts: Array<{ fileName: string; url: string }>; isCod: boolean; status: "awaiting_payment" | "ready_to_create" | "created" | "cancelled"; shopifyOrderName: string; createdAt: string; updatedAt?: string; paymentApprovedAt: string };
type ManualDetail = { intake: ManualOrder; form: { plushName?: string; gender?: string; birthDate?: string; birthPlace?: string; favouritePerson?: string; belongsTo?: string; meaningfulNote?: string } | null; voiceUrl: string; voiceFileName: string; customisationSavedAt: string };
const tabs = ["Home", "Orders", "Fulfilment", "Account"] as const;
type Tab = typeof tabs[number];
type Workspace = "fulfilment" | "manual_orders" | "reports" | "updates";
type SourceFilter = "all" | "shopify" | "tiktok";
type SalesReport = { sales: { gross: number; totalCollected: number; productDiscounted: number; shippingDiscounted: number; totalFees: number; collected: number }; channel: { shopify: { count: number; sales: number }; tiktok: { count: number; sales: number } }; orderCount: number; savedAt?: number };
type UpdateRelease = { version: string; releasedAt: string; downloadUrl: string; fileName: string };
type OfflineArchive = { version: 2 | 3; dashboard: Dashboard; orderDetails: Record<string, Detail>; manualOrders: ManualOrder[]; manualHistory: ManualOrder[]; manualDetails: Record<string, ManualDetail>; salesReport: SalesReport | null; savedAt: number };
type AutoSyncFrequency = "open" | "hourly" | "daily" | "manual";
const InAppUpdate = registerPlugin<{ install(options: { path: string }): Promise<void>; downloadAndInstall(options: { url: string; fileName: string }): Promise<void> }>("InAppUpdate");

const labels: Record<string, string> = { awaiting_customisation: "Awaiting customisation", new_order: "New order", uploading_audio: "Uploading audio", sent_for_sewing: "Sent for sewing", packed: "Packed", shipped: "Shipped", issue: "Issue" };
const next: Record<string, string> = { awaiting_customisation: "new_order", new_order: "uploading_audio", uploading_audio: "sent_for_sewing", sent_for_sewing: "packed", packed: "shipped" };
function stored<T>(key: string, fallback: T): T { if (demoMode) return fallback; try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function save(key: string, value: unknown) { if (demoMode) return; try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* cache is optional */ } }
function hasStored(key: string) { if (demoMode) return false; try { return localStorage.getItem(key) !== null; } catch { return false; } }
function date(value: string) { return value ? new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
function exactTime(value: string) { return value ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value)) : "Checking release time…"; }
function dateTime(value: string) { return value ? new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(value)) : "Not recorded"; }
function manualStatus(order: ManualOrder) { if (order.status === "created") return order.isCod ? "COD" : "Paid"; if (order.status === "ready_to_create") return order.isCod ? "COD approved" : "Receipt attached"; return "Awaiting payment"; }
function manualAddress(order: ManualOrder) { const a = order.shippingAddress; return [a.address1, a.address2, a.city, a.province, a.zip].filter(Boolean).join(", "); }

function App() {
  const [search, setSearch] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [tab, setTab] = useState<Tab>("Home");
  const [session, setSession] = useState<Session | null>(() => demoMode ? demoSession : stored<Session | null>(SESSION_KEY, null));
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [dashboard, setDashboard] = useState<Dashboard>(() => stored<Dashboard>(DASHBOARD_KEY, { counts: {}, orders: [], totalCount: 0, hasMore: false, latestUpdatedAt: null, savedAt: 0 }));
  const [selected, setSelected] = useState<Detail | null>(null); const [manualDetail, setManualDetail] = useState<ManualDetail | null>(null);
  const [approvalReceipt, setApprovalReceipt] = useState<File | null>(null);
  const [orderDetailsCache, setOrderDetailsCache] = useState<Record<string, Detail>>(() => stored<Record<string, Detail>>(ORDER_DETAILS_KEY, {}));
  const [workspace, setWorkspace] = useState<Workspace>("fulfilment");
  const [manualOrders, setManualOrders] = useState<ManualOrder[]>(() => stored<ManualOrder[]>(MANUAL_APPROVALS_KEY, [])); const [manualHistory, setManualHistory] = useState<ManualOrder[]>(() => stored<ManualOrder[]>(MANUAL_HISTORY_KEY, [])); const [manualPage, setManualPage] = useState<"approvals" | "history">("approvals");
  const [manualDetailsCache, setManualDetailsCache] = useState<Record<string, ManualDetail>>(() => stored<Record<string, ManualDetail>>(MANUAL_DETAILS_KEY, {}));
  const [manualCacheReady, setManualCacheReady] = useState(() => hasStored(MANUAL_APPROVALS_KEY) && hasStored(MANUAL_HISTORY_KEY));
  const [statusFilter, setStatusFilter] = useState("all"); const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all"); const [fromDate, setFromDate] = useState(""); const [toDate, setToDate] = useState(""); const [salesReport, setSalesReport] = useState<SalesReport | null>(() => stored<SalesReport | null>(REPORT_KEY, null)); const [reportLoading, setReportLoading] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<UpdateRelease | null>(null);
  const [autoSyncFrequency, setAutoSyncFrequency] = useState<AutoSyncFrequency>(() => stored<AutoSyncFrequency>(AUTO_SYNC_KEY, "daily")); const [updateDownloading, setUpdateDownloading] = useState(false);
  const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [loadingMore, setLoadingMore] = useState(false); const [opening, setOpening] = useState(false); const [offlineSync, setOfflineSync] = useState<{ active: boolean; completed: number; total: number; media: number }>({ active: false, completed: 0, total: 0, media: 0 });
  const [updatesAvailable, setUpdatesAvailable] = useState(false); const [pullDistance, setPullDistance] = useState(0);
  const archiveLoaded = useRef(Capacitor.getPlatform() === "web");
  const initialWorkspaceLoad = useRef(true);
  const lastOrderFilters = useRef("");
  const orderRequest = useRef(0);
  const completeOrders = useRef<Dashboard | null>(null);
  const orderSync = useRef<Promise<Dashboard> | null>(null);
  const [orderSyncProgress, setOrderSyncProgress] = useState<Dashboard | null>(null);
  const [archiveReady, setArchiveReady] = useState(Capacitor.getPlatform() === "web");

  function orderFilters() { const params = new URLSearchParams({ pageSize: String(PAGE_SIZE), status: statusFilter, source: sourceFilter }); if (fromDate) params.set("from", fromDate); if (toDate) params.set("to", toDate); if (orderQuery && tab === "Orders") params.set("q", orderQuery); return params; }
  async function saveOfflineArchive(archive: OfflineArchive) { if (Capacitor.getPlatform() === "web") return; try { await Filesystem.writeFile({ path: OFFLINE_ARCHIVE_PATH, data: JSON.stringify(archive), directory: Directory.Data, encoding: Encoding.UTF8, recursive: true }); } catch { /* The normal app cache remains available if device storage is temporarily unavailable. */ } }
  async function loadOfflineArchive() { if (Capacitor.getPlatform() === "web") return; try { let saved; try { saved = await Filesystem.readFile({ path: OFFLINE_ARCHIVE_PATH, directory: Directory.Data, encoding: Encoding.UTF8 }); } catch { saved = await Filesystem.readFile({ path: "meaningful-fulfilment/archive-v2.json", directory: Directory.Data, encoding: Encoding.UTF8 }); } const archive = JSON.parse(String(saved.data)) as OfflineArchive; if ((archive.version === 2 || archive.version === 3) && Array.isArray(archive.dashboard?.orders)) { setDashboard(archive.dashboard); if (!archive.dashboard.hasMore && archive.dashboard.orders.length === archive.dashboard.totalCount) completeOrders.current = archive.dashboard; setOrderDetailsCache(archive.orderDetails || {}); setManualOrders(archive.manualOrders || []); setManualHistory(archive.manualHistory || []); setManualDetailsCache(archive.manualDetails || {}); setManualCacheReady(true); setSalesReport((current) => current || archive.salesReport || null); } } catch { /* First install or an older cache: the background archive will replace it. */ } finally { archiveLoaded.current = true; setArchiveReady(true); } }
  async function base64(blob: Blob) { return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = () => reject(reader.error); reader.onload = () => resolve(String(reader.result).split(",").at(-1) || ""); reader.readAsDataURL(blob); }); }
  async function compactImage(blob: Blob) { if (!blob.type.startsWith("image/")) return blob; try { const source = URL.createObjectURL(blob); const image = new Image(); await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Image could not be compressed.")); image.src = source; }); const scale = Math.min(1, 1600 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(source); const output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78)); return output || blob; } catch { return blob; } }
  function assetExtension(file: Blob) { if (file.type === "image/webp") return "webp"; if (file.type === "application/pdf") return "pdf"; if (file.type === "audio/mpeg") return "mp3"; if (file.type === "audio/ogg") return "ogg"; if (file.type === "audio/wav") return "wav"; if (file.type === "audio/mp4" || file.type === "audio/x-m4a") return "m4a"; if (file.type.startsWith("audio/")) return "webm"; return "bin"; }
  async function cacheOfflineAsset(order: Order, kind: keyof OfflineMedia) { const response = await mobileFetch(`${API}/orders/${encodeURIComponent(order.id)}/assets?kind=${kind === "shippingLabel" ? "shipping_label" : kind}`, { headers: { authorization: `Bearer ${session?.token || ""}` } }); if (!response.ok) return false; const original = await response.blob(); const file = kind === "photo" ? await compactImage(original) : original; await Filesystem.writeFile({ path: `meaningful-fulfilment/media/${order.id}/${kind}.${assetExtension(file)}`, data: await base64(file), directory: Directory.Data, recursive: true }); return true; }
  async function cacheManualAsset(url: string, path: string) { if (!url || url.startsWith("manual-order:") || Capacitor.getPlatform() === "web") return url; try { const response = await mobileFetch(url); if (!response.ok) return url; const file = await response.blob(); const savedPath = `${path}.${assetExtension(file)}`; await Filesystem.writeFile({ path: savedPath, data: await base64(file), directory: Directory.Data, encoding: Encoding.UTF8, recursive: true }); const saved = await Filesystem.getUri({ path: savedPath, directory: Directory.Data }); return Capacitor.convertFileSrc(saved.uri); } catch { return url; } }
  async function cacheManualDetailAssets(detail: ManualDetail) { const voiceUrl = await cacheManualAsset(detail.voiceUrl, `meaningful-fulfilment/manual/${detail.intake.id}/voice`); const paymentReceipts = await Promise.all(detail.intake.paymentReceipts.map(async (receipt, index) => ({ ...receipt, url: await cacheManualAsset(receipt.url, `meaningful-fulfilment/manual/${detail.intake.id}/receipt-${index}`) }))); return { ...detail, voiceUrl, intake: { ...detail.intake, paymentReceipts } }; }
  async function cachedVoiceUrl(orderId: string) { if (Capacitor.getPlatform() === "web") return ""; for (const extension of ["webm", "mp3", "ogg", "wav", "m4a"]) try { const saved = await Filesystem.stat({ path: `meaningful-fulfilment/media/${orderId}/voice.${extension}`, directory: Directory.Data }); return Capacitor.convertFileSrc(saved.uri); } catch { /* Try the next supported audio extension. */ } return ""; }
  function saveOrderDetail(detail: Detail) { setOrderDetailsCache((current) => { const next = { ...current, [detail.order.id]: detail }; save(ORDER_DETAILS_KEY, next); return next; }); }
  function saveManualDetail(detail: ManualDetail) { setManualDetailsCache((current) => { const next = { ...current, [detail.intake.id]: detail }; save(MANUAL_DETAILS_KEY, next); return next; }); }
  async function fetchOrderDetail(order: Pick<Order, "id">, persist = true) { if (!session) throw new Error("Sign in again to load this order."); const response = await mobileFetch(`${API}/orders/${encodeURIComponent(order.id)}`, { headers: { authorization: `Bearer ${session.token}` } }); const data = await response.json(); if (!response.ok) throw new Error(data.error); const detail = data as Detail; if (persist) saveOrderDetail(detail); return detail; }
  async function getManualOrderDetails(id: string) { if (!session) throw new Error("Sign in again to load this Manual Order."); const response = await mobileFetch(`${API}/manual-orders`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` }, body: JSON.stringify({ action: "details", id }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); return data.details as ManualDetail; }
  async function mobileManualAction(body: Record<string, unknown>) { if (!session) throw new Error("Sign in again to approve this payment."); const response = await mobileFetch(`${API}/manual-orders`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw Error(data.error); return data; }
  async function uploadApprovalReceipt(file: File) { const form = new FormData(); form.append("file", file); const response = await mobileFetch("https://meaningful-plushies-fulfilment.vercel.app/api/media-assets", { method: "POST", body: form }); const data = await response.json() as { ok?: boolean; asset?: { originalUrl?: string }; error?: string }; if (!response.ok || !data.ok || !data.asset?.originalUrl) throw new Error(data.error || "Could not upload the payment receipt."); return { fileName: file.name, url: data.asset.originalUrl }; }
  async function approveManualPayment() { if (!manualDetail || manualDetail.intake.status !== "awaiting_payment") return; setBusy(true); try { const intake = manualDetail.intake; if (intake.isCod) await mobileManualAction({ action: "approve_cod", id: intake.id }); else { if (!approvalReceipt) throw new Error("Choose the verified payment receipt first."); const receipt = await uploadApprovalReceipt(approvalReceipt); await mobileManualAction({ action: "attach_receipt", id: intake.id, paymentReceipts: [receipt] }); } const created = await mobileManualAction({ action: "create_shopify_order", id: intake.id }); const fresh = await getManualOrderDetails(intake.id); saveManualDetail(fresh); setManualDetail(fresh); setApprovalReceipt(null); await loadManualOrders(false); setNotice(`${intake.customerName || "Customer"}'s Shopify order ${created.order?.shopifyOrderName || "was created"}.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not approve this payment."); } finally { setBusy(false); } }
  function syncOrderSummaries(): Promise<Dashboard> {
    if (orderSync.current) return orderSync.current;
    const token = session?.token;
    const cached = completeOrders.current ?? stored<Dashboard | null>(ORDER_SYNC_KEY, null);
    const task = async () => {
      const previous = new Map(cached?.orders.map((order) => [order.id, order]));
      const collected = new Map<string, Order>();
      let total = 0;
      let reachedEnd = false;
      for (let page = 0; ; page += 1) {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), includeTotal: "1" });
        const response = await mobileFetch(`${API}/dashboard?${params}`, {
          cache: "no-store", headers: { authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        const orders: Order[] = data.orders ?? [];
        total = data.totalCount;
        for (const order of orders) collected.set(order.id, order);
        if (!cached) {
          setOrderSyncProgress({
            orders: [...collected.values()], counts: {}, totalCount: total,
            hasMore: Boolean(data.hasMore), latestUpdatedAt: collected.values().next().value?.updatedAt ?? null,
            savedAt: Date.now(),
          });
        }
        const nextCount = previous.size + [...collected.keys()].filter((id) => !previous.has(id)).length;
        if (!data.hasMore) { reachedEnd = true; break; }
        const last = orders.at(-1);
        if (cached?.latestUpdatedAt && last?.updatedAt && last.updatedAt < cached.latestUpdatedAt
          && orders.every((order) => previous.get(order.id)?.updatedAt === order.updatedAt)
          && nextCount === total) break;
      }
      const merged = reachedEnd ? collected : new Map([...previous, ...collected]);
      const orders = [...merged.values()].sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""));
      if (orders.length !== total) throw Error("Orders changed during sync. Pull down to retry.");
      const fresh: Dashboard = { orders, counts: {}, totalCount: total, hasMore: false,
        latestUpdatedAt: orders[0]?.updatedAt ?? null, savedAt: Date.now() };
      completeOrders.current = fresh;
      save(ORDER_SYNC_KEY, fresh);
      return fresh;
    };
    orderSync.current = task().finally(() => { orderSync.current = null; });
    return orderSync.current;
  }

  async function syncOfflineArchive(force = false) {
    if (!session || offlineSync.active || demoMode) return;
    setOfflineSync({ active: true, completed: 0, total: 0, media: 0 });
    const request = orderRequest.current;
    try {
      const completeDashboard = await syncOrderSummaries();
      const collected = completeDashboard.orders;
      setOfflineSync((current) => ({ ...current, completed: collected.length, total: collected.length }));
      const details = { ...orderDetailsCache }; const changedOrders = collected.filter((order) => !details[order.id] || details[order.id].order.updatedAt !== order.updatedAt); let detailIndex = 0; const workers = Array.from({ length: Math.min(4, changedOrders.length) }, async () => { while (detailIndex < changedOrders.length) { const order = changedOrders[detailIndex++]; try { details[order.id] = await fetchOrderDetail(order, false); } catch { /* One unavailable order must not stop the archive. */ } } }); await Promise.all(workers); setOrderDetailsCache(details); save(ORDER_DETAILS_KEY, details);
      let approvals = manualOrders;
      let history = manualHistory;
      let changedManualCount = 0;
      const manualDetails = { ...manualDetailsCache };
      if (session.role === "admin") {
      const manualResponse = await mobileFetch(`${API}/manual-orders`, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } }); const manualData = await manualResponse.json(); if (!manualResponse.ok) throw Error(manualData.error); const allManual: ManualOrder[] = Array.isArray(manualData.intakes) ? manualData.intakes as ManualOrder[] : []; approvals = allManual.filter((order) => order.status === "awaiting_payment"); history = allManual.filter((order) => order.status !== "awaiting_payment"); setManualOrders(approvals); setManualHistory(history); setManualCacheReady(true); save(MANUAL_APPROVALS_KEY, approvals); save(MANUAL_HISTORY_KEY, history); save(MANUAL_SAVED_AT_KEY, Date.now());
      const changedManualOrders = allManual.filter((order) => !manualDetails[order.id] || manualDetails[order.id].intake.updatedAt !== order.updatedAt); let manualIndex = 0; const manualWorkers = Array.from({ length: Math.min(4, changedManualOrders.length) }, async () => { while (manualIndex < changedManualOrders.length) { const order = changedManualOrders[manualIndex++]; try { manualDetails[order.id] = await cacheManualDetailAssets(await getManualOrderDetails(order.id)); } catch { /* Keep the rest of the transaction archive available. */ } } }); await Promise.all(manualWorkers); setManualDetailsCache(manualDetails); save(MANUAL_DETAILS_KEY, manualDetails);
      changedManualCount = changedManualOrders.length;
      }
      let report = salesReport; if (force && session.role === "admin") { try { const response = await mobileFetch(`${API}/reports?source=all`, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } }); const data = await response.json(); if (response.ok) { report = { ...data, savedAt: Date.now() }; setSalesReport(report); save(REPORT_KEY, report); } } catch { /* The saved report remains available. */ } }
      const mediaCache = stored<Record<string, string>>(OFFLINE_MEDIA_KEY, {}); let media = 0; for (const order of collected) for (const kind of ["voice", "photo", "attachment", "shippingLabel"] as const) { const mediaKey = `${order.id}:${kind}`; const version = String(order.updatedAt || ""); if (order.offlineMedia?.[kind] && mediaCache[mediaKey] !== version && await cacheOfflineAsset(order, kind)) { mediaCache[mediaKey] = version; media += 1; setOfflineSync((current) => ({ ...current, media })); } } save(OFFLINE_MEDIA_KEY, mediaCache);
      if (request === orderRequest.current && statusFilter === "all" && sourceFilter === "all" && !fromDate && !toDate && !orderQuery) { setDashboard(completeDashboard); save(DASHBOARD_KEY, completeDashboard); } await saveOfflineArchive({ version: 3, dashboard: completeDashboard, orderDetails: details, manualOrders: approvals, manualHistory: history, manualDetails, salesReport: report, savedAt: Date.now() }); save(LAST_OFFLINE_SYNC_KEY, Date.now()); const changed = changedOrders.length + changedManualCount; setNotice(`Offline archive refreshed: ${changed} changed records and ${media} changed files. All saved data remains available on this phone.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not complete the offline sync."); } finally { setOfflineSync((current) => ({ ...current, active: false })); } }
  async function fetchPage(page: number, replace = false) {
    if (!session) return;
    const request = ++orderRequest.current;
    const params = orderFilters(); params.set("page", String(page));
    const response = await mobileFetch(`${API}/dashboard?${params}`, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    if (request !== orderRequest.current) return;
    const fresh: Dashboard = { counts: data.counts || {}, orders: replace ? data.orders || [] : [...dashboard.orders, ...(data.orders || [])], totalCount: data.totalCount || 0, hasMore: data.hasMore === true, latestUpdatedAt: data.latestUpdatedAt || null, savedAt: Date.now() };
    setDashboard(fresh); setUpdatesAvailable(false); setNotice("");
  }
  async function refresh(force = false) {
    if (!session || !archiveLoaded.current || (!force && dashboard.savedAt && Date.now() - dashboard.savedAt < CACHE_MAX_AGE)) return;
    const unfiltered = statusFilter === "all" && sourceFilter === "all" && !fromDate && !toDate && !orderQuery;
    setBusy(true);
    try {
      if (unfiltered && !demoMode) {
        const request = ++orderRequest.current;
        const fresh = await syncOrderSummaries();
        if (request !== orderRequest.current) return;
        setDashboard(fresh);
        setOrderSyncProgress(null);
        save(DASHBOARD_KEY, fresh);
        setUpdatesAvailable(false);
        setNotice("");
      } else await fetchPage(0, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load orders.";
      if (message.includes("REQUIRED")) {
        if (!demoMode) localStorage.removeItem(SESSION_KEY);
        setSession(null);
      } else setNotice(message);
    } finally {
      setBusy(false);
    }
  }
  async function checkForUpdates() {
    if (!session || document.visibilityState !== "visible") return;
    try {
      const response = await mobileFetch(`${API}/dashboard?check=1`, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } });
      const data = await response.json();
      if (!response.ok) return;
      if ((dashboard.latestUpdatedAt && data.latestUpdatedAt && data.latestUpdatedAt !== dashboard.latestUpdatedAt) || Number(data.totalCount || 0) > dashboard.totalCount) setUpdatesAvailable(true);
    } catch { /* Existing saved orders remain available when temporarily offline. */ }
  }
  useEffect(() => { void loadOfflineArchive(); }, []);
  useEffect(() => {
    if (!session || !archiveReady || autoSyncFrequency === "manual" || Capacitor.getPlatform() === "web") return;
    const delay = autoSyncFrequency === "hourly" ? 60 * 60 * 1000 : autoSyncFrequency === "daily" ? 24 * 60 * 60 * 1000 : 0;
    const runIfDue = () => { const last = stored<number>(LAST_OFFLINE_SYNC_KEY, 0); if (!last || !delay || Date.now() - last >= delay) void syncOfflineArchive(false); };
    const initial = window.setTimeout(runIfDue, 15000);
    const timer = delay ? window.setInterval(runIfDue, Math.min(delay, 15 * 60 * 1000)) : undefined;
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [session?.token, archiveReady, autoSyncFrequency]);
  useEffect(() => {
    // Saved orders render before any network request. The quiet check only
    // decides whether to show the "Refresh now" banner.
    const firstCheck = window.setTimeout(() => void checkForUpdates(), 500);
    const interval = window.setInterval(() => void checkForUpdates(), 30000);
    const onVisible = () => { if (document.visibilityState === "visible") void checkForUpdates(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearTimeout(firstCheck); window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [session?.token, dashboard.latestUpdatedAt, dashboard.totalCount, archiveReady]);
  useEffect(() => {
    if (!session) return;
    if (tab === "Home" && session.role === "admin") { void loadSalesReport(); return; }
    if (!archiveReady || tab !== "Orders" || workspace !== "fulfilment") return;
    const filters = orderFilters().toString();
    const changed = Boolean(lastOrderFilters.current) && lastOrderFilters.current !== filters;
    lastOrderFilters.current = filters;
    if (initialWorkspaceLoad.current) {
      initialWorkspaceLoad.current = false;
      if (dashboard.orders.length && !changed) { void refresh(true); return; }
    }
    void refresh(changed);
  }, [session?.token, workspace, statusFilter, sourceFilter, fromDate, toDate, archiveReady, orderQuery, tab]);
  useEffect(() => { const timer = window.setTimeout(() => setOrderQuery(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { if (session && workspace === "updates") void loadUpdateRelease(); }, [session?.token, workspace]);
  useEffect(() => {
    if (!session || Capacitor.getPlatform() === "web") return;
    const activeSession = session;
    let cancelled = false;
    let registrationListener: Awaited<ReturnType<typeof PushNotifications.addListener>> | undefined;
    let receivedListener: Awaited<ReturnType<typeof PushNotifications.addListener>> | undefined;
    let actionListener: Awaited<ReturnType<typeof PushNotifications.addListener>> | undefined;

    async function registerDevice(token: string) {
      const response = await mobileFetch(`${API}/notifications/register`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${activeSession.token}` },
        body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
      });
      if (!response.ok) throw new Error("Could not enable notifications on this device.");
    }

    async function setUpNotifications() {
      try {
        registrationListener = await PushNotifications.addListener("registration", (token) => {
          if (!cancelled) void registerDevice(token.value).catch(() => setNotice("Notifications could not be enabled. Try reopening the app."));
        });
        receivedListener = await PushNotifications.addListener("pushNotificationReceived", (notification) => {
          if (!cancelled) setNotice(notification.body || notification.title || "A new Manual Order was received.");
        });
        actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", () => {
          if (cancelled || activeSession.role !== "admin") return;
          setTab("Orders");
          setWorkspace("manual_orders");
          void loadManualApprovals();
        });
        const permission = await PushNotifications.checkPermissions();
        const result = permission.receive === "prompt" ? await PushNotifications.requestPermissions() : permission;
        if (result.receive === "granted") await PushNotifications.register();
      } catch {
        if (!cancelled) setNotice("Notifications are unavailable on this device.");
      }
    }

    void setUpNotifications();
    return () => {
      cancelled = true;
      registrationListener?.remove();
      receivedListener?.remove();
      actionListener?.remove();
    };
  }, [session?.token]);
  async function login(event: React.FormEvent) { event.preventDefault(); setBusy(true); try { const response = await mobileFetch(`${API}/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) }); const data = await response.json(); if (!response.ok) throw Error(data.error); setSession(data); save(SESSION_KEY, data); setPassword(""); setNotice(""); } catch (error) { setNotice(error instanceof Error ? error.message : "Unable to sign in."); } finally { setBusy(false); } }
  async function loadMore() { if (!session || loadingMore || !dashboard.hasMore) return; setLoadingMore(true); try { await fetchPage(Math.floor(dashboard.orders.length / PAGE_SIZE), false); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load more orders."); } finally { setLoadingMore(false); } }
  async function openOrder(id: string, force = false) {
    if (!session) return;
    setNotice("");
    const cached = orderDetailsCache[id];
    if (cached && !force) {
      setSelected(cached);
      if (cached.details.voice) {
        const localVoice = await cachedVoiceUrl(id);
        if (localVoice) setSelected((current) => current === cached && cached.details.voice
          ? { ...cached, details: { ...cached.details, voice: { ...cached.details.voice, url: localVoice } } }
          : current);
      }
      return;
    }

    setOpening(true);
    try {
      setSelected(await fetchOrderDetail({ id }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open this order.");
    } finally {
      setOpening(false);
    }
  }
  async function advance() { if (!session || !selected || !next[selected.order.status]) return; setBusy(true); try { const response = await mobileFetch(`${API}/orders/transition`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.token}` }, body: JSON.stringify({ orderId: selected.order.id, fromStatus: selected.order.status, toStatus: next[selected.order.status] }) }); const data = await response.json(); if (!response.ok) throw Error(data.error === "ORDER_CHANGED" ? "This order changed on another device. Tap Refresh order before retrying." : data.error); const detail = { ...selected, order: data.order }; setSelected(detail); saveOrderDetail(detail); const fresh = { ...dashboard, orders: dashboard.orders.map((item) => item.id === data.order.id ? data.order : item), savedAt: Date.now() }; setDashboard(fresh); save(DASHBOARD_KEY, fresh); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not update this order."); } finally { setBusy(false); } }
  async function loadManualOrders(showLoading = true) { if (!session) return; if (showLoading) setBusy(true); try { const response = await mobileFetch(`${API}/manual-orders`, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } }); const data = await response.json(); if (!response.ok) throw Error(data.error); const all: ManualOrder[] = Array.isArray(data.intakes) ? data.intakes as ManualOrder[] : []; const approvals = all.filter((order) => order.status === "awaiting_payment"); const history = all.filter((order) => order.status !== "awaiting_payment"); setManualOrders(approvals); setManualHistory(history); setManualCacheReady(true); save(MANUAL_APPROVALS_KEY, approvals); save(MANUAL_HISTORY_KEY, history); save(MANUAL_SAVED_AT_KEY, Date.now()); } catch (error) { if (showLoading) setNotice(error instanceof Error ? error.message : "Could not load Manual Orders."); } finally { if (showLoading) setBusy(false); } }
  async function refreshManualOrdersIfStale() { if (!manualCacheReady) { await loadManualOrders(); return; } if (Date.now() - stored<number>(MANUAL_SAVED_AT_KEY, 0) >= CACHE_MAX_AGE) void loadManualOrders(false); }
  async function loadManualApprovals() { await refreshManualOrdersIfStale(); }
  async function loadManualHistory() { await refreshManualOrdersIfStale(); }
  async function loadSalesReport() { if (!session || session.role !== "admin") return; setReportLoading(true); try { const params = new URLSearchParams({ source: sourceFilter }); if (fromDate) params.set("from", fromDate); if (toDate) params.set("to", toDate); const response = await mobileFetch(`${API}/reports?${params}`, { cache: "no-store", headers: { authorization: `Bearer ${session.token}` } }); const data = await response.json(); if (!response.ok) throw Error(data.error); const fresh = { ...data, savedAt: Date.now() }; setSalesReport(fresh); save(REPORT_KEY, fresh); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load sales reporting."); } finally { setReportLoading(false); } }
  async function loadUpdateRelease() { try { const response = await mobileFetch(UPDATE_API, { headers: { accept: "application/vnd.github+json" } }); const data = await response.json(); if (!response.ok) throw Error("Could not check the latest release."); const body = String(data.body || ""); const version = body.match(/version\s+([\d.]+)/i)?.[1] || String(data.tag_name || "Latest"); const asset = data.assets?.find((item: { name?: string; label?: string }) => /\.apk$/i.test(String(item.name || ""))); setUpdateRelease({ version, releasedAt: String(data.published_at || data.created_at || ""), downloadUrl: String(asset?.browser_download_url || UPDATE_URL), fileName: String(asset?.label || asset?.name || "Meaningful Fulfilment patch.apk") }); } catch { setUpdateRelease(null); } }
  async function downloadAndInstallUpdate() { if (updateDownloading) return; const downloadUrl = UPDATE_URL; if (Capacitor.getPlatform() === "web") { window.open(downloadUrl, "_blank", "noopener"); return; } setUpdateDownloading(true); try { await InAppUpdate.downloadAndInstall({ url: downloadUrl, fileName: updateRelease?.fileName || "Meaningful Fulfilment update.apk" }); setNotice("Update downloaded. Android is ready for you to confirm installation."); } catch (error) { setNotice(error instanceof Error ? error.message : "The update could not be downloaded."); } finally { setUpdateDownloading(false); } }
  async function openManualOrder(id: string) { if (!session) return; setOpening(true); try { const cached = manualDetailsCache[id]; if (cached && "customisationSavedAt" in cached) { setManualDetail(cached); return; } const detail = await getManualOrderDetails(id); saveManualDetail(detail); setManualDetail(detail); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not open this Manual Order."); } finally { setOpening(false); } }
  async function chooseWorkspace(item: Workspace) { setWorkspace(item); if (item === "manual_orders") setTab("Orders"); if (item === "reports") setTab("Home"); if (item === "updates") setTab("Account"); setNotice(""); if (item === "manual_orders") { setManualPage("approvals"); void loadManualApprovals(); }  }
  function signOut() { if (demoMode) { window.location.assign(window.location.pathname); return; } orderRequest.current += 1; if (!demoMode) localStorage.removeItem(SESSION_KEY); setSelected(null); setManualDetail(null); setWorkspace("fulfilment"); setTab("Home"); setSession(null); }
  function chooseTab(item: Tab) {
    setTab(item);
    setSelected(null);
    setManualDetail(null);
    if (item === "Account") void chooseWorkspace("updates");
    else if (item === "Home" && session?.role === "admin") void chooseWorkspace("reports");
    else void chooseWorkspace("fulfilment");
  }

  const manualMatches = (order: ManualOrder) => [
    order.id, `MP-${order.id}`,
    order.customisationSessionId, order.reference, order.customerName, order.shopifyOrderName,
  ].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));
  const manualSearchResults = tab === "Orders" && session?.role === "admin" && orderQuery
    ? [...manualOrders, ...manualHistory].filter((order) => manualMatches(order)
      && !dashboard.orders.some((item) => order.shopifyOrderName && item.orderNumber.replace(/^#/, "") === order.shopifyOrderName.replace(/^#/, "")))
    : [];
  const showSyncProgress = tab === "Orders" && workspace === "fulfilment"
    && statusFilter === "all" && sourceFilter === "all" && !fromDate && !toDate && !orderQuery
    && (orderSyncProgress?.orders.length ?? 0) > dashboard.orders.length;
  const availableOrders = showSyncProgress && orderSyncProgress ? orderSyncProgress.orders : dashboard.orders;
  const [orderSort, setOrderSort] = useState("updated");
  const visibleOrders = useMemo(() => {
    if (orderSort === "updated") return availableOrders;
    const numberSort = orderSort === "number-asc" || orderSort === "number-desc";
    const direction = orderSort === "oldest" || orderSort === "number-asc" ? 1 : -1;
    return [...availableOrders].sort((left, right) => direction * (numberSort
      ? left.orderNumber.localeCompare(right.orderNumber, undefined, { numeric: true })
      : left.orderDate.localeCompare(right.orderDate)));
  }, [availableOrders, orderSort]);
  const [sampleBatch, setSampleBatch] = useState<Array<Order & { batch: string; scannedToday: boolean }>>([]);
  useEffect(() => {
    if (!demoMode || tab !== "Fulfilment") return;
    let active = true;
    void mobileFetch(`${API}/demo-batch`).then((response) => response.json()).then((data) => { if (active) setSampleBatch(data.orders); });
    return () => { active = false; };
  }, [tab]);
  const pullStart = useRef<number | null>(null);
  const pullAmount = useRef(0);
  const [refreshing, setRefreshing] = useState(false);

  async function refreshCurrentScreen() {
    if (!session || refreshing || busy || opening) return;
    setRefreshing(true);
    try {
      if (selected) await openOrder(selected.order.id, true);
      else if (manualDetail) {
        const detail = await getManualOrderDetails(manualDetail.intake.id);
        saveManualDetail(detail);
        setManualDetail(detail);
      } else if (workspace === "manual_orders") await loadManualOrders();
      else if (tab === "Home" && session.role === "admin") await Promise.all([loadSalesReport(), loadManualOrders(false)]);
      else if (tab === "Account") await loadUpdateRelease();
      else if (tab === "Fulfilment" && demoMode) {
        const response = await mobileFetch(`${API}/demo-batch`);
        setSampleBatch((await response.json()).orders);
      } else if (tab === "Orders") await refresh(true);
    } catch {
      setNotice("Could not refresh. Check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }

  function finishPull(commit: boolean) {
    const shouldRefresh = commit && pullAmount.current >= 56;
    pullStart.current = null;
    pullAmount.current = 0;
    setPullDistance(0);
    if (shouldRefresh) void refreshCurrentScreen();
  }
  const certificate = certificateUrl(selected?.details.idWebsiteLink);
  useEffect(() => {
    if (session?.role === "admin" && tab === "Orders" && workspace === "fulfilment" && orderQuery) {
      void refreshManualOrdersIfStale();
    }
  }, [session?.token, tab, workspace, Boolean(orderQuery)]);

  const waitingForProgress = sampleBatch.filter((order) => order.status === "sent_for_sewing");
  const scannedToday = sampleBatch.filter((order) => order.scannedToday).length;

  const latestManual = useMemo(() => [...manualOrders, ...manualHistory]
    .reduce<ManualOrder | undefined>((latest, order) =>
      !latest || order.createdAt > latest.createdAt ? order : latest, undefined), [manualOrders, manualHistory]);
  useEffect(() => {
    if (tab === "Home" && session?.role === "admin") void refreshManualOrdersIfStale();
  }, [tab, session?.token]);

  const latestSummary = latestManual && manualOrderNotification({
    reference: latestManual.reference || `MP-${latestManual.id.toUpperCase()}`,
    product: latestManual.productDisplayName,
    amountToCollect: latestManual.amountToCollect ?? null,
    shippingRegion: latestManual.shippingRegion ?? "WEST",

  }).summary;

  async function copyLatestSummary() {
    if (!latestSummary) return;
    try {
      await navigator.clipboard.writeText(latestSummary);
      setNotice("Order summary copied.");
    } catch {
      setNotice("Could not copy the order summary.");
    }
  }
  const ordersHeader = <header className="topbar"><div><p className="eyebrow">FULFILMENT</p><h1>Orders</h1></div>
    <button className="avatar" aria-label="Sign out" onClick={signOut}>{session?.displayName.slice(0, 1).toUpperCase()}</button>
  </header>;
  const orderSwitch = session?.role === "admin" && <div className="workspace-tabs" aria-label="Order workspace">
    <button className={workspace === "fulfilment" ? "active" : ""} aria-pressed={workspace === "fulfilment"} onClick={() => void chooseWorkspace("fulfilment")}>Orders</button>
    <button className={workspace === "manual_orders" ? "active" : ""} aria-pressed={workspace === "manual_orders"} onClick={() => void chooseWorkspace("manual_orders")}>Manual orders</button>
  </div>;
  const screen = () => {
  if (opening && workspace === "manual_orders") return <main aria-live="polite" style={{ display: "grid", minHeight: "100vh", placeItems: "center", background: "linear-gradient(145deg, #f1faf7, #f6f6f7)", textAlign: "center" }}><div style={{ display: "grid", justifyItems: "center", gap: 14, maxWidth: 330, padding: "30px 24px", background: "#fff", border: "1px solid #d9ebe5", borderRadius: 16, boxShadow: "0 12px 32px #00806016" }}><svg aria-hidden="true" width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="18" fill="none" stroke="#d9f2ed" strokeWidth="5" /><path d="M23 5a18 18 0 0 1 18 18" fill="none" stroke="#008060" strokeWidth="5" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 23 23" to="360 23 23" dur="0.8s" repeatCount="indefinite" /></path></svg><h1 style={{ fontSize: 23 }}>Opening order</h1><p>Loading the customer details, customisation, voice message, and payment information.</p></div></main>;

  if (!session) return <main className="login"><img className="brand-logo brand-logo-login" src={brandLogo} alt="Meaningful Plushies" /><h1>Meaningful Fulfilment</h1><p>Sign in to your warehouse workspace.</p><form onSubmit={login}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" /></label><label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" /></label><button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form>{notice && <p className="error" role="status">{notice}</p>}</main>;
  if (selected) return <main><header className="topbar"><div><button className="back" onClick={() => setSelected(null)}>‹ Back to {tab}</button></div><img className="brand-logo" src={brandLogo} alt="Meaningful Plushies" /></header><div className="detail-title"><div><span className="eyebrow">ORDER</span><h1>#{selected.order.orderNumber}</h1><span className={`status status-${selected.order.status}`}>{labels[selected.order.status] || selected.order.status}</span></div><button className="quiet" disabled={opening || busy} onClick={() => void openOrder(selected.order.id, true)}>{opening ? "Refreshing…" : "Refresh order"}</button></div><section className="card"><h2>{selected.order.plushName || selected.order.product || "Meaningful Plushie"}</h2><p>{selected.order.character || "Character not set"} · {selected.order.voiceLength || 0} seconds</p>{selected.details.voice ? <div className="voice-card"><strong>Voice message</strong><small>{selected.details.voice.fileName}</small><audio controls preload="metadata" src={selected.details.voice.url} /></div> : <p className="muted">No playable voice message is available.</p>}</section><section className="card"><h2>Payment</h2><div className="detail-grid"><div><span>Total paid</span><strong>{money.format(selected.order.totalAmount || 0)}</strong></div><div><span>Method</span><strong>{selected.order.paymentProcessor || "—"}</strong></div><div><span>Subtotal</span><strong>{money.format(selected.details.subtotalAmount || 0)}</strong></div><div><span>Shipping</span><strong>{money.format(selected.details.shippingAmount || 0)}</strong></div><div><span>Discount</span><strong>{money.format(selected.details.discountAmount || 0)}</strong></div><div><span>Outstanding</span><strong>{money.format(selected.details.outstandingBalance || 0)}</strong></div></div></section><section className="card"><h2>Customer</h2><p><strong>{selected.order.customerName || "—"}</strong><br />{selected.order.phone || "No phone"}<br />{selected.details.email || "No email"}</p><p>{selected.order.address || "No delivery address"}</p></section><section className="card"><h2>Plushie details</h2><div className="detail-grid"><div><span>Name</span><strong>{selected.order.plushName || "—"}</strong></div><div><span>Gender</span><strong>{selected.details.plushGender || "—"}</strong></div><div><span>Born on</span><strong>{selected.details.plushBirthDate || "—"}</strong></div><div><span>Belongs to</span><strong>{selected.details.plushBelongsTo || "—"}</strong></div></div>{selected.details.meaningfulNote && <p className="note">{selected.details.meaningfulNote}</p>}</section><section className="card mobile-hub">
  <h2>Certificate</h2>
  <p>Code: {selected.details.certificateCode || "Unavailable"}</p>
  {certificate && <a href={certificate} target="_blank" rel="noreferrer">Open certificate</a>}
</section>
{isProductionOrder(selected.order.status) && <fieldset className="card mobile-hub" key={selected.order.id + selected.order.status}>
  <legend>Production checklist</legend>
  <p>Use these checks before moving the order forward. They reset when you leave this order or change its stage.</p>
  {["Confirm the plush and customisation", "Check the voice recording if ordered", "Match the certificate to the order if included", "Check the packing label before dispatch"].map((check) =>
    <label className="production-check" key={check}><input type="checkbox" />{check}</label>
  )}
</fieldset>}
<section className="card"><h2>Delivery</h2><p>{selected.details.shippingMethod}</p><div className="detail-grid"><div><span>Courier</span><strong>{selected.order.courier || "—"}</strong></div><div><span>Tracking</span><strong>{selected.order.trackingNumber || "—"}</strong></div></div></section>{next[selected.order.status] && <button className="primary-action" disabled={busy || opening} onClick={() => void advance()}>{busy ? "Updating…" : `Move to ${labels[next[selected.order.status]]}`}</button>}{notice && <p className="error" role="status">{notice}</p>}</main>;
  if (manualDetail) return <main><header className="topbar"><div><button className="back" onClick={() => { setManualDetail(null); setApprovalReceipt(null); }}>‹ Back to {workspace === "manual_orders" ? "Manual orders" : tab === "Home" ? "Home" : "search results"}</button></div></header><div className="detail-title"><div><span className="eyebrow">MANUAL ORDER</span><h1>{manualDetail.intake.customerName || "Customer"}</h1><p>{manualStatus(manualDetail.intake)}</p></div></div><section className="card"><h2>Order</h2><p><strong>{manualDetail.intake.character} · {manualDetail.intake.productDisplayName}</strong><br />Reference: {manualDetail.intake.reference || `MP-${manualDetail.intake.id.toUpperCase()}`}<br />Submitted {dateTime(manualDetail.intake.createdAt)}<br />{manualDetail.intake.shopifyOrderName || "Not created in Shopify yet"}</p></section><section className="card"><h2>Customer and delivery</h2><p><strong>{manualDetail.intake.customerName}</strong><br />{manualDetail.intake.phoneOriginal}<br />{manualDetail.intake.customerEmail}</p><p>{manualAddress(manualDetail.intake)}</p></section><section className="card"><h2>Customisation</h2><div className="detail-grid"><div><span>Plush name</span><strong>{manualDetail.form?.plushName || "—"}</strong></div><div><span>Gender</span><strong>{manualDetail.form?.gender || "—"}</strong></div><div><span>Born on</span><strong>{manualDetail.form?.birthDate || "—"}</strong></div><div><span>Birthplace</span><strong>{manualDetail.form?.birthPlace || "—"}</strong></div><div><span>Favourite person</span><strong>{manualDetail.form?.favouritePerson || "—"}</strong></div><div><span>Belongs to</span><strong>{manualDetail.form?.belongsTo || "—"}</strong></div></div><div className="customisation-saved"><span>Customisation saved</span><strong>{dateTime(manualDetail.customisationSavedAt)}</strong></div>{manualDetail.form?.meaningfulNote && <div className="manual-message"><span>Meaningful message</span><p>{manualDetail.form.meaningfulNote}</p></div>}{manualDetail.voiceUrl && <div className="voice-card"><strong>Voice message</strong><small>{manualDetail.voiceFileName || "Voice message"}</small><audio controls src={manualDetail.voiceUrl} /></div>}</section><section className="card"><h2>Payment</h2><p><strong>{manualStatus(manualDetail.intake)}</strong><br />{manualDetail.intake.paymentApprovedAt ? `Approved ${dateTime(manualDetail.intake.paymentApprovedAt)}` : "Awaiting approval"}</p>{manualDetail.intake.paymentReceipts.filter((receipt) => !receipt.url.startsWith("manual-order:")).map((receipt) => <a className="receipt-link" key={receipt.url} href={receipt.url} target="_blank" rel="noreferrer">Open receipt: {receipt.fileName || "Receipt"}</a>)}{manualDetail.intake.status === "awaiting_payment" && <div className="approval-actions">{!manualDetail.intake.isCod && <label className="receipt-picker"><span>Verified payment receipt</span><input type="file" accept="image/*,application/pdf" onChange={(event) => setApprovalReceipt(event.target.files?.[0] || null)} /><small>{approvalReceipt ? approvalReceipt.name : "Choose an image or PDF receipt"}</small></label>}<button className="primary-action" disabled={busy || (!manualDetail.intake.isCod && !approvalReceipt)} onClick={() => void approveManualPayment()}>{busy ? "Approving…" : manualDetail.intake.isCod ? "Approve COD and create order" : "Approve payment and create order"}</button></div>}</section>{notice && <p className="error" role="status">{notice}</p>}</main>;
  if (tab === "Account") return <main><header className="topbar"><div><p className="eyebrow">MOBILE APP</p><h1>Account</h1></div><button className="avatar" aria-label="Sign out" onClick={signOut}>{session.displayName.slice(0, 1).toUpperCase()}</button></header><section className="card update-card"><span className="update-dot" /><div><h2>App updates</h2><p>{demoMode ? "Preview of the Android update screen." : "Download the newest version when an update is available."}</p></div><div className="detail-grid"><div><span>Patch version</span><strong>{demoMode ? "Demo preview" : updateRelease ? `v${updateRelease.version.replace(/^v/i, "")}` : "Version check unavailable"}</strong></div><div><span>Released</span><strong>{updateRelease ? exactTime(updateRelease.releasedAt) : "—"}</strong></div></div><button className="update-button" disabled={updateDownloading} onClick={() => demoMode ? setNotice("The Android update button downloads and opens the installer in the installed app.") : void downloadAndInstallUpdate()}>{updateDownloading ? "Downloading update…" : "Update app"}</button><small>{updateRelease?.fileName ? `File: ${updateRelease.fileName}. ` : ""}The release time is shown in Malaysia time. Android will ask you to confirm installation; your saved sign-in and order cache stay on your phone.</small>{!demoMode && <a href={UPDATE_URL} target="_blank" rel="noreferrer">Download APK in browser</a>}</section><section className="card update-card"><div><h2>Offline archive</h2><p>Save every order, voice message, photo, PDF, and shipping label to this phone. Images are compressed only in the phone copy; cloud originals stay unchanged. Automatic refreshes download only records or files that changed.</p></div><label className="offline-frequency">Automatic download<select value={autoSyncFrequency} onChange={(event) => { const frequency = event.target.value as AutoSyncFrequency; setAutoSyncFrequency(frequency); save(AUTO_SYNC_KEY, frequency); }}><option value="open">Every time I open the app</option><option value="hourly">Every hour while the app is open</option><option value="daily">Once a day while the app is open</option><option value="manual">Manual only</option></select></label><button className="update-button" disabled={demoMode || offlineSync.active} onClick={() => void syncOfflineArchive(true)}>{offlineSync.active ? `Saving ${offlineSync.completed}/${offlineSync.total || "…"} orders · ${offlineSync.media} files` : "Update offline archive"}</button><small>{offlineSync.active ? "Keep the app open and connected while the first archive is created." : "The archive stays on this phone. A full save also refreshes the reporting snapshot."}</small></section>{notice && <p className="error" role="status">{notice}</p>}</main>;
  if (workspace === "manual_orders") return <main>{ordersHeader}{orderSwitch}<label className="search mobile-order-search"><span>Search manual orders</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Customer or customisation ID" /></label><div className="workspace-tabs"><button className={manualPage === "approvals" ? "active" : ""} onClick={() => { setManualPage("approvals"); void loadManualApprovals(); }}>Awaiting approval</button><button className={manualPage === "history" ? "active" : ""} onClick={() => { setManualPage("history"); void loadManualHistory(); }}>Transaction history</button></div>{manualPage === "approvals" ? <section className="order-list"><div className="list-heading"><h2>Awaiting approval</h2><span>{manualOrders.length}</span></div>{manualOrders.filter(manualMatches).map((order) => <button className="order-row manual-approval-row" key={order.id} onClick={() => void openManualOrder(order.id)}><div><strong>{order.customerName || "Customer"}</strong><span>{order.character} · {order.speakerSeconds || 0} seconds · {order.shippingRegion === "EAST" ? "East Malaysia" : "West Malaysia"}</span><small>{order.phoneOriginal}</small><small>Reference: {order.reference || `MP-${order.id.toUpperCase()}`}</small><small className="collect">To collect: {order.amountToCollect === null || order.amountToCollect === undefined ? "Price unavailable" : money.format(order.amountToCollect)}{order.shippingRegion === "EAST" ? " · includes East Malaysia delivery" : ""}</small></div><div><span className="status status-awaiting_customisation">Awaiting payment</span><b>›</b></div></button>)}{!manualOrders.length && <p className="empty">No orders are awaiting approval.</p>}</section> : <section className="order-list"><div className="list-heading"><h2>Transaction history</h2><span>{manualHistory.length}</span></div>{manualHistory.filter(manualMatches).map((order) => <button className="order-row" key={order.id} onClick={() => void openManualOrder(order.id)}><div><strong>{order.customerName || "Customer"}</strong><span>{order.shopifyOrderName || order.productDisplayName}</span><small>{order.paymentApprovedAt ? `Approved ${date(order.paymentApprovedAt)}` : date(order.createdAt)}</small></div><div><span className="status status-packed">{manualStatus(order)}</span><b>›</b></div></button>)}{!manualHistory.length && !busy && <p className="empty">No transaction history yet.</p>}</section>}{notice && <p className="error" role="status">{notice}</p>}</main>;
  if (tab === "Home" && session.role === "admin") return <main><header className="topbar"><div><p className="eyebrow">MEANINGFUL PLUSHIES</p><h1>Home</h1><p>{salesReport?.savedAt ? `Last updated ${new Date(salesReport.savedAt).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}` : "Preparing your first report…"}</p></div><button className="avatar" aria-label="Sign out" onClick={signOut}>{session.displayName.slice(0, 1).toUpperCase()}</button></header><section className="card mobile-hub">
  <h2>Latest manual order</h2>
  {latestManual ? <>
    <div className="detail-grid">
      <div><span>Customer</span><strong>{latestManual.customerName || "—"}</strong></div>
      <div><span>Reference</span><strong>{latestManual.reference || `MP-${latestManual.id.toUpperCase()}`}</strong></div>
      <div><span>To collect</span><strong>{latestManual.amountToCollect == null ? "Price unavailable" : money.format(latestManual.amountToCollect)}</strong></div>
      <div><span>Submitted</span><strong>{dateTime(latestManual.createdAt)}</strong></div>
      <div><span>Address state</span><strong>{latestManual.shippingAddress?.province || "—"}</strong></div>
    </div>
    <button className="primary-action" disabled={!latestSummary} onClick={() => void copyLatestSummary()}>Copy summary</button>
  </> : <p>{busy ? "Loading manual orders…" : "No manual orders saved."}</p>}
</section>
<section className="card mobile-hub">
  <h2>Sales by platform</h2>
  {salesReport ? <div className="report-channel">
    <span>Shopify <b>{salesReport.channel.shopify.count} sales</b><strong>{money.format(salesReport.channel.shopify.sales)}</strong></span>
    <span>TikTok Shop <b>{salesReport.channel.tiktok.count} sales</b><strong>{money.format(salesReport.channel.tiktok.sales)}</strong></span>
  </div> : <p>{reportLoading ? "Loading platform sales…" : "Platform sales unavailable."}</p>}
</section>
<section className="card mobile-filters"><div className="filter-heading"><h2>Sales reporting</h2><button className="quiet" onClick={() => { setSourceFilter("all"); setFromDate(""); setToDate(""); void loadSalesReport(); }}>Clear</button></div><div className="filter-grid"><label>From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><label>Source<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="shopify">Shopify</option><option value="tiktok">TikTok Shop</option></select></label></div></section><section className="card mobile-report"><div className="filter-heading"><div><h2>Sales totals</h2><p>{salesReport ? `${salesReport.orderCount} sales in this range` : "Calculating in the background…"}</p></div><button className="quiet" disabled={reportLoading} onClick={() => void loadSalesReport()}>{reportLoading ? "Refreshing…" : "Refresh"}</button></div>{salesReport && <><div className="report-metrics"><span>Total sales<strong>{money.format(salesReport.sales.gross)}</strong></span><span>Collected<strong>{money.format(salesReport.sales.totalCollected)}</strong></span><span>Discounts<strong>{money.format(salesReport.sales.productDiscounted + salesReport.sales.shippingDiscounted)}</strong></span><span>Fees<strong>{money.format(salesReport.sales.totalFees)}</strong></span><span>Cash after fees<strong>{money.format(salesReport.sales.collected)}</strong></span></div></>}<p>{reportLoading ? "Your saved report remains visible while the latest figures are calculated." : "Reporting is refreshed only in this workspace, so opening Orders stays fast."}</p></section>    <section className="card mobile-hub">
      <h2>Content planned</h2>
      {demoMode ? <ul><li>Monday · Behind the scenes: preparing voice messages</li><li>Wednesday · Meet the plushies</li></ul> : <p>Open the desktop content planner for the schedule.</p>}
    </section>{notice && <p className="error" role="status">{notice}</p>}</main>;
  if (tab === "Home") return <main>
    <header className="topbar"><div><p className="eyebrow">MEANINGFUL PLUSHIES</p><h1>Home</h1><p>Welcome, {session.displayName}</p></div></header>
    <section className="card mobile-hub">
      <h2>Overview</h2>
      <p>{dashboard.totalCount} orders in the current view</p>
      <button className="quiet" onClick={() => chooseTab("Fulfilment")}>View fulfilment</button>
    </section>
    {session.role === "admin" && <section className="card mobile-hub">
      <h2>Finances and sales</h2>
      {demoMode && <div className="detail-grid"><div><span>Sample gross sales</span><strong>{money.format(356)}</strong></div><div><span>Sample cash collected</span><strong>{money.format(267)}</strong></div></div>}
      <button className="quiet" onClick={() => void chooseWorkspace("reports")}>Open sales report</button>
    </section>}
    <section className="card mobile-hub">
      <h2>Content planned</h2>
      {demoMode ? <ul><li>Monday · Behind the scenes: preparing voice messages</li><li>Wednesday · Meet the plushies</li></ul> : <p>Open the desktop content planner for the schedule.</p>}
    </section>
    {updatesAvailable && <button className="updates-banner" onClick={() => void refresh(true)} disabled={busy}>Refresh changed orders</button>}
    {notice && <p role="status" className="error">{notice}</p>}
  </main>;
  if (tab === "Fulfilment") return <main>
    <header className="topbar"><div><h1>Fulfilment</h1><p>{new Intl.DateTimeFormat("en-MY", { dateStyle: "full", timeZone: "Asia/Kuala_Lumpur" }).format(new Date())}</p></div></header>
    {demoMode ? <>
      <section className="card mobile-hub dispatch-summary">
        <p className="eyebrow">BARCODE SCANNER · SAMPLE DATA</p>
        <h2><strong>{scannedToday}</strong> orders scanned today</h2>
        <p>Each order counts once, even if scanned again.</p>
        <dl><div><dt>Still at sewing</dt><dd>{waitingForProgress.length}</dd></div></dl>
      </section>
      <section className="card mobile-hub">
        <h2>Orders still at sewing by batch</h2>
        {[...new Set(waitingForProgress.map((order) => order.batch))].sort().map((batch) => {
          const orders = waitingForProgress.filter((order) => order.batch === batch);
          return <details key={batch}>
            <summary>{batch} · {orders.length} awaiting progress</summary>
            <ul>{orders.map((order) => <li key={order.id}>#{order.orderNumber} · {order.plushName}{order.scannedToday ? " · Scanned today" : ""}</li>)}</ul>
          </details>;
        })}
        {!waitingForProgress.length && <p>No orders are still at sewing.</p>}
      </section>
    </> : <section className="card"><h2>Barcode scanner activity</h2><p>Live scan counts are unavailable. The desktop scanner shows the current sewing queue.</p></section>}
  </main>;
  return <main><style>{`.mobile-report{display:none}`}</style>
    {ordersHeader}{orderSwitch}
    <label className="order-sort">Sort orders
      <select value={orderSort} onChange={(event) => setOrderSort(event.target.value)}>
        <option value="updated">Recently updated</option>
        <option value="newest">Newest order date</option>
        <option value="oldest">Oldest order date</option>
        <option value="number-asc">Order number, low to high</option>
        <option value="number-desc">Order number, high to low</option>
      </select>
    </label>
    {showSyncProgress && <p role="status">{availableOrders.length} of {orderSyncProgress?.totalCount} orders synced</p>}


    {updatesAvailable && <button className="updates-banner" onClick={() => void refresh(true)} disabled={busy}><span>New orders or changes are ready.</span><strong>{busy ? "Refreshing…" : "Refresh now"}</strong></button>}
    <section className="card mobile-filters"><div className="filter-heading"><h2>Filters</h2><button className="quiet" onClick={() => { setStatusFilter("all"); setSourceFilter("all"); setFromDate(""); setToDate(""); }}>Clear</button></div><div className="filter-grid"><label>From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><label>Source<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}><option value="all">All sources</option><option value="shopify">Shopify</option><option value="tiktok">TikTok Shop</option></select></label><label>Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></section>
    {session.role === "admin" && <section className="card mobile-report"><div className="filter-heading"><div><h2>Sales totals</h2><p>{salesReport ? `${salesReport.orderCount} sales in this range` : "Loading reporting…"}</p></div><button className="quiet" disabled={reportLoading} onClick={() => void loadSalesReport()}>{reportLoading ? "Loading…" : "Refresh"}</button></div>{salesReport && <><div className="report-channel"><span>Shopify <b>{salesReport.channel.shopify.count} sales</b><strong>{money.format(salesReport.channel.shopify.sales)}</strong></span><span>TikTok Shop <b>{salesReport.channel.tiktok.count} sales</b><strong>{money.format(salesReport.channel.tiktok.sales)}</strong></span></div><div className="report-metrics"><span>Total sales<strong>{money.format(salesReport.sales.gross)}</strong></span><span>Collected<strong>{money.format(salesReport.sales.totalCollected)}</strong></span><span>Discounts<strong>{money.format(salesReport.sales.productDiscounted + salesReport.sales.shippingDiscounted)}</strong></span><span>Fees<strong>{money.format(salesReport.sales.totalFees)}</strong></span><span>Cash after fees<strong>{money.format(salesReport.sales.collected)}</strong></span></div></>}</section>}
    {tab === "Orders" && <label className="search mobile-order-search">
  <span>Search orders</span>
  <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
    placeholder="Order number, customer, customisation ID…" />
</label>}
    {manualSearchResults.length > 0 && <section className="order-list">
      <div className="list-heading"><h2>Matching manual orders</h2><span>{manualSearchResults.length}</span></div>
      {manualSearchResults.map((order) => <button className="order-row" key={order.id} onClick={() => void openManualOrder(order.id)}>
        <div><strong>{order.reference || `MP-${order.id.toUpperCase()}`}</strong><span>{order.customerName}</span><small>{order.customisationSessionId}</small></div>
        <span className="status">{manualStatus(order)}</span>
      </button>)}
    </section>}
    <section className="order-list"><div className="list-heading"><h2>All orders</h2><span>{visibleOrders.length}</span></div>{visibleOrders.map((order) => <button className="order-row" key={order.id} onClick={() => void openOrder(order.id)}><div><strong>#{order.orderNumber}</strong><span>{order.customerName || "Customer"} · {order.plushName || order.product || "Plushie"}</span><small>{date(order.orderDate)}</small></div><div><span className={`status status-${order.status}`}>{labels[order.status] || order.status}</span><b>›</b></div></button>)}{!visibleOrders.length && <p className="empty">{orderQuery ? "No matching fulfilment orders." : "No orders on the loaded pages."}</p>}{dashboard.hasMore && !showSyncProgress && <button className="load-more" onClick={() => void loadMore()} disabled={loadingMore || busy}>{loadingMore ? "Loading orders…" : "Load next 100 orders"}</button>}</section>
    {opening && <div className="loading">Opening order…</div>}{notice && <p className="error" role="status">{notice}</p>}
  </main>;
  };

  return <div className={session ? "mobile-shell" : undefined}
    onTouchStart={(event) => {
      pullStart.current = session && window.scrollY <= 0 && event.touches.length === 1 && !refreshing
        ? event.touches[0].clientY : null;
    }}
    onTouchMove={(event) => {
      if (pullStart.current === null) return;
      if (window.scrollY > 0 || event.touches.length !== 1) { finishPull(false); return; }
      pullAmount.current = Math.min(90, Math.max(0, event.touches[0].clientY - pullStart.current));
      setPullDistance(pullAmount.current);
    }}
    onTouchEnd={() => finishPull(true)}
    onTouchCancel={() => finishPull(false)}>
    {(pullDistance > 0 || refreshing) && <div className="mobile-pull-indicator" role="status">
      {refreshing ? "Refreshing…" : pullDistance >= 56 ? "Release to refresh" : "Pull down to refresh"}
    </div>}
    {demoMode && <p className="demo-banner" role="status">Local demo · Sample orders</p>}{screen()}
    {session && <nav className="mobile-nav" aria-label="Main navigation">
      {tabs.map((item) => <button key={item} type="button"
        aria-current={tab === item ? "page" : undefined}
        disabled={busy || opening}
        onClick={() => chooseTab(item)}>{item}</button>)}
    </nav>}
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);

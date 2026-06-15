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
type View = "orders" | "fulfilment" | "packing_slips" | "print_envelope" | "import" | "fulfilled" | "history" | "settings" | "stock" | "sales_report";
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
  const [envelopeSelection, setEnvelopeSelection] = useState<string[]>([]);
  const [packingStatusFilter, setPackingStatusFilter] = useState<"all" | OrderStatus>("all");
  const [envelopeStatusFilter, setEnvelopeStatusFilter] = useState<"all" | OrderStatus>("all");
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
  const [manualEnvelopeIds, setManualEnvelopeIds] = useState("");
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
  const envelopeOrders = envelopeSelection
    .map((id) => orders.find((order) => order.id === id))
    .filter((order): order is Order => Boolean(order));
  const envelopePages = Array.from({ length: Math.ceil(envelopeOrders.length / 2) }, (_, index) => envelopeOrders.slice(index * 2, index * 2 + 2));
  const packingAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => packingStatusFilter === "all" || order.status === packingStatusFilter),
    "orderNumber",
    "desc",
  ), [orders, packingStatusFilter]);
  const envelopeAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => envelopeStatusFilter === "all" || order.status === envelopeStatusFilter),
    "orderNumber",
    "desc",
  ), [orders, envelopeStatusFilter]);
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
  const allSalesReportRows = useMemo(() => buildSalesReportRows(orders, processorS×ôæÚ$z{-®éÜj×¢Â÷6V7FöãçÐ¢Â÷6V7Föãà ¢·6VÆV7FVBbbÄ÷&FW$G&vW"÷&FW#×·6VÆV7FVGÒ&öÆS×·6W76öâç&öÆWÒ7F÷#×·6W76öâæF7ÆæÖWÒöä6Æ÷6S×²Óâ6WE6VÆV7FVDBçVÆÂÒöåWFFS×²F6ÓâWFFT÷&FW"6VÆV7FVBæBÂF6Òöå7FGW3×²7FGW2Óâ6WE7FGW26VÆV7FVBÂ7FGW2ÒóçÐ¢ÂöÖãã°§Ð ¦gVæ7FöâÆövâ²öäÆövâÓ¢²öäÆövã¢6W76öã¢6W76öâÓâföBÒ°¢6öç7B·W6W&æÖRÂ6WEW6W&æÖUÒÒW6U7FFR&FÖâ"°¢6öç7B·77v÷&BÂ6WE77v÷&EÒÒW6U7FFR&FVÖó#3B"°¢6öç7B¶W'&÷"Â6WDW'&÷%ÒÒW6U7FFR""°¢6öç7B·6væætâÂ6WE6væætåÒÒW6U7FFRfÇ6R°¢7æ2gVæ7Föâ7V&ÖBWfVçC¢f÷&ÔWfVçB°¢WfVçBç&WfVçDFVfVÇB°¢6WE6væætâG'VR°¢6WDW'&÷"""°¢G'²öäÆövâvBÆöväF6&ö&D66÷VçBW6W&æÖRÂ77v÷&B²Ð¢6F6ÆöväW'&÷"²6WDW'&÷"ÆöväW'&÷"ç7Fæ6VöbW'&÷"òÆöväW'&÷"æÖW76vR¢%6vââfÆVBâ"²Ð¢fæÆÇ²6WE6væætâfÇ6R²Ð¢Ð¢&WGW&âÆÖâ6Æ74æÖSÒ&Æövâ×vR#ãÇ6V7Föâ6Æ74æÖSÒ&ÆövâÖ'&æB#ãÆFb6Æ74æÖSÒ&ÆövâÖÆövò#äÕÂöFcãÇäÔTääteTÂÅU4U3Â÷ãÆä6ÆÖW"vFòÖævRWfW'ÇW6RãÂöãÇ7ãåG&6²fö6RÂ&öGV7FöâÂ6¶æræBFVÆfW'g&öÒöæR6×ÆRv÷&·76RãÂ÷7ããÂ÷6V7FöããÇ6V7Föâ6Æ74æÖSÒ&Æövâ×æVÂ#ãÆf÷&Òöå7V&ÖC×·7V&ÖGÓãÇ6Æ74æÖSÒ&WV'&÷r#å5Ddbõ%DÃÂ÷ãÆ#åvVÆ6öÖR&6³Âö#ãÇ7ãå6vââvFFR66÷VçB7&VFVB'÷W"FÖæ7G&F÷"ãÂ÷7ãç¶W'&÷"bbÇ6Æ74æÖSÒ&ÆövâÖW'&÷"#ç¶W'&÷'ÓÂ÷çÓÆÆ&VÃåW6W&æÖSÆçWBfÇVS×·W6W&æÖWÒöä6ævS×²WfVçBÓâ6WEW6W&æÖRWfVçBçF&vWBçfÇVRÒ&WV&VBWFô6ö×ÆWFSÒ'W6W&æÖR"óãÂöÆ&VÃãÆÆ&VÃå77v÷&CÆçWBGSÒ'77v÷&B"fÇVS×·77v÷&GÒöä6ævS×²WfVçBÓâ6WE77v÷&BWfVçBçF&vWBçfÇVRÒ&WV&VBWFô6ö×ÆWFSÒ&7W'&VçB×77v÷&B"óãÂöÆ&VÃãÆ'WGFöâ6Æ74æÖSÒ&'WGFöâ&Ö'Æ&vR"GSÒ'7V&ÖB"F6&ÆVC×·6væætçÓç·6væætâò%6væærââââ"¢%6vââ'ÓÂö'WGFöããÂöf÷&ÓãÂ÷6V7FöããÂöÖãã°§Ð ¦gVæ7Föâ7FB²Æ&VÂÂfÇVRÂ6öÆ÷"Ó¢²Æ&VÃ¢7G&æs²fÇVS¢çVÖ&W#²6öÆ÷#¢7G&ærÒ°¢&WGW&âÆ'F6ÆR6Æ74æÖS×¶7FBG¶6öÆ÷'ÖÓãÇ7ãç¶Æ&VÇÓÂ÷7ããÇ7G&öæsç·fÇVWÓÂ÷7G&öæsãÂö'F6ÆSã°§Ð ¦gVæ7FöâÖöæW7FB²Æ&VÂÂfÇVRÂFöæRÓ¢²Æ&VÃ¢7G&æs²fÇVS¢çVÖ&W#²FöæS¢7G&ærÒ°¢&WGW&âÆ'F6ÆR6Æ74æÖS×¶ÖöæW×7FBG·FöæWÖÓãÇ7ãç¶Æ&VÇÓÂ÷7ããÇ7G&öæsç¶f÷&ÖDÖöæWfÇVRÓÂ÷7G&öæsãÂö'F6ÆSã°§Ð ¦gVæ7Föâ6VÆV7F&ÆTÖöæW7FB²Æ&VÂÂfÇVRÂFöæRÂ6VÆV7FVBÂ÷Föç2Âöä6ævRÓ¢²Æ&VÃ¢7G&æs²fÇVS¢çVÖ&W#²FöæS¢7G&æs²6VÆV7FVC¢7G&æs²÷Föç3¢·7G&ærÂ7G&æuÕµÓ²öä6ævS¢fÇVS¢7G&ærÓâföBÒ°¢&WGW&âÆ'F6ÆR6Æ74æÖS×¶ÖöæW×7FBG·FöæWÒ6VÆV7F&ÆRÖÖöæW×7FFÓãÇ7ãç¶Æ&VÇÓÂ÷7ããÇ6VÆV7BfÇVS×·6VÆV7FVGÒöä6ævS×²WfVçBÓâöä6ævRWfVçBçF&vWBçfÇVRÓç¶÷Föç2æÖ·fÇVRÂ÷FöäÆ&VÅÒÓâÆ÷Föâ¶W×·fÇVWÒfÇVS×·fÇVWÓç¶÷FöäÆ&VÇÓÂö÷FöãâÓÂ÷6VÆV7CãÇ7G&öæsç¶f÷&ÖDÖöæWfÇVRÓÂ÷7G&öæsãÂö'F6ÆSã°§Ð ¦gVæ7Föâ6÷'D6öçG&öÇ2²6÷'D¶WÂF&V7FöâÂöä¶WÂöäF&V7FöâÓ¢²6÷'D¶W¢6÷'D¶W²F&V7Föã¢6÷'DF&V7Föã²öä¶W¢¶W¢6÷'D¶WÓâföC²öäF&V7Föã¢F&V7Föã¢6÷'DF&V7FöâÓâföBÒ°¢&WGW&âÆFb6Æ74æÖSÒ'6÷'BÖ6öçG&öÇ2#ãÇ6VÆV7B&ÖÆ&VÃÒ%6÷'B÷&FW'2'"fÇVS×·6÷'D¶WÒöä6ævS×²WfVçBÓâöä¶WWfVçBçF&vWBçfÇVR26÷'D¶WÓãÆ÷FöâfÇVSÒ&÷&FW$çVÖ&W"#ä÷&FW"çVÖ&W#Âö÷FöããÆ÷FöâfÇVSÒ&×÷'FVDB#äÆ7BFFVCÂö÷FöããÆ÷FöâfÇVSÒ'WFFVDB#äÆ7BVFFVCÂö÷FöããÂ÷6VÆV7CãÇ6VÆV7B&ÖÆ&VÃÒ%6÷'BF&V7Föâ"fÇVS×¶F&V7FöçÒöä6ævS×²WfVçBÓâöäF&V7FöâWfVçBçF&vWBçfÇVR26÷'DF&V7FöâÓãÆ÷FöâfÇVSÒ&62#ä66VæFæsÂö÷FöããÆ÷FöâfÇVSÒ&FW62#äFW66VæFæsÂö÷FöããÂ÷6VÆV7CãÂöFcã°§Ð ¦gVæ7Föâ7FGW5ÆÂ²7FGW2Ó¢²7FGW3¢÷&FW%7FGW2Ò°¢&WGW&âÇ7â6Æ74æÖS×¶7FGW2×ÆÂ7FGW2ÒG·7FGW7ÖÓç·7FGW4Æ&VÇ5·7FGW5×ÓÂ÷7ãã°§Ð ¦gVæ7Föâ×÷'D&÷²çVÖ&W"ÂFFÆRÂ&WV&VBÂfÇVRÂöä6ævRÂöäfÆRÂÆ6VöÆFW"Ó¢²çVÖ&W#¢7G&æs²FFÆS¢7G&æs²&WV&VCó¢&ööÆVã²fÇVS¢7G&æs²öä6ævS¢fÇVS¢7G&ærÓâföC²öäfÆS¢fÆSó¢fÆRÓâföC²Æ6VöÆFW#¢7G&ærÒ°¢&WGW&âÆ'F6ÆR6Æ74æÖSÒ&6&B×÷'BÖ&÷#ãÆFb6Æ74æÖSÒ&×÷'BÖVFær#ãÇ7ãç¶çVÖ&W'ÓÂ÷7ããÆFcãÆ3ç·FFÆWÓÂö3ãÇç·&WV&VBò%&WV&VB"¢$÷FöæÂÂ'WB&V6öÖÖVæFVB'ÓÂ÷ãÂöFcãÂöFcãÆÆ&VÂ6Æ74æÖSÒ&fÆRÖG&÷#ãÆçWBGSÒ&fÆR"66WCÒ"æ77bÇFWBö77b"öä6ævS×²WfVçBÓâöäfÆRWfVçBçF&vWBæfÆW3òå³ÒÒóãÇ7G&öæsä6ö÷6R55bfÆSÂ÷7G&öæsãÇ7ãæ÷"7FRFR55b6öçFVçB&VÆ÷sÂ÷7ããÂöÆ&VÃãÇFWF&VfÇVS×·fÇVWÒöä6ævS×²WfVçBÓâöä6ævRWfVçBçF&vWBçfÇVRÒÆ6VöÆFW#×·Æ6VöÆFW'ÒóãÂö'F6ÆSã°§Ð ¦gVæ7Föâ÷&FW$G&vW"²÷&FW"Â&öÆRÂ7F÷"Âöä6Æ÷6RÂöåWFFRÂöå7FGW2Ó¢²÷&FW#¢÷&FW#²&öÆS¢W6W%&öÆS²7F÷#¢7G&æs²öä6Æ÷6S¢ÓâföC²öåWFFS¢F6¢'FÃÄ÷&FW#âÓâföC²öå7FGW3¢7FGW3¢÷&FW%7FGW2ÓâföBÒ°¢6öç7BFÖâÒ&öÆRÓÓÒ&FÖâ#°¢6öç7BföÆÆ÷værÒæWE7FGW5¶÷&FW"ç7FGW5Ó° ¢gVæ7FöâWÆöE÷FòfÆSó¢fÆR°¢bfÆR&WGW&ã°¢bfÆRç6¦Râ5óó&WGW&âÆW'B%ÆV6R6ö÷6RâÖvR6ÖÆÆW"Fâ2Ô"â"°¢6öç7B&VFW"ÒæWrfÆU&VFW"°¢&VFW"æöæÆöBÒÓâöåWFFR²÷FôFFW&Ã¢7G&ær&VFW"ç&W7VÇBÂ÷FôæÖS¢fÆRææÖRÒ°¢&VFW"ç&VD4FFU$ÂfÆR°¢Ð ¢&WGW&âÆFb6Æ74æÖSÒ&G&vW"Ö&6¶G&÷"öäÖ÷W6TF÷vã×²WfVçBÓâWfVçBçF&vWBÓÓÒWfVçBæ7W'&VçEF&vWBbböä6Æ÷6RÓãÆ6FR6Æ74æÖSÒ&÷&FW"ÖG&vW"#ãÆFb6Æ74æÖSÒ&G&vW"ÖVFW"#ãÆFcãÇäõ$DU"DUDÃÂ÷ãÆ#ç¶÷&FW$Æ&VÂ÷&FW"ÓÂö#ãÂöFcãÆ'WGFöâöä6Æ6³×¶öä6Æ÷6WÓçÂö'WGFöããÂöFcãÆFb6Æ74æÖSÒ&G&vW"Ö&öG#à¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×7VÖÖ'#ãÆFcãÇ7ãä7W'&VçB7FGW3Â÷7ããÅ7FGW5ÆÂ7FGW3×¶÷&FW"ç7FGW7ÒóãÂöFcãÆFcãÇ7ãäÆ7BWFFVCÂ÷7ããÇ7G&öæsç¶f÷&ÖDFFR÷&FW"çWFFVDBÂG'VRÓÂ÷7G&öæsãÂöFcãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3åV6²7Föç3Âö3ãÆFb6Æ74æÖSÒ'7FGW2Ö7Föç2#ç¶föÆÆ÷værbbÆ'WGFöâ6Æ74æÖSÒ&'WGFöâ&Ö'"öä6Æ6³×²Óâöå7FGW2föÆÆ÷værÓäÖ÷fRFò·7FGW4Æ&VÇ5¶föÆÆ÷væu×ÓÂö'WGFöãç×¶FÖâbbÆ'WGFöâ6Æ74æÖSÒ&'WGFöâ77VRÖ'WGFöâ"öä6Æ6³×²Óâöå7FGW2&77VR"ÓäÖ&²77VSÂö'WGFöãç×¶FÖâbb÷&FW"ç7FGW2ÓÓÒ&77VR"bbÆ'WGFöâ6Æ74æÖSÒ&'WGFöâ6V6öæF'"öä6Æ6³×²Óâöå7FGW2'6VçEöf÷%÷6Wvær"Óå&W6öÇfR77VSÂö'WGFöãçÓÆ6Æ74æÖSÒ&'WGFöâvG6"&Vc×·vG6Ææ²÷&FW"ÒF&vWCÒ%ö&Ææ²#ä÷VâvG4ÂöãÂöFcãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3ä7W7FöÖW"æB÷&FW#Âö3ãÆFb6Æ74æÖSÒ&fVÆBÖw&B#ãÄfVÆBÆ&VÃÒ$÷&FW"çVÖ&W""fÇVS×¶2G¶÷&FW"æ÷&FW$çVÖ&W'ÖÒóãÄfVÆBÆ&VÃÒ$÷&FW"FFR"fÇVS×¶f÷&ÖDFFR÷&FW"æ÷&FW$FFRÂG'VRÒóãÄfVÆBÆ&VÃÒ%ÖVçBÖWFöB"fÇVS×¶÷&FW"çÖVçE&ö6W76÷"ÇÂ%Væ¶æ÷vâ'ÒóãÄVFF&ÆRÆ&VÃÒ$7W7FöÖW"æÖR"fÇVS×¶÷&FW"æ7W7FöÖW$æÖWÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²7W7FöÖW$æÖS¢fÇVRÒÒóãÄVFF&ÆRÆ&VÃÒ%öæR"fÇVS×¶÷&FW"çöæWÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²öæS¢fÇVRÒÒóãÄVFF&ÆRvFRÆ&VÃÒ$FG&W72"fÇVS×¶÷&FW"æFG&W77ÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²FG&W73¢fÇVRÒÒóãÂöFcãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3åÇW6RFWFÇ3Âö3ãÆFb6Æ74æÖSÒ&fVÆBÖw&B#ãÄVFF&ÆRÆ&VÃÒ%&öGV7BæÖR"fÇVS×¶÷&FW"ç&öGV7GÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²&öGV7C¢fÇVRÒÒóãÄVFF&ÆRÆ&VÃÒ$6&7FW""fÇVS×¶÷&FW"æ6&7FW'ÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²6&7FW#¢fÇVRÒÒóãÄVFF&ÆRÆ&VÃÒ%6WBæF6F÷""fÇVS×¶÷&FW"ç6WDæF6F÷"óò"'ÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²6WDæF6F÷#¢fÇVRÒÒóãÄVFF&ÆRÆ&VÃÒ$BvV'6FRÆæ²"fÇVS×¶÷&FW"æEvV'6FTÆæ²óò"'ÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²EvV'6FTÆæ³¢fÇVRÒÒóãÄVFF&ÆRÆ&VÃÒ%fö6RÆVæwF"fÇVS×µ7G&ær÷&FW"çfö6TÆVæwFÇÂ""ÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²fö6TÆVæwF¢çVÖ&W"fÇVRÇÂÒÒóãÄVFF&ÆRÆ&VÃÒ%ÇW6æÖR"fÇVS×¶÷&FW"çÇW6æÖWÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²ÇW6æÖS¢fÇVRÒÒóãÄVFF&ÆRvFRÆ&VÃÒ%&VÖ&²"fÇVS×¶÷&FW"ç&VÖ&²óò"'ÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²&VÖ&³¢fÇVRÒÒóãÄVFF&ÆRvFRFWF&VÆ&VÃÒ$ÖVæævgVÂæ÷FR"fÇVS×¶÷&FW"æÖVæævgVÄæ÷FWÒF6&ÆVC×²FÖçÒöä6ævS×²fÇVRÓâöåWFFR²ÖVæævgVÄæ÷FS¢fÇVRÒÒóãÆFb6Æ74æÖSÒ&fVÆBvFR#ãÆÆ&VÃäÖVæævgVÂÖW76vSÂöÆ&VÃç¶÷&FW"æÖVæævgVÄÖW76vRòÆ&Vc×¶÷&FW"æÖVæævgVÄÖW76vWÒF&vWCÒ%ö&Ææ²"&VÃÒ&æ÷&VfW'&W"#ä÷Vâ7W7FöÖW"ÖW76vSÂöâ¢Ç7ãäæ÷B&÷fFVCÂ÷7ãçÓÂöFcãÆFb6Æ74æÖSÒ&fVÆB#ãÆÆ&VÃåfö6RWÆöCÂöÆ&VÃç¶FÖâòÇ6VÆV7BfÇVS×¶÷&FW"çfö6UWÆöE7FGW7Òöä6ævS×²WfVçBÓâöåWFFR²fö6UWÆöE7FGW3¢WfVçBçF&vWBçfÇVR2÷&FW%²'fö6UWÆöE7FGW2%ÒÒÓãÆ÷FöâfÇVSÒ&Ö76ær#äÖ76æsÂö÷FöããÆ÷FöâfÇVSÒ'&V6VfVB#å&V6VfVCÂö÷FöããÆ÷FöâfÇVSÒ&6V6¶VB#ä6V6¶VCÂö÷FöããÂ÷6VÆV7Câ¢Ç7G&öæsç¶÷&FW"çfö6UWÆöE7FGW7ÓÂ÷7G&öæsçÓÂöFcãÂöFcãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3äFVÆfW'Âö3ãÆFb6Æ74æÖSÒ&fVÆBÖw&B#ãÄVFF&ÆRÆ&VÃÒ$6÷W&W""fÇVS×¶÷&FW"æ6÷W&W'ÒF6&ÆVC×²FÖçÒÆ6VöÆFW#Ò$¢eBW&W72"öä6ævS×²fÇVRÓâöåWFFR²6÷W&W#¢fÇVRÒÒóãÄVFF&ÆRÆ&VÃÒ%G&6¶ærçVÖ&W""fÇVS×¶÷&FW"çG&6¶ætçVÖ&W'ÒF6&ÆVC×²FÖçÒÆ6VöÆFW#Ò$VçFW"G&6¶ærçVÖ&W""öä6ævS×²fÇVRÓâöåWFFR²G&6¶ætçVÖ&W#¢fÇVRÒÒóãÂöFcãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3åFÆ÷"ò6¶ær÷FóÂö3ãÆFb6Æ74æÖSÒ'÷FòÖfVÆB#ç¶÷&FW"ç÷FôFFW&ÂòÆÖr7&3×¶÷&FW"ç÷FôFFW&ÇÒÇCÒ%FÆ÷"÷"6¶ærWfFVæ6R"óâ¢ÆFb6Æ74æÖSÒ'÷Fò×Æ6VöÆFW"#äæò÷FòWÆöFVCÂöFcç×¶FÖâbbÆÆ&VÂ6Æ74æÖSÒ&'WGFöâ6V6öæF'#ãÆçWBGSÒ&fÆR"66WCÒ&ÖvRò¢"öä6ævS×²WfVçBÓâWÆöE÷FòWfVçBçF&vWBæfÆW3òå³ÒÒóç¶÷&FW"ç÷FôFFW&Âò%&WÆ6R÷Fò"¢%WÆöB÷Fò'ÓÂöÆ&VÃçÒ¶÷&FW"ç÷FôæÖRbbÇ6ÖÆÃç¶÷&FW"ç÷FôæÖWÓÂ÷6ÖÆÃçÓÂöFcãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3äçFW&æÂæ÷FW3Âö3ãÇFWF&V6Æ74æÖSÒ&æ÷FW2"fÇVS×¶÷&FW"æçFW&æÄæ÷FW7ÒF6&ÆVC×²FÖçÒöä6ævS×²WfVçBÓâöåWFFR²çFW&æÄæ÷FW3¢WfVçBçF&vWBçfÇVRÒÒÆ6VöÆFW#Ò$FBæ÷FW2f6&ÆRFò÷W"FVÒâââ"óãÂ÷6V7Föãà¢Ç6V7Föâ6Æ74æÖSÒ&FWFÂ×6V7Föâ#ãÆ3å7FGW27F÷'Âö3ãÆFb6Æ74æÖSÒ&7F÷'#çµ²ââæ÷&FW"ç7FGW47F÷'Òç&WfW'6RæÖWfVçBÓâÆFb¶W×¶WfVçBæGÓãÇ7ããÂ÷7ããÆFcãÇ7G&öæsç·7FGW4Æ&VÇ5¶WfVçBç7FGW5×ÓÂ÷7G&öæsãÇç¶WfVçBæ6ævVD'ÒÂ¶f÷&ÖDFFRWfVçBæ6ævVDBÂG'VRÓÂ÷ç¶WfVçBææ÷FRbbÇ6ÖÆÃç¶WfVçBææ÷FWÓÂ÷6ÖÆÃçÓÂöFcãÂöFcâÓÂöFcãÂ÷6V7Föãà¢²FÖâbbÇ6Æ74æÖSÒ'W&Ö76öâÖæ÷FR#å6væVBâ27Ffbâ÷R6âöæÇÖ÷fR÷&FW'2FòFRæWB7FvRãÂ÷çÐ¢ÂöFcãÂö6FSãÂöFcã°§Ð ¦gVæ7FöâfVÆB²Æ&VÂÂfÇVRÓ¢²Æ&VÃ¢7G&æs²fÇVS¢7G&ærÒ°¢&WGW&âÆFb6Æ74æÖSÒ&fVÆB#ãÆÆ&VÃç¶Æ&VÇÓÂöÆ&VÃãÇ7G&öæsç·fÇVRÇÂ"Ò'ÓÂ÷7G&öæsãÂöFcã°§Ð ¦gVæ7FöâVFF&ÆR²Æ&VÂÂfÇVRÂöä6ævRÂF6&ÆVBÂÆ6VöÆFW"ÂvFRÂFWF&VÓ¢²Æ&VÃ¢7G&æs²fÇVS¢7G&æs²öä6ævS¢fÇVS¢7G&ærÓâföC²F6&ÆVCó¢&ööÆVã²Æ6VöÆFW#ó¢7G&æs²vFSó¢&ööÆVã²FWF&Vó¢&ööÆVâÒ°¢&WGW&âÆFb6Æ74æÖS×¶fVÆBG·vFRò'vFR"¢"'ÖÓãÆÆ&VÃç¶Æ&VÇÓÂöÆ&VÃç·FWF&VòÇFWF&VfÇVS×·fÇVWÒF6&ÆVC×¶F6&ÆVGÒÆ6VöÆFW#×·Æ6VöÆFW'Òöä6ævS×²WfVçBÓâöä6ævRWfVçBçF&vWBçfÇVRÒóâ¢ÆçWBfÇVS×·fÇVWÒF6&ÆVC×¶F6&ÆVGÒÆ6VöÆFW#×·Æ6VöÆFW'Òöä6ævS×²WfVçBÓâöä6ævRWfVçBçF&vWBçfÇVRÒóçÓÂöFcã°§Ð ¦gVæ7Föâ6¶æu6Æ²÷&FW"Ó¢²÷&FW#¢÷&FW"Ò°¢&WGW&âÆ'F6ÆR6Æ74æÖSÒ&b×6Æ#ãÆVFW#ãÇ7ãäõ$DU"CÂ÷7ããÇ7G&öæsç¶÷&FW$Æ&VÂ÷&FW"ÓÂ÷7G&öæsãÂöVFW#ãÆFb6Æ74æÖSÒ'6ÆÖfVÆG2#ãÆFb6Æ74æÖSÒ'&Ö'×6ÆÖfVÆB#ãÆÆ&VÃä4$5DU#£ÂöÆ&VÃãÇç¶÷&FW"æ6&7FW"ÇÂ"Ò'ÓÂ÷ãÂöFcãÆFb6Æ74æÖSÒ'&Ö'×6ÆÖfVÆB#ãÆÆ&VÃåÅU4äÔS£ÂöÆ&VÃãÇç¶÷&FW"çÇW6æÖRÇÂ"Ò'ÓÂ÷ãÂöFcãÆFcãÆÆ&VÃä5U5DôÔU#£ÂöÆ&VÃãÇç¶÷&FW"æ7W7FöÖW$æÖRÇÂ"Ò'ÓÂ÷ãÂöFcãÆFcãÆÆ&VÃåôäS£ÂöÆ&VÃãÇç¶÷&FW"çöæRÇÂ"Ò'ÓÂ÷ãÂöFcãÆFb6Æ74æÖSÒ'&VÖ&²×&÷r#ãÆÆ&VÃå$TÔ$³£ÂöÆ&VÃãÇç¶÷&FW"ç&VÖ&²ÇÂ"Ò'ÓÂ÷ãÂöFcãÂöFcãÆfö÷FW#äÖVæævgVÂÇW6W3Âöfö÷FW#ãÂö'F6ÆSã°§Ð ¦gVæ7FöâVçfVÆ÷U6VWB²÷&FW'2ÂvTçVÖ&W"Ó¢²÷&FW'3¢÷&FW%µÓ²vTçVÖ&W#¢çVÖ&W"Ò°¢&WGW&âÆ'F6ÆR6Æ74æÖSÒ&VçfVÆ÷R×6VWB#ãÇ7ãåtR·vTçVÖ&W'ÓÂ÷7ããÆFcãÇ6ÖÆÃåDõäÔSÂ÷6ÖÆÃãÇ7G&öæsç²÷&FW'5³ÓòçÇW6æÖRÇÂ"Ò"çFõWW$66RÓÂ÷7G&öæsãÂöFcãÆFcãÇ6ÖÆÃä$õEDôÒäÔSÂ÷6ÖÆÃãÇ7G&öæsç²÷&FW'5³ÓòçÇW6æÖRÇÂ"Ò"çFõWW$66RÓÂ÷7G&öæsãÂöFcãÂö'F6ÆSã°§Ð §GR6öäæÖRÒ&÷&FW'2"Â&gVÆfÆÖVçB"Â'6¶ær"Â&VçfVÆ÷R"Â&×÷'B"Â'6VB"Â&Æöv÷WB"Â'6V&6"Â&7F÷'"Â&G&r"Â'6WGFæw2"Â'7Fö6²"Â'&W÷'B#° ¦gVæ7Föâ6öâ²æÖRÓ¢²æÖS¢6öäæÖRÒ°¢6öç7B6öÖÖöã¢5du&÷3Å5du5dtVÆVÖVçCâÒ²vGF¢ÂVvC¢ÂfWt&÷¢##B#B"ÂfÆÃ¢&æöæR"Â7G&ö¶S¢&7W'&VçD6öÆ÷""Â7G&ö¶UvGF¢ãÂ7G&ö¶TÆæV6¢'&÷VæB"Â7G&ö¶TÆæV¦öã¢'&÷VæB"Â&&ÖFFVâ#¢G'VRÓ°¢bæÖRÓÓÒ&÷&FW'2"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇ&V7BÒ#2"Ò#2"vGFÒ#r"VvCÒ#r"'Ò#"óãÇ&V7BÒ#B"Ò#2"vGFÒ#r"VvCÒ#r"'Ò#"óãÇ&V7BÒ#2"Ò#B"vGFÒ#r"VvCÒ#r"'Ò#"óãÇ&V7BÒ#B"Ò#B"vGFÒ#r"VvCÒ#r"'Ò#"óãÂ÷7fsã°¢bæÖRÓÓÒ&gVÆfÆÖVçB"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$Óf4Ó&4Ó2"óãÆ6&6ÆR7Ò#B"7Ò#b"#Ò#"óãÆ6&6ÆR7Ò#B"7Ò#""#Ò#"óãÆ6&6ÆR7Ò#B"7Ò#"#Ò#"óãÂ÷7fsã°¢bæÖRÓÓÒ'6¶ær"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$Ób6Ã27cTg¢"óãÇFCÒ$ÓB7cFDÓ&dÓfb"óãÂ÷7fsã°¢bæÖRÓÓÒ&VçfVÆ÷R"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇ&V7BÒ#2"Ò#R"vGFÒ#"VvCÒ#B"'Ò#""óãÇFCÒ&Ó2rbÓb"óãÂ÷7fsã°¢bæÖRÓÓÒ&×÷'B"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$Ó"7c$ÓrÃRÓRRTÓRWcVGbÓR"óãÂ÷7fsã°¢bæÖRÓÓÒ'6VB"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$Ó#bvÂÓRÓR"óãÂ÷7fsã°¢bæÖRÓÓÒ&Æöv÷WB"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$ÓTWcFTÓBÃBBÓBDÓ$"óãÂ÷7fsã°¢bæÖRÓÓÒ'6V&6"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÆ6&6ÆR7Ò#"7Ò#"#Ò#r"óãÇFCÒ&Ó##ÓBÓB"óãÂ÷7fsã°¢bæÖRÓÓÒ'6WGFæw2"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÆ6&6ÆR7Ò#""7Ò#""#Ò#2"óãÇFCÒ$ÓãBVãrãrã2ãÂããÓ"ã"ãÒãÒããrãrÓãÒã2ãrãrÓãgbã&ÓEc#ãrãrÓÓãbãrãrÓãã6ÂÒããÃBã"vÂãÒããrãrã2Óããrãr2D"ãbÓD6ãrãrãbÓãrãrÒã2ÓãÃBã"rrBã&ÂãããrãrBãbãrãr7bÒã&Ec6ãrãrãbãrãrãÒã6ÂãÒãÃãvÂÒãããrãrÒã2ããrãrãbã'cD#ãrãrÓãb¢"óãÂ÷7fsã°¢bæÖRÓÓÒ'7Fö6²"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ&ÓBrÓBBÓBÓÓE¢"óãÇFCÒ&ÓBwcÃBÓEctÓ"c"óãÂ÷7fsã°¢bæÖRÓÓÒ'&W÷'B"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$Ób6'cg¤ÓdÓ&dÓfB"óãÂ÷7fsã°¢bæÖRÓÓÒ&G&r"&WGW&âÇ7fr²ââæ6öÖÖöçÓãÆ6&6ÆR7Ò#"7Ò#r"#Ò#"fÆÃÒ&7W'&VçD6öÆ÷""7G&ö¶SÒ&æöæR"óãÆ6&6ÆR7Ò#b"7Ò#r"#Ò#"fÆÃÒ&7W'&VçD6öÆ÷""7G&ö¶SÒ&æöæR"óãÆ6&6ÆR7Ò#"7Ò#""#Ò#"fÆÃÒ&7W'&VçD6öÆ÷""7G&ö¶SÒ&æöæR"óãÆ6&6ÆR7Ò#b"7Ò#""#Ò#"fÆÃÒ&7W'&VçD6öÆ÷""7G&ö¶SÒ&æöæR"óãÆ6&6ÆR7Ò#"7Ò#r"#Ò#"fÆÃÒ&7W'&VçD6öÆ÷""7G&ö¶SÒ&æöæR"óãÆ6&6ÆR7Ò#b"7Ò#r"#Ò#"fÆÃÒ&7W'&VçD6öÆ÷""7G&ö¶SÒ&æöæR"óãÂ÷7fsã°¢&WGW&âÇ7fr²ââæ6öÖÖöçÓãÇFCÒ$Ó"cVÃ2""óãÆ6&6ÆR7Ò#""7Ò#""#Ò#"óãÂ÷7fsã°§Ð￿￿
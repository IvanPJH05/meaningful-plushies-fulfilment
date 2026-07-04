import { createHash } from "node:crypto";

import { buildSalesReportRows } from "./sales";
import { insertMetaCapiLog, upsertSharedOrders } from "./supabase";
import type { MetaCapiLog, MetaCapiSettings, Order, PaymentProcessorSetting } from "./types";
import { objectValue, textValue } from "./shopify-orders";

type SendMetaPurchaseOptions = {
  orders: Order[];
  shopifyOrder?: Record<string, unknown>;
  settings: MetaCapiSettings;
  processorSettings?: PaymentProcessorSetting[];
  shopifyPercentage?: number;
  force?: boolean;
  testEventCode?: string;
  source?: "shopify_webhook" | "shopify_refresh" | "manual_test";
  request?: Request;
};

type MetaSendResult = {
  orders: Order[];
  sent: number;
  skipped: number;
  failed: number;
  needsReview: number;
  logs: MetaCapiLog[];
};

function sha256(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized ? createHash("sha256").update(normalized).digest("hex") : "";
}

function hashed(value: unknown) {
  return sha256(textValue(value));
}

function hashedPhone(value: unknown) {
  const digits = textValue(value).replace(/\D/g, "");
  return digits ? sha256(digits) : "";
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

function lastName(name: string) {
  return name.trim().split(/\s+/).slice(1).join(" ");
}

function unixTime(value: string) {
  const date = value ? new Date(value) : new Date();
  const time = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  return Math.floor(time / 1000);
}

function eventId(order: Order) {
  return `shopify_order_${order.orderNumber}_purchase`;
}

function metaCredentials() {
  return {
    pixelId: process.env.META_PIXEL_ID ?? "",
    accessToken: process.env.META_CAPI_ACCESS_TOKEN ?? "",
  };
}

export function metaCapiEnvironmentStatus() {
  const { pixelId, accessToken } = metaCredentials();
  return {
    pixelConfigured: Boolean(pixelId),
    tokenConfigured: Boolean(accessToken),
    tokenMasked: accessToken ? `${accessToken.slice(0, 6)}...${accessToken.slice(-4)}` : "",
    testEventCodeConfigured: Boolean(process.env.META_TEST_EVENT_CODE),
  };
}

function shopifyShippingAddress(shopifyOrder?: Record<string, unknown>) {
  return objectValue(shopifyOrder?.shippingAddress ?? shopifyOrder?.shipping_address ?? shopifyOrder?.billingAddress ?? shopifyOrder?.billing_address);
}

function shopifyCustomer(shopifyOrder?: Record<string, unknown>) {
  return objectValue(shopifyOrder?.customer);
}

function shopifyLineItems(shopifyOrder?: Record<string, unknown>) {
  const direct = shopifyOrder?.lineItems ?? shopifyOrder?.line_items;
  const nodes = objectValue(direct).nodes;
  return Array.isArray(nodes) ? nodes.map(objectValue) : Array.isArray(direct) ? direct.map(objectValue) : [];
}

function itemAmount(lineItem: Record<string, unknown>, fallback = 0) {
  const direct = Number(lineItem.price ?? lineItem.item_price ?? lineItem.originalUnitPrice ?? lineItem.original_unit_price);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const originalSet = objectValue(lineItem.originalUnitPriceSet ?? lineItem.original_unit_price_set);
  const shopMoney = objectValue(originalSet.shopMoney ?? originalSet.shop_money);
  const amount = Number(shopMoney.amount);
  return Number.isFinite(amount) && amount > 0 ? amount : fallback;
}

function selectedPurchaseValue(order: Order, group: Order[]) {
  const row = buildSalesReportRows(group)[0];
  const salePrice = row?.salePrice ?? 0;
  const isManualCorrection = order.totalAmount <= 0 && salePrice > 0;
  const paymentMethodSource = isManualCorrection ? "whatsapp_manual" : "shopify_checkout";
  const trueRevenueSource = isManualCorrection ? "fulfilment_actual_paid_amount" : "shopify_total_price";
  return { salePrice, isManualCorrection, paymentMethodSource, trueRevenueSource };
}

function reviewOrder(order: Order, message: string): Order {
  return {
    ...order,
    metaCapiStatus: "needs_review",
    metaCapiError: message,
    metaCapiNeedsReview: true,
    updatedAt: new Date().toISOString(),
  };
}

function logBase(order: Order, status: MetaCapiLog["status"], value: number, message = "", response: Record<string, unknown> = {}, testEventCode = ""): MetaCapiLog {
  return {
    id: `meta-capi-${order.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    eventName: "Purchase",
    eventId: eventId(order),
    value,
    currency: "MYR",
    status,
    responseId: textValue(response.fbtrace_id) || textValue(response.events_received) || "",
    error: message,
    requestSummary: {},
    responseBody: response,
    testEventCode,
    createdAt: new Date().toISOString(),
  };
}

function safeResponseBody(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : { response: String(value ?? "") };
}

function metaUserData(order: Order, shopifyOrder: Record<string, unknown> | undefined, request: Request | undefined) {
  const address = shopifyShippingAddress(shopifyOrder);
  const customer = shopifyCustomer(shopifyOrder);
  const name = order.customerName || textValue(address.name);
  const data: Record<string, string> = {
    em: hashed(order.email || customer.email),
    ph: hashedPhone(order.phone || address.phone || shopifyOrder?.phone),
    fn: hashed(customer.firstName ?? customer.first_name ?? firstName(name)),
    ln: hashed(customer.lastName ?? customer.last_name ?? lastName(name)),
    ct: hashed(address.city),
    st: hashed(address.province ?? address.provinceCode ?? address.province_code),
    zp: hashed(address.zip),
    country: hashed(address.countryCode ?? address.country_code ?? address.country),
    external_id: hashed(customer.id ?? shopifyOrder?.customer_id ?? shopifyOrder?.id ?? order.id),
    client_ip_address: textValue(request?.headers.get("x-forwarded-for")).split(",")[0]?.trim() || textValue(request?.headers.get("x-real-ip")),
    client_user_agent: textValue(request?.headers.get("user-agent")),
    fbp: textValue(request?.headers.get("x-fbp")),
    fbc: textValue(request?.headers.get("x-fbc")),
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => Boolean(value)));
}

function metaCustomData(order: Order, group: Order[], shopifyOrder: Record<string, unknown> | undefined, value: number, paymentMethodSource: string, trueRevenueSource: string, correctedZeroValueOrder: boolean) {
  const lineItems = shopifyLineItems(shopifyOrder);
  const contents = lineItems.length ? lineItems.map((item, index) => ({
    id: textValue(item.variant_id ?? item.variantId ?? item.product_id ?? item.productId ?? item.sku ?? `${order.orderNumber}-${index + 1}`),
    quantity: Number(item.quantity ?? 1) || 1,
    item_price: itemAmount(item, value / Math.max(1, lineItems.length)),
    title: textValue(item.title ?? item.name),
  })) : group.map((item, index) => ({
    id: item.id,
    quantity: 1,
    item_price: value / Math.max(1, group.length),
    title: item.product || item.character || `${item.orderNumber}-${index + 1}`,
  }));
  return {
    value,
    currency: "MYR",
    order_id: order.orderNumber,
    content_type: "product",
    content_ids: contents.map((item) => item.id).filter(Boolean),
    contents,
    num_items: contents.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    payment_method_source: paymentMethodSource,
    discount_code: order.discountCodeUsed || order.discountCodes?.[0] || "",
    discount_amount: order.discountAmount,
    shipping: order.shippingAmount,
    tax: 0,
    true_revenue_source: trueRevenueSource,
    corrected_zero_value_order: correctedZeroValueOrder,
  };
}

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postToMeta(payload: Record<string, unknown>) {
  const { pixelId, accessToken } = metaCredentials();
  if (!pixelId || !accessToken) throw new Error("META_PIXEL_ID or META_CAPI_ACCESS_TOKEN is not configured.");
  const response = await fetch(`https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = safeResponseBody(await response.json().catch(() => ({})));
  if (!response.ok) throw new Error(JSON.stringify(body));
  return body;
}

async function postWithRetry(payload: Record<string, unknown>) {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await postToMeta(payload);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Meta rejected the event.";
      if (attempt < 2) await wait(500 * 2 ** attempt);
    }
  }
  throw new Error(lastError);
}

export async function sendMetaPurchaseEvents(options: SendMetaPurchaseOptions): Promise<MetaSendResult> {
  const groups = new Map<string, Order[]>();
  for (const order of options.orders.filter((item) => (item.salesChannel ?? "shopify") === "shopify")) {
    groups.set(order.orderNumber, [...(groups.get(order.orderNumber) ?? []), order]);
  }

  const updatedOrders: Order[] = [];
  const logs: MetaCapiLog[] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let needsReview = 0;

  for (const group of groups.values()) {
    const primary = group.reduce((current, candidate) => candidate.totalAmount > current.totalAmount ? candidate : current);
    const { salePrice, isManualCorrection, paymentMethodSource, trueRevenueSource } = selectedPurchaseValue(primary, group);
    if (!options.force && primary.metaCapiSentAt) {
      skipped += 1;
      continue;
    }
    if (!options.settings.enabled || options.settings.purchaseMode === "disabled") {
      skipped += 1;
      continue;
    }
    if (options.settings.purchaseMode === "manual_only" && !isManualCorrection) {
      skipped += 1;
      continue;
    }
    if (primary.totalAmount <= 0 && salePrice <= 0) {
      needsReview += 1;
      const reviewed = reviewOrder(primary, "Shopify total is RM0 and no real paid amount was found.");
      updatedOrders.push(...group.map((order) => order.id === primary.id ? reviewed : { ...order, metaCapiStatus: "needs_review" as const, metaCapiNeedsReview: true, updatedAt: reviewed.updatedAt }));
      const testEventCode = options.testEventCode ?? options.settings.testEventCode ?? process.env.META_TEST_EVENT_CODE ?? "";
      const log = logBase(primary, "needs_review", 0, reviewed.metaCapiError ?? "", {}, testEventCode);
      await insertMetaCapiLog(log);
      logs.push(log);
      continue;
    }

    const currentEventId = primary.metaCapiEventId || eventId(primary);
    const event = {
      event_name: "Purchase",
      event_time: unixTime(primary.orderDate || primary.importedAt),
      event_id: currentEventId,
      action_source: "website",
      event_source_url: "https://meaningfulplushies.com",
      opt_out: false,
      user_data: metaUserData(primary, options.shopifyOrder, options.request),
      custom_data: metaCustomData(primary, group, options.shopifyOrder, salePrice, paymentMethodSource, trueRevenueSource, isManualCorrection),
    };
    const testEventCode = options.testEventCode ?? options.settings.testEventCode ?? process.env.META_TEST_EVENT_CODE ?? "";
    const payload: Record<string, unknown> = {
      data: [event],
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    };
    const requestSummary = {
      event_name: "Purchase",
      event_id: currentEventId,
      value: salePrice,
      currency: "MYR",
      payment_method_source: paymentMethodSource,
      corrected_zero_value_order: isManualCorrection,
      user_data_keys: Object.keys(event.user_data),
      content_count: (event.custom_data.contents as unknown[]).length,
    };

    try {
      const response = await postWithRetry(payload);
      const now = new Date().toISOString();
      const responseId = textValue(response.fbtrace_id) || textValue(response.events_received);
      updatedOrders.push(...group.map((order) => ({
        ...order,
        metaCapiSentAt: now,
        metaCapiEventId: currentEventId,
        metaCapiValueSent: salePrice,
        metaCapiResponseId: responseId,
        metaCapiStatus: "success" as const,
        metaCapiError: "",
        metaCapiNeedsReview: false,
        updatedAt: now,
      })));
      const log = { ...logBase(primary, "success", salePrice, "", response, testEventCode), responseId, requestSummary };
      await insertMetaCapiLog(log);
      logs.push(log);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Meta rejected the event.";
      const now = new Date().toISOString();
      updatedOrders.push(...group.map((order) => ({
        ...order,
        metaCapiEventId: currentEventId,
        metaCapiValueSent: salePrice,
        metaCapiStatus: "failed" as const,
        metaCapiError: message,
        updatedAt: now,
      })));
      const log = { ...logBase(primary, "failed", salePrice, message, {}, testEventCode), requestSummary };
      await insertMetaCapiLog(log);
      logs.push(log);
      failed += 1;
    }
  }

  if (updatedOrders.length) await upsertSharedOrders(updatedOrders);
  return { orders: updatedOrders, sent, skipped, failed, needsReview, logs };
}

export function fakeMetaPurchaseOrder(manualCorrection = false): Order {
  const now = new Date().toISOString();
  return {
    id: manualCorrection ? "meta-test-whatsapp" : "meta-test-shopify",
    orderNumber: manualCorrection ? "META-WHATSAPP-TEST" : "META-SHOPIFY-TEST",
    salesChannel: "shopify",
    orderDate: now,
    customerName: "Meta Test Customer",
    phone: "+60123456789",
    email: "test@example.com",
    address: "Kuala Lumpur, Malaysia",
    currency: "MYR",
    subtotalAmount: manualCorrection ? 135 : 135,
    shippingAmount: 8,
    totalAmount: manualCorrection ? 0 : 143,
    discountAmount: manualCorrection ? 143 : 0,
    productDiscountAmount: manualCorrection ? 0 : 0,
    shippingDiscountAmount: manualCorrection ? 8 : 0,
    refundedAmount: 0,
    outstandingBalance: 0,
    paymentProcessor: manualCorrection ? "Bank Transfer" : "Stripe",
    discountCodes: manualCorrection ? ["WHATSAPP_PAID"] : [],
    discountCodeUsed: manualCorrection ? "WHATSAPP_PAID" : "",
    shippingMethod: "Standard",
    product: "Build Your Meaningful Plushie",
    character: "BILLY",
    setIndicator: "",
    idWebsiteLink: "",
    voiceLength: 20,
    plushName: "TEST",
    certificateCode: "",
    meaningfulNote: "",
    meaningfulMessage: "",
    remark: "Meta test event",
    voiceUploadStatus: "missing",
    courier: "",
    trackingNumber: "",
    status: "new_order",
    internalNotes: "",
    statusHistory: [],
    importedAt: now,
    updatedAt: now,
  };
}

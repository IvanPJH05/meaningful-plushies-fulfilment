import { createHmac, timingSafeEqual } from "node:crypto";

import type { Order, OrderStatus } from "./types";

let cachedKnownOrderCount = 0;

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(objectValue) : [];
}

function money(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(textValue(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function firstText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = textValue(record[key]);
    if (value) return value;
  }
  return "";
}

function firstMoney(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const amount = money(record[key]);
    if (amount) return amount;
  }
  return 0;
}

function orderNumber(value = "") {
  return value.replace(/[^0-9]/g, "");
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function certificateLink(code: string) {
  return code ? `https://meaningfulplushies.com/pages/certificate/${code.trim()}` : "";
}

function nextTikTokOrderNumber(existing: Order[], orderId: string) {
  const current = existing.find((order) => order.id === `tiktok-${orderId}`);
  const currentTt = current?.orderNumber.match(/\bTT(\d{4,})\b/i)?.[0];
  if (currentTt) return currentTt;
  const highest = existing.reduce((max, order) => {
    const match = order.orderNumber.match(/\bTT(\d{4,})\b/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, Math.max(1026, cachedKnownOrderCount));
  cachedKnownOrderCount = highest + 1;
  return `TT${cachedKnownOrderCount}`;
}

function tikTokCertificateCode(ttNumber: string, orderId: string) {
  const sequence = ttNumber.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const lastFour = orderId.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `${sequence}${lastFour}106`;
}

function tikTokVariation(value: string) {
  const character = value.match(/\b(BILLY|TOOTSIE|HUNNIE|DRAGON WARRIOR)\b/i)?.[1]
    ?? value.split(/[,/-]/).map((part) => part.trim()).find((part) => /billy|tootsie|hunnie|dragon/i.test(part))
    ?? "";
  const voiceLength = Number(value.match(/(5|10|20)\s*(?:seconds?|s)\b/i)?.[1] ?? 0);
  return { character: titleCase(character).replace(/\bDragon Warrior\b/i, "Dragon Warrior"), voiceLength };
}

function localStatusFromTikTok(value: string, current?: OrderStatus): OrderStatus {
  const status = value.toLowerCase();
  if (/cancel|refund|return|fail/.test(status)) return current ?? "issue";
  if (/delivered|completed|shipped|in_transit/.test(status)) return current ?? "shipped";
  if (/awaiting_collection|ready_to_ship|packed/.test(status)) return current ?? "packed";
  return current ?? "new_order";
}

function normalizeTikTokPaymentMethod(value: string) {
  if (/bank|transfer|duitnow/i.test(value)) return "Bank Transfer";
  if (/stripe/i.test(value)) return "Stripe";
  if (/xendit/i.test(value)) return "Xendit";
  return value || "TikTok Shop";
}

function normalizeApiDate(value: string) {
  if (!value) return "";
  if (/^\d+$/.test(value)) {
    const timestamp = Number(value);
    return new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function firstLineItem(order: Record<string, unknown>) {
  const keys = ["line_items", "lineItems", "item_list", "items", "skus", "sku_list", "packages"];
  for (const key of keys) {
    const values = arrayValue(order[key]);
    if (values.length) return values[0];
  }
  return {};
}

function shippingAddressText(order: Record<string, unknown>) {
  const address = objectValue(order.recipient_address ?? order.shipping_address ?? order.address);
  return [
    address.full_address,
    address.detail_address,
    address.address_detail,
    address.address_line1,
    address.address_line2,
    address.city,
    address.district,
    address.state,
    address.postal_code,
    address.country,
  ].map(textValue).filter(Boolean).join(", ");
}

function buyerUsername(order: Record<string, unknown>) {
  const buyer = objectValue(order.buyer_info ?? order.buyer ?? order.user);
  return firstText(order, ["buyer_username", "buyer_user_name", "username", "buyer_name"])
    || firstText(buyer, ["buyer_username", "username", "nickname", "name"])
    || "";
}

function recipientName(order: Record<string, unknown>) {
  const address = objectValue(order.recipient_address ?? order.shipping_address ?? order.address);
  return firstText(address, ["name", "full_name", "recipient_name"])
    || firstText(order, ["recipient", "recipient_name", "receiver_name"])
    || buyerUsername(order);
}

function phoneNumber(order: Record<string, unknown>) {
  const address = objectValue(order.recipient_address ?? order.shipping_address ?? order.address);
  return firstText(address, ["phone", "phone_number", "mobile"])
    || firstText(order, ["phone", "phone_number", "buyer_phone"])
    || "";
}

function shippingInfo(order: Record<string, unknown>) {
  const shipping = objectValue(order.shipping_info ?? order.fulfillment_info ?? order.delivery);
  return {
    method: firstText(order, ["delivery_option_name", "shipping_service_name", "shipping_type"])
      || firstText(shipping, ["delivery_option_name", "shipping_service_name", "shipping_type"]),
    courier: firstText(order, ["shipping_provider_name", "logistics_provider_name", "delivery_provider_name"])
      || firstText(shipping, ["shipping_provider_name", "logistics_provider_name", "delivery_provider_name"]),
    tracking: firstText(order, ["tracking_number", "tracking_id"])
      || firstText(shipping, ["tracking_number", "tracking_id"]),
  };
}

function productInfo(order: Record<string, unknown>) {
  const item = firstLineItem(order);
  const product = firstText(item, ["product_name", "productName", "name", "title"])
    || firstText(order, ["product_name", "productName", "item_name"])
    || "TikTok Shop Order";
  const variation = firstText(item, ["sku_name", "skuName", "variation", "seller_sku"])
    || firstText(order, ["variation", "sku_name", "seller_sku"])
    || product;
  return { product, ...tikTokVariation(`${variation} ${product}`) };
}

function discountAmount(order: Record<string, unknown>) {
  const item = firstLineItem(order);
  return firstMoney(order, ["seller_discount", "platform_discount", "discount_amount", "total_discount"])
    || firstMoney(item, ["seller_discount", "platform_discount", "discount_amount", "total_discount"]);
}

function shippingAmount(order: Record<string, unknown>) {
  return firstMoney(order, ["shipping_fee", "shipping_fee_after_discount", "original_shipping_fee", "delivery_fee"]);
}

function totalAmount(order: Record<string, unknown>) {
  return firstMoney(order, ["payment_amount", "order_amount", "total_amount", "paid_amount"])
    || firstMoney(objectValue(order.payment), ["payment_amount", "order_amount", "total_amount", "paid_amount"]);
}

function subtotalAmount(order: Record<string, unknown>) {
  const item = firstLineItem(order);
  return firstMoney(order, ["subtotal", "sku_subtotal_before_discount", "item_subtotal"])
    || firstMoney(item, ["subtotal", "sku_subtotal_before_discount", "original_price", "sale_price"])
    || totalAmount(order);
}

export function tiktokOrderIdFromValue(value: string) {
  const ttMatch = value.match(/\bTT\d+\s+(\d{8,})\b/i);
  if (ttMatch) return ttMatch[1];
  return value.replace(/\D/g, "");
}

export function extractTikTokOrderIds(payload: unknown): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string" || typeof value === "number") {
      if (/order/i.test(key) || /^\d{8,}$/.test(String(value))) {
        const id = tiktokOrderIdFromValue(String(value));
        if (id.length >= 8) ids.add(id);
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (value && typeof value === "object") {
      for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
        visit(childValue, childKey);
      }
    }
  };
  visit(payload);
  return [...ids];
}

export function tiktokApiOrderToFulfilmentOrder(apiOrder: Record<string, unknown>, existing: Order[], actor = "TikTok Shop") {
  const rawOrderId = firstText(apiOrder, ["order_id", "orderId", "id", "order_number", "orderNumber"]);
  const tikTokOrderId = tiktokOrderIdFromValue(rawOrderId);
  if (!tikTokOrderId) return null;
  const id = `tiktok-${tikTokOrderId}`;
  const current = existing.find((order) => order.id === id);
  const timestamp = new Date().toISOString();
  const assignedNumber = nextTikTokOrderNumber(existing, tikTokOrderId);
  const displayOrderNumber = `${assignedNumber} ${tikTokOrderId}`;
  const code = current?.certificateCode || tikTokCertificateCode(assignedNumber, tikTokOrderId);
  const product = productInfo(apiOrder);
  const shipping = shippingInfo(apiOrder);
  const discount = discountAmount(apiOrder);
  const total = totalAmount(apiOrder);
  const orderStatus = firstText(apiOrder, ["status", "order_status", "fulfillment_status"]);
  const username = buyerUsername(apiOrder);
  const createdAt = normalizeApiDate(firstText(apiOrder, ["create_time", "created_time", "created_at", "paid_time", "paid_at"])) || timestamp;

  return {
    id,
    orderNumber: displayOrderNumber,
    salesChannel: "tiktok" as const,
    orderDate: createdAt,
    customerName: current?.customerName || username || recipientName(apiOrder),
    phone: phoneNumber(apiOrder) || current?.phone || "",
    email: current?.email || "",
    address: shippingAddressText(apiOrder) || current?.address || "",
    currency: firstText(apiOrder, ["currency", "currency_code"]) || current?.currency || "MYR",
    subtotalAmount: subtotalAmount(apiOrder) || current?.subtotalAmount || 0,
    shippingAmount: shippingAmount(apiOrder) || current?.shippingAmount || 0,
    totalAmount: total || current?.totalAmount || 0,
    discountAmount: discount,
    productDiscountAmount: discount,
    shippingDiscountAmount: current?.shippingDiscountAmount || 0,
    refundedAmount: firstMoney(apiOrder, ["refund_amount", "refunded_amount"]) || current?.refundedAmount || 0,
    outstandingBalance: current?.outstandingBalance ?? 0,
    paymentProcessor: normalizeTikTokPaymentMethod(firstText(apiOrder, ["payment_method", "paymentMethod"]) || current?.paymentProcessor || "TikTok Shop"),
    discountCodes: current?.discountCodes ?? [],
    discountCodeUsed: current?.discountCodeUsed ?? "",
    shippingMethod: shipping.method || current?.shippingMethod || "",
    product: product.product || current?.product || "TikTok Shop Order",
    character: product.character || current?.character || "",
    setIndicator: current?.setIndicator || "",
    idWebsiteLink: certificateLink(code),
    voiceLength: product.voiceLength || current?.voiceLength || 0,
    plushName: current?.plushName || "",
    certificateCode: code,
    meaningfulNote: current?.meaningfulNote || "",
    meaningfulMessage: current?.meaningfulMessage || "",
    remark: username ? `TikTok Shop username: ${username}` : current?.remark || "TikTok Shop order synced. Add plushie details manually.",
    voiceUploadStatus: current?.voiceUploadStatus ?? "missing",
    courier: shipping.courier || current?.courier || "",
    trackingNumber: shipping.tracking || current?.trackingNumber || "",
    status: localStatusFromTikTok(orderStatus, current?.status),
    internalNotes: current?.internalNotes || "",
    photoDataUrl: current?.photoDataUrl,
    photoName: current?.photoName,
    tikTokFileDataUrl: current?.tikTokFileDataUrl,
    tikTokFileName: current?.tikTokFileName,
    tikTokFileType: current?.tikTokFileType,
    statusHistory: current?.statusHistory ?? [
      { id: `${id}-${timestamp}`, status: "new_order" as const, changedAt: timestamp, changedBy: actor, note: "Synced from TikTok Shop. Plushie details need manual input." },
    ],
    importedAt: current?.importedAt ?? timestamp,
    updatedAt: timestamp,
  } satisfies Order;
}

function tiktokBaseUrl() {
  return (process.env.TIKTOK_SHOP_BASE_URL || "https://open-api.tiktokglobalshop.com").replace(/\/$/, "");
}

function tiktokOrderDetailPath() {
  return process.env.TIKTOK_SHOP_ORDER_DETAIL_PATH || "/api/orders/detail/query";
}

function tiktokAccessToken() {
  return process.env.TIKTOK_SHOP_ACCESS_TOKEN || "";
}

function tiktokCredentials() {
  return {
    appKey: process.env.TIKTOK_SHOP_APP_KEY || "",
    appSecret: process.env.TIKTOK_SHOP_APP_SECRET || "",
    accessToken: tiktokAccessToken(),
    shopId: process.env.TIKTOK_SHOP_ID || "",
  };
}

function signTikTokRequest(path: string, params: Record<string, string>, body: string, appSecret: string) {
  const sorted = Object.keys(params)
    .filter((key) => key !== "sign" && key !== "access_token")
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");
  const payload = `${path}${sorted}${body}`;
  return createHmac("sha256", appSecret).update(payload).digest("hex");
}

async function tiktokPost<T>(path: string, body: Record<string, unknown>) {
  const { appKey, appSecret, accessToken, shopId } = tiktokCredentials();
  if (!appKey || !appSecret || !accessToken) {
    throw new Error("TikTok Shop API is not configured. Add TIKTOK_SHOP_APP_KEY, TIKTOK_SHOP_APP_SECRET, and TIKTOK_SHOP_ACCESS_TOKEN in Vercel.");
  }
  const bodyText = JSON.stringify(body);
  const params: Record<string, string> = {
    app_key: appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
    access_token: accessToken,
  };
  if (shopId) params.shop_id = shopId;
  params.sign = signTikTokRequest(path, params, bodyText, appSecret);
  const query = new URLSearchParams(params);
  const response = await fetch(`${tiktokBaseUrl()}${path}?${query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bodyText,
  });
  const result = await response.json().catch(() => ({})) as T & { message?: string; error?: string; code?: number };
  if (!response.ok || Number(result.code ?? 0) !== 0) {
    throw new Error(textValue(result.message) || textValue(result.error) || "TikTok Shop API request failed.");
  }
  return result;
}

function collectOrderObjects(value: unknown, found: Record<string, unknown>[] = []) {
  if (Array.isArray(value)) {
    const objectRows = value.map(objectValue).filter((row) => firstText(row, ["order_id", "orderId", "id"]));
    if (objectRows.length) found.push(...objectRows);
    value.forEach((item) => collectOrderObjects(item, found));
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (firstText(record, ["order_id", "orderId", "id"]) && (record.line_items || record.item_list || record.status || record.order_status)) {
      found.push(record);
    }
    Object.values(record).forEach((child) => collectOrderObjects(child, found));
  }
  return found;
}

export async function fetchTikTokOrderDetails(orderIds: string[]) {
  const uniqueOrderIds = [...new Set(orderIds.map(tiktokOrderIdFromValue).filter(Boolean))];
  if (!uniqueOrderIds.length) return [];
  const result = await tiktokPost<Record<string, unknown>>(tiktokOrderDetailPath(), {
    order_id_list: uniqueOrderIds,
    order_ids: uniqueOrderIds,
  });
  const orders = collectOrderObjects(result);
  const byId = new Map<string, Record<string, unknown>>();
  for (const order of orders) {
    const id = tiktokOrderIdFromValue(firstText(order, ["order_id", "orderId", "id"]));
    if (id) byId.set(id, order);
  }
  return uniqueOrderIds.map((id) => byId.get(id)).filter(Boolean) as Record<string, unknown>[];
}

export function verifyTikTokWebhook(rawBody: string, request: Request) {
  const secret = process.env.TIKTOK_WEBHOOK_SECRET;
  if (!secret) return true;
  const received = [
    request.headers.get("x-tts-signature"),
    request.headers.get("x-tiktok-signature"),
    request.headers.get("x-tiktok-shop-signature"),
    request.headers.get("x-hub-signature-256")?.replace(/^sha256=/, ""),
  ].filter(Boolean)[0];
  if (!received) return false;
  const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const base64 = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  return [hex, base64].some((expected) => {
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

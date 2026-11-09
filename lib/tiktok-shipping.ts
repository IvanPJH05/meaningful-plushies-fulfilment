import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { mobileServiceClient } from "./mobile-api";
import { tikTokAccess } from "./tiktok-connection";
import { TikTokApiError, tikTokRequest } from "./tiktok-client";
import { fetchTikTokOrderDetails } from "./tiktok-orders";
import { hasShippingScope, trustedTikTokDocumentUrl, validateHandover, validateShippingPackage, type Handover, type HandoverOptions, type ShippingPackage } from "./tiktok-shipping-policy";
import { ensureDefaultBusiness } from "@/src/modules/businesses/default-business";
import { createOrReuseMediaAssetFromBytes, mediaAssetPublicUrls } from "@/src/modules/whatsapp/media-assets";

export type ShippingReview = { orderId: string; orderNumber: string; packageId?: string; packageStatus?: string; courier?: string; trackingNumber?: string; labelUrl?: string; options?: HandoverOptions; error?: string };
const MAX_LABEL_BYTES = 20 * 1024 * 1024;

async function shippingAccess() {
  const connection = await tikTokAccess();
  if (!hasShippingScope(connection.granted_scopes)) throw Error("Enable Fulfillment Basic in TikTok Partner Center, then use the Reconnect TikTok Shop link to authorise shipping access.");
  return connection;
}

export async function inspectTikTokShipping(orderId: string) {
  const connection = await shippingAccess();
  const db = mobileServiceClient();
  const saved = await db.from("fulfilment_orders").select("id,order_number,data").eq("id", orderId).single();
  if (saved.error || saved.data?.data?.salesChannel !== "tiktok") throw Error("This saved TikTok order could not be found.");
  const orderNumber = String(saved.data.data.orderNumber || saved.data.order_number);
  const rawId = orderNumber.match(/\b(\d{8,25})\b/)?.[1] || orderId.replace(/^tiktok-/, "");
  const [order] = await fetchTikTokOrderDetails([rawId]);
  if (!order || String(order.id || order.order_id) !== rawId) throw Error("TikTok did not confirm this order.");
  if (["UNPAID", "ON_HOLD", "CANCELLED"].includes(String(order.status || order.order_status)) || order.is_on_hold_order === true) throw Error("This TikTok order is unpaid, on hold, or cancelled. Shipment is unavailable.");
  const packages = order.packages as { id?: string; package_id?: string }[] | undefined;
  if (!Array.isArray(packages) || packages.length !== 1) throw Error("This order has no single shipping package. Review split or combined orders in TikTok Seller Center.");
  const packageId = String(packages[0].id || packages[0].package_id || "");
  if (!/^\d{8,25}$/.test(packageId)) throw Error("TikTok did not return a valid shipping package.");
  const query = { shop_cipher: connection.shop_cipher };
  const pkg = await tikTokRequest<ShippingPackage>(`/fulfillment/202309/packages/${packageId}`, connection.token, query);
  if (pkg.package_id !== packageId || pkg.orders?.length !== 1 || String(pkg.orders[0].id) !== rawId) throw Error("TikTok package ownership does not match this order. Review it in Seller Center.");
  if (pkg.package_status === "TO_FULFILL" && !["AWAITING_SHIPMENT", "PARTIALLY_SHIPPING"].includes(String(order.status || order.order_status))) throw Error("The order and package shipment states disagree. Refresh later or review this order in TikTok Seller Center.");
  const cached = await db.from("tiktok_shipping_packages").select("label_url,tracking_number,booking_state").eq("shop_id", connection.shop_id).eq("package_id", packageId).maybeSingle();
  if (cached.error) throw Error("Shipping history could not be loaded. Please retry.");
  const review: ShippingReview = { orderId, orderNumber, packageId, packageStatus: pkg.package_status, courier: pkg.shipping_provider_name || "", trackingNumber: cached.data?.tracking_number || pkg.tracking_number || "", labelUrl: cached.data?.label_url || "" };
  try { validateShippingPackage(pkg, rawId); } catch (error) { review.error = (error as Error).message; }
  if (!review.error && pkg.package_status === "TO_FULFILL") {
    // The OAuth callback only accepts MY shops. Since 2024-10-30, SEA local
    // sellers' collection method is controlled by warehouse settings, not the
    // Ship Package handover parameter. Do not request the unrelated package-
    // split scope just to call the handover-time-slots endpoint.
    review.options = { uses_shop_settings: true };
    // An earlier request may have reached the carrier even if our connection
    // failed. Never automatically submit a second booking in that case.
    if (cached.data && ["attempting", "uncertain", "arranged"].includes(cached.data.booking_state)) review.error = "An earlier booking is awaiting confirmation. Refresh later or check this order in TikTok Seller Center before retrying.";
  }
  return { review, connection, pkg, cached: cached.data };
}

async function downloadLabel(documentUrl: string): Promise<Buffer> {
  let url = trustedTikTokDocumentUrl(documentUrl);
  for (let hop = 0; hop < 4; hop++) {
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(25000), cache: "no-store" });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw Error("TikTok label redirect is missing its destination.");
      url = trustedTikTokDocumentUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw Error("The TikTok label could not be downloaded. Retrieve the label again.");
    if (Number(response.headers.get("content-length")) > MAX_LABEL_BYTES) { await response.body.cancel(); throw Error("TikTok label is too large."); }
    const chunks: Uint8Array[] = []; let length = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > MAX_LABEL_BYTES) { await reader.cancel(); throw Error("TikTok label is too large."); }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw Error("TikTok did not return a PDF shipping label.");
    const pdf = await PDFDocument.load(bytes);
    if (!pdf.getPageCount()) throw Error("TikTok returned an empty shipping label.");
    return bytes;
  }
  throw Error("Too many TikTok label redirects.");
}

export async function performTikTokShipping(orderId: string, expectedPackageId: string, action: "arrange" | "label", handover?: Handover) {
  const db = mobileServiceClient(), owner = randomUUID();
  // Share the existing integration lease with order sync. This serializes
  // bookings across server instances and protects order edits from stale sync.
  const lock = await db.from("tiktok_sync_lock").update({ owner, lease_until: new Date(Date.now() + 330000).toISOString() }).eq("id", true).lt("lease_until", new Date().toISOString()).select("id");
  if (lock.error || !lock.data?.length) throw Error("TikTok is processing another request. Please retry shortly.");
  try {
    const { review, connection, pkg, cached } = await inspectTikTokShipping(orderId);
    if (review.packageId !== expectedPackageId) throw Error("This package changed. Refresh shipment details before continuing.");
    if (review.error) throw Error(review.error);
    const query = { shop_cipher: connection.shop_cipher };
    const packageId = review.packageId!;
    const key = { shop_id: connection.shop_id, package_id: packageId, order_id: orderId };
    async function state(booking_state: string) {
      const result = await db.from("tiktok_shipping_packages").upsert({ ...key, booking_state, updated_at: new Date().toISOString() }, { onConflict: "shop_id,package_id" });
      if (result.error) throw Error("Shipping progress could not be saved. Check TikTok Seller Center before retrying.");
    }
    if (pkg.package_status === "TO_FULFILL") {
      if (action !== "arrange") throw Error("Arrange shipment before retrieving the shipping label.");
      const body = validateHandover(handover!, review.options || {});
      await state("attempting");
      try { await tikTokRequest(`/fulfillment/202309/packages/${packageId}/ship`, connection.token, query, body); }
      catch (error) {
        // A platform timeout can also arrive as an API error. Only an explicit
        // parameter rejection is safe to treat as a definite failed booking.
        const rejected = error instanceof TikTokApiError && [11001002, 11050001, 21001001].includes(Number(error.code));
        await state(rejected ? "failed" : "uncertain");
        if (!(error instanceof TikTokApiError)) throw Error("TikTok did not confirm the booking. Refresh later or check Seller Center; do not arrange it again yet.");
        throw error;
      }
      await state("arranged");
    } else if (!cached) await state("arranged");
    // Booking can succeed before the label is ready. Retrieval is a separate,
    // repeatable operation and never submits another /ship request.
    let document: { doc_url: string; tracking_number?: string };
    try { document = await tikTokRequest(`/fulfillment/202309/packages/${packageId}/shipping_documents`, connection.token, { ...query, document_type: "SHIPPING_LABEL", document_size: "A6", document_format: "PDF" }); }
    catch (error) { throw Error(`Shipment is arranged, but the label is not ready. Use Retrieve labels to try again. ${error instanceof TikTokApiError ? `TikTok code ${error.code}.` : ""}`); }
    const bytes = await downloadLabel(document.doc_url);
    const business = await ensureDefaultBusiness();
    const asset = await createOrReuseMediaAssetFromBytes({ businessId: business.id, bytes, contentType: "application/pdf" });
    if (!asset) throw Error("Shipment is arranged, but label storage is unavailable. Retrieve the label again.");
    const url = mediaAssetPublicUrls(asset.contentHash).originalUrl;
    const tracking = document.tracking_number || pkg.tracking_number || "";
    const saved = await db.rpc("save_tiktok_shipping_label", { p_shop: connection.shop_id, p_package: packageId, p_order: orderId, p_url: url, p_tracking: tracking, p_courier: pkg.shipping_provider_name || "" });
    if (saved.error) throw Error("The label is ready but could not be linked to the order. Retrieve it again.");
    return { ...review, packageStatus: "PROCESSING", labelUrl: url, trackingNumber: tracking, error: undefined };
  } finally { await db.from("tiktok_sync_lock").update({ owner: null, lease_until: new Date(0).toISOString() }).eq("id", true).eq("owner", owner); }
}

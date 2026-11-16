import { isShopifyShirtLine, shopifyOrderToFulfilmentOrders, shopifyShirtPhoto } from "../../../../lib/importer";
import { mobileServiceClient, requireMobileSession } from "../../../../lib/mobile-api";
import { cleanShopifyOrderNumber, fetchShopifyOrderByNumber, objectValue, textValue } from "../../../../lib/shopify-orders";
import type { Order } from "../../../../lib/types";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
  } catch (error) {
    return Response.json({ error: "Sign in with a fulfilment account." }, {
      status: error instanceof Error && error.message === "WAREHOUSE_ACCESS_REQUIRED" ? 403 : 401,
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get("orderId");
    const lineId = searchParams.get("lineId");
    const db = mobileServiceClient();
    const { data, error } = await db.from("fulfilment_orders").select("data").eq("id", orderId).maybeSingle();
    if (error) throw error;
    const order = data?.data as Order | undefined;
    if (!order?.customShirts?.some(shirt => shirt.lineItemId === lineId && shirt.hasPhoto)) {
      return Response.json({ error: "Shirt photo not found." }, { status: 404 });
    }
    const source = await fetchShopifyOrderByNumber(order.orderNumber);
    const paired = source && cleanShopifyOrderNumber(textValue(source.name)) === order.orderNumber
      && shopifyOrderToFulfilmentOrders(source).find(row => row.shopifyLineItemId === order.shopifyLineItemId);
    const lines = source?.lineItems ?? source?.line_items;
    const shirt = paired && paired.customShirts?.some(item => item.lineItemId === lineId)
      && Array.isArray(lines) && lines.find(item => isShopifyShirtLine(item) && String(objectValue(item).id) === lineId);
    const url = shirt && shopifyShirtPhoto(shirt);
    if (!url) return Response.json({ error: "Shirt photo not found." }, { status: 404 });

    const photo = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(20000) });
    const type = photo.headers.get("Content-Type")?.split(";")[0].toLowerCase() ?? "";
    const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[type];
    if (!photo.ok || !photo.body || !extension) throw new Error("Photo unavailable");
    return new Response(photo.body, { headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="shirt-photo.${extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return Response.json({ error: "The shirt photo could not be downloaded. Try again." }, { status: 502 });
  }
}

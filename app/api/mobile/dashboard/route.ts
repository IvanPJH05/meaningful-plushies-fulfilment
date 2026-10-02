import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../lib/mobile-api";

type MobileRow = Record<string, unknown>;
function text(row: MobileRow, key: string) { return typeof row[key] === "string" ? row[key] : ""; }
function number(row: MobileRow, key: string) { const value = Number(row[key]); return Number.isFinite(value) ? value : 0; }

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const url = new URL(request.url);
    const checkOnly = url.searchParams.get("check") === "1";
    const includeTotal = url.searchParams.get("includeTotal") !== "0";
    const status = url.searchParams.get("status") || "all";
    const source = url.searchParams.get("source") || "all";
    const fromDate = url.searchParams.get("from") || "";
    const toDate = url.searchParams.get("to") || "";
    const page = Math.max(0, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "100", 10) || 100));
    const from = page * pageSize;
    if (checkOnly) {
      const { data: latest, error: latestError } = await mobileServiceClient().from("fulfilment_orders").select("updated_at").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (latestError) throw latestError;
      return NextResponse.json(
        { latestUpdatedAt: latest?.updated_at || null, checkedAt: new Date().toISOString() },
        { headers: { "cache-control": "no-store, max-age=0" } },
      );
    }
    // The full `data` JSON can include uploaded media. Only extract the small
    // order fields needed by the phone, so the query is fast and reliable.
    let query = mobileServiceClient()
      .from("fulfilment_orders")
      .select("id,status,order_number,updated_at,orderNumber:data->>orderNumber,orderDate:data->>orderDate,customerName:data->>customerName,phone:data->>phone,address:data->>address,plushName:data->>plushName,character:data->>character,product:data->>product,voiceLength:data->>voiceLength,voiceUploadStatus:data->>voiceUploadStatus,salesChannel:data->>salesChannel,paymentProcessor:data->>paymentProcessor,totalAmount:data->>totalAmount,courier:data->>courier,trackingNumber:data->>trackingNumber,meaningfulMessage:data->>meaningfulMessage,photoName:data->>photoName,tikTokFileName:data->>tikTokFileName,shippingLabelFileName:data->>shippingLabelFileName", includeTotal ? { count: "exact" } : undefined)
      .order("updated_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    if (fromDate) query = query.gte("order_date", `${fromDate}T00:00:00.000Z`);
    if (toDate) query = query.lte("order_date", `${toDate}T23:59:59.999Z`);
    if (source === "tiktok") query = query.eq("data->>salesChannel", "tiktok");
    if (source === "shopify") query = query.or("data->>salesChannel.eq.shopify,data->>salesChannel.is.null");
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as MobileRow[];
    const orders = rows.map((row) => ({
      id: text(row, "id"), orderNumber: text(row, "orderNumber") || text(row, "order_number"), orderDate: text(row, "orderDate"),
      customerName: text(row, "customerName"), phone: text(row, "phone"), address: text(row, "address"), plushName: text(row, "plushName"),
      character: text(row, "character"), product: text(row, "product"), voiceLength: number(row, "voiceLength"), voiceUploadStatus: text(row, "voiceUploadStatus"),
      status: text(row, "status"), salesChannel: text(row, "salesChannel") || undefined, paymentProcessor: text(row, "paymentProcessor"), totalAmount: number(row, "totalAmount"),
      courier: text(row, "courier"), trackingNumber: text(row, "trackingNumber"), updatedAt: text(row, "updated_at"),
      offlineMedia: { voice: Boolean(text(row, "meaningfulMessage")), photo: Boolean(text(row, "photoName")), attachment: Boolean(text(row, "tikTokFileName")), shippingLabel: Boolean(text(row, "shippingLabelFileName")) },
    }));
    const counts = rows.reduce<Record<string, number>>((all, row) => {
      const status = text(row, "status");
      return status ? { ...all, [status]: (all[status] || 0) + 1 } : all;
    }, {});
    const totalCount = includeTotal ? Math.max(0, Number(count) || 0) : null;
    return NextResponse.json({ counts, orders, page, pageSize, totalCount, hasMore: includeTotal ? from + orders.length < (totalCount ?? 0) : orders.length === pageSize, latestUpdatedAt: rows[0]?.updated_at || null, refreshedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DASHBOARD_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

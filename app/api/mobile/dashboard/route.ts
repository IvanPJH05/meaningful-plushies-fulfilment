import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../lib/mobile-api";

type MobileRow = Record<string, unknown>;
function text(row: MobileRow, key: string) { return typeof row[key] === "string" ? row[key] : ""; }
function number(row: MobileRow, key: string) { const value = Number(row[key]); return Number.isFinite(value) ? value : 0; }

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    // The full `data` JSON can include uploaded media. Only extract the small
    // order fields needed by the phone, so the query is fast and reliable.
    const { data, error } = await mobileServiceClient()
      .from("fulfilment_orders")
      .select("id,status,order_number,updated_at,orderNumber:data->>orderNumber,orderDate:data->>orderDate,customerName:data->>customerName,phone:data->>phone,address:data->>address,plushName:data->>plushName,character:data->>character,product:data->>product,voiceLength:data->>voiceLength,voiceUploadStatus:data->>voiceUploadStatus,salesChannel:data->>salesChannel,paymentProcessor:data->>paymentProcessor,totalAmount:data->>totalAmount,courier:data->>courier,trackingNumber:data->>trackingNumber")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as MobileRow[];
    const orders = rows.map((row) => ({
      id: text(row, "id"), orderNumber: text(row, "orderNumber") || text(row, "order_number"), orderDate: text(row, "orderDate"),
      customerName: text(row, "customerName"), phone: text(row, "phone"), address: text(row, "address"), plushName: text(row, "plushName"),
      character: text(row, "character"), product: text(row, "product"), voiceLength: number(row, "voiceLength"), voiceUploadStatus: text(row, "voiceUploadStatus"),
      status: text(row, "status"), salesChannel: text(row, "salesChannel") || undefined, paymentProcessor: text(row, "paymentProcessor"), totalAmount: number(row, "totalAmount"),
      courier: text(row, "courier"), trackingNumber: text(row, "trackingNumber"), updatedAt: text(row, "updated_at"),
    }));
    const counts = rows.reduce<Record<string, number>>((all, row) => {
      const status = text(row, "status");
      return status ? { ...all, [status]: (all[status] || 0) + 1 } : all;
    }, {});
    return NextResponse.json({ counts, orders, refreshedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DASHBOARD_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

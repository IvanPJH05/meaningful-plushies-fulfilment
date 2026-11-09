import { NextResponse } from "next/server";
import { mobileServiceClient } from "@/lib/mobile-api";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const number = typeof body?.number === "string" ? body.number : "";
  const tiktok = body?.channel === "tiktok";
  if ((!tiktok && body?.channel !== "website") || !(tiktok ? /^\d{8,30}$/ : /^\d{1,10}$/).test(number)) {
    return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  }

  const db = mobileServiceClient();
  const query = db.from("fulfilment_orders").select("id,status").limit(50);
  const { data: orders, error } = tiktok
    ? await query.eq("data->>salesChannel", "tiktok").like("order_number", "% " + number)
    : await query.neq("data->>salesChannel", "tiktok").in("order_number", [number, "#" + number]);
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });
  if (!orders?.length) return NextResponse.json({ error: "missing" }, { status: 404, headers });

  const { data: items, error: itemsError } = await db.from("production_items").select("order_id,stage")
    .in("order_id", orders.map(order => order.id)).eq("disposition", "active");
  if (itemsError) return NextResponse.json({ error: "unavailable" }, { status: 503, headers });

  // An order number is a lookup reference, so return only a coarse milestone.
  // For split orders show the earliest item that still needs to progress.
  const stages = orders.map(order => {
    const stage = items?.find(item => item.order_id === order.id)?.stage;
    if (order.status === "issue") return "review";
    if (order.status === "shipped" || stage === "collected" || stage === "delivered") return "shipped";
    if (order.status === "packed" || stage === "packed") return "packed";
    if (stage === "audio_passed") return "qc";
    if (order.status === "sent_for_sewing") return "sewing";
    return "preparing";
  });
  const stage = (["review", "preparing", "sewing", "qc", "packed", "shipped"] as const).find(value => stages.includes(value));
  return NextResponse.json({ stage }, { headers });
}

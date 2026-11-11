import { NextResponse } from "next/server";
import { mobileOrder, mobileServiceClient, requireMobileSession } from "../../../../../lib/mobile-api";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const value = new URL(request.url).searchParams.get("code")?.trim() ?? "";
    if (!value || value.length > 200) return NextResponse.json({ error: "Enter a search of 1–200 characters." }, { status: 400 });
    const client = mobileServiceClient();
    // Quote PostgREST values and escape LIKE wildcards: search text is literal.
    const pattern = JSON.stringify(`%${value.replace(/[\\%_*]/g, "\\$&")}%`);
    const fields = ["order_number", "data->>customisationSessionId", "data->>orderNumber", "data->>customerName", "data->>phone", "data->>email", "data->>address", "data->>trackingNumber", "data->>plushName", "data->>product", "data->>character", "data->>shippingMethod", "data->>discountCodeUsed", "data->>discountCodes"];
    const filters = fields.map((field) => `${field}.ilike.${pattern}`);
    const barcode = value.replace(/[^a-z0-9]/gi, "").toUpperCase().replace(/^MP/, "");
    if (barcode) filters.push(`order_number.eq.${JSON.stringify(barcode)}`);
    const { data, error } = await client.from("fulfilment_orders").select("data").or(filters.join(",")).order("updated_at", { ascending: false }).limit(100);
    if (error) throw error;
    const orders = (data || []).map((row) => mobileOrder(row.data));
    return NextResponse.json({ orders, order: orders.length === 1 ? orders[0] : null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOOKUP_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

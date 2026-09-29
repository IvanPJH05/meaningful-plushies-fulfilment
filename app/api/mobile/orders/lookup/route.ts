import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mobileOrder, requireMobileSession } from "../../../../../lib/mobile-api";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const value = new URL(request.url).searchParams.get("code")?.trim().replace(/[^a-z0-9]/gi, "").toUpperCase() ?? "";
    if (!value) return NextResponse.json({ error: "A barcode is required." }, { status: 400 });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const client = createClient(url, key, { auth: { persistSession: false } });
    const number = value.replace(/^MP/, "");
    const { data, error } = await client.from("fulfilment_orders").select("data").or(`order_number.eq.${number},order_number.eq.${value}`).limit(1).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ order: data?.data ? mobileOrder(data.data) : null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LOOKUP_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}

export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireMobileSession } from "../../../../lib/mobile-api";

export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await client.from("fulfilment_orders").select("data,status,order_number,updated_at").order("updated_at", { ascending: false }).limit(80);
    if (error) throw error;
    const orders = (data ?? []).map((row) => row.data);
    const counts = (data ?? []).reduce<Record<string, number>>((all, row) => ({ ...all, [row.status]: (all[row.status] || 0) + 1 }), {});
    return NextResponse.json({ counts, orders });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DASHBOARD_FAILED" }, { status: 500 }); }
}
export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

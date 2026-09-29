import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fetchCreatorFreeSamples, fetchCreatorProfiles, fetchManualOrders, fetchPaymentProcessorSettings, fetchSalesFeeSettings } from "../../../../lib/supabase";
import { summarizeSales } from "../../../../lib/sales";
import { mobileOrder, requireMobileSession } from "../../../../lib/mobile-api";
import type { Order } from "../../../../lib/types";

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    // Staff must see the complete fulfilment queue, not only the latest 80.
    const { data, error } = await client.from("fulfilment_orders").select("data,status,order_number,updated_at").order("updated_at", { ascending: false });
    if (error) throw error;
    const fullOrders = (data ?? []).map((row) => row.data as Order);
    const orders = fullOrders.map(mobileOrder);
    const counts = (data ?? []).reduce<Record<string, number>>((all, row) => ({ ...all, [row.status]: (all[row.status] || 0) + 1 }), {});
    const [processorSettings, feeSettings, manualOrders, creatorProfiles, creatorSamples] = await Promise.all([
      fetchPaymentProcessorSettings(), fetchSalesFeeSettings(), fetchManualOrders(),
      session.role === "admin" ? fetchCreatorProfiles(session.token) : Promise.resolve(undefined),
      session.role === "admin" ? fetchCreatorFreeSamples(session.token) : Promise.resolve([]),
    ]);
    const report = summarizeSales(fullOrders, processorSettings, feeSettings.shopifyPercentage, manualOrders, creatorProfiles, creatorSamples.map((sample) => sample.sampleCode));
    return NextResponse.json({ counts, orders, report, refreshedAt: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DASHBOARD_FAILED" }, { status: 500 }); }
}
export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

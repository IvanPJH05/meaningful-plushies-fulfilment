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

    // Reporting is useful, but it must never prevent warehouse staff from
    // receiving the order queue. These optional existing-system lookups can
    // be unavailable while a schema upgrade is in progress.
    const reportingSources = await Promise.allSettled([
      fetchPaymentProcessorSettings(), fetchSalesFeeSettings(), fetchManualOrders(),
      session.role === "admin" ? fetchCreatorProfiles(session.token) : Promise.resolve(undefined),
      session.role === "admin" ? fetchCreatorFreeSamples(session.token) : Promise.resolve([]),
    ]);
    const value = <T,>(index: number, fallback: T): T => reportingSources[index]?.status === "fulfilled"
      ? reportingSources[index].value as T
      : fallback;
    const processorSettings = value(0, []);
    const feeSettings = value(1, { shopifyPercentage: 0 });
    const manualOrders = value(2, []);
    const creatorProfiles = value(3, undefined);
    const creatorSamples = value<{ sampleCode: string }[]>(4, []);
    const report = summarizeSales(fullOrders, processorSettings, feeSettings.shopifyPercentage, manualOrders, creatorProfiles, creatorSamples.map((sample) => sample.sampleCode));
    const reportAvailable = reportingSources.every((result) => result.status === "fulfilled");
    return NextResponse.json({ counts, orders, report, reportAvailable, refreshedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DASHBOARD_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("REQUIRED") ? 401 : 500 });
  }
}
export function OPTIONS() { return new NextResponse(null, { status: 204 }); }

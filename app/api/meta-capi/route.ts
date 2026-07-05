import { NextResponse } from "next/server";

import { fakeMetaPurchaseOrder, metaCapiEnvironmentStatus, sendMetaPurchaseEvents } from "../../../lib/meta-capi";
import { fetchMetaCapiLogs, fetchMetaCapiSettings, fetchSharedOrders, saveMetaCapiSettings } from "../../../lib/supabase";
import type { MetaCapiSettings } from "../../../lib/types";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const [settings, logs] = await Promise.all([fetchMetaCapiSettings(), fetchMetaCapiLogs()]);
    return json(200, {
      ok: true,
      settings,
      logs,
      environment: metaCapiEnvironmentStatus(settings),
    });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Meta CAPI could not be loaded." });
  }
}

export async function POST(request: Request) {
  let body: {
    action?: "save_settings" | "test_purchase" | "test_whatsapp_purchase" | "retry_orders";
    settings?: MetaCapiSettings;
    orderNumbers?: string[];
  };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json(400, { ok: false, error: "Invalid Meta CAPI request." });
  }

  try {
    if (body.action === "save_settings") {
      if (!body.settings) return json(400, { ok: false, error: "Settings are required." });
      await saveMetaCapiSettings(body.settings);
      const settings = await fetchMetaCapiSettings();
      return json(200, { ok: true, settings });
    }

    const settings = await fetchMetaCapiSettings();

    if (body.action === "test_purchase" || body.action === "test_whatsapp_purchase") {
      const manual = body.action === "test_whatsapp_purchase";
      const result = await sendMetaPurchaseEvents({
        orders: [fakeMetaPurchaseOrder(manual)],
        settings: { ...settings, enabled: true, purchaseMode: manual ? "manual_only" : "all" },
        force: true,
        testEventCode: settings.testEventCode,
        source: "manual_test",
        request,
      });
      return json(200, { ok: true, result });
    }

    if (body.action === "retry_orders") {
      const requested = new Set((body.orderNumbers ?? []).map((item) => String(item).replace(/\D/g, "")).filter(Boolean));
      if (!requested.size) return json(400, { ok: false, error: "Choose at least one Shopify order number to retry." });
      const orders = (await fetchSharedOrders()).filter((order) => requested.has(order.orderNumber) && (order.salesChannel ?? "shopify") === "shopify");
      const result = await sendMetaPurchaseEvents({ orders, settings, force: true, source: "manual_test", request });
      return json(200, { ok: true, result });
    }

    return json(400, { ok: false, error: "Unknown Meta CAPI action." });
  } catch (error) {
    return json(500, { ok: false, error: error instanceof Error ? error.message : "Meta CAPI request failed." });
  }
}

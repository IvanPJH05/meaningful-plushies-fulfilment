import { NextRequest, NextResponse } from "next/server";

import { approveManualOrderCod, attachManualOrderReceipt, createPaidShopifyOrder, deleteManualOrderIntake, getManualOrderIntakeDetails, isDashboardAdmin, listManualOrderIntakes, repairManualOrderShipping, type PaymentReceipt } from "@/lib/manual-order-intakes";

export const runtime = "nodejs";

async function requireAdmin(request: NextRequest) {
  return isDashboardAdmin(request.headers.get("x-dashboard-session") || "");
}

export async function GET(request: NextRequest) {
  if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  try { return NextResponse.json({ ok: true, intakes: await listManualOrderIntakes() }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Manual order submissions could not be loaded." }, { status: 500 }); }
}

export async function POST(request: NextRequest) {
  if (!await requireAdmin(request)) return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  try {
    const body = await request.json() as { action?: string; id?: string; paymentReceipts?: PaymentReceipt[] };
    if (body.action === "details") return NextResponse.json({ ok: true, details: await getManualOrderIntakeDetails(String(body.id || "")) });
    if (body.action === "attach_receipt") return NextResponse.json({ ok: true, intake: await attachManualOrderReceipt(String(body.id || ""), Array.isArray(body.paymentReceipts) ? body.paymentReceipts : []) });
    if (body.action === "approve_cod") return NextResponse.json({ ok: true, intake: await approveManualOrderCod(String(body.id || "")) });
    if (body.action === "create_shopify_order") return NextResponse.json({ ok: true, order: await createPaidShopifyOrder(String(body.id || "")) });
    if (body.action === "repair_shipping") return NextResponse.json({ ok: true, order: await repairManualOrderShipping(String(body.id || "")) });
    if (body.action === "delete") { await deleteManualOrderIntake(String(body.id || "")); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ ok: false, error: "That Manual Order action is not supported." }, { status: 400 });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The Manual Order action could not be completed." }, { status: 400 }); }
}

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { createManualOrderDiscounts } from "@/lib/manual-orders";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

const db = () => { if (!supabase) throw new Error("Supabase is not configured."); return supabase; };
const error = (value: unknown) => value instanceof Error ? value.message : "Pre-order could not be saved.";

export async function GET() {
  try {
    const { data, error: queryError } = await db().from("preorders").select("*").order("created_at", { ascending: false });
    if (queryError) throw queryError;
    return NextResponse.json({ ok: true, preorders: data || [] });
  } catch (cause) { return NextResponse.json({ ok: false, error: error(cause) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const total = Number(body.totalAmount); const deposit = Number(body.depositAmount);
    if (!body.customerName || !body.phone || !body.productKey || !Number.isFinite(total) || total <= 0 || !Number.isFinite(deposit) || deposit < 0 || deposit > total) throw new Error("Enter customer details, the normal order total, and a valid deposit.");
    const row = { id: randomUUID(), customer_name: body.customerName, phone: body.phone, character: body.character, product_key: body.productKey, shipping_region: body.shippingRegion === "EAST" ? "EAST" : "WEST", total_amount: total, deposit_amount: deposit, balance_due_date: body.balanceDueDate || null, status: "deposit_paid", payment_receipts: body.paymentReceipts || [] };
    const { data, error: insertError } = await db().from("preorders").insert(row).select("*").single();
    if (insertError) throw insertError;
    return NextResponse.json({ ok: true, preorder: data });
  } catch (cause) { return NextResponse.json({ ok: false, error: error(cause) }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    if (body.action !== "mark_paid" || !body.preorder) throw new Error("Invalid pre-order action.");
    const preorder = body.preorder;
    const manualOrder = await createManualOrderDiscounts({ customerName: preorder.customer_name, phone: preorder.phone, productKey: preorder.product_key, character: preorder.character, shippingRegion: preorder.shipping_region });
    const { error: updateError } = await db().from("preorders").update({ status: "paid", manual_order_id: manualOrder.id, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", preorder.id);
    if (updateError) throw updateError;
    const { error: manualError } = await db().from("manual_orders").upsert({ id: manualOrder.id, customer_name: manualOrder.customerName, phone_original: manualOrder.phoneOriginal, phone_normalized: manualOrder.phoneNormalized, phone_last_four: manualOrder.phoneLastFour, product_key: manualOrder.productKey, product_display_name: manualOrder.productDisplayName, shopify_product_id: manualOrder.shopifyProductId, shopify_variant_id: manualOrder.shopifyVariantId, product_path: manualOrder.productPath, shipping_region: manualOrder.shippingRegion, product_discount_code: manualOrder.productDiscountCode, product_discount_shopify_id: manualOrder.productDiscountShopifyId, shipping_discount_code: manualOrder.shippingDiscountCode || null, shipping_discount_shopify_id: manualOrder.shippingDiscountShopifyId, customer_link: manualOrder.customerLink, status: manualOrder.status });
    if (manualError) throw manualError;
    return NextResponse.json({ ok: true, manualOrder });
  } catch (cause) { return NextResponse.json({ ok: false, error: error(cause) }, { status: 400 }); }
}

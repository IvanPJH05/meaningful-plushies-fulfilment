import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { mobileServiceClient, requireMobileSession } from "../../../../lib/mobile-api";
import { createUgcSampleDiscountCode, deactivateManualOrderDiscount } from "../../../../lib/manual-orders";
import { normalizeUgcCode } from "../../../../lib/marketing-ugc";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function admin(request: Request) {
  const session = await requireMobileSession(request);
  if (session.role !== "admin") throw new Error("ADMIN_REQUIRED");
  return session;
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "UGC request failed.";
  return NextResponse.json({ error: message }, { status: message === "ADMIN_REQUIRED" ? 403 : message.includes("REQUIRED") ? 401 : 400 });
}
export async function GET(request: Request) {
  try {
    await admin(request);
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error("Invalid page.");
    const { data, error } = await mobileServiceClient().from("marketing_ugc_samples").select("*").order("given_at", { ascending: false }).order("id").range(offset, offset + 50);
    if (error) throw error;
    return NextResponse.json({ samples: data?.slice(0,50) || [], hasMore: (data?.length || 0) > 50 }, { headers: {"cache-control":"no-store"} });
  } catch(error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const session = await admin(request);
    const body = await request.json();
    if (typeof body.id !== "string" || !uuid.test(body.id)) throw new Error("Invalid UGC record.");
    const db = mobileServiceClient();
    const existing = await db.from("marketing_ugc_samples").select("*").eq("id", body.id).maybeSingle();
    if (existing.error) throw existing.error;
    let sample = existing.data;
    if (!sample) {
      const name = typeof body.customerName === "string" ? body.customerName.trim() : "";
      if (!name || name.length > 200) throw new Error("Add a customer name (up to 200 characters).");
      const customerUrl = typeof body.customerUrl === "string" ? body.customerUrl.trim() : "";
      if (customerUrl && (!/^https?:\/\//i.test(customerUrl) || customerUrl.length > 2000)) throw new Error("Use a valid customer profile URL.");
      const insert = await db.from("marketing_ugc_samples").insert({ id: body.id, customer_name: name, customer_url: customerUrl, sample_code: normalizeUgcCode(typeof body.code === "string" && body.code.trim() ? body.code : randomBytes(5).toString("hex")), source_order_number: String(body.sourceOrderNumber || "").slice(0,100), notes: String(body.notes || "").slice(0,20000), created_by: session.username }).select("*").single();
      if (insert.error) throw new Error(insert.error.code === "23505" ? "This UGC code already exists. Choose a different code." : insert.error.message);
      sample = insert.data;
    }
    if (sample.status === "disabled") throw new Error("This UGC offer has been disabled.");
    if (sample.shopify_discount_id) return NextResponse.json({ sample });
    try {
      const discountId = await createUgcSampleDiscountCode(sample.sample_code, sample.customer_name, sample.id);
      const saved = await db.from("marketing_ugc_samples").update({shopify_discount_id:discountId,status:"active",updated_at:new Date().toISOString()}).eq("id",sample.id).eq("status","pending").select("*").single();
      if (saved.error) {
        const latest = await db.from("marketing_ugc_samples").select("*").eq("id",sample.id).single();
        if (latest.data?.status === "disabled") await deactivateManualOrderDiscount(discountId);
        else if (latest.data?.shopify_discount_id === discountId) return NextResponse.json({ sample: latest.data });
        throw new Error("The UGC record changed while creating its code. Refresh and retry this saved record.");
      }
      return NextResponse.json({ sample: saved.data });
    } catch(error) {
      return NextResponse.json({ sample, error: error instanceof Error ? error.message : "Shopify code creation failed. Retry this saved record." });
    }
  } catch(error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    await admin(request);
    const body = await request.json();
    if (typeof body.id !== "string" || !uuid.test(body.id)) throw new Error("Invalid UGC record.");
    const db = mobileServiceClient();
    const current = await db.from("marketing_ugc_samples").select("*").eq("id",body.id).single();
    if (current.error) throw current.error;
    if (body.expectedUpdatedAt !== current.data.updated_at) throw new Error("This UGC record changed. Refresh before saving again.");
    let patch: Record<string, string>;
    if (body.action === "disable") {
      if (current.data.shopify_discount_id) await deactivateManualOrderDiscount(current.data.shopify_discount_id);
      patch = { status: "disabled" };
    } else if (body.action === "edit" && typeof body.notes === "string" && body.notes.length <= 20000 && typeof body.orderNumber === "string" && body.orderNumber.length <= 100) {
      patch = { notes: body.notes, order_number: body.orderNumber.trim() };
    } else throw new Error("Invalid UGC action.");
    const result = await db.from("marketing_ugc_samples").update({...patch,updated_at:new Date().toISOString()}).eq("id",body.id).eq("updated_at",body.expectedUpdatedAt).select("*").single();
    if (result.error) throw new Error("The record changed or could not be saved. Refresh and try again.");
    return NextResponse.json({ sample: result.data });
  } catch(error) { return failure(error); }
}

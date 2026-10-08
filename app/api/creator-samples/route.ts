import { NextResponse } from "next/server";

import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";

export async function GET(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const { data, error } = await mobileServiceClient()
      .from("creator_free_samples")
      .select("id,creator_name,creator_url,sample_code,product_collection,shopify_discount_id,order_number,given_at,notes")
      .order("given_at", { ascending: false })
      .order("creator_name", { ascending: true });
    if (error) throw error;

    // Staff only need the discount-code list to recognise an influencer order.
    // Full creator names, links, and notes remain visible to admins only.
    if (session.role !== "admin") {
      return NextResponse.json({ codes: (data ?? []).map((sample) => String(sample.sample_code || "")).filter(Boolean) });
    }
    return NextResponse.json({ samples: data ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATOR_SAMPLES_LOAD_FAILED";
    const status = message.includes("REQUIRED") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

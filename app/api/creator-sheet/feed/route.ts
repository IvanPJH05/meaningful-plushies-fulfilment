import { timingSafeEqual } from "node:crypto";
import { mobileServiceClient } from "../../../../lib/mobile-api";
import { creatorSheetCsv, creatorSampleSheetRows, creatorProfileSheetRows, creatorSheetSampleHeaders, creatorSheetProfileHeaders } from "../../../../lib/creator-sheet";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };
export async function GET(request: Request) {
  const url = new URL(request.url), expected = process.env.CREATOR_SHEET_FEED_KEY?.trim();
  const supplied = url.searchParams.get("key") ?? "";
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return new Response("Not found", { status: 404, headers });
  }
  const view = url.searchParams.get("view");
  if (view !== "samples" && view !== "profiles") return new Response("Unknown view", { status: 400, headers });
  try {
    const db = mobileServiceClient(), rows: Record<string, unknown>[] = [];
    const table = view === "samples" ? "creator_free_samples" : "creator_profiles";
    const fields = view === "samples" ? "id,creator_name,creator_url,sample_code,product_collection,order_number,given_at" : "id,display_name,email,phone,tiktok_url,instagram_url,discount_code,commission_rate,current_tier,status,created_at,updated_at";
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from(table).select(fields).order("id").range(offset, offset + 499);
      if (error) throw error;
      rows.push(...(data ?? []) as unknown as Record<string, unknown>[]);
      if ((data?.length ?? 0) < 500) break;
    }
    const values = view === "samples" ? [creatorSheetSampleHeaders, ...creatorSampleSheetRows(rows)] : [creatorSheetProfileHeaders, ...creatorProfileSheetRows(rows)];
    return new Response(creatorSheetCsv(values), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch {
    return new Response("Creator feed temporarily unavailable", { status: 503, headers });
  }
}

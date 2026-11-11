import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "../../../../../lib/mobile-api";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not load batch history.";
  return NextResponse.json({ error: message }, { status: /REQUIRED/.test(message) ? 401 : /Invalid/.test(message) ? 400 : 500, headers });
}
export async function GET(request: Request) {
  try {
    await requireMobileSession(request);
    const url = new URL(request.url), id = url.searchParams.get("id"), before = url.searchParams.get("before");
    if ((id && !uuid.test(id)) || (before && !/^[1-9]\d{0,18}$/.test(before))) throw new Error("Invalid history selection.");
    const db = mobileServiceClient();
    if (id) {
      const batch = await db.from("fulfilment_batches").select("id,number,stage,created_at,completed_at").eq("id", id).maybeSingle();
      if (batch.error) throw new Error(batch.error.message);
      if (!batch.data) return NextResponse.json({ error: "Batch not found." }, { status: 404, headers });
      let query = db.from("fulfilment_batch_events").select("id,action,actor,created_at,details").eq("batch_id", id).order("id", { ascending: false }).limit(101);
      if (before) query = query.lt("id", before);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return NextResponse.json({ batch: batch.data, events: data.slice(0,100), more: data.length > 100 }, { headers });
    }
    let query = db.from("fulfilment_batches").select("id,number,stage,created_at,completed_at").order("number", { ascending: false }).limit(51);
    if (before) query = query.lt("number", before);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return NextResponse.json({ batches: data.slice(0,50), more: data.length > 50 }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const session = await requireMobileSession(request);
    const body = await request.json();
    if (!uuid.test(body.batchId ?? "") || !["packing_slips_generated","envelopes_generated","audio_zip_download_started"].includes(body.action)) throw new Error("Invalid history action.");
    const db = mobileServiceClient();
    const batch = await db.from("fulfilment_batches").select("id,stage").eq("id", body.batchId).maybeSingle();
    if (batch.error) throw new Error(batch.error.message);
    const stages: Record<string,string[]> = { packing_slips_generated: ["printing"], envelopes_generated: ["envelopes"], audio_zip_download_started: ["audio"] };
    if (!batch.data || !stages[body.action].includes(batch.data.stage)) throw new Error("Invalid batch stage for this action.");
    const { error } = await db.from("fulfilment_batch_events").insert({ batch_id: body.batchId, action: body.action, actor: `${session.displayName} (${session.username})` });
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return failure(error); }
}

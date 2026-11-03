import { queueTutorialPilot, retryTutorial } from "@/lib/tiktok-tutorial";
import { NextResponse } from "next/server";
import { mobileServiceClient } from "@/lib/mobile-api";
import { requireTikTokAdmin } from "@/lib/tiktok-connection";

const bucket = "tiktok-tutorial";
const pathPattern = /^tutorial\/[a-f0-9-]{36}\.mp4$/;
const headers = { "Cache-Control": "private, no-store" };
function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers });
}

async function handle(request: Request) {
  try {
    await requireTikTokAdmin(request);
  } catch {
    return reply({ error: "Administrator access required." }, 403);
  }

  try {
    const db = mobileServiceClient();
    const storage = db.storage.from(bucket);
    const settings = db.from("tiktok_tutorial_settings");
    const { data: current, error } = await settings.select("video_path, updated_at").eq("id", true).single();
    if (error) throw error;

    if (request.method === "GET") {
      const jobs = await db.from("tiktok_tutorial_deliveries").select("order_id,status,sent_at,error").order("retry_after", { ascending: false }).limit(100);
      if (jobs.error) throw jobs.error;
      if (!current.video_path) return reply({ video: null, deliveries: jobs.data });
      const preview = await storage.createSignedUrl(current.video_path, 3600);
      if (preview.error) throw preview.error;
      return reply({ deliveries: jobs.data, video: { url: preview.data.signedUrl, updatedAt: current.updated_at } });
    }

    const body = await request.json().catch(() => null);
    if (body?.action === "pilot" && current.video_path) {
      await queueTutorialPilot();
      return reply({ ok: true });
    }
    if (body?.action === "retry" && typeof body.orderId === "string") {
      await retryTutorial(body.orderId);
      return reply({ ok: true });
    }
    if (body?.action === "prepare") {
      const path = `tutorial/${crypto.randomUUID()}.mp4`;
      const upload = await storage.createSignedUploadUrl(path, { upsert: false });
      if (upload.error) throw upload.error;
      return reply({ upload: upload.data, revision: current.updated_at });
    }

    const path = body?.action === "remove" ? null : body?.path;
    if (body?.action !== "remove" && (body?.action !== "activate" || typeof path !== "string" || !pathPattern.test(path))) {
      return reply({ error: "Choose a valid MP4 upload." }, 400);
    }
    if (body.action === "activate" && body.revision !== current.updated_at) {
      return reply({ error: "The tutorial changed during upload. Refresh and try again." }, 409);
    }
    if (path) {
      const file = await storage.info(path);
      if (file.error || !file.data?.size || file.data.size > 100000000 || file.data.contentType !== "video/mp4") {
        return reply({ error: "Upload an MP4 under 100 MB first." }, 400);
      }
    }
    const result = await settings.update({ video_path: path, updated_at: new Date().toISOString() })
      .eq("id", true).eq("updated_at", current.updated_at).select("id").maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return reply({ error: "The tutorial changed. Refresh and try again." }, 409);
    if (current.video_path && current.video_path !== path) await storage.remove([current.video_path]);
    return reply({ ok: true });
  } catch {
    return reply({ error: "Could not update the tutorial video. Try again." }, 500);
  }
}

export const GET = handle;
export const POST = handle;

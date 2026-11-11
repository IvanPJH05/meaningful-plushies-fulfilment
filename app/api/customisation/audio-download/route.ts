import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cachedBatchMp3, maxAudioSourceBytes } from "../../../../lib/batch-audio";

export const runtime = "nodejs";
export const maxDuration = 60;

const AUDIO_BUCKET = "customisation-audio";

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._ -]/g, "-").replace(/-+/g, "-").slice(0, 120) || "meaningful-plushie-voice";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get("path") || "";
  const requestedName = safeFileName(url.searchParams.get("filename") || path.split("/").at(-1) || "meaningful-plushie-voice");

  // Voice paths are generated as <customisation-session-uuid>/<safe-file-name>.
  // Do not allow this endpoint to read arbitrary files from Supabase Storage.
  if (!/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/i.test(path)) {
    return NextResponse.json({ ok: false, error: "Invalid voice file." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ ok: false, error: "Voice downloads are not configured." }, { status: 503 });

  const storage = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await storage.storage.from(AUDIO_BUCKET).download(path);
  if (error || !data) return NextResponse.json({ ok: false, error: "Voice file was not found." }, { status: 404 });

  // Browser recordings need a real transcode: renaming WebM leaves its container
  // and sometimes missing duration metadata intact, which confuses editors.
  if (/\.webm$/i.test(path) || /^(audio|video)\/webm(?:;|$)/i.test(data.type)) {
    if (data.size > maxAudioSourceBytes) return NextResponse.json({ ok: false, error: "This recording exceeds the 50 MB conversion limit." }, { status: 413 });
    try {
      const mp3 = await cachedBatchMp3(storage, Buffer.from(await data.arrayBuffer()));
      const name = requestedName.replace(/\.[^.]+$/, "") || "meaningful-plushie-voice";
      return new Response(new Uint8Array(mp3), { headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${name}.mp3"`,
        "Content-Length": String(mp3.length),
        "Cache-Control": "private, no-store",
      } });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not convert this recording to MP3." }, { status: 422 });
    }
  }

  return new Response(data, {
    headers: {
      "Content-Type": data.type || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${requestedName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

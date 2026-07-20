import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://joaoirpegnkexmktylop.supabase.co";
const fallbackSupabaseAnonKey = "sb_publishable_qYeTDXzz1yeOydayZDSBPA_VjLbcgdE";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackSupabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SERVICE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? fallbackSupabaseAnonKey;

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
export const WHATSAPP_MEDIA_CACHE_MAX_BYTES = Number(
  process.env.WHATSAPP_MEDIA_CACHE_MAX_BYTES ?? 15 * 1024 * 1024,
);

let mediaStorageClient: SupabaseClient | null = null;

function getMediaStorageClient() {
  if (!supabaseUrl || !supabaseKey) return null;
  if (!mediaStorageClient) {
    mediaStorageClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return mediaStorageClient;
}

function safePathSegment(value: string) {
  return value.replace(/[^\w.-]+/g, "_");
}

export function whatsappMediaCachePath(args: {
  businessId: string;
  mediaId: string;
}) {
  return `${safePathSegment(args.businessId)}/${safePathSegment(args.mediaId)}`;
}

export async function readCachedWhatsAppMedia(args: {
  businessId: string;
  mediaId: string;
}) {
  const client = getMediaStorageClient();
  if (!client) return null;

  const { data, error } = await client
    .storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .download(whatsappMediaCachePath(args));

  if (error || !data) return null;
  const bytes = await data.arrayBuffer();
  return bytes.byteLength ? bytes : null;
}

export async function writeCachedWhatsAppMedia(args: {
  businessId: string;
  mediaId: string;
  bytes: ArrayBuffer;
  contentType: string;
}) {
  if (args.bytes.byteLength > WHATSAPP_MEDIA_CACHE_MAX_BYTES) return false;
  const client = getMediaStorageClient();
  if (!client) return false;

  const { error } = await client
    .storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(whatsappMediaCachePath(args), args.bytes, {
      cacheControl: "604800",
      contentType: args.contentType || "application/octet-stream",
      upsert: true,
    });

  if (error) {
    console.warn("WhatsApp media could not be cached", {
      mediaId: args.mediaId,
      message: error.message,
    });
    return false;
  }

  return true;
}

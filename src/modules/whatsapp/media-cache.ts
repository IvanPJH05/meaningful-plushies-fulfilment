import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const fallbackSupabaseUrl = "https://joaoirpegnkexmktylop.supabase.co";
const fallbackSupabaseAnonKey = "sb_publishable_qYeTDXzz1yeOydayZDSBPA_VjLbcgdE";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? fallbackSupabaseUrl;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? process.env.SUPABASE_SERVICE_KEY
  ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? fallbackSupabaseAnonKey;

export const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
export const CRM_WHATSAPP_INBOX_REALTIME_TOPIC = "crm-whatsapp-inbox";
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

export async function broadcastWhatsAppCrmChange(payload: {
  table: string;
  operation: string;
  id?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
}) {
  const client = getMediaStorageClient();
  if (!client) return false;

  const channel = client.channel(CRM_WHATSAPP_INBOX_REALTIME_TOPIC);
  try {
    const status = await channel.send({
      type: "broadcast",
      event: "crm_change",
      payload,
    }, { timeout: 2500 });
    return status === "ok";
  } catch (error) {
    console.warn("WhatsApp CRM realtime broadcast failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  } finally {
    await client.removeChannel(channel);
  }
}

export function safeStoragePathSegment(value: string) {
  return value.replace(/[^\w.-]+/g, "_");
}

export function whatsappMediaCachePath(args: {
  businessId: string;
  mediaId: string;
}) {
  return `${safeStoragePathSegment(args.businessId)}/${safeStoragePathSegment(args.mediaId)}`;
}

export async function readStoredWhatsAppMedia(path: string) {
  const client = getMediaStorageClient();
  if (!client) return null;

  const { data, error } = await client
    .storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .download(path);

  if (error || !data) return null;
  const bytes = await data.arrayBuffer();
  return bytes.byteLength ? bytes : null;
}

export async function writeStoredWhatsAppMedia(args: {
  path: string;
  bytes: ArrayBuffer;
  contentType: string;
  cacheControl?: string;
  upsert?: boolean;
}) {
  if (args.bytes.byteLength > WHATSAPP_MEDIA_CACHE_MAX_BYTES) return false;
  const client = getMediaStorageClient();
  if (!client) return false;

  const { error } = await client
    .storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(args.path, args.bytes, {
      cacheControl: args.cacheControl || "31536000",
      contentType: args.contentType || "application/octet-stream",
      upsert: args.upsert ?? true,
    });

  if (error) {
    console.warn("WhatsApp media could not be cached", {
      path: args.path,
      message: error.message,
    });
    return false;
  }

  return true;
}

export async function readCachedWhatsAppMedia(args: {
  businessId: string;
  mediaId: string;
}) {
  return readStoredWhatsAppMedia(whatsappMediaCachePath(args));
}

export async function writeCachedWhatsAppMedia(args: {
  businessId: string;
  mediaId: string;
  bytes: ArrayBuffer;
  contentType: string;
}) {
  return writeStoredWhatsAppMedia({
    path: whatsappMediaCachePath(args),
    bytes: args.bytes,
    contentType: args.contentType,
    cacheControl: "604800",
    upsert: true,
  });
}

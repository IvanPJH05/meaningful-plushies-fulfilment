import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const CLOSER_MEDIA_BUCKET = "closer-app-media";

let storage: SupabaseClient | null = null;

function client() {
  if (storage) return storage;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Closer media storage is not configured.");
  storage = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return storage;
}

export async function storeCloserMedia(path: string, bytes: ArrayBuffer, contentType: string) {
  const { error } = await client().storage.from(CLOSER_MEDIA_BUCKET).upload(path, bytes, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw new Error("Your media could not be saved. Please try again.");
}

export async function readCloserMedia(path: string) {
  const { data, error } = await client().storage.from(CLOSER_MEDIA_BUCKET).download(path);
  if (error || !data) return null;
  return data.arrayBuffer();
}

export async function deleteCloserMedia(paths: Array<string | null | undefined>) {
  const validPaths = paths.filter((path): path is string => Boolean(path));
  if (!validPaths.length) return;
  const { error } = await client().storage.from(CLOSER_MEDIA_BUCKET).remove(validPaths);
  if (error) console.error("Closer media cleanup failed", error.message);
}

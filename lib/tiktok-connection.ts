import { mobileServiceClient, requireMobileSession } from "./mobile-api";
import { decryptTikTokToken, encryptTikTokToken } from "./tiktok-crypto.ts";
import { tikTokTokenRequest, type TikTokTokens } from "./tiktok-client.ts";

export async function requireTikTokAdmin(request: Request) {
  const session = await requireMobileSession(request);
  if (session.role !== "admin") throw new Error("ADMIN_REQUIRED");
  return session;
}
export async function getTikTokConnection() {
  const { data, error } = await mobileServiceClient().from("tiktok_connection").select("*").eq("id", true).maybeSingle();
  if (error) throw new Error("TikTok connection storage is unavailable.");
  return data;
}
export function tokenFields(tokens: TikTokTokens) {
  // TikTok returns Unix expiry timestamps, rather than durations.
  return { access_token: encryptTikTokToken(tokens.access_token), refresh_token: encryptTikTokToken(tokens.refresh_token), access_expires_at: new Date(tokens.access_token_expire_in * 1000).toISOString(), refresh_expires_at: new Date(tokens.refresh_token_expire_in * 1000).toISOString(), granted_scopes: tokens.granted_scopes ?? [], updated_at: new Date().toISOString() };
}
export async function tikTokAccess() {
  let connection = await getTikTokConnection();
  if (!connection) throw new Error("Connect your TikTok Shop first.");
  if (Date.parse(connection.access_expires_at) > Date.now() + 120000) return { ...connection, token: decryptTikTokToken(connection.access_token) };
  if (Date.parse(connection.refresh_expires_at) <= Date.now()) throw new Error("TikTok authorization expired. Reconnect your shop.");
  const db = mobileServiceClient();
  const lease = new Date(Date.now() + 60000).toISOString();
  const { data, error } = await db.from("tiktok_connection").update({ refresh_lock_until: lease }).eq("id", true).lt("refresh_lock_until", new Date().toISOString()).select("id");
  if (error || !data?.length) throw new Error("TikTok connection is refreshing. Please retry shortly.");
  try {
    // Re-read after acquiring the cross-instance lease.
    connection = await getTikTokConnection();
    if (Date.parse(connection!.access_expires_at) > Date.now() + 120000) return { ...connection!, token: decryptTikTokToken(connection!.access_token) };
    const tokens = await tikTokTokenRequest({ refresh_token: decryptTikTokToken(connection!.refresh_token), grant_type: "refresh_token" }, true);
    const fields = tokenFields(tokens);
    const saved = await db.from("tiktok_connection").update(fields).eq("id", true).eq("refresh_lock_until", lease);
    if (saved.error) throw new Error("Could not save refreshed TikTok authorization.");
    return { ...connection!, ...fields, token: tokens.access_token };
  } finally { await db.from("tiktok_connection").update({ refresh_lock_until: new Date(0).toISOString() }).eq("id", true).eq("refresh_lock_until", lease); }
}

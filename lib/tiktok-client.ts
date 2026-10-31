import { signTikTokRequest } from "./tiktok-crypto.ts";

export function tikTokCredentials() {
  const appKey = process.env.TIKTOK_SHOP_APP_KEY;
  const appSecret = process.env.TIKTOK_SHOP_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("TikTok app credentials are not configured.");
  return { appKey, appSecret };
}

export async function tikTokRequest<T>(path: string, accessToken: string, query: Record<string, string> = {}, body?: Record<string, unknown>): Promise<T> {
  const { appKey, appSecret } = tikTokCredentials();
  const bodyText = body ? JSON.stringify(body) : "";
  const params = { ...query, app_key: appKey, timestamp: String(Math.floor(Date.now() / 1000)) };
  const sign = signTikTokRequest(path, params, bodyText, appSecret);
  const response = await fetch(`https://open-api.tiktokglobalshop.com${path}?${new URLSearchParams({ ...params, sign })}`, {
    method: body ? "POST" : "GET", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { "content-type": "application/json", "x-tts-access-token": accessToken },
    ...(body ? { body: bodyText } : {}),
  });
  const result = await response.json();
  if (!response.ok || result.code !== 0 || !result.data) throw new Error(`TikTok API failed (code ${result.code ?? response.status}).`);
  return result.data as T;
}

export type TikTokTokens = { access_token: string; refresh_token: string; access_token_expire_in: number; refresh_token_expire_in: number; user_type: number; granted_scopes?: string[] };
export async function tikTokTokenRequest(params: Record<string, string>, refresh = false): Promise<TikTokTokens> {
  const { appKey, appSecret } = tikTokCredentials();
  const query = new URLSearchParams({ app_key: appKey, app_secret: appSecret, ...params });
  const response = await fetch(`https://auth.tiktok-shops.com/api/v2/token/${refresh ? "refresh" : "get"}?${query}`, { cache: "no-store", signal: AbortSignal.timeout(20000) });
  const result = await response.json();
  const data = result.data as TikTokTokens;
  if (!response.ok || result.code !== 0 || !data?.access_token || !data.refresh_token || Number(data.user_type) !== 0 || !Number.isFinite(data.access_token_expire_in) || !Number.isFinite(data.refresh_token_expire_in)) throw new Error("TikTok seller authorization failed. Reconnect your shop.");
  if (data.granted_scopes && !data.granted_scopes.includes("seller.order.info")) throw new Error("TikTok Order Information permission was not granted.");
  return data;
}

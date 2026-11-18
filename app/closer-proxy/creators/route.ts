import { checkVipInvite, claimVipProduct, registerVipCreator } from "@/lib/creator-vip";
import { renderCreatorVipPage } from "@/lib/creator-vip-page";
import { verifyUgcProxy } from "@/lib/shopify-proxy-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function proxyPath(url: URL) {
  verifyUgcProxy(url);
  const prefix = url.searchParams.get("path_prefix");
  if (!prefix || !/^\/(a|apps|community|tools)\/[a-z0-9_-]{1,30}$/i.test(prefix)) throw new Error("Invalid proxy path.");
  return `${prefix}/creators`;
}

export function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const path = proxyPath(url);
    const malay = url.searchParams.get("lang") === "ms";
    return new Response(renderCreatorVipPage(path, malay), {
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Language": malay ? "ms" : "en" },
    });
  } catch {
    return new Response("Open the creator program from the Meaningful Plushies storefront.", { status: 403, headers });
  }
}

async function readSignup(request: Request) {
  if (!request.body || !/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new Error("JSON is required.");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        throw new Error("The request is too large.");
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  const input = JSON.parse(body + decoder.decode());
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid signup details.");
  return input;
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  try {
    proxyPath(url);
  } catch {
    return Response.json({ error: "unavailable" }, { status: 403, headers });
  }
  const action = url.searchParams.get("action");
  if (action !== "check" && action !== "register" && action !== "claim") {
    return Response.json({ error: "invalid_details" }, { status: 400, headers });
  }
  const input = await readSignup(request).catch(() => null);
  if (!input) return Response.json({ error: "invalid_details" }, { status: 400, headers });
  try {
    const result = action === "check" ? await checkVipInvite(input.invite)
      : action === "register" ? await registerVipCreator(input)
        : await claimVipProduct(input);
    const error = "error" in result ? result.error : undefined;
    const status = error === "invalid_invite" ? 404 : error === "invalid_details" ? 422 : error ? 409 : 200;
    return Response.json(result, { status, headers });
  } catch (error) {
    console.error("VIP creator signup failed", error);
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}

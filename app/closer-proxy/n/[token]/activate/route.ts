import { after, NextResponse } from "next/server";
import { verifyUgcProxy } from "@/lib/shopify-proxy-auth";
import { nfcTokenPattern } from "@/lib/nfc-cards";
import { customerNfcActivationState, startLinkedNfcCustomisation, submitCustomerNfcActivation, verifyCustomerNfcOrder } from "@/lib/nfc-customer-activation";
import { processCertificateSync } from "@/lib/certificate-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
type Context = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Context) {
  try {
    verifyUgcProxy(new URL(request.url));
    const { token } = await params;
    if (!nfcTokenPattern.test(token)) throw new Error("Invalid card link.");
    return NextResponse.json({ state: await customerNfcActivationState(token) }, { headers });
  } catch {
    return NextResponse.json({ error: "Your card could not be checked. Please refresh to try again." }, { status: 400, headers });
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    verifyUgcProxy(new URL(request.url));
    const { token } = await params;
    if (!nfcTokenPattern.test(token)) throw new Error("Invalid card link.");
    const raw = await request.text();
    if (raw.length > 15000) throw new Error("Your details are too long. Please shorten the note.");
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Choose a valid customisation action.");
    if (body.action === "linked") return NextResponse.json(await startLinkedNfcCustomisation(token), { headers });
    if (body.action === "verify") {
      const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      return NextResponse.json(await verifyCustomerNfcOrder(token, body, client), { headers });
    }
    if (body.action !== "submit") throw new Error("Choose a valid customisation action.");
    await submitCustomerNfcActivation(token, body);
    after(async () => {
      try { await processCertificateSync(); } catch { console.error("Customer NFC certificate sync will retry through the scheduled worker."); }
    });
    return NextResponse.json({ state: "processing" }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Your details could not be saved. Please try again." }, { status: 400, headers });
  }
}

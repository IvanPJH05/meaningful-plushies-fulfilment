import { NextResponse } from "next/server";
import { verifyUgcProxy } from "@/lib/shopify-proxy-auth";
import { nfcDestination, nfcTokenPattern } from "@/lib/nfc-cards";
import { publicNfcOrder, publicNfcCertificate } from "@/lib/nfc-public-card";
import { nfcCertificateHtml } from "@/lib/nfc-certificate-html";
import { isPlushCharmOrder } from "@/lib/plush-charm";
import { customerNfcActivationState } from "@/lib/nfc-customer-activation";
import { nfcActivationHtml } from "@/lib/nfc-activation-html";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Content-Type": "application/liquid", "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    verifyUgcProxy(new URL(request.url));
  } catch {
    return new NextResponse("Storefront verification failed.", { status: 403 });
  }
  const { token } = await params;
  if (!nfcTokenPattern.test(token)) return new NextResponse(nfcCertificateHtml(), { status: 404, headers });
  try {
    const state = await customerNfcActivationState(token);
    if (state === "customise" || state === "processing") {
      const prefix = new URL(request.url).searchParams.get("path_prefix") || "/apps/closer";
      return new NextResponse(nfcActivationHtml(`${prefix}/n/${token}/activate`, state === "processing"), { headers });
    }
    const order = await publicNfcOrder(token);
    if (!order) return new NextResponse(nfcCertificateHtml(), { headers });
    const destination = nfcDestination(order);
    if (isPlushCharmOrder(order) && destination) return NextResponse.redirect(destination, { status: 307, headers });
    return new NextResponse(nfcCertificateHtml(await publicNfcCertificate(order)), { headers });
  } catch {
    return new NextResponse(nfcCertificateHtml(undefined, true), { status: 503, headers });
  }
}

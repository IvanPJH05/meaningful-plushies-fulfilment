import { NextResponse } from "next/server";
import { verifyUgcProxy } from "@/lib/shopify-proxy-auth";
import { publicNfcOrder } from "@/lib/nfc-public-card";
import { certificateHandleQuery } from "@/lib/certificate-sync";
import { shopDomain, shopifyGraphql } from "@/lib/shopify-orders";
import { nfcDestination, nfcTokenPattern } from "@/lib/nfc-cards";
import { isPlushCharmOrder } from "@/lib/plush-charm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    verifyUgcProxy(url);
  } catch {
    return NextResponse.json({ error: "Storefront verification failed." }, { status: 403, headers });
  }
  const token = url.searchParams.get("card") || "";
  if (!nfcTokenPattern.test(token)) return NextResponse.json({ status: "inactive" }, { status: 404, headers });
  try {
    const order = await publicNfcOrder(token);
    if (!order) return NextResponse.json({ status: "inactive" }, { headers });
    if (isPlushCharmOrder(order)) return NextResponse.json({ status: "our_link", url: nfcDestination(order) }, { headers });
    const type = process.env.SHOPIFY_CERTIFICATE_METAOBJECT_TYPE || "version_1_certs";
    const domain = shopDomain();
    if (!domain) throw new Error("Certificate service is unavailable.");
    const result = await shopifyGraphql<{
      errors?: unknown[];
      data?: {
        metaobjectByHandle?: { fields: Array<{ key: string; value: string }> } | null;
        metaobjectDefinitionByType?: { fieldDefinitions: Array<{ key: string; name: string }> };
      };
    }>(domain, certificateHandleQuery, {
      handle: { type, handle: order.certificateCode.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 255) }, type,
    });
    const object = result?.data?.metaobjectByHandle;
    const definitions = result?.data?.metaobjectDefinitionByType?.fieldDefinitions;
    if (result?.errors?.length || !object || !definitions) throw new Error("Certificate is unavailable.");
    const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const value = (name: string) => {
      const definition = definitions.find(field => normalize(field.key) === normalize(name) || normalize(field.name) === normalize(name));
      return object.fields.find(field => field.key === definition?.key)?.value || "";
    };
    if (value("code") !== order.certificateCode) throw new Error("Certificate does not match.");
    return NextResponse.json({ status: "ready", certificate: {
      code: value("code"),
      name: value("id_name"),
      character: order.character || "",
      gender: value("gender"),
      birthDate: value("born_on"),
      birthplace: value("birthplace"),
      favouritePerson: value("favourite_person"),
      belongsTo: value("belongs_to"),
      note: value("meaningful_note"),
    } }, { headers });
  } catch {
    return NextResponse.json({ error: "Your certificate could not be loaded. Please try again." }, { status: 503, headers });
  }
}

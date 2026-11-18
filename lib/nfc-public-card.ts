import { certificateHandleQuery } from "./certificate-sync";
import { shopDomain, shopifyGraphql } from "./shopify-orders";
import { mobileServiceClient } from "./mobile-api";
import { nfcDestination, nfcTokenPattern } from "./nfc-cards";
import type { Order } from "./types";

export async function publicNfcOrder(token: string): Promise<Order | null> {
  if (!nfcTokenPattern.test(token)) return null;
  const db = mobileServiceClient();
  const { data: card, error } = await db.from("nfc_cards").select("status,order_id").eq("public_token", token).maybeSingle();
  if (error) throw error;
  if (!card || card.status !== "assigned" || !card.order_id) return null;
  const { data: row, error: orderError } = await db.from("fulfilment_orders").select("data,status").eq("id", card.order_id).maybeSingle();
  if (orderError) throw orderError;
  if (!row || ["awaiting_customisation", "issue"].includes(row.status)) return null;
  const order = row.data as Order;
  return nfcDestination(order) ? order : null;
}

export async function publicNfcCertificate(order: Order) {
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
  return {
    code: value("code"),
    name: value("id_name"),
    character: order.character || "",
    gender: value("gender"),
    birthDate: value("born_on"),
    birthplace: value("birthplace"),
    favouritePerson: value("favourite_person"),
    belongsTo: value("belongs_to"),
    note: value("meaningful_note"),
  };
}

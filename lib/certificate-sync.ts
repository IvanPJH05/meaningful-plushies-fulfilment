import { randomUUID } from "node:crypto";
import { mobileServiceClient } from "./mobile-api";
import type { Order } from "./types";
import { certificateDetails, retryDelaySeconds } from "./certificate-sync-fields";
import { isPlushCharmOrder } from "./plush-charm";
import { certificateMediaForLineItem, plushBackgroundForMeaningfulNote, shopDomain, shopifyGraphql } from "./shopify-orders";

type Metaobject = { id: string; type: string; handle: string; fields: Array<{ key: string; value: string }> };
export const certificateLookupQuery = `query LinkedCertificate($id: ID!, $type: String!) {
  metaobject(id: $id) { id type handle fields { key value } }
  metaobjectDefinitionByType(type: $type) { fieldDefinitions { key name } }
}`;
export const certificateHandleQuery = `query LinkedCertificateHandle($handle: MetaobjectHandleInput!, $type: String!) {
  metaobjectByHandle(handle: $handle) { id type handle fields { key value } }
  metaobjectDefinitionByType(type: $type) { fieldDefinitions { key name } }
}`;
export const certificateSyncMutation = `mutation SyncLinkedCertificate($handle: MetaobjectHandleInput!, $metaobject: MetaobjectUpsertInput!) {
  metaobjectUpsert(handle: $handle, metaobject: $metaobject) { metaobject { id } userErrors { message } }
}`;

function checkResponse<T extends { errors?: unknown[] }>(result: T | null): T {
  if (!result || result.errors?.length) throw new Error("Shopify certificate service is unavailable or access was denied.");
  return result;
}

export async function syncLinkedCertificate(order: Order) {
  if (isPlushCharmOrder(order)) throw new Error("Plush Charms use Our Link rather than birth certificates.");
  const domain = shopDomain();
  if (!domain) throw new Error("Shopify certificate service is not configured.");
  const type = process.env.SHOPIFY_CERTIFICATE_METAOBJECT_TYPE || "version_1_certs";
  const { data: link, error: linkError } = await mobileServiceClient().rpc("read_certificate_sync_link", { p_order: order.id, p_code: order.certificateCode || "" });
  if (linkError) throw new Error("The certificate link could not be checked.");
  const sessions = (link?.sessions || []) as Array<{ certificate_code: string; certificate_metaobject_id: string }>;
  if (sessions.length > 1) throw new Error("More than one customisation is linked. Review the certificate link.");
  const session = sessions[0];
  const code = order.certificateCode || session?.certificate_code || "";
  if (order.certificateCode && session?.certificate_code && order.certificateCode !== session.certificate_code) throw new Error("The order and customisation certificate links disagree.");
  if (!code && !session?.certificate_metaobject_id) throw new Error("No birth certificate is linked to this order.");
  if (link?.duplicate) throw new Error("This certificate is linked to another order. Review the link.");
  type Result = { errors?: unknown[]; data?: { metaobject?: Metaobject | null; metaobjectByHandle?: Metaobject | null; metaobjectDefinitionByType?: { fieldDefinitions: Array<{ key: string; name: string }> } } };
  const id = session?.certificate_metaobject_id;
  const result = checkResponse(await shopifyGraphql<Result>(domain, id ? certificateLookupQuery : certificateHandleQuery, id
    ? { id, type } : { handle: { type, handle: code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 255) }, type }));
  const object = id ? result.data?.metaobject : result.data?.metaobjectByHandle;
  const definition = result.data?.metaobjectDefinitionByType?.fieldDefinitions;
  const details = certificateDetails(order);
  const creating = !object && !id && order.salesChannel === "tiktok";
  if ((!object && !creating) || (object && object.type !== type) || !definition?.length) throw new Error("The linked birth certificate or definition was not found.");
  if (creating && ![details.idName, details.gender, details.bornOn, details.birthplace, details.favouritePerson, details.belongsTo].every(value => value?.trim())) {
    throw new Error("Complete the TikTok birth certificate details before automatic creation.");
  }
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fieldFor = (key: string) => definition.find(field => normalize(field.key) === normalize(key) || normalize(field.name) === normalize(key));
  const existing = (key: string) => object?.fields.find(field => field.key === fieldFor(key)?.key)?.value;
  if (object && code && existing("code") !== code) throw new Error("The linked birth certificate code does not match this order.");
  const canonicalNumber = (value: string) => value.replace(/^#/, "").split(/\s+/)[0].toUpperCase();
  if (existing("order_number") && canonicalNumber(existing("order_number")!) !== canonicalNumber(order.orderNumber)) throw new Error("The linked birth certificate belongs to another order.");
  const values: Array<[string, string | undefined]> = [
    ...(creating ? [["code", code], ["order_number", order.orderNumber], ["created_at", order.orderDate]] as Array<[string, string]> : []),
    ["id_name", details.idName], ["gender", details.gender], ["born_on", details.bornOn],
    ["birthplace", details.birthplace], ["favourite_person", details.favouritePerson], ["belongs_to", details.belongsTo],
    ["meaningful_note", details.meaningfulNote],
    ["plush_background_bottom", details.meaningfulNote === undefined ? undefined : plushBackgroundForMeaningfulNote(details.meaningfulNote)],
    ["plush_details", order.salesChannel === "tiktok" ? `${order.character}${order.voiceLength ? ` ${order.voiceLength}S` : ""}`.trim() : order.product || order.character],
    ["certificate", certificateMediaForLineItem(order.product, order.character) || undefined],
  ];
  const fields = values.flatMap(([key, value]) => {
    if (value === undefined) return [];
    const field = fieldFor(key);
    if (!field) throw new Error(`The certificate definition is missing ${key}.`);
    return [{ key: field.key, value: value.replace(/[\r\n]+/g, " ").trim() }];
  });
  const updated = checkResponse(await shopifyGraphql<{ errors?: unknown[]; data?: { metaobjectUpsert?: { metaobject?: { id: string }; userErrors?: Array<{ message: string }> } } }>(domain, certificateSyncMutation,
    { handle: { type, handle: object?.handle || code.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 255) }, metaobject: { fields, ...(creating ? { capabilities: { publishable: { status: "ACTIVE" } } } : {}) } }));
  const payload = updated.data?.metaobjectUpsert;
  if (payload?.userErrors?.length) throw new Error("Shopify rejected a certificate field. Review the certificate definition and saved values.");
  if (!payload?.metaobject?.id || (object && payload.metaobject.id !== object.id)) throw new Error("Shopify did not confirm the linked certificate update.");
}

/** A lease serializes each certificate; edits during a write remain queued. */
export async function processCertificateSync() {
  const lease = randomUUID();
  const client = mobileServiceClient();
  const { data, error } = await client.rpc("claim_certificate_sync", { p_lease: lease });
  if (error) throw new Error("The certificate queue could not be claimed.");
  const jobs = (data || []) as Array<{ order_id: string; revision: number; attempts: number; data: Order }>;
  const results = await Promise.all(jobs.map(async job => {
    try {
      await syncLinkedCertificate(job.data);
      const { error: finishError } = await client.rpc("finish_certificate_sync", { p_order: job.order_id, p_lease: lease, p_revision: job.revision, p_error: null, p_delay: 30 });
      if (finishError) throw new Error("The certificate update acknowledgement could not be saved.");
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Certificate update failed.";
      const { error: retryError } = await client.rpc("finish_certificate_sync", { p_order: job.order_id, p_lease: lease, p_revision: job.revision, p_error: message, p_delay: retryDelaySeconds(job.attempts) });
      if (retryError) throw new Error("The certificate retry could not be saved.");
      return { ok: false };
    }
  }));
  return { processed: results.length, failed: results.filter(result => !result.ok).length };
}

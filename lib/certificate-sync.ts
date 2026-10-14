import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/infrastructure/database/prisma";
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
  const sessions = await prisma.$queryRaw<Array<{ certificate_code: string; certificate_metaobject_id: string }>>(Prisma.sql`
    select certificate_code, certificate_metaobject_id from public.customisation_sessions
    where fulfilment_order_id = ${order.id}
       or (id::text = ${order.customisationSessionId || ""} and fulfilment_order_id = ${order.id})
  `);
  if (sessions.length > 1) throw new Error("More than one customisation is linked. Review the certificate link.");
  const session = sessions[0];
  const code = order.certificateCode || session?.certificate_code || "";
  if (order.certificateCode && session?.certificate_code && order.certificateCode !== session.certificate_code) throw new Error("The order and customisation certificate links disagree.");
  if (!code && !session?.certificate_metaobject_id) throw new Error("No birth certificate is linked to this order.");
  if (code) {
    const duplicates = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      select id from public.fulfilment_orders where id <> ${order.id} and data->>'certificateCode' = ${code} limit 1
    `);
    if (duplicates.length) throw new Error("This certificate is linked to another order. Review the link.");
  }
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
  const jobs = await prisma.$queryRaw<Array<{ order_id: string; revision: number; attempts: number }>>(Prisma.sql`
    with due as (
      select order_id from public.certificate_sync_jobs where revision > synced_revision
        and next_attempt_at <= now() and (lease_until is null or lease_until < now())
      order by next_attempt_at limit 3 for update skip locked
    ) update public.certificate_sync_jobs j set lease_token = ${lease}::uuid,
        lease_until = now() + interval '5 minutes', attempts = attempts + 1
      from due where j.order_id = due.order_id returning j.order_id, j.revision, j.attempts
  `);
  const results = await Promise.all(jobs.map(async job => {
    try {
      const rows = await prisma.$queryRaw<Array<{ data: Order }>>(Prisma.sql`
        select data - 'photoDataUrl' - 'tikTokFileDataUrl' as data from public.fulfilment_orders where id = ${job.order_id}
      `);
      if (!rows[0]) throw new Error("Order was removed.");
      await syncLinkedCertificate(rows[0].data);
      await prisma.$executeRaw(Prisma.sql`
        update public.certificate_sync_jobs set synced_revision = ${job.revision},
          synced_at = now(), last_error = null, attempts = 0, lease_token = null, lease_until = null, next_attempt_at = now()
        where order_id = ${job.order_id} and lease_token = ${lease}::uuid
      `);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Certificate update failed.";
      await prisma.$executeRaw(Prisma.sql`
        update public.certificate_sync_jobs set last_error = ${message.slice(0, 300)},
          lease_token = null, lease_until = null,
          next_attempt_at = case when revision > ${job.revision} then now() else now() + ${retryDelaySeconds(job.attempts)} * interval '1 second' end
        where order_id = ${job.order_id} and lease_token = ${lease}::uuid
      `);
      return { ok: false };
    }
  }));
  return { processed: results.length, failed: results.filter(result => !result.ok).length };
}

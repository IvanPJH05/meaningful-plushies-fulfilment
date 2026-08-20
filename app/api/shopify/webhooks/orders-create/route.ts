import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { shopifyLinePersonalization, shopifyOrderToFulfilmentOrders } from "../../../../../lib/importer";
import { bindSessionsToOrders, customisationSessionIds, submittedCustomisationsForSessionIds } from "../../../../../lib/customisation";
import { sendMetaPurchaseEvents } from "../../../../../lib/meta-capi";
import { certificateMediaForLineItem, certificateMetaobjectForOrder, cleanShopifyOrderNumber, createCertificateMetaobject, fetchShopifyOrder, fetchShopifyOrderWithMetafieldRetry, flowCertificateCode, objectValue, plushBackgroundForMeaningfulNote, shopifyMetafieldValue, textValue, uploadLiftCertificateFields } from "../../../../../lib/shopify-orders";
import { fetchMetaCapiSettings, fetchSharedOrders, insertSharedActivity, markManualOrderUsedByDiscountCode, syncCreatorCommissions, upsertSharedOrders } from "../../../../../lib/supabase";

export const runtime = "nodejs";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function verifyShopifyHmac(rawBody: string, hmacHeader: string | null) {
  // Store-managed webhooks use their per-webhook signing secret, while
  // webhooks registered by this Shopify app use the app client secret. Both
  // are first-party Shopify deliveries and can reach this route.
  const secrets = [process.env.SHOPIFY_WEBHOOK_SECRET, process.env.SHOPIFY_CLIENT_SECRET].filter(Boolean) as string[];
  if (!secrets.length) return true;
  if (!hmacHeader) return false;

  const received = Buffer.from(hmacHeader, "utf8");
  return secrets.some((secret) => {
    const expected = Buffer.from(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"), "utf8");
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}

function looksLikePersonalizedPlushie(order: Record<string, unknown>) {
  const lineItems = order.lineItems ?? order.line_items ?? "";
  return /meaningful plushie|build your meaningful plushie|plushie/i.test(JSON.stringify(lineItems));
}

function appliedDiscountCodes(order: Record<string, unknown>) {
  const discountApplications = order.discountApplications;
  const nodes = discountApplications && typeof discountApplications === "object" && "nodes" in discountApplications
    ? (discountApplications as { nodes?: unknown[] }).nodes
    : [];
  return (Array.isArray(nodes) ? nodes : [])
    .map((node) => node && typeof node === "object" && "code" in node ? textValue((node as { code?: unknown }).code) : "")
    .filter(Boolean);
}

function certificateFieldsForLineItem(lineItem: Record<string, unknown>, uploadLiftFormData: string) {
  const line = shopifyLinePersonalization(lineItem);
  const metafield = uploadLiftCertificateFields(uploadLiftFormData);
  return {
    ...metafield,
    idName: line.plushName || metafield.idName,
    gender: line.gender || metafield.gender,
    bornOn: line.bornOn || metafield.bornOn,
    birthplace: line.birthplace || metafield.birthplace,
    favouritePerson: line.favouritePerson || metafield.favouritePerson,
    belongsTo: line.belongsTo || metafield.belongsTo,
    meaningfulNote: line.meaningfulNote || metafield.meaningfulNote,
    meaningfulMessage: line.meaningfulMessage || metafield.meaningfulMessage,
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!verifyShopifyHmac(rawBody, request.headers.get("x-shopify-hmac-sha256"))) {
    return json(401, { ok: false, error: "Invalid Shopify webhook signature." });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return json(400, { ok: false, error: "Invalid Shopify webhook JSON." });
  }

  try {
    // Meaningful Fulfilment saves its own session ID on the line item. It does
    // not need Upload Lift's delayed metafield, so avoid the 32-second retry.
    const payloadSessionIds = customisationSessionIds(payload);
    const fullOrder = payloadSessionIds.length
      ? await fetchShopifyOrder(payload, request)
      : await fetchShopifyOrderWithMetafieldRetry(payload, request);
    const uploadLiftFormData = shopifyMetafieldValue(fullOrder) || shopifyMetafieldValue(payload);
    const deferredSessionIds = [...new Set([...payloadSessionIds, ...customisationSessionIds(fullOrder)])];
    const submittedCustomisations = await submittedCustomisationsForSessionIds(deferredSessionIds);
    const existing = await fetchSharedOrders();
    const importedOrders = shopifyOrderToFulfilmentOrders(fullOrder, uploadLiftFormData, existing, "Shopify");
    const syncedNumber = cleanShopifyOrderNumber(
      textValue(fullOrder.name)
      || textValue(fullOrder.order_number)
      || textValue(payload.name)
      || textValue(payload.order_number),
    );
    let ordersToSave = importedOrders.filter((order) => order.orderNumber === syncedNumber);
    const orderId = textValue(fullOrder.id) || textValue(payload.admin_graphql_api_id) || textValue(payload.id);
    const orderLineItems = Array.isArray(fullOrder.lineItems) ? fullOrder.lineItems : [];
    // The storefront saves this same form data as Shopify line-item properties.
    // Read those first: they arrive with the webhook and do not depend on a
    // separate session lookup or delayed order metafield.
    const certificateFieldsByLine = ordersToSave.map((_, index) => certificateFieldsForLineItem(
      objectValue(orderLineItems[index] ?? orderLineItems[0]),
      uploadLiftFormData,
    ));
    ordersToSave = ordersToSave.map((order, index) => {
      const certificateFields = certificateFieldsByLine[index] ?? {};
      return {
        ...order,
        plushName: certificateFields.idName || order.plushName,
        plushGender: certificateFields.gender || order.plushGender,
        plushBirthDate: certificateFields.bornOn || order.plushBirthDate,
        plushBirthPlace: certificateFields.birthplace || order.plushBirthPlace,
        plushFavouritePerson: certificateFields.favouritePerson || order.plushFavouritePerson,
        plushBelongsTo: certificateFields.belongsTo || order.plushBelongsTo,
        meaningfulNote: certificateFields.meaningfulNote || order.meaningfulNote,
        meaningfulMessage: certificateFields.meaningfulMessage || order.meaningfulMessage,
        voiceUploadStatus: certificateFields.meaningfulMessage ? "received" : order.voiceUploadStatus,
      };
    });
    const createdAt = textValue(fullOrder.createdAt) || new Date().toISOString();
    const existingCertificate = looksLikePersonalizedPlushie(fullOrder)
      ? await certificateMetaobjectForOrder(syncedNumber).catch(() => null)
      : null;
    const certificates = looksLikePersonalizedPlushie(fullOrder) && ordersToSave.length
      ? await Promise.all(ordersToSave.map((order, index) => {
        const lineItem = objectValue(orderLineItems[index]);
        const lineItemTitle = textValue(lineItem.title);
        const lineItemVariantTitle = textValue(lineItem.variantTitle);
        const certificateFields = certificateFieldsByLine[index] ?? {};
        // Shopify's order payload can omit the character from the title. The
        // saved fulfilment order retains it, so include that as a matching hint
        // to keep the certificate picture aligned with the selected plushie.
        const characterHint = order.character || order.product;
        const sessionId = deferredSessionIds[index] || deferredSessionIds[0];
        const submitted = submittedCustomisations.get(sessionId);
        return createCertificateMetaobject({
          orderNumber: syncedNumber,
          createdAt,
          // A fixed code makes concurrent webhook retries upsert this same
          // entry instead of creating duplicate certificates.
          code: order.certificateCode || existingCertificate?.code || flowCertificateCode(syncedNumber, createdAt, textValue(lineItem.id) || String(index + 1)),
          plushDetails: lineItemTitle || lineItemVariantTitle || characterHint,
          certificate: certificateMediaForLineItem(`${lineItemTitle} ${characterHint}`, `${lineItemVariantTitle} ${characterHint}`),
          // The importer can already have the note even when Shopify's line
          // properties or the session lookup are delayed. Use that same final
          // fallback here, otherwise the certificate gets its note but no
          // matching bottom background (as happened for order #1609).
          plushBackgroundBottom: plushBackgroundForMeaningfulNote(submitted?.form.meaningfulNote || certificateFields.meaningfulNote || order.meaningfulNote || ""),
          ...certificateFields,
          // The importer has already normalized the line-item properties into
          // the fulfilment order. Keep it as the final fallback so certificate
          // creation cannot lose fields when Shopify returns an incomplete
          // custom-attribute shape on a webhook retry.
          idName: submitted?.form.plushName || certificateFields.idName || order.plushName,
          gender: submitted?.form.gender || certificateFields.gender || order.plushGender,
          bornOn: submitted?.form.birthDate || certificateFields.bornOn || order.plushBirthDate,
          birthplace: submitted?.form.birthPlace || certificateFields.birthplace || order.plushBirthPlace,
          favouritePerson: submitted?.form.favouritePerson || certificateFields.favouritePerson || order.plushFavouritePerson,
          belongsTo: submitted?.form.belongsTo || certificateFields.belongsTo || order.plushBelongsTo,
          meaningfulNote: submitted?.form.meaningfulNote || certificateFields.meaningfulNote || order.meaningfulNote,
          meaningfulMessage: submitted?.voiceStoragePath ? `supabase-storage:${submitted.voiceStoragePath}` : certificateFields.meaningfulMessage || order.meaningfulMessage,
        });
      }))
      : [];
    if (certificates.some(Boolean)) {
      ordersToSave = ordersToSave.map((order, index) => {
        const certificate = certificates[index];
        return certificate ? {
          ...order,
          certificateCode: certificate.code,
          idWebsiteLink: `https://meaningfulplushies.com/pages/certificate/${certificate.code}`,
        } : order;
      });
    }
    if (deferredSessionIds.length && ordersToSave.length) {
      ordersToSave = await bindSessionsToOrders({
        orderId,
        orderNumber: syncedNumber,
        sessionIds: deferredSessionIds,
        orders: ordersToSave,
        certificates,
      });
    }

    await upsertSharedOrders(ordersToSave);
    for (const code of appliedDiscountCodes(fullOrder)) {
      await markManualOrderUsedByDiscountCode(
        code,
        textValue(fullOrder.id) || textValue(payload.admin_graphql_api_id),
        textValue(fullOrder.name) || textValue(payload.name),
      );
    }
    await syncCreatorCommissions();
    try {
      const metaSettings = await fetchMetaCapiSettings();
      if (ordersToSave.length) {
        await sendMetaPurchaseEvents({
          orders: ordersToSave,
          shopifyOrder: fullOrder,
          settings: metaSettings,
          source: "shopify_webhook",
          request,
        });
      }
    } catch (error) {
      console.error("Meta CAPI purchase event failed after Shopify webhook import", error);
    }
    await insertSharedActivity({
      id: `shopify-order-${Date.now()}`,
      orderNumber: ordersToSave[0]?.orderNumber,
      action: "Shopify order imported",
      detail: `${ordersToSave.length} fulfilment order${ordersToSave.length === 1 ? "" : "s"} saved from Shopify order-created webhook.`,
      actor: "Shopify",
      createdAt: new Date().toISOString(),
    });

    return json(200, { ok: true, saved: ordersToSave.length });
  } catch (error) {
    console.error("Shopify order webhook failed", error);
    return json(500, {
      ok: false,
      error: error instanceof Error ? error.message : "Shopify order could not be saved.",
    });
  }
}

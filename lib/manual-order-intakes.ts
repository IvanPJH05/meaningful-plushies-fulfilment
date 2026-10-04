import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createCompleteNowSession, createVoiceUpload, saveSubmittedSession, submittedCustomisationsForSessionIds, type CustomisationForm } from "./customisation";
import { shopifyOrderToFulfilmentOrders } from "./importer";
import { notifyNewManualOrder } from "./mobile-push-notifications";
import { shopifyManualOrderCustomerName } from "./manual-order-customer-name";
import { manualOrderProductByKey } from "./manual-order-products";
import { manualOrderIntakeQuote as quoteManualOrderIntake } from "./manual-order-intake-pricing";
import { normalizeManualOrderPhone, shopifyManualOrderPhone } from "./manual-order-phone";
import { manualOrderSpeakerSeconds, normalizeManualOrderCharacter } from "./manual-order-product-paths";
import { cleanShopifyOrderNumber, fetchShopifyOrderByNumber, shopDomain, shopifyGraphql, shopifyRest, textValue } from "./shopify-orders";
import { fetchSharedOrdersByOrderNumber, saveManualOrder, upsertSharedOrders } from "./supabase";
import type { ManualOrder, Order } from "./types";

const TABLE = "manual_order_intakes";
const COD_PAYMENT_MARKER = "manual-order://cash-on-delivery";

export type PaymentReceipt = { fileName: string; url: string };
export type ShippingAddress = {
  address1: string;
  address2?: string;
  city: string;
  province: string;
  zip: string;
  countryCode: string;
};

export type ManualOrderIntake = {
  id: string;
  customerName: string;
  customerEmail: string;
  phoneOriginal: string;
  phoneNormalized: string;
  character: string;
  productKey: string;
  productDisplayName: string;
  shopifyVariantId: string;
  shippingRegion: "WEST" | "EAST";
  shippingAddress: ShippingAddress;
  customisationSessionId: string;
  paymentReceipts: PaymentReceipt[];
  isCod: boolean;
  status: "awaiting_payment" | "ready_to_create" | "created" | "cancelled";
  shopifyOrderId: string;
  shopifyOrderName: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string;
  paymentApprovedAt: string;
  createdByOrderAt: string;
};

export type ManualOrderIntakeDetails = {
  intake: ManualOrderIntake;
  form: CustomisationForm | null;
  voiceUrl: string;
  voiceFileName: string;
};

export type ManualOrderIntakeApproval = ManualOrderIntake & {
  speakerSeconds: number;
  amountToCollect: number | null;
};

export type ManualOrderIntakeSubmission = {
  customerName: string;
  customerEmail: string;
  phone: string;
  character: string;
  productKey: string;
  shippingRegion: "WEST" | "EAST";
  shippingAddress: ShippingAddress;
  form: CustomisationForm;
  sessionToken: string;
  voiceStoragePath: string;
};

export function manualOrderIntakeReference(id: string) {
  return `MP-${id.toUpperCase()}`;
}

function collectionWhatsAppUrl(reference: string) {
  const recipient = (process.env.MANUAL_ORDER_COLLECTION_WHATSAPP || "").replace(/\D/g, "");
  if (!recipient) return "";
  return `https://wa.me/${recipient}?text=${encodeURIComponent(`I have completed my customisation for ${reference}`)}`;
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Manual Order Collection.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function validAddress(value: ShippingAddress): ShippingAddress {
  const address: ShippingAddress = {
    address1: clean(value.address1, 160),
    address2: clean(value.address2, 160),
    city: clean(value.city, 80),
    province: clean(value.province, 80),
    zip: clean(value.zip, 20),
    countryCode: clean(value.countryCode, 2).toUpperCase() || "MY",
  };
  if (!address.address1 || !address.city || !address.province || !address.zip || address.countryCode !== "MY") {
    throw new Error("Please enter the full Malaysian delivery address.");
  }
  return address;
}

function rowToIntake(row: Record<string, unknown>): ManualOrderIntake {
  const address = (row.shipping_address && typeof row.shipping_address === "object" ? row.shipping_address : {}) as ShippingAddress;
  const paymentReceipts = Array.isArray(row.payment_receipts) ? row.payment_receipts as PaymentReceipt[] : [];
  return {
    id: String(row.id || ""),
    customerName: String(row.customer_name || ""),
    customerEmail: String(row.customer_email || ""),
    phoneOriginal: String(row.phone_original || ""),
    phoneNormalized: String(row.phone_normalized || ""),
    character: String(row.character || ""),
    productKey: String(row.product_key || ""),
    productDisplayName: String(row.product_display_name || ""),
    shopifyVariantId: String(row.shopify_variant_id || ""),
    shippingRegion: row.shipping_region === "EAST" ? "EAST" : "WEST",
    shippingAddress: validAddress(address),
    customisationSessionId: String(row.customisation_session_id || ""),
    paymentReceipts,
    isCod: paymentReceipts.some((receipt) => receipt.url === COD_PAYMENT_MARKER),
    status: ["awaiting_payment", "ready_to_create", "created", "cancelled"].includes(String(row.status)) ? String(row.status) as ManualOrderIntake["status"] : "awaiting_payment",
    shopifyOrderId: String(row.shopify_order_id || ""),
    shopifyOrderName: String(row.shopify_order_name || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    paidAt: String(row.paid_at || ""),
    paymentApprovedAt: String(row.payment_approved_at || row.paid_at || ""),
    createdByOrderAt: String(row.created_by_order_at || ""),
  };
}

function knownVariantId(character: string, seconds: number) {
  const variants: Record<string, Record<number, string>> = {
    billy: { 5: "42426495959111", 10: "42426495991879", 20: "42426496024647" },
    hunnie: { 5: "42426496090183", 10: "42426496122951", 20: "42426496155719" },
    tootsie: { 5: "42426496221255", 10: "42426496254023", 20: "42426496286791" },
    "dragon warrior": { 5: "42426496352327", 10: "42426496385095", 20: "42426496417863" },
  };
  return variants[character.toLowerCase()]?.[seconds] || "";
}

function asVariantGid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`;
}

function currentVariantIdForIntake(intake: ManualOrderIntake) {
  const product = manualOrderProductByKey(intake.productKey);
  const character = normalizeManualOrderCharacter(intake.character);
  const seconds = Number(product ? manualOrderSpeakerSeconds(product) : 0);
  const currentVariant = character && seconds ? knownVariantId(character, seconds) : "";
  return currentVariant ? asVariantGid(currentVariant) : intake.shopifyVariantId;
}

function intakeConfiguredSpeakerSeconds(intake: Pick<ManualOrderIntake, "productKey" | "productDisplayName">) {
  const configuredProduct = manualOrderProductByKey(intake.productKey);
  const configuredSeconds = Number(configuredProduct ? manualOrderSpeakerSeconds(configuredProduct) : 0);
  if (configuredSeconds) return configuredSeconds;
  return 0;
}

export function manualOrderIntakeQuote(intake: Pick<ManualOrderIntake, "productKey" | "productDisplayName" | "shippingRegion">, storeVariantPrice?: number) {
  return quoteManualOrderIntake(intake, intakeConfiguredSpeakerSeconds(intake), storeVariantPrice);
}

function voiceDownloadUrl(path: string) {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://meaningful-plushies-fulfilment.vercel.app").replace(/\/$/, "");
  const fileName = path.split("/").at(-1) || "meaningful-plushie-voice";
  return `${appUrl}/api/customisation/audio-download?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(fileName)}`;
}

function intakeAddress(intake: ManualOrderIntake) {
  return [
    intake.shippingAddress.address1,
    intake.shippingAddress.address2,
    intake.shippingAddress.city,
    intake.shippingAddress.province,
    intake.shippingAddress.zip,
    "Malaysia",
  ].filter(Boolean).join(", ");
}

function fallbackFulfilmentOrderForIntake(
  intake: ManualOrderIntake,
  form: CustomisationForm,
  voiceStoragePath: string,
  createdAt: string,
): Order | null {
  const orderNumber = cleanShopifyOrderNumber(intake.shopifyOrderName || intake.shopifyOrderId);
  if (!orderNumber) return null;
  const quote = manualOrderIntakeQuote(intake);
  const basePrice = Math.max(0, (quote.amountToCollect ?? 0) - quote.shippingFee);
  const total = quote.amountToCollect ?? 0;
  return {
    id: orderNumber,
    orderNumber,
    salesChannel: "shopify",
    orderDate: createdAt,
    customerName: intake.customerName,
    phone: intake.phoneOriginal,
    email: intake.customerEmail,
    address: intakeAddress(intake),
    currency: "MYR",
    subtotalAmount: basePrice,
    shippingAmount: quote.shippingFee,
    totalAmount: total,
    discountAmount: 0,
    productDiscountAmount: 0,
    shippingDiscountAmount: 0,
    refundedAmount: 0,
    outstandingBalance: intake.isCod ? total : 0,
    paymentProcessor: intake.isCod ? "Cash on Delivery" : "Bank Transfer",
    discountCodes: [],
    discountCodeUsed: "",
    creatorFreeOrder: false,
    shippingMethod: intake.shippingRegion === "EAST" ? "East Malaysia delivery" : "Standard delivery",
    product: intake.productDisplayName,
    productType: "classic_plushie",
    character: normalizeManualOrderCharacter(intake.character) || intake.character,
    setIndicator: "",
    idWebsiteLink: "",
    voiceLength: quote.speakerSeconds,
    plushName: form.plushName,
    plushGender: form.gender,
    plushBirthDate: form.birthDate,
    plushBirthPlace: form.birthPlace,
    plushFavouritePerson: form.favouritePerson,
    plushBelongsTo: form.belongsTo,
    certificateCode: "",
    meaningfulNote: form.meaningfulNote,
    meaningfulMessage: voiceDownloadUrl(voiceStoragePath),
    remark: intake.isCod
      ? "Created from Manual Order Collection as Cash on Delivery."
      : "Created from Manual Order Collection after payment receipt was verified.",
    voiceUploadStatus: voiceStoragePath ? "received" : "missing",
    courier: "",
    trackingNumber: "",
    status: "new_order",
    internalNotes: "",
    statusHistory: [{
      id: `${orderNumber}-${createdAt}`,
      status: "new_order",
      changedAt: createdAt,
      changedBy: "Manual Order Collection",
      note: "Created directly from the verified WhatsApp order.",
    }],
    importedAt: createdAt,
    updatedAt: createdAt,
  };
}

/**
 * Manual collection orders are created through Shopify's Admin API. Shopify
 * does not guarantee that an app receives its own order-created webhook, so
 * write the fulfilment row here as part of the same completed-order flow.
 * The webhook can still arrive later and safely enrich this record.
 */
async function saveManualIntakeToFulfilment(
  intake: ManualOrderIntake,
  form: CustomisationForm,
  voiceStoragePath: string,
  createdAt: string,
) {
  const orderNumber = cleanShopifyOrderNumber(intake.shopifyOrderName || intake.shopifyOrderId);
  if (!orderNumber) throw new Error("Shopify did not provide an order number for fulfilment.");

  const existing = await fetchSharedOrdersByOrderNumber(orderNumber);
  const shopifyOrder = await fetchShopifyOrderByNumber(orderNumber);
  const imported = shopifyOrder
    ? shopifyOrderToFulfilmentOrders(shopifyOrder, "", existing, "Manual Order Collection")
      .filter((order) => order.orderNumber === orderNumber)
    : [];
  const fallback = fallbackFulfilmentOrderForIntake(intake, form, voiceStoragePath, createdAt);
  const sourceOrders = imported.length ? imported : fallback ? [fallback] : [];
  if (!sourceOrders.length) throw new Error("The created Shopify order could not be prepared for fulfilment.");

  const enriched = sourceOrders.map((order) => ({
    ...order,
    customerName: intake.customerName || order.customerName,
    phone: intake.phoneOriginal || order.phone,
    email: intake.customerEmail || order.email,
    address: intakeAddress(intake) || order.address,
    character: normalizeManualOrderCharacter(intake.character) || order.character,
    voiceLength: manualOrderIntakeQuote(intake).speakerSeconds || order.voiceLength,
    plushName: form.plushName || order.plushName,
    plushGender: form.gender || order.plushGender,
    plushBirthDate: form.birthDate || order.plushBirthDate,
    plushBirthPlace: form.birthPlace || order.plushBirthPlace,
    plushFavouritePerson: form.favouritePerson || order.plushFavouritePerson,
    plushBelongsTo: form.belongsTo || order.plushBelongsTo,
    meaningfulNote: form.meaningfulNote || order.meaningfulNote,
    meaningfulMessage: voiceStoragePath ? voiceDownloadUrl(voiceStoragePath) : order.meaningfulMessage,
    voiceUploadStatus: voiceStoragePath ? "received" as const : order.voiceUploadStatus,
    paymentProcessor: intake.isCod ? "Cash on Delivery" : order.paymentProcessor || "Bank Transfer",
    remark: order.remark || (intake.isCod
      ? "Created from Manual Order Collection as Cash on Delivery."
      : "Created from Manual Order Collection after payment receipt was verified."),
    updatedAt: createdAt,
  }));
  await upsertSharedOrders(enriched);
  return enriched.length;
}

type ShopifyManualOrder = {
  id?: string;
  legacyResourceId?: string;
  name?: string;
  shippingAddress?: { address1?: string } | null;
  customAttributes?: Array<{ key?: string; value?: string }>;
};

type ShopifyCustomer = { id?: string };

function shopifyOrderId(order: ShopifyManualOrder) {
  return textValue(order.legacyResourceId) || textValue(order.id);
}

async function existingManualShopifyOrders(domain: string) {
  const result = await shopifyGraphql<{ data?: { orders?: { nodes?: ShopifyManualOrder[] } } }>(domain, `
    query RecentManualCollectionOrders {
      orders(first: 100, query: "tag:'Manual order'", sortKey: CREATED_AT, reverse: true) {
        nodes { id legacyResourceId name shippingAddress { address1 } customAttributes { key value } }
      }
    }
  `, {});
  return result?.data?.orders?.nodes || [];
}

function shopifyErrors(result: { errors?: Array<{ message?: string }> | undefined; data?: Record<string, unknown> | undefined }, userErrors: Array<{ message?: string }> | undefined) {
  return [
    ...(result.errors?.map((item) => item.message).filter(Boolean) || []),
    ...(userErrors?.map((item) => item.message).filter(Boolean) || []),
  ].join(" ");
}

function customerPhone(value: string) {
  return shopifyManualOrderPhone(value);
}

async function ensureShopifyCustomerAddress(domain: string, intake: ManualOrderIntake, address: Record<string, unknown>) {
  const lookup = await shopifyGraphql<{ data?: { customers?: { nodes?: ShopifyCustomer[] } }; errors?: Array<{ message?: string }> }>(domain, `
    query CollectionCustomerByEmail($query: String!) {
      customers(first: 1, query: $query) { nodes { id } }
    }
  `, { query: `email:${intake.customerEmail}` });
  const existing = lookup?.data?.customers?.nodes?.[0];
  if (existing?.id) {
    const addressResult = await shopifyGraphql<{ data?: { customerAddressCreate?: { address?: { id?: string }; userErrors?: Array<{ message?: string }> } }; errors?: Array<{ message?: string }> }>(domain, `
      mutation SaveCollectionCustomerAddress($customerId: ID!, $address: MailingAddressInput!) {
        customerAddressCreate(customerId: $customerId, address: $address, setAsDefault: true) {
          address { id }
          userErrors { message }
        }
      }
    `, { customerId: existing.id, address });
    const message = shopifyErrors(addressResult || {}, addressResult?.data?.customerAddressCreate?.userErrors);
    // Retrying an interrupted approval can encounter the address that the
    // earlier request already saved. It is safe to reuse that customer rather
    // than blocking the order because the same address cannot be added twice.
    const alreadySaved = /address.*(already|exist|taken)|(already|exist|taken).*address/i.test(message);
    if ((message && !alreadySaved) || (!message && !addressResult?.data?.customerAddressCreate?.address?.id)) throw new Error(`Shopify could not save the customer's shipping address. ${message}`.trim());
    return existing.id;
  }

  const customerName = shopifyManualOrderCustomerName(intake.customerName);
  const created = await shopifyGraphql<{ data?: { customerCreate?: { customer?: ShopifyCustomer; userErrors?: Array<{ message?: string }> } }; errors?: Array<{ message?: string }> }>(domain, `
    mutation CreateCollectionCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { message }
      }
    }
  `, {
    input: {
      firstName: customerName.firstName,
      lastName: customerName.lastName,
      email: intake.customerEmail,
      phone: customerPhone(intake.phoneOriginal),
      addresses: [address],
    },
  });
  const message = shopifyErrors(created || {}, created?.data?.customerCreate?.userErrors);
  const customerId = created?.data?.customerCreate?.customer?.id;
  if (message || !customerId) throw new Error(`Shopify could not create the customer. ${message}`.trim());
  return customerId;
}

function shopifyOrderForIntake(orders: ShopifyManualOrder[], intakeId: string) {
  return orders.find((order) => order.customAttributes?.some((attribute) => attribute.key === "manual_order_intake_id" && attribute.value === intakeId));
}

async function repairShopifyShippingAddress(domain: string, order: ShopifyManualOrder, address: Record<string, unknown>) {
  if (!order.id) return false;
  const graphql = await shopifyGraphql<{ data?: { orderUpdate?: { order?: { shippingAddress?: { address1?: string } | null }; userErrors?: Array<{ message?: string }> } } }>(domain, `
    mutation AddManualOrderShippingAddress($input: OrderInput!) {
      orderUpdate(input: $input) {
        order { shippingAddress { address1 } }
        userErrors { message }
      }
    }
  `, { input: { id: order.id, shippingAddress: address } });
  const graphqlErrors = shopifyErrors(graphql || {}, graphql?.data?.orderUpdate?.userErrors);
  if (graphqlErrors) throw new Error(`Shopify could not save this order's shipping address. ${graphqlErrors}`);
  if (graphql?.data?.orderUpdate?.order?.shippingAddress?.address1) return true;

  // Shopify's REST order update is deliberately a fallback only. It repairs
  // orders where the GraphQL create/update response has silently omitted the
  // delivery address, keeping those paid orders exportable to J&T.
  const legacyId = shopifyOrderId(order).replace(/^gid:\/\/shopify\/Order\//, "");
  if (!/^\d+$/.test(legacyId)) return false;
  const rest = await shopifyRest<{ order?: { shipping_address?: { address1?: string } | null } }>(domain, `/orders/${legacyId}.json`, "PUT", {
    order: {
      id: Number(legacyId),
      shipping_address: {
        first_name: address.firstName,
        last_name: address.lastName,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        province: address.province,
        zip: address.zip,
        country: "Malaysia",
        country_code: "MY",
        phone: address.phone,
      },
      billing_address: {
        first_name: address.firstName,
        last_name: address.lastName,
        address1: address.address1,
        address2: address.address2,
        city: address.city,
        province: address.province,
        zip: address.zip,
        country: "Malaysia",
        country_code: "MY",
        phone: address.phone,
      },
    },
  });
  if (rest?.order?.shipping_address?.address1) return true;
  throw new Error("Shopify did not confirm the shipping address. The order was kept ready to retry so its address cannot be lost.");
}

function shopifyAddressForIntake(intake: ManualOrderIntake) {
  // Re-validate the stored address at approval time. This happens before any
  // Shopify customer or order write, so an incomplete record stays in Manual
  // Orders until it is corrected instead of creating a partial Shopify order.
  const shippingAddress = validAddress(intake.shippingAddress);
  const customerName = shopifyManualOrderCustomerName(intake.customerName);
  return {
    firstName: customerName.firstName,
    lastName: customerName.lastName,
    address1: shippingAddress.address1,
    address2: shippingAddress.address2 || undefined,
    city: shippingAddress.city,
    province: shippingAddress.province,
    zip: shippingAddress.zip,
    country: "Malaysia",
    countryCode: "MY",
    phone: customerPhone(intake.phoneOriginal),
  };
}

async function markIntakeCreated(intake: ManualOrderIntake, order: ShopifyManualOrder) {
  const now = new Date().toISOString();
  const resolvedShopifyOrderId = shopifyOrderId(order);
  const shopifyOrderName = textValue(order.name);
  const { data, error } = await serviceClient().from(TABLE).update({ status: "created", shopify_order_id: resolvedShopifyOrderId, shopify_order_name: shopifyOrderName, created_by_order_at: now, updated_at: now }).eq("id", intake.id).eq("status", "ready_to_create").select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This order could not be moved to Paid orders. Refresh the page and try Finish creating order once more.");
  return { shopifyOrderId: resolvedShopifyOrderId, shopifyOrderName, now };
}

export async function startManualOrderIntake() {
  return createCompleteNowSession();
}

export async function prepareManualOrderIntakeVoiceUpload(token: string, fileName: string, contentType: string) {
  return createVoiceUpload(token, fileName, contentType);
}

export async function submitManualOrderIntake(input: ManualOrderIntakeSubmission) {
  const customerName = clean(input.customerName, 120);
  const email = clean(input.customerEmail, 254).toLowerCase();
  if (!customerName) throw new Error("Enter the customer name.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
  const character = normalizeManualOrderCharacter(input.character);
  const product = manualOrderProductByKey(input.productKey);
  const seconds = Number(product ? manualOrderSpeakerSeconds(product) : 0);
  const variant = character && seconds ? knownVariantId(character, seconds) : "";
  if (!product || !character || !variant) throw new Error("Choose a valid plushie and voice length.");
  const phone = normalizeManualOrderPhone(input.phone);
  const address = validAddress(input.shippingAddress);
  await saveSubmittedSession(input.sessionToken, input.form, input.voiceStoragePath);

  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from(TABLE).insert({
    id: randomUUID(), customer_name: customerName, customer_email: email,
    phone_original: clean(input.phone, 40), phone_normalized: phone.normalized,
    character, product_key: product.key, product_display_name: `${character} - ${product.displayName}`,
    shopify_variant_id: asVariantGid(variant), shipping_region: input.shippingRegion === "EAST" ? "EAST" : "WEST",
    shipping_address: address, customisation_session_id: input.voiceStoragePath.split("/")[0], payment_receipts: [], status: "awaiting_payment",
    created_at: now, updated_at: now,
  }).select("*").single();
  if (error || !data) throw new Error(error?.message || "Your details could not be saved.");
  const intake = rowToIntake(data as Record<string, unknown>);
  await notifyNewManualOrder({ id: intake.id, reference: manualOrderIntakeReference(intake.id), product: intake.productDisplayName });
  return { ...intake, reference: manualOrderIntakeReference(intake.id), whatsAppUrl: collectionWhatsAppUrl(manualOrderIntakeReference(intake.id)) };
}

export async function listManualOrderIntakes() {
  const { data, error } = await serviceClient().from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // Loading the private Supabase records must never depend on Shopify. In
  // particular, customer permission changes must not make the list appear
  // empty even though every submission remains safely stored in Supabase.
  return (data || []).map((row) => rowToIntake(row as Record<string, unknown>));
}

/** Compact data for the approval queue. It deliberately excludes transaction
 * history and uploaded media, so opening Manual Orders on a phone stays fast. */
export async function listManualOrderIntakeApprovals(): Promise<ManualOrderIntakeApproval[]> {
  const { data, error } = await serviceClient().from(TABLE).select("*").eq("status", "awaiting_payment").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const intakes = (data || []).map((row) => rowToIntake(row as Record<string, unknown>));
  const variants = [...new Set(intakes.map(currentVariantIdForIntake).filter(Boolean))];
  const prices = new Map<string, number>();
  if (variants.length) {
    try {
      const domain = shopDomain();
      if (domain) {
        const result = await shopifyGraphql<{ data?: { nodes?: Array<{ id?: string; price?: string }> } }>(domain, `
          query ManualOrderVariantPrices($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id price } } }
        `, { ids: variants });
        for (const variant of result?.data?.nodes ?? []) {
          const price = Number(variant.price);
          if (variant.id && Number.isFinite(price)) prices.set(variant.id, price);
        }
      }
    } catch { /* The queue must remain usable if Shopify price lookup is briefly unavailable. */ }
  }
  return intakes.map((intake) => {
    const price = prices.get(currentVariantIdForIntake(intake));
    const quote = manualOrderIntakeQuote(intake, price);
    return { ...intake, speakerSeconds: quote.speakerSeconds, amountToCollect: quote.amountToCollect };
  });
}

export async function getManualOrderIntakeDetails(id: string): Promise<ManualOrderIntakeDetails> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Choose a valid Manual Order submission.");
  const { data, error } = await serviceClient().from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This Manual Order submission could not be found.");

  const intake = rowToIntake(data as Record<string, unknown>);
  const submitted = await submittedCustomisationsForSessionIds([intake.customisationSessionId]);
  const customisation = submitted.get(intake.customisationSessionId);
  const voiceStoragePath = customisation?.voiceStoragePath || "";
  return {
    intake,
    form: customisation?.form || null,
    voiceUrl: voiceStoragePath ? voiceDownloadUrl(voiceStoragePath) : "",
    voiceFileName: voiceStoragePath.split("/").at(-1) || "",
  };
}

export async function deleteManualOrderIntake(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Choose a valid Manual Order submission.");

  // This intentionally removes only the internal Manual Orders records. The
  // linked Shopify order, customer, fulfilment records, and uploaded files are
  // never changed by this workspace clean-up action.
  const linkedManualOrder = await serviceClient().from("manual_orders").delete().eq("id", `collection-${id}`);
  if (linkedManualOrder.error) throw new Error(linkedManualOrder.error.message);

  const { data, error } = await serviceClient().from(TABLE).delete().eq("id", id).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This Manual Order submission was not found or was already removed.");
}

export async function attachManualOrderReceipt(id: string, receipts: PaymentReceipt[]) {
  if (!id || !receipts.length) throw new Error("Attach at least one payment receipt.");
  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from(TABLE).update({
    payment_receipts: receipts,
    status: "ready_to_create",
    paid_at: now,
    updated_at: now,
  }).eq("id", id).eq("status", "awaiting_payment").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This submission is no longer waiting for payment.");
  return rowToIntake(data as Record<string, unknown>);
}

export async function approveManualOrderCod(id: string) {
  if (!id) throw new Error("Choose a Manual Order submission first.");
  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from(TABLE).update({
    payment_receipts: [{ fileName: "Cash on delivery", url: COD_PAYMENT_MARKER }],
    status: "ready_to_create", paid_at: now, updated_at: now,
  }).eq("id", id).eq("status", "awaiting_payment").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This submission is no longer waiting for approval.");
  return rowToIntake(data as Record<string, unknown>);
}

export async function createPaidShopifyOrder(intakeId: string) {
  const { data, error } = await serviceClient().from(TABLE).select("*").eq("id", intakeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Manual order submission not found.");
  const intake = rowToIntake(data as Record<string, unknown>);
  if (intake.status !== "ready_to_create" || (!intake.isCod && !intake.paymentReceipts.length)) throw new Error("Attach the payment receipt or approve this order as COD before creating the Shopify order.");
  const domain = shopDomain();
  if (!domain) throw new Error("SHOPIFY_SHOP_DOMAIN is missing in Vercel.");
  const shippingCost = intake.shippingRegion === "EAST" ? "20.00" : "0.00";
  // The customer completed this before paying. Copy the complete record to the
  // Shopify line item now instead of relying only on the later webhook. This
  // keeps the birth certificate and voice visible to Shopify and available to
  // the fulfilment importer from the moment the paid order exists.
  const submitted = await submittedCustomisationsForSessionIds([intake.customisationSessionId]);
  const customisation = submitted.get(intake.customisationSessionId);
  if (!customisation) throw new Error("The saved customisation for this collection submission could not be found.");
  const form = customisation.form;
  const shopifyAddress = shopifyAddressForIntake(intake);
  const shopifyVariantId = currentVariantIdForIntake(intake);
  if (!shopifyVariantId) throw new Error("The selected plushie product is not available in Shopify. This order has not been created.");
  if (shopifyVariantId !== intake.shopifyVariantId) {
    await serviceClient().from(TABLE).update({ shopify_variant_id: shopifyVariantId, updated_at: new Date().toISOString() }).eq("id", intake.id);
  }
  const lineItemProperties = [
    { name: "customisation_session_id", value: intake.customisationSessionId },
    { name: "Name", value: form.plushName },
    { name: "Gender", value: form.gender },
    { name: "Born On", value: form.birthDate },
    { name: "Birthplace", value: form.birthPlace },
    { name: "Favourite Person", value: form.favouritePerson },
    { name: "Belongs To", value: form.belongsTo },
    { name: "Meaningful Note", value: form.meaningfulNote },
    { name: "Meaningful Message", value: voiceDownloadUrl(customisation.voiceStoragePath) },
  ];
  // Shopify needs a real customer with a saved default address before this
  // manual paid order is made. Without that sequence it can create the order
  // and shipping line but leave "No shipping address provided" in Admin.
  const customerId = await ensureShopifyCustomerAddress(domain, intake, shopifyAddress);
  // A previous request may have created the Shopify order successfully and
  // then stopped while saving its address. Find it by its intake reference
  // first so retrying can never charge/create a duplicate order.
  const existing = shopifyOrderForIntake(await existingManualShopifyOrders(domain), intake.id);
  let order: ShopifyManualOrder | undefined = existing;
  if (!order) {
    const result = await shopifyGraphql<{ data?: { orderCreate?: { order?: ShopifyManualOrder; userErrors?: Array<{ message?: string }> } }; errors?: Array<{ message?: string }> }>(domain, `
    mutation CreatePaidManualOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id legacyResourceId name shippingAddress { address1 } }
        userErrors { message }
      }
    }
  `, {
    order: {
      email: intake.customerEmail || undefined,
      phone: customerPhone(intake.phoneOriginal),
      customer: { toAssociate: { id: customerId } },
      financialStatus: intake.isCod ? "PENDING" : "PAID",
      tags: intake.isCod ? ["Manual order", "WhatsApp", "COD"] : ["Manual order", "WhatsApp", "Receipt verified"],
      note: intake.isCod ? "Created from Manual Order Collection as Cash on Delivery." : "Created from Manual Order Collection after payment receipt was verified.",
      customAttributes: [
        { key: "manual_order_intake_id", value: intake.id },
        { key: "payment_type", value: intake.isCod ? "COD" : "Receipt verified" },
        { key: "payment_receipt", value: intake.isCod ? "Cash on Delivery" : intake.paymentReceipts.map((item) => item.url).join("\n") },
      ],
      shippingAddress: shopifyAddress,
      billingAddress: shopifyAddress,
      lineItems: [{ variantId: shopifyVariantId, quantity: 1, requiresShipping: true, properties: lineItemProperties }],
      shippingLines: [{ title: intake.shippingRegion === "EAST" ? "East Malaysia delivery" : "Standard delivery", priceSet: { shopMoney: { amount: shippingCost, currencyCode: "MYR" } } }],
    },
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  });
    const topErrors = result?.errors?.map((item) => item.message).filter(Boolean) || [];
    const userErrors = result?.data?.orderCreate?.userErrors?.map((item) => item.message).filter(Boolean) || [];
    if (topErrors.length || userErrors.length) throw new Error([...topErrors, ...userErrors].join(" "));
    order = result?.data?.orderCreate?.order;
    if (!order?.id) throw new Error("Shopify did not return the new order.");
  }

  // Always make the follow-up write. The REST fallback covers the Shopify
  // behaviour seen in these collection orders where the shipping line saves
  // but the address itself does not.
  const shippingAddressSaved = await repairShopifyShippingAddress(domain, order, shopifyAddress);
  if (!shippingAddressSaved) throw new Error("Shopify did not confirm the shipping address. This order is still ready to retry.");
  const marked = await markIntakeCreated(intake, order);
  const shopifyOrderId = marked.shopifyOrderId;
  const shopifyOrderName = marked.shopifyOrderName;
  const now = marked.now;
  // The familiar Manual Order marker drives your existing WhatsApp labels,
  // packing-slip source, and sales reporting. This record intentionally has
  // no discount because the customer paid before the Shopify order was made.
  const linkedManualOrder: ManualOrder = {
    id: `collection-${intake.id}`, customerName: intake.customerName, phoneOriginal: intake.phoneOriginal,
    phoneNormalized: intake.phoneNormalized, phoneLastFour: intake.phoneNormalized.slice(-4), productKey: intake.productKey,
    productDisplayName: intake.productDisplayName, shopifyProductId: "", shopifyVariantId: intake.shopifyVariantId,
    productPath: "", shippingRegion: intake.shippingRegion, productDiscountCode: `INTAKE-${intake.id}`,
    productDiscountShopifyId: "", shippingDiscountCode: "", shippingDiscountShopifyId: "", customerLink: "",
    status: "used", isCod: intake.isCod, shopifyOrderId, shopifyOrderName, createdAt: intake.createdAt, updatedAt: now, usedAt: now,
    paymentReceipts: intake.paymentReceipts,
  };
  // The order and its Paid status are already safely stored before this
  // dashboard marker is written. Use the service connection here too; a
  // marker failure must never tell staff that a completed Shopify order failed.
  try {
    await saveManualOrder(linkedManualOrder, serviceClient());
  } catch (error) {
    console.error("Manual Order dashboard marker could not be saved after Shopify order creation", {
      intakeId: intake.id,
      shopifyOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  let fulfilmentRowsSaved = 0;
  try {
    fulfilmentRowsSaved = await saveManualIntakeToFulfilment(intake, form, customisation.voiceStoragePath, now);
  } catch (error) {
    // Shopify has already created the order, so preserve that successful state.
    // The restoration action can safely retry this small, idempotent upsert.
    console.error("Manual Order Collection fulfilment sync failed", {
      intakeId: intake.id,
      shopifyOrderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { shopifyOrderId, shopifyOrderName, fulfilmentRowsSaved };
}

/** Restore any historical WhatsApp collection orders that were created while
 * Shopify did not deliver its order-created webhook to this app. */
export async function restoreManualOrderFulfilment() {
  const { data, error } = await serviceClient()
    .from(TABLE)
    .select("*")
    .eq("status", "created")
    .order("created_by_order_at", { ascending: false });
  if (error) throw new Error(error.message);

  let restored = 0;
  let failed = 0;
  for (const row of data ?? []) {
    try {
      const intake = rowToIntake(row as Record<string, unknown>);
      const submitted = await submittedCustomisationsForSessionIds([intake.customisationSessionId]);
      const customisation = submitted.get(intake.customisationSessionId);
      if (!customisation) {
        failed += 1;
        continue;
      }
      restored += await saveManualIntakeToFulfilment(
        intake,
        customisation.form,
        customisation.voiceStoragePath,
        intake.createdByOrderAt || intake.updatedAt || new Date().toISOString(),
      );
    } catch (restoreError) {
      failed += 1;
      console.error("Historical Manual Order Collection fulfilment restore failed", restoreError);
    }
  }
  return { checked: (data ?? []).length, restored, failed };
}

export async function repairManualOrderShipping(intakeId: string) {
  const { data, error } = await serviceClient().from(TABLE).select("*").eq("id", intakeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Manual order submission not found.");
  const intake = rowToIntake(data as Record<string, unknown>);
  if (!intake.shopifyOrderId) throw new Error("This Manual Order has not reached Shopify yet.");
  const domain = shopDomain();
  if (!domain) throw new Error("SHOPIFY_SHOP_DOMAIN is missing in Vercel.");
  const existing = shopifyOrderForIntake(await existingManualShopifyOrders(domain), intake.id);
  if (!existing) throw new Error("The linked Shopify order could not be found.");
  await repairShopifyShippingAddress(domain, existing, shopifyAddressForIntake(intake));
  return { shopifyOrderId: shopifyOrderId(existing), shopifyOrderName: textValue(existing.name) };
}

export async function isDashboardAdmin(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data, error } = await serviceClient().rpc("dashboard_is_admin", { p_token: token });
  return !error && data === true;
}

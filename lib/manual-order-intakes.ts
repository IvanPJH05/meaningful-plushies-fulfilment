import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { createCompleteNowSession, createVoiceUpload, saveSubmittedSession, type CustomisationForm } from "./customisation";
import { manualOrderProductByKey } from "./manual-order-products";
import { normalizeManualOrderPhone } from "./manual-orders";
import { manualOrderSpeakerSeconds, normalizeManualOrderCharacter } from "./manual-order-product-paths";
import { shopDomain, shopifyGraphql, textValue } from "./shopify-orders";
import { saveManualOrder } from "./supabase";
import type { ManualOrder } from "./types";

const TABLE = "manual_order_intakes";

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
  status: "awaiting_payment" | "ready_to_create" | "created" | "cancelled";
  shopifyOrderId: string;
  shopifyOrderName: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string;
  createdByOrderAt: string;
};

export type ManualOrderIntakeSubmission = {
  customerName: string;
  customerEmail?: string;
  phone: string;
  character: string;
  productKey: string;
  shippingRegion: "WEST" | "EAST";
  shippingAddress: ShippingAddress;
  form: CustomisationForm;
  sessionToken: string;
  voiceStoragePath: string;
};

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
    paymentReceipts: Array.isArray(row.payment_receipts) ? row.payment_receipts as PaymentReceipt[] : [],
    status: ["awaiting_payment", "ready_to_create", "created", "cancelled"].includes(String(row.status)) ? String(row.status) as ManualOrderIntake["status"] : "awaiting_payment",
    shopifyOrderId: String(row.shopify_order_id || ""),
    shopifyOrderName: String(row.shopify_order_name || ""),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    paidAt: String(row.paid_at || ""),
    createdByOrderAt: String(row.created_by_order_at || ""),
  };
}

function knownVariantId(character: string, seconds: number) {
  const variants: Record<string, Record<number, string>> = {
    billy: { 5: "42426495959111", 10: "42426495991879", 20: "42426496024647" },
    hunnie: { 5: "42426496090183", 10: "42426496122951", 20: "42426496155719" },
    tootsie: { 5: "42426496221255", 10: "42426496254023", 20: "42426496286791" },
    "dragon warrior": { 5: "42426496352327", 10: "42426496385095", 20: "42426496386791" },
  };
  return variants[character.toLowerCase()]?.[seconds] || "";
}

function asVariantGid(id: string) {
  return id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`;
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
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
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
  return rowToIntake(data as Record<string, unknown>);
}

export async function listManualOrderIntakes() {
  const { data, error } = await serviceClient().from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => rowToIntake(row as Record<string, unknown>));
}

export async function attachManualOrderReceipt(id: string, receipts: PaymentReceipt[]) {
  if (!id || !receipts.length) throw new Error("Attach at least one payment receipt.");
  const now = new Date().toISOString();
  const { data, error } = await serviceClient().from(TABLE).update({ payment_receipts: receipts, status: "ready_to_create", paid_at: now, updated_at: now }).eq("id", id).eq("status", "awaiting_payment").select("*").maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This submission is no longer waiting for payment.");
  return rowToIntake(data as Record<string, unknown>);
}

export async function createPaidShopifyOrder(intakeId: string) {
  const { data, error } = await serviceClient().from(TABLE).select("*").eq("id", intakeId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Manual order submission not found.");
  const intake = rowToIntake(data as Record<string, unknown>);
  if (intake.status !== "ready_to_create" || !intake.paymentReceipts.length) throw new Error("Attach the payment receipt before creating the Shopify order.");
  const domain = shopDomain();
  if (!domain) throw new Error("SHOPIFY_SHOP_DOMAIN is missing in Vercel.");
  const [firstName, ...surname] = intake.customerName.split(/\s+/).filter(Boolean);
  const shippingCost = intake.shippingRegion === "EAST" ? "20.00" : "0.00";
  const result = await shopifyGraphql<{ data?: { orderCreate?: { order?: { id?: string; legacyResourceId?: string; name?: string }; userErrors?: Array<{ message?: string }> } }; errors?: Array<{ message?: string }> }>(domain, `
    mutation CreatePaidManualOrder($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
      orderCreate(order: $order, options: $options) {
        order { id legacyResourceId name }
        userErrors { message }
      }
    }
  `, {
    order: {
      email: intake.customerEmail || undefined,
      phone: intake.phoneOriginal,
      financialStatus: "PAID",
      tags: ["Manual order", "WhatsApp", "Receipt verified"],
      note: "Created from Manual Order Collection after payment receipt was verified.",
      customAttributes: [
        { key: "manual_order_intake_id", value: intake.id },
        { key: "payment_receipt", value: intake.paymentReceipts.map((item) => item.url).join("\n") },
      ],
      shippingAddress: {
        firstName: firstName || intake.customerName, lastName: surname.join(" "), address1: intake.shippingAddress.address1,
        address2: intake.shippingAddress.address2 || undefined, city: intake.shippingAddress.city, province: intake.shippingAddress.province,
        zip: intake.shippingAddress.zip, countryCode: "MY", phone: intake.phoneOriginal,
      },
      billingAddress: {
        firstName: firstName || intake.customerName, lastName: surname.join(" "), address1: intake.shippingAddress.address1,
        address2: intake.shippingAddress.address2 || undefined, city: intake.shippingAddress.city, province: intake.shippingAddress.province,
        zip: intake.shippingAddress.zip, countryCode: "MY", phone: intake.phoneOriginal,
      },
      lineItems: [{ variantId: intake.shopifyVariantId, quantity: 1, properties: [{ name: "customisation_session_id", value: intake.customisationSessionId }] }],
      shippingLines: shippingCost === "0.00" ? [] : [{ title: "East Malaysia delivery", priceSet: { shopMoney: { amount: shippingCost, currencyCode: "MYR" } } }],
    },
    options: { sendReceipt: false, sendFulfillmentReceipt: false },
  });
  const topErrors = result?.errors?.map((item) => item.message).filter(Boolean) || [];
  const userErrors = result?.data?.orderCreate?.userErrors?.map((item) => item.message).filter(Boolean) || [];
  if (topErrors.length || userErrors.length) throw new Error([...topErrors, ...userErrors].join(" "));
  const order = result?.data?.orderCreate?.order;
  if (!order?.id) throw new Error("Shopify did not return the new order.");
  const now = new Date().toISOString();
  const { error: updateError } = await serviceClient().from(TABLE).update({ status: "created", shopify_order_id: textValue(order.legacyResourceId) || textValue(order.id), shopify_order_name: textValue(order.name), created_by_order_at: now, updated_at: now }).eq("id", intake.id).eq("status", "ready_to_create");
  if (updateError) throw new Error(updateError.message);
  const shopifyOrderId = textValue(order.legacyResourceId) || textValue(order.id);
  const shopifyOrderName = textValue(order.name);
  // The familiar Manual Order marker drives your existing WhatsApp labels,
  // packing-slip source, and sales reporting. This record intentionally has
  // no discount because the customer paid before the Shopify order was made.
  const linkedManualOrder: ManualOrder = {
    id: `collection-${intake.id}`, customerName: intake.customerName, phoneOriginal: intake.phoneOriginal,
    phoneNormalized: intake.phoneNormalized, phoneLastFour: intake.phoneNormalized.slice(-4), productKey: intake.productKey,
    productDisplayName: intake.productDisplayName, shopifyProductId: "", shopifyVariantId: intake.shopifyVariantId,
    productPath: "", shippingRegion: intake.shippingRegion, isCod: false, productDiscountCode: `INTAKE-${intake.id}`,
    productDiscountShopifyId: "", shippingDiscountCode: "", shippingDiscountShopifyId: "", customerLink: "",
    status: "used", shopifyOrderId, shopifyOrderName, createdAt: intake.createdAt, updatedAt: now, usedAt: now,
    paymentReceipts: intake.paymentReceipts,
  };
  await saveManualOrder(linkedManualOrder);
  return { shopifyOrderId, shopifyOrderName };
}

export async function isDashboardAdmin(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const { data, error } = await serviceClient().rpc("dashboard_is_admin", { p_token: token });
  return !error && data === true;
}

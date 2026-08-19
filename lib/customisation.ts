import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { certificateMediaForLineItem, certificateMetaobjectForOrder, createCertificateMetaobject, plushBackgroundForMeaningfulNote, setShopifyOrderMetafield, shopDomain, shopifyGraphql, updateCertificateMetaobject } from "./shopify-orders";
import type { Order } from "./types";

const SESSION_TABLE = "customisation_sessions";
const AUDIO_BUCKET = "customisation-audio";
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://meaningful-plushies-fulfilment.vercel.app").replace(/\/$/, "");
const storefrontCustomisationUrl = process.env.CUSTOMISATION_STOREFRONT_URL || "https://meaningfulplushies.com/pages/birth-certificate-customization?view=customise-your-plushie";

/** The secure customisation page for each plushie and recorder option. */
const CUSTOMISATION_PAGE_PATHS: Record<string, Record<number, string>> = {
  billy: { 5: "billy-5s", 10: "billy-10s", 20: "billy-20s" },
  hunnie: { 5: "hunnie-5s", 10: "hunnie-10s", 20: "hunnie-20s" },
  tootsie: { 5: "tootsie-5s", 10: "tootsie-10s", 20: "tootsie-20s" },
  "dragon warrior": { 5: "dw-5s", 10: "dw-10s", 20: "dw-20s" },
};

export type CustomisationMode = "complete_now" | "fill_later";
export type DeliveryMethod = "email" | "whatsapp";

export type PendingCustomisation = {
  fulfilmentOrderId: string;
  deliveryMethod: DeliveryMethod;
  contact: string;
  linkSentAt: string | null;
  expiresAt: string | null;
};

export type CustomisationForm = {
  plushName: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  favouritePerson: string;
  belongsTo: string;
  meaningfulNote: string;
};

type SessionRow = {
  id: string;
  token_hash: string;
  token_cipher?: string | null;
  order_id: string | null;
  order_number: string | null;
  line_item_id: string | null;
  fulfilment_order_id?: string | null;
  certificate_code?: string | null;
  certificate_metaobject_id?: string | null;
  mode: CustomisationMode;
  delivery_method: DeliveryMethod | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "draft" | "pending_payment" | "awaiting_customisation" | "submitted" | "expired" | "cancelled";
  form_data: Partial<CustomisationForm> & { customisationPageUrl?: string };
  voice_storage_path: string | null;
  google_drive_file_id?: string | null;
  google_drive_file_name?: string | null;
  google_drive_backed_up_at?: string | null;
  link_sent_at: string | null;
  link_opened_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
};

const ORDER_SUMMARY_VIDEO_METAOBJECT_TYPE = process.env.SHOPIFY_ORDER_SUMMARY_VIDEO_METAOBJECT_TYPE || "order_summary";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for customisation sessions.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function encryptionKey() {
  const raw = process.env.CUSTOMISATION_TOKEN_ENCRYPTION_KEY || process.env.CRM_CREDENTIAL_ENCRYPTION_KEY || "";
  if (!raw) throw new Error("A protected encryption key is required for customisation sessions.");

  // The dedicated key is preferred. The existing fulfilment credential key is
  // a safe production fallback, with a context-specific derivation so the two
  // features never use the same AES key directly.
  if (process.env.CUSTOMISATION_TOKEN_ENCRYPTION_KEY) {
    const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("CUSTOMISATION_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex value.");
    return key;
  }

  return createHash("sha256").update(`meaningful-plushies-customisation-token:${raw}`).digest();
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(ciphertext: string) {
  const [ivText, tagText, dataText] = ciphertext.split(".");
  if (!ivText || !tagText || !dataText) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

function requiredText(value: unknown, max?: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return max ? text.slice(0, max) : text;
}

function customerCustomisationLink(token: string, pageUrl?: string) {
  const url = new URL(pageUrl || storefrontCustomisationUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function customisationPageForOrder(order: Pick<Order, "character" | "voiceLength">) {
  const character = order.character.trim().toLowerCase();
  const pageHandle = CUSTOMISATION_PAGE_PATHS[character]?.[Number(order.voiceLength)];
  return pageHandle
    ? `https://meaningfulplushies.com/pages/${pageHandle}?view=customise-your-plushie`
    : storefrontCustomisationUrl;
}

export function normaliseCustomisationForm(value: unknown): CustomisationForm | null {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const form = {
    plushName: requiredText(source.plushName, 20),
    gender: requiredText(source.gender, 20),
    birthDate: requiredText(source.birthDate, 20),
    birthPlace: requiredText(source.birthPlace, 20),
    favouritePerson: requiredText(source.favouritePerson, 20),
    belongsTo: requiredText(source.belongsTo, 20),
    meaningfulNote: requiredText(source.meaningfulNote),
  };
  return Object.values(form).every(Boolean) ? form : null;
}

export async function createDeferredSession(input: {
  deliveryMethod: DeliveryMethod;
  contactEmail?: string;
  contactPhone?: string;
}) {
  const deliveryMethod = input.deliveryMethod;
  const contactEmail = requiredText(input.contactEmail, 254).toLowerCase();
  const contactPhone = requiredText(input.contactPhone, 40);
  if (deliveryMethod !== "email" && deliveryMethod !== "whatsapp") throw new Error("Choose email or WhatsApp.");
  if (deliveryMethod === "email" && !/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error("Enter a valid email address.");
  if (deliveryMethod === "whatsapp" && contactPhone.replace(/\D/g, "").length < 8) throw new Error("Enter a valid WhatsApp number.");

  const token = randomBytes(32).toString("base64url");
  const { data, error } = await serviceClient().from(SESSION_TABLE).insert({
    token_hash: hashToken(token),
    token_cipher: encryptToken(token),
    mode: "fill_later",
    delivery_method: deliveryMethod,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    status: "pending_payment",
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), token, url: customerCustomisationLink(token) };
}

/** Creates an already-completed customisation that will be attached when its cart item becomes an order. */
export async function createCompleteNowSession() {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await serviceClient().from(SESSION_TABLE).insert({
    token_hash: hashToken(token),
    token_cipher: encryptToken(token),
    mode: "complete_now",
    status: "pending_payment",
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);
  return { id: String(data.id), token };
}

async function sessionByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{40,100}$/.test(token)) return null;
  const { data, error } = await serviceClient().from(SESSION_TABLE).select("*").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) throw new Error(error.message);
  return data as SessionRow | null;
}

export async function getPublicSession(token: string) {
  const session = await sessionByToken(token);
  if (!session || session.status === "cancelled" || session.status === "expired") return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    await serviceClient().from(SESSION_TABLE).update({ status: "expired" }).eq("id", session.id);
    return null;
  }
  if (!session.link_opened_at) await serviceClient().from(SESSION_TABLE).update({ link_opened_at: new Date().toISOString() }).eq("id", session.id);
  return {
    status: session.status,
    submitted: session.status === "submitted",
    form: session.form_data || {},
    hasVoice: Boolean(session.voice_storage_path),
  };
}

type VideoReference = {
  url?: string;
  sources?: Array<{ url?: string; mimeType?: string }>;
};

function normaliseVideoName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function orderSummaryVideoName(lineItems: Array<{ name?: string; title?: string; variant?: { title?: string } | null }>) {
  const description = lineItems.map((line) => `${line.name || ""} ${line.title || ""} ${line.variant?.title || ""}`).join(" ").toUpperCase();
  const characters: Array<[string, string[]]> = [
    ["BILLY", ["BILLY"]],
    ["HUN", ["HUNNIE", "HUN"]],
    ["TOOT", ["TOOT"]],
    ["DW", ["DRAGON WARRIOR", "DW"]],
  ];
  const character = characters.find(([, aliases]) => aliases.some((alias) => description.includes(alias)))?.[0] || "";
  const seconds = ["20", "10", "5"].find((length) => new RegExp(`\\b${length}\\s*(?:S|SEC|SECOND)`, "i").test(description)) || "";
  return character && seconds ? `${character} ${seconds}s` : "";
}

/**
 * Finds the Order Summary entry for this session's purchased plushie and
 * speaker length. The token is still required, so an order number alone
 * cannot be used to reveal a customer's video.
 */
export async function orderVideoForCustomisationToken(token: string) {
  const session = await sessionByToken(token);
  if (!session || !session.order_id || session.status === "cancelled" || session.status === "expired") return null;
  const domain = shopDomain();
  if (!domain) return null;

  const result = await shopifyGraphql<{
    data?: {
      order?: { lineItems?: { nodes?: Array<{ name?: string; title?: string; variant?: { title?: string } | null }> } | null } | null;
      metaobjects?: { nodes?: Array<{ fields?: Array<{ key?: string; value?: string; reference?: VideoReference | null }> }> } | null;
    };
  }>(domain, `
    query CustomisationOrderVideo($orderId: ID!, $type: String!) {
      order(id: $orderId) {
        lineItems(first: 50) { nodes { name title variant { title } } }
      }
      metaobjects(type: $type, first: 250) {
        nodes {
          fields {
            key
            value
            reference {
              ... on GenericFile { url }
              ... on Video { sources { url mimeType } }
            }
          }
        }
      }
    }
  `, { orderId: session.order_id, type: ORDER_SUMMARY_VIDEO_METAOBJECT_TYPE });

  const videoName = orderSummaryVideoName(result?.data?.order?.lineItems?.nodes ?? []);
  if (!videoName) return null;
  const expectedName = normaliseVideoName(videoName);

  for (const entry of result?.data?.metaobjects?.nodes ?? []) {
    const fields = new Map((entry.fields ?? []).map((field) => [field.key || "", field]));
    const title = fields.get("name")?.value || "";
    const video = fields.get("video")?.reference;
    if (normaliseVideoName(title) === expectedName && video) {
      const source = video.url || video.sources?.find((item) => item.url)?.url || "";
      if (source) return { url: source, title: title || "Your Meaningful Plushie" };
    }
  }
  return null;
}

export async function createVoiceUpload(token: string, fileName: string, contentType: string) {
  const session = await sessionByToken(token);
  if (!session || !["awaiting_customisation", "pending_payment"].includes(session.status)) throw new Error("This customisation link is no longer available.");
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "voice-audio";
  const path = `${session.id}/${randomBytes(12).toString("hex")}-${safeName}`;
  const { data, error } = await serviceClient().storage.from(AUDIO_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message || "Could not prepare the voice upload.");
  return { path, token: data.token, signedUrl: data.signedUrl };
}

export async function uploadVoiceFile(token: string, file: File) {
  const session = await sessionByToken(token);
  if (!session || !["awaiting_customisation", "pending_payment"].includes(session.status)) throw new Error("This customisation link is no longer available.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Your file must be 50 MB or smaller.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "voice-audio";
  const path = `${session.id}/${randomBytes(12).toString("hex")}-${safeName}`;
  const { error } = await serviceClient().storage.from(AUDIO_BUCKET).upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function saveSubmittedSession(token: string, formValue: unknown, voiceStoragePath: string) {
  const form = normaliseCustomisationForm(formValue);
  if (!form) throw new Error("Please complete every birth certificate field.");
  const session = await sessionByToken(token);
  if (!session || !["awaiting_customisation", "pending_payment"].includes(session.status)) throw new Error("This customisation link is no longer available.");
  if (!voiceStoragePath.startsWith(`${session.id}/`)) throw new Error("Please upload your voice recording first.");

  const completedAt = new Date().toISOString();
  const { error } = await serviceClient().from(SESSION_TABLE).update({
    form_data: { ...session.form_data, ...form },
    voice_storage_path: voiceStoragePath,
    updated_at: completedAt,
  }).eq("id", session.id);
  if (error) throw new Error(error.message);
  const linkedOrder = await fulfilmentOrderForSession(session);
  let certificateCode = session.certificate_code || "";
  if (!certificateCode && session.order_number) {
    const certificate = await certificateMetaobjectForOrder(session.order_number).catch(() => null);
    if (certificate) {
      certificateCode = certificate.code;
      await serviceClient().from(SESSION_TABLE).update({
        certificate_code: certificate.code,
        certificate_metaobject_id: certificate.id,
        updated_at: completedAt,
      }).eq("id", session.id);
    }
  }
  if (!certificateCode && session.order_number && linkedOrder) {
    const certificate = await createCertificateMetaobject({
      orderNumber: session.order_number,
      createdAt: linkedOrder.orderDate || completedAt,
      plushDetails: linkedOrder.product || linkedOrder.character,
      certificate: certificateMediaForLineItem(linkedOrder.product, linkedOrder.character),
      plushBackgroundBottom: plushBackgroundForMeaningfulNote(form.meaningfulNote),
      idName: form.plushName,
      gender: form.gender,
      bornOn: form.birthDate,
      birthplace: form.birthPlace,
      favouritePerson: form.favouritePerson,
      belongsTo: form.belongsTo,
      meaningfulNote: form.meaningfulNote,
      meaningfulMessage: `supabase-storage:${voiceStoragePath}`,
    });
    if (certificate) {
      certificateCode = certificate.code;
      await serviceClient().from(SESSION_TABLE).update({ certificate_code: certificate.code, certificate_metaobject_id: certificate.id, updated_at: completedAt }).eq("id", session.id);
    }
  }
  if (!certificateCode) throw new Error("Your certificate could not be linked to this order. Please try again shortly.");
  const certificateUpdated = await updateCertificateMetaobject({
    code: certificateCode,
    orderNumber: session.order_number || "",
    createdAt: linkedOrder?.orderDate || completedAt,
    plushDetails: linkedOrder?.product || linkedOrder?.character,
    certificate: linkedOrder ? certificateMediaForLineItem(linkedOrder.product, linkedOrder.character) : undefined,
    idName: form.plushName,
    gender: form.gender,
    bornOn: form.birthDate,
    birthplace: form.birthPlace,
    favouritePerson: form.favouritePerson,
    belongsTo: form.belongsTo,
    meaningfulNote: form.meaningfulNote,
    plushBackgroundBottom: plushBackgroundForMeaningfulNote(form.meaningfulNote),
    meaningfulMessage: `supabase-storage:${voiceStoragePath}`,
  });
  if (!certificateUpdated) throw new Error("Your certificate could not be updated. Please try again.");
  if (session.fulfilment_order_id) await applySubmittedSessionToFulfilmentOrder(session.fulfilment_order_id, form, voiceStoragePath, certificateCode);
  if (session.order_id && !await setShopifyOrderMetafield(session.order_id, uploadLiftCompatibleText(form, voiceStoragePath))) throw new Error("Your order customisation could not be saved. Please try again.");
  const { error: completionError } = await serviceClient().from(SESSION_TABLE).update({ status: "submitted", completed_at: completedAt, updated_at: completedAt }).eq("id", session.id);
  if (completionError) throw new Error(completionError.message);
  await backupVoiceToGoogleDrive({ ...session, voice_storage_path: voiceStoragePath }, form.plushName).catch(() => false);
  return { sessionId: session.id, fulfilmentOrderId: session.fulfilment_order_id || "" };
}

export async function attachCertificateToSessions(orderId: string, orderNumber: string, certificate: { code: string; id: string }) {
  const { error } = await serviceClient().from(SESSION_TABLE).update({
    certificate_code: certificate.code,
    certificate_metaobject_id: certificate.id,
    updated_at: new Date().toISOString(),
  }).eq("order_id", orderId).eq("order_number", orderNumber);
  if (error) throw new Error(error.message);
}

function uploadLiftCompatibleText(form: CustomisationForm, voiceStoragePath: string) {
  return [
    "Product: Meaningful Plushie",
    `Name: ${form.plushName}`,
    `Gender: ${form.gender}`,
    `Born On: ${form.birthDate}`,
    `Birthplace: ${form.birthPlace}`,
    `Favourite Person: ${form.favouritePerson}`,
    `Belongs To: ${form.belongsTo}`,
    `Meaningful Note: ${form.meaningfulNote}`,
    `Meaningful Message: supabase-storage:${voiceStoragePath}`,
  ].join("\n");
}

async function fulfilmentOrderForSession(session: Pick<SessionRow, "fulfilment_order_id" | "order_number">) {
  const client = serviceClient();
  const query = session.fulfilment_order_id
    ? client.from("fulfilment_orders").select("id,data").eq("id", session.fulfilment_order_id).maybeSingle()
    : client.from("fulfilment_orders").select("id,data").eq("order_number", session.order_number || "").maybeSingle();
  const { data, error } = await query;
  if (error || !data?.data || typeof data.data !== "object") return null;
  return data.data as Order;
}

async function applySubmittedSessionToFulfilmentOrder(fulfilmentOrderId: string, form: CustomisationForm, voiceStoragePath: string, certificateCode = "") {
  const client = serviceClient();
  const { data, error } = await client.from("fulfilment_orders").select("data").eq("id", fulfilmentOrderId).maybeSingle();
  if (error || !data?.data || typeof data.data !== "object") return;
  const order = data.data as Order;
  const now = new Date().toISOString();
  const updated: Order = {
    ...order,
    status: "new_order",
    plushName: form.plushName,
    plushGender: form.gender,
    plushBirthDate: form.birthDate,
    plushBirthPlace: form.birthPlace,
    plushFavouritePerson: form.favouritePerson,
    plushBelongsTo: form.belongsTo,
    meaningfulNote: form.meaningfulNote,
    meaningfulMessage: `supabase-storage:${voiceStoragePath}`,
    idWebsiteLink: certificateCode ? `https://meaningfulplushies.com/pages/certificate/${certificateCode}` : order.idWebsiteLink,
    voiceUploadStatus: "received",
    updatedAt: now,
    statusHistory: [...(order.statusHistory ?? []), {
      id: `${order.id}-customisation-${now}`,
      status: "new_order",
      changedAt: now,
      changedBy: "Customer",
      note: "Customisation submitted through secure link.",
    }],
  };
  const { error: updateError } = await client.from("fulfilment_orders").update({ status: updated.status, updated_at: now, data: updated }).eq("id", fulfilmentOrderId);
  if (updateError) throw new Error(updateError.message);
}

export function customisationSessionIds(order: Record<string, unknown>) {
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  return lineItems.flatMap((line) => {
    const item = line && typeof line === "object" ? line as Record<string, unknown> : {};
    const attributes = Array.isArray(item.customAttributes) ? item.customAttributes : Array.isArray(item.properties) ? item.properties : [];
    return attributes.flatMap((attribute) => {
      const value = attribute && typeof attribute === "object" ? attribute as Record<string, unknown> : {};
      return String(value.key || value.name || "") === "customisation_session_id" && String(value.value || "") ? [String(value.value)] : [];
    });
  });
}

type CertificateReference = { code: string; id: string };

/**
 * Shopify Flow and the app are both triggered when Shopify creates an order.
 * When Flow owns certificate creation it can finish a few seconds after this
 * webhook, so wait briefly before treating its certificate as unavailable.
 */
async function flowCertificateForOrder(orderNumber: string) {
  for (const delay of [0, 2_000, 5_000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const certificate = await certificateMetaobjectForOrder(orderNumber).catch(() => null);
    if (certificate) return certificate;
  }
  return null;
}

function submittedCertificateUpdate(session: SessionRow, form: CustomisationForm, voiceStoragePath: string, certificateCode: string) {
  if (!certificateCode) return Promise.resolve(false);
  return updateCertificateMetaobject({
    code: certificateCode,
    orderNumber: session.order_number || "",
    createdAt: session.completed_at || new Date().toISOString(),
    idName: form.plushName,
    gender: form.gender,
    bornOn: form.birthDate,
    birthplace: form.birthPlace,
    favouritePerson: form.favouritePerson,
    belongsTo: form.belongsTo,
    meaningfulNote: form.meaningfulNote,
    plushBackgroundBottom: plushBackgroundForMeaningfulNote(form.meaningfulNote),
    meaningfulMessage: `supabase-storage:${voiceStoragePath}`,
  });
}

export async function bindSessionsToOrders(input: { orderId: string; orderNumber: string; sessionIds: string[]; orders: Order[]; certificates?: Array<CertificateReference | null> }) {
  if (!input.sessionIds.length) return input.orders;
  const client = serviceClient();
  const { data, error } = await client.from(SESSION_TABLE).select("*").in("id", input.sessionIds);
  if (error) throw new Error(error.message);
  const sessions = (data ?? []) as SessionRow[];
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const now = new Date().toISOString();
  const needsCertificate = sessions.some((session) => session.status === "submitted");
  const fallbackCertificate = !input.certificates?.length && needsCertificate
    ? await flowCertificateForOrder(input.orderNumber)
    : null;

  const updated = input.orders.map((order, index) => {
    const sessionId = input.sessionIds[index] || input.sessionIds[0];
    const session = byId.get(sessionId);
    if (!session) return order;
    const form = session.form_data || {};
    const submitted = session.status === "submitted";
    const certificate = input.certificates?.[index] || fallbackCertificate;
    const certificateCode = certificate?.code || session.certificate_code || "";
    return {
      ...order,
      status: submitted ? "new_order" : "awaiting_customisation",
      plushName: submitted ? form.plushName || order.plushName : order.plushName,
      plushGender: submitted ? form.gender || order.plushGender : order.plushGender,
      plushBirthDate: submitted ? form.birthDate || order.plushBirthDate : order.plushBirthDate,
      plushBirthPlace: submitted ? form.birthPlace || order.plushBirthPlace : order.plushBirthPlace,
      plushFavouritePerson: submitted ? form.favouritePerson || order.plushFavouritePerson : order.plushFavouritePerson,
      plushBelongsTo: submitted ? form.belongsTo || order.plushBelongsTo : order.plushBelongsTo,
      meaningfulNote: submitted ? form.meaningfulNote || order.meaningfulNote : order.meaningfulNote,
      meaningfulMessage: submitted && session.voice_storage_path ? `supabase-storage:${session.voice_storage_path}` : order.meaningfulMessage,
      certificateCode: certificateCode || order.certificateCode,
      idWebsiteLink: submitted && certificateCode ? `https://meaningfulplushies.com/pages/certificate/${certificateCode}` : order.idWebsiteLink,
      voiceUploadStatus: submitted && session.voice_storage_path ? "received" : "missing",
      statusHistory: submitted
        ? [...order.statusHistory, { id: `${order.id}-customisation-${now}`, status: "new_order", changedAt: now, changedBy: "Customer", note: "Customisation submitted through secure link." }]
        : [...order.statusHistory, { id: `${order.id}-awaiting-${now}`, status: "awaiting_customisation", changedAt: now, changedBy: "Customer", note: "Customer chose to complete customisation later." }],
    } as Order;
  });

  const boundSessions = updated.map((order, index) => {
    const sessionId = input.sessionIds[index] || input.sessionIds[0];
    const session = byId.get(sessionId);
    if (!session) return null;
    const formData = { ...session.form_data, customisationPageUrl: customisationPageForOrder(order) };
    session.form_data = formData;
    session.order_id = input.orderId;
    session.order_number = input.orderNumber;
    session.fulfilment_order_id = order.id;
    const certificate = input.certificates?.[index] || fallbackCertificate;
    if (certificate) {
      session.certificate_code = certificate.code;
      session.certificate_metaobject_id = certificate.id;
    }
    return client.from(SESSION_TABLE).update({
      order_id: input.orderId,
      order_number: input.orderNumber,
      fulfilment_order_id: order.id,
      certificate_code: certificate?.code || session.certificate_code || null,
      certificate_metaobject_id: certificate?.id || session.certificate_metaobject_id || null,
      status: byId.get(sessionId)?.status === "submitted" ? "submitted" : "awaiting_customisation",
      form_data: formData,
      updated_at: now,
    }).eq("id", sessionId);
  });
  await Promise.all(boundSessions.filter((request) => request !== null));
  await Promise.all(sessions.filter((session) => session.status === "submitted" && session.voice_storage_path).map(async (session) => {
    const form = normaliseCustomisationForm(session.form_data);
    if (!form || !session.voice_storage_path) return;
    await Promise.all([
      setShopifyOrderMetafield(input.orderId, uploadLiftCompatibleText(form, session.voice_storage_path)).catch(() => false),
      submittedCertificateUpdate(session, form, session.voice_storage_path, session.certificate_code || "").catch(() => false),
    ]);
  }));
  await Promise.all(sessions.map((session) => sendCustomisationEmail(session).catch(() => false)));
  await Promise.all(sessions.filter((session) => session.status === "submitted" && session.voice_storage_path).map((session) => backupVoiceToGoogleDrive(session, String(session.form_data?.plushName || "plushie")).catch(() => false)));
  return updated;
}

function googleDriveConfigured() {
  return Boolean(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.GOOGLE_DRIVE_REFRESH_TOKEN && process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID);
}

async function googleDriveAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_DRIVE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_DRIVE_CLIENT_SECRET || "",
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "",
      grant_type: "refresh_token",
    }),
  });
  const payload = await response.json() as { access_token?: string };
  if (!response.ok || !payload.access_token) throw new Error("Google Drive connection could not be refreshed.");
  return payload.access_token;
}

function driveBackupFileName(session: SessionRow, plushName: string) {
  const extension = session.voice_storage_path?.split(".").at(-1)?.replace(/[^a-z0-9]/gi, "") || "audio";
  const safeName = plushName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "plushie";
  const order = (session.order_number || "pending-order").replace(/[^0-9A-Za-z-]/g, "");
  return `Order-${order}-${safeName}.${extension.toLowerCase()}`;
}

export async function backupVoiceToGoogleDrive(session: SessionRow, plushName: string) {
  if (!session.voice_storage_path || session.google_drive_file_id || !googleDriveConfigured()) return false;
  const client = serviceClient();
  try {
    const { data: audio, error: downloadError } = await client.storage.from(AUDIO_BUCKET).download(session.voice_storage_path);
    if (downloadError || !audio) throw new Error(downloadError?.message || "Could not read the saved voice file.");
    const fileName = driveBackupFileName(session, plushName);
    const token = await googleDriveAccessToken();
    const body = new FormData();
    body.append("metadata", new Blob([JSON.stringify({ name: fileName, parents: [process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID] })], { type: "application/json" }));
    body.append("file", audio, fileName);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const result = await response.json() as { id?: string; name?: string };
    if (!response.ok || !result.id) throw new Error("Google Drive rejected the backup upload.");
    const backedUpAt = new Date().toISOString();
    await client.from(SESSION_TABLE).update({
      google_drive_file_id: result.id,
      google_drive_file_name: result.name || fileName,
      google_drive_backed_up_at: backedUpAt,
      backup_error: null,
      updated_at: backedUpAt,
    }).eq("id", session.id);
    if (session.fulfilment_order_id) await replaceFulfilmentVoiceLink(session.fulfilment_order_id, `https://drive.google.com/open?id=${result.id}`);
    return true;
  } catch (error) {
    await client.from(SESSION_TABLE).update({ backup_error: error instanceof Error ? error.message : "Google Drive backup failed." }).eq("id", session.id);
    throw error;
  }
}

async function replaceFulfilmentVoiceLink(fulfilmentOrderId: string, meaningfulMessage: string) {
  const client = serviceClient();
  const { data } = await client.from("fulfilment_orders").select("data").eq("id", fulfilmentOrderId).maybeSingle();
  if (!data?.data || typeof data.data !== "object") return;
  const order = data.data as Order;
  const updatedAt = new Date().toISOString();
  await client.from("fulfilment_orders").update({ data: { ...order, meaningfulMessage, updatedAt }, updated_at: updatedAt }).eq("id", fulfilmentOrderId);
}

async function sendCustomisationEmail(session: SessionRow) {
  if (session.delivery_method !== "email" || session.link_sent_at || !session.contact_email || !session.token_cipher) return false;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CUSTOMISATION_EMAIL_FROM;
  const token = decryptToken(session.token_cipher);
  if (!apiKey || !from || !token) return false;
  const link = customerCustomisationLink(token, session.form_data?.customisationPageUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [session.contact_email],
      subject: "Complete your Meaningful Plushie customisation",
      html: `<p>Thank you for your order.</p><p>Use this secure link to complete your plushie's birth certificate and upload the voice recording:</p><p><a href="${link}">Complete my customisation</a></p><p>This link expires in 30 days.</p>`,
    }),
  });
  if (!response.ok) throw new Error("Customisation email could not be sent.");
  await serviceClient().from(SESSION_TABLE).update({ link_sent_at: new Date().toISOString() }).eq("id", session.id);
  return true;
}

export async function sessionForFulfilmentOrder(fulfilmentOrderId: string) {
  const { data, error } = await serviceClient().from(SESSION_TABLE).select("*").eq("fulfilment_order_id", fulfilmentOrderId).maybeSingle();
  if (error) throw new Error(error.message);
  return data as SessionRow | null;
}

/** Pending customer responses for the fulfilment workspace. Tokens are never returned here. */
export async function listPendingCustomisations(): Promise<PendingCustomisation[]> {
  const { data, error } = await serviceClient()
    .from(SESSION_TABLE)
    .select("fulfilment_order_id,delivery_method,contact_email,contact_phone,link_sent_at,expires_at")
    .eq("status", "awaiting_customisation")
    .not("fulfilment_order_id", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((session) => {
    const fulfilmentOrderId = String(session.fulfilment_order_id || "");
    const deliveryMethod = session.delivery_method === "email" ? "email" : session.delivery_method === "whatsapp" ? "whatsapp" : null;
    if (!fulfilmentOrderId || !deliveryMethod) return [];
    return [{
      fulfilmentOrderId,
      deliveryMethod,
      contact: String(deliveryMethod === "email" ? session.contact_email || "" : session.contact_phone || ""),
      linkSentAt: session.link_sent_at ? String(session.link_sent_at) : null,
      expiresAt: session.expires_at ? String(session.expires_at) : null,
    }];
  });
}

export function manualWhatsAppCustomisationLink(order: Order, session: SessionRow | null) {
  if (!session || session.delivery_method !== "whatsapp" || !session.contact_phone) return "";
  const phone = session.contact_phone.replace(/\D/g, "").replace(/^0/, "60");
  if (phone.length < 9) return "";
  const token = session.token_cipher ? decryptToken(session.token_cipher) : "";
  return token ? `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${order.customerName}, please complete your Meaningful Plushie customisation here: ${customerCustomisationLink(token, customisationPageForOrder(order))}`)}` : "";
}

export async function whatsappCustomisationLinkForOrder(order: Order) {
  const session = await sessionForFulfilmentOrder(order.id);
  return manualWhatsAppCustomisationLink(order, session);
}

/** A Gmail draft for staff to send the secure customisation link manually. */
export async function emailCustomisationLinkForOrder(order: Order) {
  const session = await sessionForFulfilmentOrder(order.id);
  if (!session || session.delivery_method !== "email" || !session.contact_email || !session.token_cipher) return "";
  const token = decryptToken(session.token_cipher);
  if (!token) return "";
  const name = order.customerName?.trim() || "there";
  const subject = "Complete your Meaningful Plushie customisation";
  const body = [
    `Hi ${name},`,
    "",
    "Thank you for your order! Please use this secure link to complete your plushie's birth certificate and upload the voice recording:",
    customerCustomisationLink(token, customisationPageForOrder(order)),
    "",
    "This link expires in 30 days.",
    "",
    "With love,",
    "Meaningful Plushies",
  ].join("\n");
  // A Gmail compose URL is reliable in the fulfilment workspace. `mailto:`
  // depends on a desktop email app being configured and can otherwise appear
  // to do nothing in Chrome.
  const compose = new URL("https://mail.google.com/mail/");
  compose.searchParams.set("view", "cm");
  compose.searchParams.set("fs", "1");
  compose.searchParams.set("to", session.contact_email);
  compose.searchParams.set("su", subject);
  compose.searchParams.set("body", body);
  return compose.toString();
}

import { createHash, createHmac, randomBytes } from "node:crypto";
import { mobileServiceClient } from "./mobile-api";
import { nfcTokenPattern } from "./nfc-cards";

export async function customerNfcActivationState(token: string): Promise<string> {
  const { data, error } = await mobileServiceClient().rpc("customer_nfc_activation_state", { p_token: token });
  if (error) throw new Error("Your card could not be checked. Please try again.");
  return data;
}

export async function verifyCustomerNfcOrder(token: string, body: Record<string, unknown>, clientAddress: string) {
  const method = body.method ?? "phone";
  if (!nfcTokenPattern.test(token) || (method !== "phone" && method !== "tiktok")) throw new Error("Choose where you placed your order.");
  if (method === "phone" && (typeof body.phone !== "string" || body.phone.length > 50)) throw new Error("Enter the phone number used for your order.");
  if (method === "tiktok" && (typeof body.orderDigits !== "string" || !/^\d{6}$/.test(body.orderDigits.trim()))) throw new Error("Enter exactly the last six digits of your TikTok order ID.");
  const fullOrderId = typeof body.fullOrderId === "string" ? body.fullOrderId.trim() : "";
  if (method === "tiktok" && fullOrderId && !/^\d{8,32}$/.test(fullOrderId)) throw new Error("Enter your full TikTok order ID using numbers only.");
  const session = randomBytes(32).toString("hex");
  const sessionHash = createHash("sha256").update(session).digest("hex");
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Customisation is temporarily unavailable.");
  const clientHash = createHmac("sha256", secret).update(clientAddress).digest("hex");
  const parameters = { p_token: token, p_session_hash: sessionHash, p_client_hash: clientHash };
  const { data, error } = method === "tiktok"
    ? await mobileServiceClient().rpc("verify_customer_nfc_tiktok", { ...parameters, p_digits: (body.orderDigits as string).trim(), p_full_order_id: fullOrderId })
    : await mobileServiceClient().rpc("verify_customer_nfc_phone", { ...parameters, p_phone: body.phone });
  if (error) throw new Error("Your order could not be checked. Please try again.");
  if (data?.limited) throw new Error("Too many attempts. Please wait 15 minutes before trying again.");
  if (data?.needsFullOrderId) return { needsFullOrderId: true };
  if (!data?.verified) throw new Error(method === "tiktok"
    ? "We couldn’t find an unactivated plushie for that TikTok order. Check the last six digits of your order ID."
    : "We couldn’t find an unactivated plushie for that phone number. Check the number used for your order.");
  return { session, orders: data.orders };
}

export async function submitCustomerNfcActivation(token: string, body: Record<string, unknown>) {
  if (!nfcTokenPattern.test(token) || typeof body.session !== "string" || !/^[a-f0-9]{64}$/.test(body.session)
    || typeof body.orderId !== "string" || !body.orderId || body.orderId.length > 200) throw new Error("Verify your order again to continue.");
  const raw = body.fields;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Enter your plushie’s details.");
  const limits: Record<string, number> = { plushName: 100, character: 30, plushGender: 40, plushBirthDate: 30, plushBirthPlace: 150, plushFavouritePerson: 150, plushBelongsTo: 150, meaningfulNote: 4000 };
  const fields: Record<string, string> = {};
  for (const [key, maximum] of Object.entries(limits)) {
    const value = (raw as Record<string, unknown>)[key] ?? "";
    if (typeof value !== "string" || value.length > maximum) throw new Error("One of your plushie’s details is too long. Please shorten it.");
    fields[key] = value.trim();
  }
  if (!fields.plushName || !["Billy", "Tootsie", "Hunnie", "Dragon Warrior"].includes(fields.character)) throw new Error("Enter your plushie’s name and choose its character.");
  if (fields.plushBirthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.plushBirthDate)
    || Number.isNaN(Date.parse(fields.plushBirthDate)) || new Date(fields.plushBirthDate).toISOString().slice(0,10) !== fields.plushBirthDate)) throw new Error("Choose a valid birth date.");
  const sessionHash = createHash("sha256").update(body.session).digest("hex");
  const { data, error } = await mobileServiceClient().rpc("submit_customer_nfc_activation", {
    p_token: token, p_session_hash: sessionHash, p_order: body.orderId, p_fields: fields,
  });
  if (error) {
    const messages: Record<string, string> = {
      NFC_ACTIVATION_EXPIRED: "Your verification expired. Verify your order again.",
      NFC_ACTIVATION_CHANGED: "This card or plushie has already been activated or changed. Refresh the page before trying again.",
      NFC_ACTIVATION_ORDER: "This plushie no longer matches your verified order. Verify your order again.",
      NFC_ACTIVATION_FIELDS: "Check your plushie’s name and character, then try again.",
      NFC_ACTIVATION_CERTIFICATE: "This order’s certificate needs a check by our team. Please contact Meaningful Plushies.",
    };
    throw new Error(messages[error.message] || "Your details could not be saved. Please try again with the same card.");
  }
  return data as string;
}

import { createHash, createHmac, randomBytes } from "node:crypto";
import { mobileServiceClient } from "./mobile-api";
import { nfcTokenPattern } from "./nfc-cards";

export async function customerNfcActivationState(token: string): Promise<string> {
  const { data, error } = await mobileServiceClient().rpc("customer_nfc_activation_state", { p_token: token });
  if (error) throw new Error("Your card could not be checked. Please try again.");
  return data;
}

export async function verifyCustomerNfcPhone(token: string, phone: unknown, clientAddress: string) {
  if (!nfcTokenPattern.test(token) || typeof phone !== "string" || phone.length > 50) throw new Error("Enter the phone number used for your order.");
  const session = randomBytes(32).toString("hex");
  const sessionHash = createHash("sha256").update(session).digest("hex");
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Customisation is temporarily unavailable.");
  const clientHash = createHmac("sha256", secret).update(clientAddress).digest("hex");
  const { data, error } = await mobileServiceClient().rpc("verify_customer_nfc_phone", {
    p_token: token, p_phone: phone, p_session_hash: sessionHash, p_client_hash: clientHash,
  });
  if (error) throw new Error("Your phone number could not be checked. Please try again.");
  if (data?.limited) throw new Error("Too many attempts. Please wait 15 minutes before trying again.");
  if (!data?.verified) throw new Error("We couldn’t find an unactivated plushie for that phone number. Check the number used for your order.");
  return { session, orders: data.orders };
}

export async function submitCustomerNfcActivation(token: string, body: Record<string, unknown>) {
  if (!nfcTokenPattern.test(token) || typeof body.session !== "string" || !/^[a-f0-9]{64}$/.test(body.session)
    || typeof body.orderId !== "string" || !body.orderId || body.orderId.length > 200) throw new Error("Verify your phone number again to continue.");
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
      NFC_ACTIVATION_EXPIRED: "Your verification expired. Verify your phone number again.",
      NFC_ACTIVATION_CHANGED: "This card or plushie has already been activated or changed. Refresh the page before trying again.",
      NFC_ACTIVATION_ORDER: "This plushie no longer matches your verified order. Verify your phone number again.",
      NFC_ACTIVATION_FIELDS: "Check your plushie’s name and character, then try again.",
      NFC_ACTIVATION_CERTIFICATE: "This order’s certificate needs a check by our team. Please contact Meaningful Plushies.",
    };
    throw new Error(messages[error.message] || "Your details could not be saved. Please try again with the same card.");
  }
  return data as string;
}

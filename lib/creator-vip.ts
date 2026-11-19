import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { provisionVipNativeDiscounts, vipProductHandle, vipShippingCode } from "./creator-vip-native-discounts";
import { createCreatorSampleDiscountCode } from "./manual-orders";
import { mobileServiceClient } from "./mobile-api";
import { syncVipRedemptions } from "./creator-vip-redemption";

const inviteFields = "id,code,username,discount_code,sample_id,activated_at,registered_at,name,phone,consent_version,created_at,discount_mode,selected_product_handle,shipping_discount_id,redeemed_at";
const usableInvite = "sample_id.not.is.null,and(discount_mode.eq.native,activated_at.not.is.null,shipping_discount_id.is.null)";

export function isVipInviteReady(invite: { sample_id: string | null; activated_at: string | null; discount_mode: string; shipping_discount_id: string | null; redeemed_at: string | null }) {
  return !invite.redeemed_at && (!!invite.sample_id || (invite.discount_mode === "native" && !!invite.activated_at && !invite.shipping_discount_id));
}

function vipClaimToken(code: string) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) throw new Error("Creator claim signing is not configured.");
  return createHmac("sha256", secret).update(`vip-claim:${code}`).digest("hex");
}

function claimResponse(invite: { code: string; discount_code: string; discount_mode: string; selected_product_handle: string | null }) {
  return invite.discount_mode === "native"
    ? { discount: invite.discount_code, claimToken: vipClaimToken(invite.code), selectedProduct: invite.selected_product_handle }
    : { discount: invite.discount_code };
}

export function creatorUsername(value: unknown) {
  if (typeof value !== "string") return "";
  const username = value.trim().replace(/^@/, "").toLowerCase();
  return /^(?=.*[a-z0-9])[a-z0-9._]{1,24}$/.test(username) ? username : "";
}

function inviteCode(value: unknown) {
  if (typeof value !== "string" || value.length > 48) return "";
  const code = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^VIP[0-9A-F]{16}$/.test(code) ? `VIP-${code.slice(3, 11)}-${code.slice(11)}` : "";
}

function creatorPhone(value: unknown) {
  if (typeof value !== "string" || value.length > 24) return "";
  const input = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(input)) return "";
  let digits = input.replace(/\D/g, "");
  if (!input.startsWith("+")) {
    if (digits.startsWith("00")) digits = digits.slice(2);
    else if (digits.startsWith("0")) digits = `60${digits.slice(1)}`;
  }
  return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : "";
}

export async function listVipInvites() {
  const { data, error } = await mobileServiceClient().from("creator_vip_invites")
    .select(inviteFields).order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return syncVipRedemptions(data);
}

async function reserveVipInvite(username: string) {
  const db = mobileServiceClient();
  const base = `FREE-${username.toUpperCase().replace(/[._]+/g, "-").replace(/^-|-$/g, "")}`;
  for (let suffix = 1; suffix <= 100; suffix++) {
    const { data: existing, error: lookupError } = await db.from("creator_vip_invites")
      .select(inviteFields).eq("username", username).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing;

    const discount = suffix === 1 ? base : `${base}-${suffix}`;
    const { count, error: sampleError } = await db.from("creator_free_samples")
      .select("id", { count: "exact", head: true }).eq("sample_code", discount);
    if (sampleError) throw sampleError;
    if (count) continue;

    const random = randomBytes(8).toString("hex").toUpperCase();
    const { data, error } = await db.from("creator_vip_invites").insert({
      code: `VIP-${random.slice(0, 8)}-${random.slice(8)}`, username, discount_code: discount,
    }).select(inviteFields).single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
  }
  throw new Error("No available discount code for this TikTok username.");
}

export async function issueVipInvite(username: string) {
  const invite = await reserveVipInvite(username);
  if (invite.activated_at) return (await syncVipRedemptions([invite]))[0];

  const db = mobileServiceClient();
  let activation: { sample_id: string | null; discount_mode: "native" | "function"; activated_at: string };
  try {
    const discountId = await createCreatorSampleDiscountCode(invite.discount_code, `@${invite.username}`, "classics", { recoverExisting: true });
    await saveVipLedgerSample(invite, discountId);
    activation = { sample_id: invite.id, discount_mode: "function", activated_at: new Date().toISOString() };
  } catch (error) {
    if (!(error instanceof Error) || !/Shop must be on a Shopify Plus plan to activate functions from a custom app/i.test(error.message)) throw error;
    activation = { sample_id: null, discount_mode: "native", activated_at: new Date().toISOString() };
  }

  const { data, error } = await db.from("creator_vip_invites")
    .update(activation).eq("id", invite.id).is("activated_at", null).select(inviteFields).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: activated, error: readError } = await db.from("creator_vip_invites")
    .select(inviteFields).eq("id", invite.id).single();
  if (readError) throw readError;
  return activated;
}

async function saveVipLedgerSample(invite: { id: string; username: string; discount_code: string; created_at: string }, discountId: string) {
  const db = mobileServiceClient();
  const { error: ledgerError } = await db.from("creator_free_samples").upsert({
    id: invite.id,
    creator_name: `@${invite.username}`,
    creator_url: `https://www.tiktok.com/@${invite.username}`,
    sample_code: invite.discount_code,
    product_collection: "classics",
    shopify_discount_id: discountId,
    given_at: invite.created_at,
    notes: "VIP Creator Program",
  }, { onConflict: "id", ignoreDuplicates: true });
  if (ledgerError) throw ledgerError;
}

export async function checkVipInvite(value: unknown) {
  const code = inviteCode(value);
  if (!code) return { error: "invalid_invite" };
  const { data, error } = await mobileServiceClient().from("creator_vip_invites")
    .select(inviteFields).eq("code", code).maybeSingle();
  if (error) throw error;
  if (!data) return { error: "invalid_invite" };
  const [invite] = await syncVipRedemptions([data]);
  if (invite.redeemed_at) return { error: "used_invite" };
  if (!isVipInviteReady(invite)) return { error: "invalid_invite" };
  return {
    username: `@${invite.username}`,
    name: invite.name ?? "",
    phone: invite.phone ?? "",
    consent: !!invite.consent_version,
    ...(invite.registered_at ? claimResponse(invite) : {}),
  };
}

export async function registerVipCreator(input: { invite?: unknown; name?: unknown; phone?: unknown; consent?: unknown }) {
  const code = inviteCode(input.invite);
  if (!code) return { error: "invalid_invite" };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = creatorPhone(input.phone);
  if (!name || name.length > 100 || !phone || input.consent !== true) return { error: "invalid_details" };

  const db = mobileServiceClient();
  const { data: previous, error: readError } = await db.from("creator_vip_invites")
    .select(inviteFields).eq("code", code).maybeSingle();
  if (readError) throw readError;
  if (!previous) return { error: "invalid_invite" };
  const [invite] = await syncVipRedemptions([previous]);
  if (invite.redeemed_at) return { error: "used_invite" };
  if (!isVipInviteReady(invite)) return { error: "invalid_invite" };

  const { data, error } = await db.from("creator_vip_invites")
    .update({ name, phone, registered_at: invite.registered_at ?? new Date().toISOString(), consent_version: "creator-marketing-v1" })
    .eq("id", invite.id).is("redeemed_at", null).or(usableInvite)
    .select("code,discount_code,discount_mode,selected_product_handle").maybeSingle();
  if (error?.code === "23505") return { error: "duplicate_creator" };
  if (error) throw error;
  if (data) return claimResponse(data);

  return { error: "used_invite" };
}

export async function claimVipProduct(input: { invite?: unknown; claimToken?: unknown; product?: unknown }) {
  const code = inviteCode(input.invite);
  const token = input.claimToken;
  const product = vipProductHandle(input.product);
  if (!code || !product || typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token) ||
      !timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(vipClaimToken(code), "hex"))) return { error: "invalid_invite" };

  const db = mobileServiceClient();
  const { data: previous, error: readError } = await db.from("creator_vip_invites")
    .select(inviteFields).eq("code", code).eq("discount_mode", "native").not("registered_at", "is", null).maybeSingle();
  if (readError) throw readError;
  if (!previous) return { error: "invalid_invite" };
  const [current] = await syncVipRedemptions([previous]);
  if (current.redeemed_at) return { error: "used_invite" };
  const { data: reserved, error: reserveError } = await db.from("creator_vip_invites")
    .update({ selected_product_handle: product }).eq("code", code).eq("discount_mode", "native")
    .not("registered_at", "is", null).is("redeemed_at", null).is("selected_product_handle", null).or(usableInvite)
    .select(inviteFields).maybeSingle();
  if (reserveError) throw reserveError;
  let invite = reserved;
  if (!invite) {
    const { data, error } = await db.from("creator_vip_invites")
      .select(inviteFields).eq("code", code).eq("discount_mode", "native").not("registered_at", "is", null).maybeSingle();
    if (error) throw error;
    invite = data;
  }
  if (!invite || !isVipInviteReady(invite)) return { error: "invalid_invite" };
  if (invite.selected_product_handle !== product) return { error: "product_already_selected" };

  if (!invite.shipping_discount_id || !invite.sample_id) {
    const discounts = await provisionVipNativeDiscounts(invite, product);
    await saveVipLedgerSample(invite, discounts.productId);
    const { error } = await db.from("creator_vip_invites")
      .update({ sample_id: invite.id, shipping_discount_id: discounts.shippingId }).eq("id", invite.id);
    if (error) throw error;
  }
  return { discount: invite.discount_code, shippingDiscount: vipShippingCode(invite.id) };
}

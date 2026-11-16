import { randomBytes } from "node:crypto";
import { createCreatorSampleDiscountCode } from "./manual-orders";
import { mobileServiceClient } from "./mobile-api";

const inviteFields = "id,code,username,discount_code,sample_id,activated_at,registered_at,name,phone,created_at";

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
  return data;
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
  if (invite.activated_at) return invite;

  const db = mobileServiceClient();
  const creatorName = `@${invite.username}`;
  const discountId = await createCreatorSampleDiscountCode(invite.discount_code, creatorName, "classics", { recoverExisting: true });
  const { error: ledgerError } = await db.from("creator_free_samples").upsert({
    id: invite.id,
    creator_name: creatorName,
    creator_url: `https://www.tiktok.com/@${invite.username}`,
    sample_code: invite.discount_code,
    product_collection: "classics",
    shopify_discount_id: discountId,
    given_at: invite.created_at,
    notes: "VIP Creator Program",
  }, { onConflict: "id", ignoreDuplicates: true });
  if (ledgerError) throw ledgerError;

  const { data, error } = await db.from("creator_vip_invites")
    .update({ sample_id: invite.id, activated_at: new Date().toISOString() })
    .eq("id", invite.id).is("activated_at", null).select(inviteFields).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { data: activated, error: readError } = await db.from("creator_vip_invites")
    .select(inviteFields).eq("id", invite.id).single();
  if (readError) throw readError;
  return activated;
}

export async function checkVipInvite(value: unknown) {
  const code = inviteCode(value);
  if (!code) return { error: "invalid_invite" };
  const { data, error } = await mobileServiceClient().from("creator_vip_invites")
    .select("username,sample_id,registered_at").eq("code", code).maybeSingle();
  if (error) throw error;
  if (!data?.sample_id) return { error: "invalid_invite" };
  if (data.registered_at) return { error: "used_invite" };
  return { username: `@${data.username}` };
}

export async function registerVipCreator(input: { invite?: unknown; name?: unknown; phone?: unknown; consent?: unknown }) {
  const code = inviteCode(input.invite);
  if (!code) return { error: "invalid_invite" };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const phone = creatorPhone(input.phone);
  if (!name || name.length > 100 || !phone || input.consent !== true) return { error: "invalid_details" };

  const db = mobileServiceClient();
  const { data, error } = await db.from("creator_vip_invites")
    .update({ name, phone, registered_at: new Date().toISOString(), consent_version: "creator-marketing-v1" })
    .eq("code", code).is("registered_at", null).not("sample_id", "is", null)
    .select("discount_code").maybeSingle();
  if (error?.code === "23505") return { error: "duplicate_creator" };
  if (error) throw error;
  if (data) return { discount: data.discount_code };

  const { data: previous, error: readError } = await db.from("creator_vip_invites")
    .select("name,phone,discount_code,sample_id").eq("code", code).maybeSingle();
  if (readError) throw readError;
  if (!previous?.sample_id) return { error: "invalid_invite" };
  if (previous.name === name && previous.phone === phone) return { discount: previous.discount_code };
  return { error: "used_invite" };
}

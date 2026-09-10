import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { deleteCloserMedia, storeCloserMedia } from "@/src/modules/closer/media-storage";

const nameLimit = 60;

type Certificate = { id: string; certificate_id: string; access_key_hash: string; connection_id: string | null; created_at: string };
type Connection = { id: string; first_certificate_id: string; second_certificate_id: string; first_name: string; second_name: string; next_photo_certificate_id: string; photo_path: string | null; photo_content_type: string | null; voice_path: string | null; voice_content_type: string | null; created_at: string; updated_at: string };
type PairingRequest = { id: string; from_certificate_id: string; to_certificate_id: string; requester_name: string; status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED"; created_at: string };
type AdminCertificate = Pick<Certificate, "certificate_id" | "connection_id" | "created_at">;
type AdminActivity = { id: string; action: string; actor_certificate_id: string; created_at: string };

let closerDatabase: SupabaseClient | null = null;

export class CloserError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

function database() {
  if (closerDatabase) return closerDatabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!key) throw new Error("Closer data is not configured.");
  closerDatabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return closerDatabase;
}

function cleanText(value: unknown, label: string, maxLength = nameLimit) {
  if (typeof value !== "string") throw new CloserError(`${label} is required.`);
  const cleaned = value.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.length > maxLength) throw new CloserError(`${label} must be between 1 and ${maxLength} characters.`);
  return cleaned;
}

function throwDatabaseError(error: { message: string } | null) { if (error) throw new Error(error.message); }

async function certificateById(certificateId: string) {
  const { data, error } = await database().from("closer_app_certificates").select("id,certificate_id,access_key_hash,connection_id,created_at").eq("certificate_id", certificateId).maybeSingle<Certificate>();
  throwDatabaseError(error);
  return data;
}

async function connectionById(id: string | null) {
  if (!id) return null;
  const { data, error } = await database().from("closer_app_connections").select("*").eq("id", id).maybeSingle<Connection>();
  throwDatabaseError(error);
  return data;
}

async function logActivity(connectionId: string, actorCertificateId: string, action: string, details?: Record<string, unknown>) {
  const { error } = await database().from("closer_app_activity").insert({ id: randomUUID(), connection_id: connectionId, actor_certificate_id: actorCertificateId, action, details: details || null });
  throwDatabaseError(error);
}

export function hashCloserAccessKey(accessKey: string) { return createHash("sha256").update(accessKey).digest("hex"); }

export async function authenticateCloserCertificate(certificateId: unknown, accessKey: unknown) {
  const cleanCertificateId = cleanText(certificateId, "Certificate ID", 100);
  if (typeof accessKey !== "string" || !accessKey) throw new CloserError("This certificate link is not valid.", 401);
  const certificate = await certificateById(cleanCertificateId);
  if (!certificate) throw new CloserError("We could not find this certificate.", 404);
  const suppliedHash = Buffer.from(hashCloserAccessKey(accessKey), "utf8");
  const storedHash = Buffer.from(certificate.access_key_hash, "utf8");
  if (suppliedHash.length !== storedHash.length || !timingSafeEqual(suppliedHash, storedHash)) throw new CloserError("This certificate link is not valid.", 401);
  return { ...certificate, certificateId: certificate.certificate_id, connectionId: certificate.connection_id };
}

export async function closerConnectionForCertificate(certificateId: string) {
  const certificate = await certificateById(certificateId);
  return connectionById(certificate?.connection_id || null);
}

export async function closerTheme() {
  const { data, error } = await database().from("closer_app_settings").select("theme").eq("id", "default").maybeSingle<{ theme: unknown }>();
  throwDatabaseError(error);
  return data?.theme && typeof data.theme === "object" ? data.theme as Record<string, unknown> : {};
}

// The fulfilment dashboard uses the same server-only Supabase connection as
// the customer pages. Prisma's database role intentionally cannot read these
// RLS-protected Closer tables in production.
export async function loadCloserAdminDashboard() {
  const [certificatesResult, connectionsResult, activityResult, settingsResult] = await Promise.all([
    database().from("closer_app_certificates").select("certificate_id,connection_id,created_at").order("created_at", { ascending: false }).limit(100).returns<AdminCertificate[]>(),
    database().from("closer_app_connections").select("id,first_certificate_id,second_certificate_id,first_name,second_name").order("updated_at", { ascending: false }).limit(100).returns<Array<Pick<Connection, "id" | "first_certificate_id" | "second_certificate_id" | "first_name" | "second_name">>>(),
    database().from("closer_app_activity").select("id,action,actor_certificate_id,created_at").order("created_at", { ascending: false }).limit(100).returns<AdminActivity[]>(),
    database().from("closer_app_settings").select("theme").eq("id", "default").maybeSingle<{ theme: unknown }>(),
  ]);
  throwDatabaseError(certificatesResult.error);
  throwDatabaseError(connectionsResult.error);
  throwDatabaseError(activityResult.error);
  throwDatabaseError(settingsResult.error);
  return {
    certificates: certificatesResult.data || [],
    connections: connectionsResult.data || [],
    activity: activityResult.data || [],
    theme: settingsResult.data?.theme && typeof settingsResult.data.theme === "object" ? settingsResult.data.theme : {},
  };
}

export async function createCloserCertificate(certificateId: string, accessKey: string) {
  const { error } = await database().from("closer_app_certificates").insert({
    id: randomUUID(),
    certificate_id: certificateId,
    access_key_hash: hashCloserAccessKey(accessKey),
  });
  throwDatabaseError(error);
}

export async function saveCloserTheme(theme: Record<string, unknown>) {
  const { error } = await database().from("closer_app_settings").upsert({ id: "default", theme }, { onConflict: "id" });
  throwDatabaseError(error);
}

export async function closerState(certificateId: string) {
  const certificate = await certificateById(certificateId);
  const [connection, requestResult] = await Promise.all([
    connectionById(certificate?.connection_id || null),
    database().from("closer_app_pairing_requests").select("id,from_certificate_id,to_certificate_id,requester_name,status,created_at").eq("to_certificate_id", certificateId).eq("status", "PENDING").order("created_at", { ascending: false }).limit(1).maybeSingle<PairingRequest>(),
  ]);
  throwDatabaseError(requestResult.error);
  if (!connection) return { status: "unlinked" as const, request: requestResult.data ? { id: requestResult.data.id, requesterName: requestResult.data.requester_name, fromCertificateId: requestResult.data.from_certificate_id } : null };
  const isFirst = connection.first_certificate_id === certificateId;
  return { status: "linked" as const, connection: { id: connection.id, names: (isFirst ? [connection.first_name, connection.second_name] : [connection.second_name, connection.first_name]) as [string, string], partnerCertificateId: isFirst ? connection.second_certificate_id : connection.first_certificate_id, canUploadNextPhoto: connection.next_photo_certificate_id === certificateId, hasPhoto: Boolean(connection.photo_path), hasVoice: Boolean(connection.voice_path) } };
}

export async function requestCloserConnection(fromCertificateId: string, toCertificateIdValue: unknown, requesterNameValue: unknown) {
  const toCertificateId = cleanText(toCertificateIdValue, "Partner certificate ID", 100);
  const requesterName = cleanText(requesterNameValue, "Your name");
  if (fromCertificateId === toCertificateId) throw new CloserError("Choose your partner's certificate, not your own.");
  const [from, to] = await Promise.all([certificateById(fromCertificateId), certificateById(toCertificateId)]);
  if (!to) throw new CloserError("That certificate ID was not found.", 404);
  if (from?.connection_id || to.connection_id) throw new CloserError("One of these plushies is already linked.", 409);
  const { error: cancelledError } = await database().from("closer_app_pairing_requests").update({ status: "CANCELLED" }).eq("from_certificate_id", fromCertificateId).eq("to_certificate_id", toCertificateId).eq("status", "PENDING");
  throwDatabaseError(cancelledError);
  const { error } = await database().from("closer_app_pairing_requests").insert({ id: randomUUID(), from_certificate_id: fromCertificateId, to_certificate_id: toCertificateId, requester_name: requesterName, status: "PENDING" });
  throwDatabaseError(error);
}

export async function rejectCloserConnection(certificateId: string, requestIdValue: unknown) {
  const requestId = cleanText(requestIdValue, "Connection request", 100);
  const { data, error } = await database().from("closer_app_pairing_requests").update({ status: "REJECTED" }).eq("id", requestId).eq("to_certificate_id", certificateId).eq("status", "PENDING").select("id");
  throwDatabaseError(error);
  if (!data?.length) throw new CloserError("That connection request is no longer available.", 404);
}

export async function acceptCloserConnection(certificateId: string, requestIdValue: unknown, recipientNameValue: unknown) {
  const requestId = cleanText(requestIdValue, "Connection request", 100);
  const recipientName = cleanText(recipientNameValue, "Your name");
  const { data: request, error: requestError } = await database().from("closer_app_pairing_requests").select("id,from_certificate_id,to_certificate_id,requester_name,status,created_at").eq("id", requestId).eq("to_certificate_id", certificateId).eq("status", "PENDING").maybeSingle<PairingRequest>();
  throwDatabaseError(requestError);
  if (!request) throw new CloserError("That connection request is no longer available.", 404);
  const [from, to] = await Promise.all([certificateById(request.from_certificate_id), certificateById(certificateId)]);
  if (!from || !to) throw new CloserError("One of these certificates is no longer available.", 404);
  if (from.connection_id || to.connection_id) throw new CloserError("One of these plushies is already linked.", 409);
  const connectionId = randomUUID();
  const { error: connectionError } = await database().from("closer_app_connections").insert({ id: connectionId, first_certificate_id: from.certificate_id, second_certificate_id: to.certificate_id, first_name: request.requester_name, second_name: recipientName, next_photo_certificate_id: from.certificate_id });
  throwDatabaseError(connectionError);
  const { error: fromError } = await database().from("closer_app_certificates").update({ connection_id: connectionId }).eq("certificate_id", from.certificate_id);
  const { error: toError } = await database().from("closer_app_certificates").update({ connection_id: connectionId }).eq("certificate_id", to.certificate_id);
  throwDatabaseError(fromError); throwDatabaseError(toError);
  const { error: acceptedError } = await database().from("closer_app_pairing_requests").update({ status: "ACCEPTED" }).eq("id", request.id);
  throwDatabaseError(acceptedError);
  const { error: cancelledError } = await database().from("closer_app_pairing_requests").update({ status: "CANCELLED" }).or(`from_certificate_id.in.(${from.certificate_id},${to.certificate_id}),to_certificate_id.in.(${from.certificate_id},${to.certificate_id})`).eq("status", "PENDING");
  throwDatabaseError(cancelledError);
  await logActivity(connectionId, certificateId, "connection_accepted", { requestId });
}

export async function unlinkCloserConnection(certificateId: string) {
  const certificate = await certificateById(certificateId);
  const connection = await connectionById(certificate?.connection_id || null);
  if (!connection) throw new CloserError("This plushie is not linked.", 409);
  await logActivity(connection.id, certificateId, "connection_unlinked");
  const { error: firstError } = await database().from("closer_app_certificates").update({ connection_id: null }).eq("certificate_id", connection.first_certificate_id);
  const { error: secondError } = await database().from("closer_app_certificates").update({ connection_id: null }).eq("certificate_id", connection.second_certificate_id);
  const { error: deleteError } = await database().from("closer_app_connections").delete().eq("id", connection.id);
  throwDatabaseError(firstError); throwDatabaseError(secondError); throwDatabaseError(deleteError);
  return { mediaPaths: [connection.photo_path, connection.voice_path] };
}

export async function uploadCloserMedia(args: { certificateId: string; type: "photo" | "voice"; bytes: ArrayBuffer; contentType: string }) {
  const certificate = await certificateById(args.certificateId);
  const connection = await connectionById(certificate?.connection_id || null);
  if (!connection) throw new CloserError("Link your plushies before sharing media.", 409);
  if (args.type === "photo" && connection.next_photo_certificate_id !== args.certificateId) throw new CloserError("It is your partner’s turn to upload the next photo.", 409);
  const extension = args.type === "photo" ? "jpg" : args.contentType === "audio/mp4" ? "m4a" : "webm";
  const path = `${connection.id}/${args.type}-${randomUUID()}.${extension}`;
  await storeCloserMedia(path, args.bytes, args.contentType);
  try {
    const partnerCertificateId = connection.first_certificate_id === args.certificateId ? connection.second_certificate_id : connection.first_certificate_id;
    const update = args.type === "photo" ? { photo_path: path, photo_content_type: args.contentType, next_photo_certificate_id: partnerCertificateId } : { voice_path: path, voice_content_type: args.contentType };
    let updateQuery = database().from("closer_app_connections").update(update).eq("id", connection.id);
    if (args.type === "photo") updateQuery = updateQuery.eq("next_photo_certificate_id", args.certificateId);
    const { data, error } = await updateQuery.select("id");
    throwDatabaseError(error);
    if (!data?.length) throw new CloserError("Your partner just shared a photo. Please wait for your turn.", 409);
    await logActivity(connection.id, args.certificateId, `${args.type}_updated`);
    await deleteCloserMedia([args.type === "photo" ? connection.photo_path : connection.voice_path]);
  } catch (error) {
    await deleteCloserMedia([path]);
    throw error;
  }
}

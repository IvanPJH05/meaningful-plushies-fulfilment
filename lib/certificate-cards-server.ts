import { NextResponse } from "next/server";
import { mobileServiceClient, requireMobileSession } from "@/lib/mobile-api";
import { certificateDetails } from "@/lib/certificate-sync-fields";
import { characterKey } from "@/lib/certificate-pairing";

import type { Order } from "@/lib/types";


export const headers = { "Cache-Control": "no-store" };
export class PairingError extends Error { constructor(message: string, public status = 400) { super(message); } }
export async function context(request: Request) {
  const session = await requireMobileSession(request);
  const client = mobileServiceClient();
  const { data, error } = await client.from("dashboard_sessions").select("account_id").eq("token", session.token).gt("expires_at", new Date().toISOString()).single();
  if (error || !data) throw new PairingError("Sign in again.", 401);
  return { client, actor: data.account_id as string, session };
}
export function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "Pairing is unavailable. Please try again.";
  const status = error instanceof PairingError ? error.status : /REQUIRED/.test(message) ? 401 : 400;
  return NextResponse.json({ error: /REQUIRED/.test(message) ? "Sign in to an active staff account." : message }, { status, headers });
}
export function summary(row: { id: string; order_number: string; updated_at: string; data: Order }) {
  const order = row.data;
  const details = certificateDetails(order);
  let character = "";
  try { character = characterKey(`${order.character} ${order.product}`); } catch { /* Staff must choose a supported character. */ }
  return { id: row.id, orderNumber: row.order_number, updatedAt: row.updated_at, product: order.product, character,
    fields: { character_key: character, id_name: details.idName || "", gender: details.gender || "", born_on: details.bornOn || "", birthplace: details.birthplace || "", favourite_person: details.favouritePerson || "", belongs_to: details.belongsTo || "", meaningful_note: details.meaningfulNote || "" } };
}

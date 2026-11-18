import { mobileServiceClient } from "./mobile-api";
import { nfcDestination, nfcTokenPattern } from "./nfc-cards";
import type { Order } from "./types";

export async function publicNfcOrder(token: string): Promise<Order | null> {
  if (!nfcTokenPattern.test(token)) return null;
  const db = mobileServiceClient();
  const { data: card, error } = await db.from("nfc_cards").select("status,order_id").eq("public_token", token).maybeSingle();
  if (error) throw error;
  if (!card || card.status !== "assigned" || !card.order_id) return null;
  const { data: row, error: orderError } = await db.from("fulfilment_orders").select("data,status").eq("id", card.order_id).maybeSingle();
  if (orderError) throw orderError;
  if (!row || ["awaiting_customisation", "issue"].includes(row.status)) return null;
  const order = row.data as Order;
  return nfcDestination(order) ? order : null;
}

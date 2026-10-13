import { createClient } from "@supabase/supabase-js";
import type { Order, OrderStatus, UserRole } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://joaoirpegnkexmktylop.supabase.co";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient() {
  if (!url || !serviceRoleKey) throw new Error("Mobile fulfilment service is not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function mobileServiceClient() {
  return adminClient();
}

export type MobileSession = { token: string; displayName: string; username: string; role: UserRole };

// Never put attached voice/image files into the app cache. The mobile app only
// needs the fulfilment fields below to show and process an order.
export type MobileOrder = Pick<Order, "id" | "orderNumber" | "orderDate" | "customerName" | "phone" | "address" | "plushName" | "character" | "product" | "voiceLength" | "voiceUploadStatus" | "status" | "salesChannel" | "paymentProcessor" | "totalAmount" | "courier" | "trackingNumber" | "updatedAt">;

export function mobileOrder(order: Order): MobileOrder {
  const { id, orderNumber, orderDate, customerName, phone, address, plushName, character, product, voiceLength, voiceUploadStatus, status, salesChannel, paymentProcessor, totalAmount, courier, trackingNumber, updatedAt } = order;
  return { id, orderNumber, orderDate, customerName, phone, address, plushName, character, product, voiceLength, voiceUploadStatus, status, salesChannel, paymentProcessor, totalAmount, courier, trackingNumber, updatedAt };
}

export async function requireMobileSession(request: Request): Promise<MobileSession> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) throw new Error("SIGN_IN_REQUIRED");
  const { data, error } = await adminClient()
    .from("dashboard_sessions")
    .select("token, expires_at, dashboard_accounts!inner(username, display_name, role, active)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data) throw new Error("SIGN_IN_REQUIRED");
  const account = data.dashboard_accounts as unknown as { username: string; display_name: string; role: UserRole; active: boolean };
  if (!account.active || (account.role !== "admin" && account.role !== "staff")) throw new Error("WAREHOUSE_ACCESS_REQUIRED");
  return { token, username: account.username, displayName: account.display_name, role: account.role };
}

export async function mobileLogin(username: string, password: string): Promise<MobileSession> {
  const { data, error } = await adminClient().rpc("dashboard_login", { p_username: username, p_password: password });
  if (error || !data?.[0]) throw new Error("INVALID_CREDENTIALS");
  const account = data[0];
  if (account.role !== "admin" && account.role !== "staff") throw new Error("WAREHOUSE_ACCESS_REQUIRED");
  return { token: account.session_token, username: account.username, displayName: account.display_name, role: account.role };
}

export async function transitionMobileOrder(orderId: string, fromStatus: OrderStatus, toStatus: OrderStatus, actor: string) {
  const { data, error } = await adminClient().rpc("transition_fulfilment_orders", {
    p_transitions: [{ orderId, fromStatus, toStatus }], p_actor: actor,
  });
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new Error("ORDER_NOT_FOUND");
  return mobileOrder(data[0] as Order);
}

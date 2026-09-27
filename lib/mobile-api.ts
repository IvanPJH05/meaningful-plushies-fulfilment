import { createClient } from "@supabase/supabase-js";
import type { Order, OrderStatus, UserRole } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function adminClient() {
  if (!url || !serviceRoleKey) throw new Error("Mobile fulfilment service is not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type MobileSession = { token: string; displayName: string; username: string; role: UserRole };

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
  const client = adminClient();
  const { data: row, error: readError } = await client.from("fulfilment_orders").select("id,data,status,updated_at").eq("id", orderId).maybeSingle();
  if (readError || !row) throw new Error("ORDER_NOT_FOUND");
  if (row.status !== fromStatus) throw new Error("ORDER_CHANGED");
  const changedAt = new Date().toISOString();
  const order = row.data as Order;
  const updated: Order = { ...order, status: toStatus, updatedAt: changedAt, statusHistory: [...(order.statusHistory ?? []), { id: `${order.id}-${changedAt}`, status: toStatus, changedAt, changedBy: actor }] };
  const { data: changed, error } = await client.from("fulfilment_orders").update({ status: toStatus, updated_at: changedAt, data: updated }).eq("id", orderId).eq("status", fromStatus).eq("updated_at", row.updated_at).select("data").maybeSingle();
  if (error) throw error;
  if (!changed) throw new Error("ORDER_CHANGED");
  return changed.data as Order;
}

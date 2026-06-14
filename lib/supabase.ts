import { createClient } from "@supabase/supabase-js";
import type { Order, PaymentProcessorSetting } from "./types";

export type SharedActivity = {
  id: string;
  orderNumber?: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
};

// Public browser credentials for the shared production database. Vercel
// environment variables override these defaults when configured.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? "https://joaoirpegnkexmktylop.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ?? "sb_publishable_qYeTDXzz1yeOydayZDSBPA_VjLbcgdE";

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

function requireSupabase() {
  if (!supabase) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return supabase;
}

export async function fetchSharedOrders(): Promise<Order[]> {
  const { data, error } = await requireSupabase()
    .from("fulfilment_orders")
    .select("data")
    .order("order_number", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => row.data as Order);
}

export async function upsertSharedOrders(orders: Order[]) {
  if (!orders.length) return;
  const rows = orders.map((order) => ({
    id: order.id,
    order_number: order.orderNumber,
    status: order.status,
    order_date: order.orderDate || null,
    updated_at: order.updatedAt,
    data: order,
  }));
  const { error } = await requireSupabase().from("fulfilment_orders").upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteSharedOrders(ids: string[]) {
  if (!ids.length) return;
  const { error } = await requireSupabase().from("fulfilment_orders").delete().in("id", ids);
  if (error) throw error;
}

export async function fetchPaymentProcessorSettings(): Promise<PaymentProcessorSetting[]> {
  const { data, error } = await requireSupabase()
    .from("payment_processor_settings")
    .select("processor, percentage, fixed_amount")
    .order("processor");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    processor: row.processor,
    percentage: Number(row.percentage),
    fixedAmount: Number(row.fixed_amount),
  }));
}

export async function ensurePaymentProcessors(processors: string[]) {
  const rows = [...new Set(processors.map((processor) => processor.trim()).filter((processor) => (
    Boolean(processor) && processor.toLowerCase() !== "bank transfer"
  )))]
    .map((processor) => ({ processor }));
  if (!rows.length) return;
  const { error } = await requireSupabase()
    .from("payment_processor_settings")
    .upsert(rows, { onConflict: "processor", ignoreDuplicates: true });
  if (error) throw error;
}

export async function savePaymentProcessorSetting(setting: PaymentProcessorSetting) {
  const { error } = await requireSupabase().from("payment_processor_settings").upsert({
    processor: setting.processor,
    percentage: Math.max(0, setting.percentage),
    fixed_amount: Math.max(0, setting.fixedAmount),
    updated_at: new Date().toISOString(),
  }, { onConflict: "processor" });
  if (error) throw error;
}

export async function fetchSharedActivity(): Promise<SharedActivity[]> {
  const { data, error } = await requireSupabase()
    .from("activity_events")
    .select("id, order_number, action, detail, actor, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    orderNumber: row.order_number ?? undefined,
    action: row.action,
    detail: row.detail,
    actor: row.actor,
    createdAt: row.created_at,
  }));
}

export async function insertSharedActivity(event: SharedActivity) {
  const { error } = await requireSupabase().from("activity_events").insert({
    id: event.id,
    order_number: event.orderNumber ?? null,
    action: event.action,
    detail: event.detail,
    actor: event.actor,
    created_at: event.createdAt,
  });
  if (error) throw error;
}

export function subscribeToSharedData(onChange: () => void) {
  const client = requireSupabase();
  const channel = client.channel("fulfilment-dashboard")
    .on("postgres_changes", { event: "*", schema: "public", table: "fulfilment_orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payment_processor_settings" }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

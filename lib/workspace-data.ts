const sales = ["manual_orders", "payment_processor_settings", "sales_fee_settings", "creator_profiles"];
const accounting = ["accounting_categories", "accounting_documents", "accounting_transactions", "accounting_ledger_entries", "accounting_bank_statement_lines", "accounting_ai_import_reviews", "sales_consumption_mappings"];

// Explicit dependencies keep background modules off the fulfilment load path.
// Sales classifications/fees are retained because the order dashboard shows totals.
export function sharedTablesForWorkspace(view: string, workspace: string, role?: string): string[] {
  if (!role) return [];
  if (workspace === "batch_fulfilment") return ["manual_orders", "envelope_print_settings"];
  const tables = new Set<string>();
  const add = (keys: string[]) => keys.forEach((key) => tables.add(key));
  if (["fulfilment", "reports", "accounting", "formal_accounting", "creator"].includes(workspace) || view === "plush_charm_orders") add(sales);
  if (role === "admin") {
    if (workspace === "accounting") add([...accounting, "stock_settings"]);
    if (workspace === "formal_accounting") add(["accounting_categories", "accounting_transactions", "accounting_ledger_entries", "sales_consumption_mappings"]);
    if (workspace === "inventory") add(["stock_settings", "accounting_transactions"]);
    if (workspace === "content") add(["content_plan_items", "content_idea_items"]);
    if (view === "manual_orders_dashboard") add(["manual_orders"]);
    if (view === "manual_orders_leads") add(["whatsapp_leads"]);
    if (view === "history") add(["activity_events"]);
    if (view === "settings") add(["payment_processor_settings", "sales_fee_settings", "stock_settings", "envelope_print_settings"]);
    if (view === "meta_capi") add(["meta_capi_settings", "meta_capi_logs"]);
  }
  if (view === "print_envelope" && (role === "admin" || role === "staff")) add(["envelope_print_settings"]);
  if (workspace === "creator" && (role === "admin" || role === "creator")) add(["creator_profiles", "creator_commissions", "creator_payouts"]);
  if (role === "staff") tables.delete("creator_profiles");
  if (role === "creator") return ["creator_profiles", "creator_commissions", "creator_payouts"];
  return [...tables];
}

export class WorkspaceDataCache {
  private versions = new Map<string, number>();
  private ready = new Map<string, number>();
  private pending = new Map<string, Promise<void>>();

  isReady(keys: string[]) {
    return keys.every((key) => this.ready.get(key) === (this.versions.get(key) ?? 0));
  }

  invalidate(keys: string[]) {
    for (const key of keys) this.versions.set(key, (this.versions.get(key) ?? 0) + 1);
  }

  async read(key: string, fetch: () => Promise<unknown>): Promise<void> {
    const version = this.versions.get(key) ?? 0;
    if (this.ready.get(key) === version) return;
    const existing = this.pending.get(key);
    if (existing) {
      await existing;
      return this.read(key, fetch);
    }
    const task = Promise.resolve().then(fetch).then(() => {
      if ((this.versions.get(key) ?? 0) === version) this.ready.set(key, version);
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, task);
    await task;
    // A realtime change during a read must not mark its old result current.
    if ((this.versions.get(key) ?? 0) !== version) await this.read(key, fetch);
  }

  async load(keys: string[], fetchers: Record<string, () => Promise<unknown>>): Promise<string[]> {
    const unique = [...new Set(keys)];
    const results = await Promise.allSettled(unique.map((key) => {
      if (!fetchers[key]) return Promise.reject(new Error(`Missing workspace loader: ${key}`));
      return this.read(key, fetchers[key]);
    }));
    return unique.filter((_, index) => results[index].status === "rejected");
  }
}

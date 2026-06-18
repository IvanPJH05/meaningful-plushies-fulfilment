import { createClient } from "@supabase/supabase-js";
import type { AccountingCategory, AccountingDocument, AccountingLedgerEntry, AccountingTransaction, DashboardAccount, Order, PaymentProcessorSetting, SalesFeeSetting, StockSetting, UserRole } from "./types";

export type DashboardSession = DashboardAccount & { token: string };

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

export async function fetchSalesFeeSettings(): Promise<SalesFeeSetting> {
  const { data, error } = await requireSupabase()
    .from("sales_fee_settings")
    .select("shopify_percentage")
    .eq("id", "default")
    .maybeSingle();
  if (error) throw error;
  return { shopifyPercentage: Number(data?.shopify_percentage ?? 0) };
}

export async function saveSalesFeeSettings(setting: SalesFeeSetting) {
  const { error } = await requireSupabase().from("sales_fee_settings").upsert({
    id: "default",
    shopify_percentage: Math.max(0, setting.shopifyPercentage),
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function loginDashboardAccount(username: string, password: string): Promise<DashboardSession> {
  const { data, error } = await requireSupabase().rpc("dashboard_login", {
    p_username: username,
    p_password: password,
  });
  if (error) throw error;
  const account = data?.[0];
  if (!account) throw new Error("Incorrect username or password.");
  return {
    id: account.account_id,
    token: account.session_token,
    username: account.username,
    displayName: account.display_name,
    role: account.role as UserRole,
    active: true,
  };
}

export async function fetchDashboardAccounts(token: string): Promise<DashboardAccount[]> {
  const { data, error } = await requireSupabase().rpc("dashboard_list_accounts", { p_session_token: token });
  if (error) throw error;
  return (data ?? []).map((account: {
    account_id: string;
    username: string;
    display_name: string;
    role: UserRole;
    active: boolean;
  }) => ({
    id: account.account_id,
    username: account.username,
    displayName: account.display_name,
    role: account.role as UserRole,
    active: account.active,
  }));
}

export async function createDashboardAccount(token: string, account: Omit<DashboardAccount, "id" | "active">, password: string) {
  const { error } = await requireSupabase().rpc("dashboard_create_account", {
    p_session_token: token,
    p_username: account.username,
    p_display_name: account.displayName,
    p_role: account.role,
    p_password: password,
  });
  if (error) throw error;
}

export async function updateDashboardAccount(token: string, account: DashboardAccount, password = "") {
  const { error } = await requireSupabase().rpc("dashboard_update_account", {
    p_session_token: token,
    p_account_id: account.id,
    p_display_name: account.displayName,
    p_role: account.role,
    p_active: account.active,
    p_new_password: password || null,
  });
  if (error) throw error;
}

export async function fetchStockSettings(): Promise<StockSetting[]> {
  const { data, error } = await requireSupabase().from("stock_settings").select("item_key, initial_stock").order("item_key");
  if (error) throw error;
  return (data ?? []).map((row) => ({ itemKey: row.item_key, initialStock: Number(row.initial_stock) }));
}

export async function saveStockSetting(setting: StockSetting) {
  const { error } = await requireSupabase().from("stock_settings").upsert({
    item_key: setting.itemKey,
    initial_stock: Math.max(0, Math.floor(setting.initialStock)),
    updated_at: new Date().toISOString(),
  }, { onConflict: "item_key" });
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

export async function fetchAccountingCategories(): Promise<AccountingCategory[]> {
  const { data, error } = await requireSupabase()
    .from("accounting_categories")
    .select("id, name, account_type, report_section, parent_id, data_source_type, source_module, source_entity, posting_trigger, allow_sub_accounts, allowed_transaction_types, active")
    .eq("active", true)
    .order("report_section", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    accountType: row.account_type,
    reportSection: row.report_section,
    parentId: row.parent_id ?? "",
    dataSourceType: row.data_source_type ?? "manual",
    sourceModule: row.source_module ?? "",
    sourceEntity: row.source_entity ?? "",
    postingTrigger: row.posting_trigger ?? "",
    allowSubAccounts: Boolean(row.allow_sub_accounts),
    allowedTransactionTypes: row.allowed_transaction_types ?? [],
    active: row.active,
  }));
}

export async function saveAccountingCategory(category: AccountingCategory) {
  const { error } = await requireSupabase().from("accounting_categories").upsert({
    id: category.id,
    name: category.name,
    account_type: category.accountType === "income" ? "revenue" : category.accountType,
    report_section: category.reportSection,
    parent_id: category.parentId || null,
    data_source_type: category.dataSourceType,
    source_module: category.sourceModule,
    source_entity: category.sourceEntity,
    posting_trigger: category.postingTrigger,
    allow_sub_accounts: category.allowSubAccounts,
    allowed_transaction_types: category.allowedTransactionTypes,
    active: category.active,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function fetchAccountingDocuments(): Promise<AccountingDocument[]> {
  const { data, error } = await requireSupabase()
    .from("accounting_documents")
    .select("id, file_path, file_name, file_type, file_size, name, supplier, description, document_date, amount, category_id, transaction_type, tax_treatment, notes, uploaded_by, created_at, updated_at")
    .is("deleted_at", null)
    .order("document_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    filePath: row.file_path,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: Number(row.file_size),
    name: row.name,
    supplier: row.supplier,
    description: row.description,
    documentDate: row.document_date,
    amount: Number(row.amount),
    categoryId: row.category_id ?? "",
    transactionType: row.transaction_type,
    taxTreatment: row.tax_treatment,
    notes: row.notes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function uploadAccountingDocumentFile(file: File, id: string) {
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${new Date().getFullYear()}/${id}.${extension}`;
  const { error } = await requireSupabase().storage.from("accounting-documents").upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export async function createAccountingDocumentSignedUrl(filePath: string) {
  const { data, error } = await requireSupabase().storage.from("accounting-documents").createSignedUrl(filePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveAccountingDocument(document: AccountingDocument) {
  const { error } = await requireSupabase().from("accounting_documents").upsert({
    id: document.id,
    file_path: document.filePath,
    file_name: document.fileName,
    file_type: document.fileType,
    file_size: document.fileSize,
    name: document.name,
    supplier: document.supplier,
    description: document.description,
    document_date: document.documentDate,
    amount: Math.max(0, document.amount),
    category_id: document.categoryId || null,
    transaction_type: document.transactionType,
    tax_treatment: document.taxTreatment || "none",
    notes: document.notes,
    uploaded_by: document.uploadedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function deleteAccountingDocument(id: string) {
  const { error } = await requireSupabase()
    .from("accounting_documents")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function fetchAccountingTransactions(): Promise<AccountingTransaction[]> {
  const { data, error } = await requireSupabase()
    .from("accounting_transactions")
    .select("id, source, source_id, document_id, business_event, transaction_date, description, account_name, category_id, transaction_type, payment_status, payment_method, supplier, quantity, unit_cost, deposit_amount, invoice_number, due_date, supplier_terms, debit, credit, amount, currency, tax_treatment, notes, created_by, created_at, updated_at")
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    sourceId: row.source_id ?? "",
    documentId: row.document_id ?? "",
    businessEvent: row.business_event ?? "",
    transactionDate: row.transaction_date,
    description: row.description,
    accountName: row.account_name,
    categoryId: row.category_id ?? "",
    transactionType: row.transaction_type,
    paymentStatus: row.payment_status ?? "paid_in_full",
    paymentMethod: row.payment_method ?? "",
    supplier: row.supplier ?? "",
    quantity: Number(row.quantity ?? 0),
    unitCost: Number(row.unit_cost ?? 0),
    depositAmount: Number(row.deposit_amount ?? 0),
    invoiceNumber: row.invoice_number ?? "",
    dueDate: row.due_date ?? "",
    supplierTerms: row.supplier_terms ?? "",
    debit: Number(row.debit),
    credit: Number(row.credit),
    amount: Number(row.amount),
    currency: row.currency,
    taxTreatment: row.tax_treatment,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function saveAccountingTransaction(transaction: AccountingTransaction) {
  const amount = Math.max(0, transaction.amount);
  const { error } = await requireSupabase().from("accounting_transactions").upsert({
    id: transaction.id,
    source: transaction.source,
    source_id: transaction.sourceId || null,
    document_id: transaction.documentId || null,
    business_event: transaction.businessEvent || null,
    transaction_date: transaction.transactionDate,
    description: transaction.description,
    account_name: transaction.accountName || "Cash",
    category_id: transaction.categoryId || null,
    transaction_type: transaction.transactionType,
    payment_status: transaction.paymentStatus || "paid_in_full",
    payment_method: transaction.paymentMethod || "",
    supplier: transaction.supplier || "",
    quantity: transaction.quantity || 0,
    unit_cost: transaction.unitCost || 0,
    deposit_amount: transaction.depositAmount || 0,
    invoice_number: transaction.invoiceNumber || "",
    due_date: transaction.dueDate || null,
    supplier_terms: transaction.supplierTerms || "",
    debit: Math.max(0, transaction.debit),
    credit: Math.max(0, transaction.credit),
    amount,
    currency: transaction.currency || "MYR",
    tax_treatment: transaction.taxTreatment || "none",
    notes: transaction.notes,
    created_by: transaction.createdBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw error;
}

export async function fetchAccountingLedgerEntries(): Promise<AccountingLedgerEntry[]> {
  const { data, error } = await requireSupabase()
    .from("accounting_ledger_entries")
    .select("id, transaction_id, account_id, account_name, entry_type, amount, memo, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    transactionId: row.transaction_id,
    accountId: row.account_id ?? "",
    accountName: row.account_name,
    entryType: row.entry_type,
    amount: Number(row.amount),
    memo: row.memo ?? "",
    createdAt: row.created_at,
  }));
}

export async function saveAccountingLedgerEntries(transactionId: string, entries: AccountingLedgerEntry[]) {
  const client = requireSupabase();
  const { error: deleteError } = await client.from("accounting_ledger_entries").delete().eq("transaction_id", transactionId);
  if (deleteError) throw deleteError;
  if (!entries.length) return;
  const { error } = await client.from("accounting_ledger_entries").insert(entries.map((entry) => ({
    id: entry.id,
    transaction_id: entry.transactionId,
    account_id: entry.accountId || null,
    account_name: entry.accountName,
    entry_type: entry.entryType,
    amount: Math.max(0, entry.amount),
    memo: entry.memo,
    created_at: entry.createdAt,
  })));
  if (error) throw error;
}

export async function deleteAccountingTransaction(id: string) {
  const { error } = await requireSupabase()
    .from("accounting_transactions")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function subscribeToSharedData(onChange: () => void) {
  const client = requireSupabase();
  const channel = client.channel("fulfilment-dashboard")
    .on("postgres_changes", { event: "*", schema: "public", table: "fulfilment_orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "activity_events" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payment_processor_settings" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "sales_fee_settings" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "stock_settings" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "accounting_documents" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "accounting_transactions" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "accounting_ledger_entries" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "accounting_categories" }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

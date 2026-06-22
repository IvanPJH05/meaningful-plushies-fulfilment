"use client";

import "./settings.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent, SVGProps } from "react";
import { detectCsvKind, fulfilledOrdersCsv, importShopifyData, normalizePaymentProcessor } from "../lib/importer";
import { buildSalesReportRows, summarizeSales, type SalesReportRow, type SalesSummary } from "../lib/sales";
import { stockCharacters, summarizeStock } from "../lib/stock";
import {
  createDashboardAccount,
  createAccountingDocumentSignedUrl,
  deleteSalesConsumptionMapping,
  deleteContentIdea,
  deleteContentPlanItem,
  deleteSharedOrders,
  deleteAccountingDocument,
  deleteAccountingTransaction,
  ensurePaymentProcessors,
  fetchAccountingCategories,
  fetchAccountingDocuments,
  fetchAccountingLedgerEntries,
  fetchAccountingTransactions,
  fetchContentIdeas,
  fetchContentPlanItems,
  fetchSalesConsumptionMappings,
  fetchSharedActivity,
  fetchSharedOrders,
  fetchDashboardAccounts,
  fetchPaymentProcessorSettings,
  fetchSalesFeeSettings,
  fetchStockSettings,
  insertSharedActivity,
  loginDashboardAccount,
  saveAccountingDocument,
  saveAccountingCategory,
  saveAccountingLedgerEntries,
  saveAccountingTransaction,
  saveContentIdea,
  saveContentPlanItem,
  saveSalesConsumptionMapping,
  saveStockSetting,
  savePaymentProcessorSetting,
  saveSalesFeeSettings,
  subscribeToSharedData,
  supabaseConfigured,
  updateDashboardAccount,
  uploadAccountingDocumentFile,
  upsertSharedOrders,
  type DashboardSession,
} from "../lib/supabase";
import { orderStatuses, type AccountingCategory, type AccountingDocument, type AccountingLedgerEntry, type AccountingTransaction, type ContentIdeaItem, type ContentIdeaReference, type ContentPlanItem, type DashboardAccount, type Order, type OrderStatus, type PaymentProcessorSetting, type SalesConsumptionMapping, type SalesFeeSetting, type StockSetting, type UserRole } from "../lib/types";

type Session = DashboardSession;
type View =
  | "orders" | "fulfilment" | "packing_slips" | "print_envelope" | "import" | "fulfilled" | "history" | "settings" | "stock" | "sales_report"
  | "accounting_dashboard" | "accounting_documents" | "accounting_transactions" | "accounting_csv_import" | "accounting_profit_loss" | "accounting_balance_sheet"
  | "accounting_cash_flow" | "accounting_general_ledger" | "accounting_trial_balance" | "accounting_payable" | "accounting_receivable"
  | "accounting_bank_reconciliation" | "accounting_product_profitability" | "accounting_marketing_profitability" | "accounting_cash_position"
  | "accounting_tax_reports" | "accounting_settings" | "accounting_files" | "accounting_general_journal" | "accounting_t_accounts" | "accounting_unit_costs" | "accounting_financial_reports"
  | "content_dashboard" | "content_plan" | "content_ideas";
type Workspace = "fulfilment" | "accounting" | "formal_accounting" | "inventory" | "reports" | "content" | "settings";
type SalesRange = "active" | "today" | "7d" | "30d" | "lifetime";
type SortKey = "orderNumber" | "importedAt" | "updatedAt";
type SortDirection = "asc" | "desc";
type SortChoice = `${SortKey}:${SortDirection}`;
type CollectedMetric = "bankTransfer" | "stripeCollected" | "xenditCollected" | "totalCollected";
type DiscountMetric = "productDiscounted" | "shippingDiscounted";
type FeeMetric = "processingFees" | "shopifyFees" | "totalFees";
type FinancialReportType = "income_statement" | "balance_sheet" | "cash_summary";
type AccountingPeriodMode = "this_month" | "lifetime" | "custom";
type CashFlowActivity = "operating" | "investing" | "financing";
type EnvelopePrintSettings = {
  fontName: string;
  fontBase64: string;
  fontSize: number;
  minFontSize: number;
  boldness: number;
  letterSpacing: number;
  lineHeight: number;
  textBoxWidth: number;
  textBoxHeight: number;
  topX: number;
  topY: number;
  bottomX: number;
  bottomY: number;
};
type StoredUiPreferences = {
  view?: View;
  query?: string;
  statusFilter?: "all" | OrderStatus;
  packingStatusFilter?: "all" | OrderStatus;
  envelopeStatusFilter?: "all" | OrderStatus;
  dashboardStatus?: OrderStatus | "total";
  dashboardStatusTwo?: OrderStatus | "total";
  salesRange?: SalesRange;
  collectedMetric?: CollectedMetric;
  discountMetric?: DiscountMetric;
  feeMetric?: FeeMetric;
  sortKey?: SortKey;
  sortDirection?: SortDirection;
  reportStartDate?: string;
  reportEndDate?: string;
  fulfilmentColumns?: FulfilmentColumn[];
};
type ActivityEvent = {
  id: string;
  orderNumber?: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
};
type AccountingDocumentForm = {
  name: string;
  supplier: string;
  description: string;
  documentDate: string;
  amount: string;
  categoryId: string;
  transactionType: "income" | "expense";
  taxTreatment: string;
  notes: string;
};
type AccountingTransactionForm = {
  businessEvent: string;
  transactionDate: string;
  description: string;
  accountName: string;
  amount: string;
  categoryId: string;
  transactionType: "income" | "expense" | "transfer";
  paymentStatus: "paid_in_full" | "deposit_paid" | "on_credit";
  paymentMethod: string;
  supplier: string;
  quantity: string;
  unitCost: string;
  depositAmount: string;
  invoiceNumber: string;
  dueDate: string;
  supplierTerms: string;
  taxTreatment: string;
  notes: string;
};
type AccountingAccountForm = {
  id: string;
  name: string;
  accountType: AccountingCategory["accountType"];
  reportSection: string;
  parentId: string;
  dataSourceType: AccountingCategory["dataSourceType"];
  sourceModule: string;
  sourceEntity: string;
  postingTrigger: string;
  allowSubAccounts: boolean;
  active: boolean;
};
type BookkeepingSectionKey = "inventory" | "expense" | "asset" | "marketing";
type BookkeepingCategoryForm = {
  section: BookkeepingSectionKey;
  name: string;
};
type SalesConsumptionMappingForm = {
  sku: string;
  inventoryItem: string;
  quantityPerSale: string;
  operatingExpensePerSale: string;
};
type BookkeepingCsvImportRow = {
  id: string;
  rowNumber: number;
  transactionDate: string;
  description: string;
  businessEvent: (typeof businessEvents)[number]["value"];
  categoryName: string;
  supplier: string;
  amount: number;
  quantity: number;
  unitCost: number;
  paymentStatus: AccountingTransactionForm["paymentStatus"];
  paymentMethod: string;
  depositAmount: number;
  invoiceNumber: string;
  notes: string;
  warnings: string[];
};
type ContentPlanForm = {
  title: string;
  plannedDate: string;
  platform: string;
  contentType: string;
  notes: string;
};
type ContentIdeaForm = {
  title: string;
  idea: string;
  references: ContentIdeaReference[];
  referenceName: string;
  referenceUrl: string;
};
type InventoryCostField = "unitCost" | "quantity" | "amount";
type AccountOption = {
  value: string;
  label: string;
};

const salesRanges: { value: SalesRange; label: string }[] = [
  { value: "active", label: "Active orders" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Past 7 days" },
  { value: "30d", label: "Past 30 days" },
  { value: "lifetime", label: "Lifetime" },
];

const dashboardSelectableStatuses: { value: OrderStatus | "total"; label: string }[] = [
  { value: "total", label: "Total orders" },
  { value: "new_order", label: "New orders" },
  { value: "packed", label: "Packed" },
  { value: "shipped", label: "Shipped" },
  { value: "issue", label: "Issues" },
];

const sourceModules = ["Shopify", "TikTok Shop", "Fulfilment", "Inventory", "Payment Processor", "Tax Engine", "Depreciation Engine", "Manual Transactions", "Subscription Engine", "Payroll Engine"];
const postingTriggers = ["Manual Entry", "Order Created", "Payment Received", "Order Fulfilled", "Order Packed", "Payout Received", "Inventory Adjusted", "Bill Created"];
const paymentAccounts = ["Bank Account"];
const stockPurchaseAccounts = [
  "Billy Plush Skin",
  "Tootsie Plush Skin",
  "Hunnie Plush Skin",
  "Dragon Warrior Plush Skin",
  "Speakers",
  "Boxes",
  "NFC Chips",
] as const;
const bookkeepingInventoryStockKeys = ["BILLY", "TOOTSIE", "HUNNIE", "DRAGON WARRIOR", "PACKAGING", "BOXES", "BUBBLE WRAP", "CARRIAGE INWARD", "WAX SEAL"];
const newAssetOptionValue = "__new_asset__";
const bookkeepingSectionConfigs: Record<BookkeepingSectionKey, {
  label: string;
  singularLabel: string;
  reportSection: string;
  accountType: AccountingCategory["accountType"];
  parentAccount: string;
  sourceEntity: string;
  defaults: readonly string[];
}> = {
  inventory: {
    label: "Inventory items",
    singularLabel: "Inventory item",
    reportSection: "Bookkeeping Inventory",
    accountType: "asset",
    parentAccount: "Inventory",
    sourceEntity: "Inventory item",
    defaults: ["Plush toy", "Packaging", "Carton Box", "Bubble wrap", "Carriage Inward", "Wax seal"],
  },
  expense: {
    label: "Expense categories",
    singularLabel: "Expense category",
    reportSection: "Bookkeeping Expenses",
    accountType: "expense",
    parentAccount: "Expenses",
    sourceEntity: "Expense category",
    defaults: ["Labour", "Samples", "JnT (Carriage Outwards)"],
  },
  asset: {
    label: "Assets",
    singularLabel: "Asset",
    reportSection: "Bookkeeping Assets",
    accountType: "asset",
    parentAccount: "Equipment",
    sourceEntity: "Asset",
    defaults: [],
  },
  marketing: {
    label: "Marketing categories",
    singularLabel: "Marketing category",
    reportSection: "Bookkeeping Marketing",
    accountType: "expense",
    parentAccount: "Marketing Expenses",
    sourceEntity: "Marketing category",
    defaults: ["Meta ads", "TikTok ads"],
  },
};
const businessEvents = [
  { group: "Money out", value: "inventory_purchase", label: "Inventory", transactionLabel: "Inventory Purchase", accountingMapping: "Inventory", accounts: ["Plush toy", "Packaging", "Carton Box", "Bubble wrap", "Carriage Inward", "Wax seal"] },
  { group: "Money out", value: "expense", label: "Expenses", transactionLabel: "Expense", accountingMapping: "Expenses", accounts: ["Labour", "Samples", "JnT (Carriage Outwards)"] },
  { group: "Money out", value: "asset_purchase", label: "Assets", transactionLabel: "Asset Purchase", accountingMapping: "Assets", accounts: ["New asset"] },
  { group: "Money out", value: "marketing_expense", label: "Marketing", transactionLabel: "Marketing Expense", accountingMapping: "Marketing", accounts: ["Meta ads", "TikTok ads"] },
  { group: "Money in", value: "payment_processor_paid", label: "Cash", transactionLabel: "Cash", accountingMapping: "Cash", accounts: ["Bank Transfer", "Stripe", "Xendit", "Payment Processing Fees", "Owner's Equity", "Drawings"] },
] as const;
const rejectedInventoryOption = "Rejected Inventory";
const bookkeepingEventByView: Partial<Record<View, (typeof businessEvents)[number]["value"]>> = {
  accounting_transactions: "inventory_purchase",
  accounting_documents: "expense",
  accounting_balance_sheet: "asset_purchase",
  accounting_profit_loss: "marketing_expense",
  accounting_cash_flow: "payment_processor_paid",
};

const accountingPresetAccounts: Omit<AccountingCategory, "id" | "parentId" | "active">[] = [
  { name: "Bank Account", accountType: "asset", reportSection: "Current Assets", dataSourceType: "system_generated", sourceModule: "Payment Processor", sourceEntity: "Payouts", postingTrigger: "Payout Received", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Accounts Receivable", accountType: "asset", reportSection: "Current Assets", dataSourceType: "system_generated", sourceModule: "Shopify", sourceEntity: "Orders", postingTrigger: "Order Paid", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Payment Processors", accountType: "asset", reportSection: "Current Assets", dataSourceType: "system_generated", sourceModule: "Payment Processor", sourceEntity: "Processor Balances", postingTrigger: "Payment Received", allowSubAccounts: true, allowedTransactionTypes: [] },
  { name: "Inventory", accountType: "asset", reportSection: "Current Assets", dataSourceType: "hybrid", sourceModule: "Inventory", sourceEntity: "Inventory Items", postingTrigger: "Inventory Purchased", allowSubAccounts: true, allowedTransactionTypes: [] },
  { name: "Prepaid Expenses", accountType: "asset", reportSection: "Current Assets", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Equipment", accountType: "asset", reportSection: "Non Current Assets", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Accumulated Depreciation", accountType: "asset", reportSection: "Non Current Assets", dataSourceType: "system_generated", sourceModule: "Depreciation Engine", sourceEntity: "Equipment", postingTrigger: "Depreciation Run", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Accounts Payable", accountType: "liability", reportSection: "Liabilities", dataSourceType: "hybrid", sourceModule: "Manual Transactions", sourceEntity: "Supplier Bills", postingTrigger: "Bill Created", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Tax Payable", accountType: "liability", reportSection: "Liabilities", dataSourceType: "system_generated", sourceModule: "Tax Engine", sourceEntity: "Tax Payable", postingTrigger: "Tax Calculated", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Accrued Expenses", accountType: "liability", reportSection: "Liabilities", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Customer Deposits", accountType: "liability", reportSection: "Liabilities", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Loan", accountType: "liability", reportSection: "Long Term Liabilities", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Owner Capital", accountType: "equity", reportSection: "Equity", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Owner Drawings", accountType: "equity", reportSection: "Equity", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Retained Earnings", accountType: "equity", reportSection: "Equity", dataSourceType: "system_generated", sourceModule: "Accounting", sourceEntity: "Closed Earnings", postingTrigger: "Year Closed", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Current Year Earnings", accountType: "equity", reportSection: "Equity", dataSourceType: "system_generated", sourceModule: "Accounting", sourceEntity: "Current Profit", postingTrigger: "Report Generated", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Shopify Sales", accountType: "revenue", reportSection: "Revenue", dataSourceType: "system_generated", sourceModule: "Shopify", sourceEntity: "Orders", postingTrigger: "Payment Received", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "TikTok Shop Sales", accountType: "revenue", reportSection: "Revenue", dataSourceType: "system_generated", sourceModule: "TikTok Shop", sourceEntity: "Orders", postingTrigger: "Payment Received", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Shipping Revenue", accountType: "revenue", reportSection: "Revenue", dataSourceType: "system_generated", sourceModule: "Shopify", sourceEntity: "Shipping Charges", postingTrigger: "Payment Received", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Meta Advertising", accountType: "expense", reportSection: "Marketing Expenses", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "TikTok Advertising", accountType: "expense", reportSection: "Marketing Expenses", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Influencer Marketing", accountType: "expense", reportSection: "Marketing Expenses", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Affiliate Commissions", accountType: "expense", reportSection: "Marketing Expenses", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Content Creation", accountType: "expense", reportSection: "Marketing Expenses", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Payment Processor Fees", accountType: "expense", reportSection: "Admin Fees", dataSourceType: "system_generated", sourceModule: "Payment Processor", sourceEntity: "Processor Fees", postingTrigger: "Payment Received", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Income Tax Expense", accountType: "expense", reportSection: "Tax", dataSourceType: "system_generated", sourceModule: "Tax Engine", sourceEntity: "Profit Tax", postingTrigger: "Tax Calculated", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "SST Expense", accountType: "expense", reportSection: "Tax", dataSourceType: "system_generated", sourceModule: "Tax Engine", sourceEntity: "SST", postingTrigger: "Tax Calculated", allowSubAccounts: false, allowedTransactionTypes: [] },
];
const manualExpenseAccounts = [
  ["Rejected Inventory", "Expense", false],
  ["Software Expenses", "Expense", true],
  ["Shopify Subscription", "Software Expenses", false],
  ["ChatGPT Subscription", "Software Expenses", false],
  ["Canva Subscription", "Software Expenses", false],
  ["Upload Lift", "Software Expenses", false],
  ["Domain & Hosting", "Software Expenses", false],
  ["Other Software", "Software Expenses", false],
  ["Professional Fees", "Admin Fees", false],
  ["Bank Charges", "Admin Fees", false],
  ["Office Expenses", "Admin Fees", false],
  ["Samples & Testing", "Admin Fees", false],
  ["Miscellaneous Expenses", "Admin Fees", false],
  ["Salary Expense", "Salary", false],
  ["Tax Penalties", "Tax", false],
] as const;
const cogsAccounts = ["Plushie Cost", "Speaker Cost", "Packaging Cost", "Shipping Cost", "Labour Cost", "NFC Cost", "Other Direct Costs"] as const;

const salesConsumptionMappingFormDefaults: SalesConsumptionMappingForm = {
  sku: "BILLY",
  inventoryItem: "PACKAGING",
  quantityPerSale: "1",
  operatingExpensePerSale: "0",
};

function normalizeAccountingItem(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function cogsAccountForInventoryItem(itemName: string) {
  const normalized = normalizeAccountingItem(itemName);
  if (normalized.includes("SPEAKER") || normalized.includes("VOICE")) return "Speaker Cost";
  if (normalized.includes("NFC")) return "NFC Cost";
  if (normalized.includes("PACK") || normalized.includes("BOX") || normalized.includes("BUBBLE") || normalized.includes("WAX")) return "Packaging Cost";
  if (normalized.includes("SHIPPING") || normalized.includes("CARRIAGE")) return "Shipping Cost";
  if (normalized.includes("LABOUR") || normalized.includes("LABOR")) return "Labour Cost";
  if (stockCharacters.includes(normalized as (typeof stockCharacters)[number]) || normalized.includes("PLUSH")) return "Plushie Cost";
  return "Other Direct Costs";
}
const processorAccounts = ["Xendit", "Stripe", "TikTok Shop"] as const;

const fulfilmentViews: readonly View[] = ["orders", "fulfilment", "packing_slips", "print_envelope", "import", "fulfilled"];
const accountingViews: readonly View[] = [
  "accounting_dashboard",
  "accounting_transactions",
  "accounting_csv_import",
  "accounting_payable",
  "accounting_files",
  "accounting_documents",
  "accounting_balance_sheet",
  "accounting_profit_loss",
  "accounting_cash_flow",
  "accounting_settings",
];
const formalAccountingViews: readonly View[] = ["accounting_general_journal", "accounting_t_accounts", "accounting_unit_costs", "accounting_financial_reports"];
const contentViews: readonly View[] = ["content_dashboard", "content_plan", "content_ideas"];
const dashboardViews: readonly View[] = [...fulfilmentViews, "history", "settings", "stock", "sales_report", ...accountingViews, ...formalAccountingViews, ...contentViews];
const adminOnlyViews = new Set<View>(["history", "settings", "stock", "sales_report", ...accountingViews, ...formalAccountingViews, ...contentViews]);
const workspaceDefaultViews: Record<Workspace, View> = {
  fulfilment: "orders",
  accounting: "accounting_dashboard",
  formal_accounting: "accounting_general_journal",
  inventory: "stock",
  reports: "sales_report",
  content: "content_dashboard",
  settings: "settings",
};
const workspaceLabels: Record<Workspace, string> = {
  fulfilment: "Fulfilment",
  accounting: "Book Keeping",
  formal_accounting: "Accounting",
  inventory: "Inventory",
  reports: "Reports",
  content: "Content Plan",
  settings: "Settings",
};
const orderStatusFilterValues = ["all", ...orderStatuses] as const;
const dashboardMetricValues = ["total", ...orderStatuses] as const;
const salesRangeValues = ["active", "today", "7d", "30d", "lifetime"] as const;
const collectedMetricValues = ["bankTransfer", "stripeCollected", "xenditCollected", "totalCollected"] as const;
const discountMetricValues = ["productDiscounted", "shippingDiscounted"] as const;
const feeMetricValues = ["processingFees", "shopifyFees", "totalFees"] as const;
const sortKeyValues = ["orderNumber", "importedAt", "updatedAt"] as const;
const sortDirectionValues = ["asc", "desc"] as const;
const sortChoiceLabels: Record<SortChoice, string> = {
  "orderNumber:asc": "Order number, ascending",
  "orderNumber:desc": "Order number, descending",
  "importedAt:asc": "Last added, oldest first",
  "importedAt:desc": "Last added, newest first",
  "updatedAt:asc": "Last edited, oldest first",
  "updatedAt:desc": "Last edited, newest first",
};
const fulfilmentColumnValues: readonly FulfilmentColumn[] = ["orderNumber", "meaningfulMessage", "plushName", "character", "idWebsiteLink", "customerName", "phone"];
const sessionStorageKey = "meaningful-plushies-dashboard-session";
const uiStorageKey = "meaningful-plushies-ui-preferences";
const envelopeSettingsStorageKey = "meaningful-plushies-envelope-print-settings";
const defaultEnvelopePrintSettings: EnvelopePrintSettings = {
  fontName: "",
  fontBase64: "",
  fontSize: 56,
  minFontSize: 34,
  boldness: 0,
  letterSpacing: 2.5,
  lineHeight: 0.96,
  textBoxWidth: 300,
  textBoxHeight: 150,
  topX: 301.8,
  topY: 1564.2,
  bottomX: 301.8,
  bottomY: 135.6,
};

const collectedMetricLabels: Record<CollectedMetric, string> = {
  bankTransfer: "Bank transfer collected",
  stripeCollected: "Stripe collected",
  xenditCollected: "Xendit collected",
  totalCollected: "Total collected",
};

const discountMetricLabels: Record<DiscountMetric, string> = {
  productDiscounted: "Product discounts",
  shippingDiscounted: "Shipping discounts",
};

const feeMetricLabels: Record<FeeMetric, string> = {
  processingFees: "Payment processing fees",
  shopifyFees: "Shopify fees",
  totalFees: "Total fees",
};

const statusLabels: Record<OrderStatus, string> = {
  new_order: "New Order",
  uploading_audio: "Uploading Audio",
  sent_for_sewing: "Sent for Sewing",
  packed: "Packed",
  shipped: "Shipped",
  issue: "Issue",
};

const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = {
  new_order: "uploading_audio",
  uploading_audio: "sent_for_sewing",
  sent_for_sewing: "packed",
  packed: "shipped",
};

const legacyStatus: Record<string, OrderStatus> = {
  awaiting_voice: "uploading_audio",
  ready_to_make: "sent_for_sewing",
  making: "sent_for_sewing",
  ready_to_pack: "sent_for_sewing",
  fulfilled: "shipped",
};

type FulfilmentColumn = "orderNumber" | "meaningfulMessage" | "plushName" | "character" | "idWebsiteLink" | "customerName" | "phone";

const fulfilmentColumnLabels: Record<FulfilmentColumn, string> = {
  orderNumber: "Order ID",
  meaningfulMessage: "Meaningful Message",
  plushName: "Plush Name",
  character: "Character",
  idWebsiteLink: "ID Website Link",
  customerName: "Customer Name",
  phone: "Phone Number",
};

type NavItem = { view: View; label: string; icon: IconName };

const fulfilmentNavItems: NavItem[] = [
  { view: "orders", label: "Orders", icon: "orders" },
  { view: "fulfilment", label: "Fulfilment", icon: "fulfilment" },
  { view: "packing_slips", label: "Packing Slips", icon: "packing" },
  { view: "print_envelope", label: "Print Envelope", icon: "envelope" },
  { view: "import", label: "CSV Import", icon: "import" },
];

const fulfilmentAdminNavItems: NavItem[] = [
  { view: "sales_report", label: "Sales Report", icon: "report" },
];

const accountingNavItems: NavItem[] = [
  { view: "accounting_dashboard", label: "Book Keeping Book", icon: "ledger" },
  { view: "accounting_payable", label: "Unsettled Payments", icon: "cash" },
  { view: "accounting_files", label: "Files", icon: "documents" },
  { view: "accounting_csv_import", label: "CSV Import", icon: "import" },
  { view: "accounting_transactions", label: "Inventory", icon: "stock" },
  { view: "accounting_documents", label: "Expenses", icon: "documents" },
  { view: "accounting_balance_sheet", label: "Assets", icon: "accounting" },
  { view: "accounting_profit_loss", label: "Marketing", icon: "report" },
  { view: "accounting_cash_flow", label: "Cash", icon: "cash" },
  { view: "accounting_settings", label: "Book Keeping Settings", icon: "settings" },
];
const formalAccountingNavItems: NavItem[] = [
  { view: "accounting_general_journal", label: "General Journal", icon: "ledger" },
  { view: "accounting_t_accounts", label: "T Accounts", icon: "accounting" },
  { view: "accounting_unit_costs", label: "Unit Costs", icon: "stock" },
  { view: "accounting_financial_reports", label: "Financial Reports", icon: "report" },
];

const inventoryNavItems: NavItem[] = [{ view: "stock", label: "Stock Count", icon: "stock" }];
const reportsNavItems: NavItem[] = [{ view: "sales_report", label: "Sales Report", icon: "report" }];
const contentNavItems: NavItem[] = [
  { view: "content_dashboard", label: "Dashboard", icon: "report" },
  { view: "content_plan", label: "Planned Content", icon: "calendar" },
  { view: "content_ideas", label: "Idea Brainstorming", icon: "idea" },
];
const settingsNavItems: NavItem[] = [
  { view: "settings", label: "Fulfilment Settings", icon: "settings" },
  { view: "history", label: "History", icon: "history" },
];

function formatDate(value: string, withTime = false) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-MY", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function dateKey(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthStartKey(date = new Date()) {
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

function monthEndKey(date = new Date()) {
  return localDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function formatMoney(value: number, currency = "MYR") {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(value);
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return fallback;
}

function parseLooseCsv(text: string) {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsvAmount(value: string) {
  const cleaned = value.replace(/[^\d.,()-]/g, "").replace(/,/g, "");
  if (!cleaned) return 0;
  const negative = cleaned.includes("(") && cleaned.includes(")");
  const amount = Number(cleaned.replace(/[()]/g, ""));
  return Number.isFinite(amount) ? Math.abs(amount) * (negative ? -1 : 1) : 0;
}

function csvColumn(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    if (value !== undefined && value !== "") return value.trim();
  }
  return "";
}

function inferBookkeepingEvent(category: string, type: string): (typeof businessEvents)[number]["value"] {
  const text = `${category} ${type}`.toLowerCase();
  if (text.includes("asset") || text.includes("equipment") || text.includes("printer") || text.includes("machine") || text.includes("camera")) return "asset_purchase";
  if (text.includes("marketing") || text.includes("meta") || text.includes("tiktok ad") || text.includes("advertis") || text.includes("influencer")) return "marketing_expense";
  if (text.includes("cash") || text.includes("stripe") || text.includes("xendit") || text.includes("payout") || text.includes("bank transfer") || text.includes("owner")) return "payment_processor_paid";
  if (text.includes("inventory") || text.includes("plush") || text.includes("speaker") || text.includes("nfc") || text.includes("packaging") || text.includes("box") || text.includes("wax") || text.includes("bubble")) return "inventory_purchase";
  return "expense";
}

function parseBookkeepingPaymentStatus(value: string): AccountingTransactionForm["paymentStatus"] {
  const text = value.toLowerCase();
  if (text.includes("deposit")) return "deposit_paid";
  if (text.includes("credit") || text.includes("unpaid") || text.includes("pay later") || text.includes("outstanding")) return "on_credit";
  return "paid_in_full";
}

function formatCalculatorNumber(value: number, decimals = 2) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return Number(value.toFixed(decimals)).toString();
}

function calculateInventoryCostFields(
  current: AccountingTransactionForm,
  changed: Partial<Pick<AccountingTransactionForm, "unitCost" | "quantity" | "amount">>,
  manualFields: InventoryCostField[],
) {
  const next = { ...current, ...changed };
  const unitCost = Number(next.unitCost);
  const quantity = Number(next.quantity);
  const amount = Number(next.amount);
  const hasUnitCost = Number.isFinite(unitCost) && unitCost > 0;
  const hasQuantity = Number.isFinite(quantity) && quantity > 0;
  const hasAmount = Number.isFinite(amount) && amount > 0;
  const manual = new Set(manualFields);
  if (manual.has("unitCost") && manual.has("quantity") && hasUnitCost && hasQuantity) return { ...changed, amount: formatCalculatorNumber(unitCost * quantity) };
  if (manual.has("amount") && manual.has("quantity") && hasAmount && hasQuantity) return { ...changed, unitCost: formatCalculatorNumber(amount / quantity, 4) };
  if (manual.has("amount") && manual.has("unitCost") && hasAmount && hasUnitCost) return { ...changed, quantity: formatCalculatorNumber(amount / unitCost, 4) };
  return changed;
}

function printView(className: "print-packing" | "print-sales-report" | "print-financial-report") {
  document.body.classList.add(className);
  const cleanup = () => document.body.classList.remove(className);
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}

function whatsappLink(order: Order) {
  const digits = order.phone.replace(/\D/g, "");
  const phone = digits.startsWith("60") ? digits : digits.startsWith("0") ? `60${digits.slice(1)}` : `60${digits}`;
  const tracking = order.trackingNumber ? `Tracking number: ${order.trackingNumber}` : "We will share your tracking number soon.";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`Hi ${order.customerName}, your Meaningful Plushie ${order.plushName} is being prepared. ${tracking}`)}`;
}

function orderLabel(order: Order) {
  return `#${order.orderNumber}${order.setIndicator ? ` ${order.setIndicator}` : ""}`;
}

function certificateLink(order: Order, includeProtocol = true) {
  const link = order.certificateCode
    ? `meaningfulplushies.com/pages/certificate/${order.certificateCode.trim()}`
    : order.idWebsiteLink.replace(/^https?:\/\//i, "");
  return includeProtocol && link ? `https://${link}` : link;
}

function splitShipmentSortValue(order: Pick<Order, "orderNumber" | "setIndicator">) {
  const text = `${order.orderNumber} ${order.setIndicator ?? ""}`;
  const match = text.match(/(?:set\s*)?(\d+)\s*(?:[,./]|\bof\b)\s*(\d+)/i);
  if (!match) return { part: 0, total: 0 };
  return { part: Number(match[1]) || 0, total: Number(match[2]) || 0 };
}

function compareSplitShipmentOrder(a: Pick<Order, "orderNumber" | "setIndicator">, b: Pick<Order, "orderNumber" | "setIndicator">) {
  const aSplit = splitShipmentSortValue(a);
  const bSplit = splitShipmentSortValue(b);
  return aSplit.part - bSplit.part || aSplit.total - bSplit.total;
}

function sortOrderRecords<T extends Pick<Order, "orderNumber" | "importedAt" | "updatedAt" | "setIndicator">>(
  records: T[], key: SortKey, direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    if (key === "orderNumber") {
      const orderComparison = multiplier * (Number(a.orderNumber) - Number(b.orderNumber));
      return orderComparison || compareSplitShipmentOrder(a, b);
    }
    const dateComparison = multiplier * (new Date(a[key]).getTime() - new Date(b[key]).getTime());
    return dateComparison || compareSplitShipmentOrder(a, b);
  });
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function removeStored(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function readStoredSession() {
  const session = readJson<Session>(sessionStorageKey);
  if (!session?.token || !session.username || !session.displayName || !["admin", "staff"].includes(session.role)) return null;
  return session;
}

function readStoredUi() {
  return readJson<StoredUiPreferences>(uiStorageKey) ?? {};
}

function readStoredEnvelopeSettings(): EnvelopePrintSettings {
  return { ...defaultEnvelopePrintSettings, ...(readJson<Partial<EnvelopePrintSettings>>(envelopeSettingsStorageKey) ?? {}) };
}

function choice<T extends string>(value: unknown, fallback: T, allowed: readonly T[]) {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function cleanFulfilmentColumns(value: unknown) {
  if (!Array.isArray(value)) return [...fulfilmentColumnValues];
  const columns = value.filter((column): column is FulfilmentColumn => fulfilmentColumnValues.includes(column));
  return [...columns, ...fulfilmentColumnValues.filter((column) => !columns.includes(column))];
}

function permittedView(value: unknown, role?: UserRole) {
  const view = choice(value, "orders" as View, dashboardViews);
  return role === "staff" && adminOnlyViews.has(view) ? "orders" : view;
}

function workspaceForView(view: View): Workspace {
  if (contentViews.includes(view)) return "content";
  if (formalAccountingViews.includes(view)) return "formal_accounting";
  if (accountingViews.includes(view)) return "accounting";
  if (view === "stock") return "inventory";
  if (view === "sales_report") return "reports";
  if (view === "history" || view === "settings") return "settings";
  return "fulfilment";
}

function navItemsForWorkspace(workspace: Workspace, role: UserRole): NavItem[] {
  if (role !== "admin") return fulfilmentNavItems;
  if (workspace === "accounting") return accountingNavItems;
  if (workspace === "formal_accounting") return formalAccountingNavItems;
  if (workspace === "inventory") return inventoryNavItems;
  if (workspace === "reports") return reportsNavItems;
  if (workspace === "content") return contentNavItems;
  if (workspace === "settings") return settingsNavItems;
  return [...fulfilmentNavItems, ...fulfilmentAdminNavItems];
}

function viewTitle(view: View) {
  const titleOverrides: Partial<Record<View, string>> = {
    orders: "Orders Dashboard",
    import: "Import Shopify Orders",
    fulfilled: "Shipped Orders",
    history: "Activity History",
    content_dashboard: "Content Dashboard",
    content_plan: "Planned Content",
    content_ideas: "Idea Brainstorming",
  };
  if (titleOverrides[view]) return titleOverrides[view]!;
  const item = [...fulfilmentNavItems, ...fulfilmentAdminNavItems, ...accountingNavItems, ...formalAccountingNavItems, ...inventoryNavItems, ...reportsNavItems, ...contentNavItems, ...settingsNavItems]
    .find((navItem) => navItem.view === view);
  if (item) return item.label;
  return "Orders Dashboard";
}

export default function Home() {
  const storedSession = readStoredSession();
  const storedUi = readStoredUi();
  const storedEnvelopeSettings = readStoredEnvelopeSettings();
  const [session, setSession] = useState<Session | null>(() => storedSession);
  const [view, setView] = useState<View>(() => permittedView(storedUi.view, storedSession?.role));
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState(() => storedUi.query ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | OrderStatus>(() => choice(storedUi.statusFilter, "all", orderStatusFilterValues));
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [packingSelection, setPackingSelection] = useState<string[]>([]);
  const [envelopeSelection, setEnvelopeSelection] = useState<string[]>([]);
  const [packingStatusFilter, setPackingStatusFilter] = useState<"all" | OrderStatus>(() => choice(storedUi.packingStatusFilter, "all", orderStatusFilterValues));
  const [envelopeStatusFilter, setEnvelopeStatusFilter] = useState<"all" | OrderStatus>(() => choice(storedUi.envelopeStatusFilter, "all", orderStatusFilterValues));
  const [dashboardStatus, setDashboardStatus] = useState<OrderStatus | "total">(() => choice(storedUi.dashboardStatus, "packed", dashboardMetricValues));
  const [dashboardStatusTwo, setDashboardStatusTwo] = useState<OrderStatus | "total">(() => choice(storedUi.dashboardStatusTwo, "issue", dashboardMetricValues));
  const [salesRange, setSalesRange] = useState<SalesRange>(() => choice(storedUi.salesRange, "active", salesRangeValues));
  const [collectedMetric, setCollectedMetric] = useState<CollectedMetric>(() => choice(storedUi.collectedMetric, "totalCollected", collectedMetricValues));
  const [discountMetric, setDiscountMetric] = useState<DiscountMetric>(() => choice(storedUi.discountMetric, "productDiscounted", discountMetricValues));
  const [feeMetric, setFeeMetric] = useState<FeeMetric>(() => choice(storedUi.feeMetric, "totalFees", feeMetricValues));
  const [sortKey, setSortKey] = useState<SortKey>(() => choice(storedUi.sortKey, "orderNumber", sortKeyValues));
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => choice(storedUi.sortDirection, "asc", sortDirectionValues));
  const [reportSelectedOrders, setReportSelectedOrders] = useState<string[]>([]);
  const [reportStartDate, setReportStartDate] = useState(() => storedUi.reportStartDate ?? "");
  const [reportEndDate, setReportEndDate] = useState(() => storedUi.reportEndDate ?? "");
  const [processorSettings, setProcessorSettings] = useState<PaymentProcessorSetting[]>([]);
  const [salesFeeSettings, setSalesFeeSettings] = useState<SalesFeeSetting>({ shopifyPercentage: 0 });
  const [stockSettings, setStockSettings] = useState<StockSetting[]>([]);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [accountingCategories, setAccountingCategories] = useState<AccountingCategory[]>([]);
  const [accountingDocuments, setAccountingDocuments] = useState<AccountingDocument[]>([]);
  const [accountingTransactions, setAccountingTransactions] = useState<AccountingTransaction[]>([]);
  const [accountingLedgerEntries, setAccountingLedgerEntries] = useState<AccountingLedgerEntry[]>([]);
  const [salesConsumptionMappings, setSalesConsumptionMappings] = useState<SalesConsumptionMapping[]>([]);
  const [contentPlanItems, setContentPlanItems] = useState<ContentPlanItem[]>([]);
  const [contentIdeas, setContentIdeas] = useState<ContentIdeaItem[]>([]);
  const [accountingDocumentFile, setAccountingDocumentFile] = useState<File | null>(null);
  const [transactionDocumentFile, setTransactionDocumentFile] = useState<File | null>(null);
  const [settlementFiles, setSettlementFiles] = useState<Record<string, File | null>>({});
  const [previewDocument, setPreviewDocument] = useState<AccountingDocument | null>(null);
  const [previewDocumentUrl, setPreviewDocumentUrl] = useState("");
  const [previewDocumentError, setPreviewDocumentError] = useState("");
  const [savingAccounting, setSavingAccounting] = useState(false);
  const [documentForm, setDocumentForm] = useState<AccountingDocumentForm>({
    name: "",
    supplier: "",
    description: "",
    documentDate: dateKey(new Date().toISOString()),
    amount: "",
    categoryId: "",
    transactionType: "expense" as "income" | "expense",
    taxTreatment: "none",
    notes: "",
  });
  const [transactionForm, setTransactionForm] = useState<AccountingTransactionForm>({
    businessEvent: "inventory_purchase",
    transactionDate: dateKey(new Date().toISOString()),
    description: "",
    accountName: "Cash",
    amount: "",
    categoryId: "",
    transactionType: "expense" as "income" | "expense" | "transfer",
    paymentStatus: "paid_in_full",
    paymentMethod: "Bank Account",
    supplier: "",
    quantity: "",
    unitCost: "",
    depositAmount: "",
    invoiceNumber: "",
    dueDate: "",
    supplierTerms: "",
    taxTreatment: "none",
    notes: "",
  });
  const [accountForm, setAccountForm] = useState<AccountingAccountForm>({
    id: "",
    name: "",
    accountType: "expense",
    reportSection: "Expenses",
    parentId: "",
    dataSourceType: "manual",
    sourceModule: "Manual Transactions",
    sourceEntity: "",
    postingTrigger: "Manual Entry",
    allowSubAccounts: false,
    active: true,
  });
  const [bookkeepingCategoryForm, setBookkeepingCategoryForm] = useState<BookkeepingCategoryForm>({
    section: "inventory",
    name: "",
  });
  const [salesConsumptionMappingForm, setSalesConsumptionMappingForm] = useState<SalesConsumptionMappingForm>(salesConsumptionMappingFormDefaults);
  const [contentPlanForm, setContentPlanForm] = useState<ContentPlanForm>({
    title: "",
    plannedDate: localDateKey(new Date()),
    platform: "Instagram",
    contentType: "Post",
    notes: "",
  });
  const [contentIdeaForm, setContentIdeaForm] = useState<ContentIdeaForm>({
    title: "",
    idea: "",
    references: [],
    referenceName: "",
    referenceUrl: "",
  });
  const [bookkeepingCsvRows, setBookkeepingCsvRows] = useState<BookkeepingCsvImportRow[]>([]);
  const [bookkeepingCsvFileName, setBookkeepingCsvFileName] = useState("");
  const [inventoryCostManualFields, setInventoryCostManualFields] = useState<InventoryCostField[]>([]);
  const [accountPasswords, setAccountPasswords] = useState<Record<string, string>>({});
  const [newAccount, setNewAccount] = useState({ username: "", displayName: "", role: "staff" as UserRole, password: "" });
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<FulfilmentColumn | null>(null);
  const [fulfilmentColumns, setFulfilmentColumns] = useState<FulfilmentColumn[]>(() => cleanFulfilmentColumns(storedUi.fulfilmentColumns));
  const [manualOrderIds, setManualOrderIds] = useState("");
  const [manualEnvelopeIds, setManualEnvelopeIds] = useState("");
  const [envelopePrintSettings, setEnvelopePrintSettings] = useState<EnvelopePrintSettings>(() => storedEnvelopeSettings);
  const [orderCsv, setOrderCsv] = useState("");
  const [metafieldCsv, setMetafieldCsv] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [databaseError, setDatabaseError] = useState("");

  const loadSharedData = useCallback(async (showLoading = false) => {
    if (!supabaseConfigured) {
      setDatabaseError("Supabase is not configured. Add the public Supabase URL and anon key in Vercel.");
      setLoadingOrders(false);
      return;
    }
    if (showLoading) setLoadingOrders(true);
    try {
      const [
        sharedOrders,
        sharedActivity,
        sharedProcessorSettings,
        sharedStockSettings,
        sharedSalesFeeSettings,
        sharedAccountingCategories,
        sharedAccountingDocuments,
        sharedAccountingTransactions,
        sharedAccountingLedgerEntries,
        sharedSalesConsumptionMappings,
        sharedContentPlanItems,
        sharedContentIdeas,
      ] = await Promise.all([
        fetchSharedOrders(), fetchSharedActivity(), fetchPaymentProcessorSettings(), fetchStockSettings(), fetchSalesFeeSettings(),
        fetchAccountingCategories(), fetchAccountingDocuments(), fetchAccountingTransactions(), fetchAccountingLedgerEntries(), fetchSalesConsumptionMappings(), fetchContentPlanItems(), fetchContentIdeas(),
      ]);
      setOrders(sharedOrders.map((order) => {
      const status = legacyStatus[order.status] ?? order.status;
      return {
        ...order,
        status,
        currency: order.currency ?? "MYR",
        subtotalAmount: order.subtotalAmount ?? 0,
        shippingAmount: order.shippingAmount ?? 0,
        totalAmount: order.totalAmount ?? 0,
        discountAmount: order.discountAmount ?? 0,
        productDiscountAmount: order.productDiscountAmount ?? 0,
        shippingDiscountAmount: order.shippingDiscountAmount ?? 0,
        refundedAmount: order.refundedAmount ?? 0,
        outstandingBalance: order.outstandingBalance ?? 0,
        paymentProcessor: normalizePaymentProcessor(order.paymentProcessor ?? "", order.totalAmount === 0),
        shippingMethod: order.shippingMethod ?? "",
        setIndicator: order.setIndicator ?? "",
        idWebsiteLink: order.idWebsiteLink ?? "",
        statusHistory: (order.statusHistory ?? []).map((event) => ({
          ...event,
          status: legacyStatus[event.status] ?? event.status,
        })),
      };
      }));
      setActivity(sharedActivity);
      setProcessorSettings(sharedProcessorSettings);
      setStockSettings(sharedStockSettings);
      setSalesFeeSettings(sharedSalesFeeSettings);
      setAccountingCategories(sharedAccountingCategories);
      setAccountingDocuments(sharedAccountingDocuments);
      setAccountingTransactions(sharedAccountingTransactions);
      setAccountingLedgerEntries(sharedAccountingLedgerEntries);
      setSalesConsumptionMappings(sharedSalesConsumptionMappings);
      setContentPlanItems(sharedContentPlanItems);
      setContentIdeas(sharedContentIdeas);
      setDatabaseError("");
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : "Could not load orders from Supabase.");
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    void loadSharedData(true);
    if (!supabaseConfigured) return;
    return subscribeToSharedData(() => { void loadSharedData(); });
  }, [loadSharedData]);

  useEffect(() => {
    if (session) writeJson(sessionStorageKey, session);
    else removeStored(sessionStorageKey);
  }, [session]);

  useEffect(() => {
    writeJson(uiStorageKey, {
      view: permittedView(view, session?.role),
      query,
      statusFilter,
      packingStatusFilter,
      envelopeStatusFilter,
      dashboardStatus,
      dashboardStatusTwo,
      salesRange,
      collectedMetric,
      discountMetric,
      feeMetric,
      sortKey,
      sortDirection,
      reportStartDate,
      reportEndDate,
      fulfilmentColumns,
    } satisfies StoredUiPreferences);
  }, [
    view,
    session,
    query,
    statusFilter,
    packingStatusFilter,
    envelopeStatusFilter,
    dashboardStatus,
    dashboardStatusTwo,
    salesRange,
    collectedMetric,
    discountMetric,
    feeMetric,
    sortKey,
    sortDirection,
    reportStartDate,
    reportEndDate,
    fulfilmentColumns,
  ]);

  useEffect(() => {
    writeJson(envelopeSettingsStorageKey, envelopePrintSettings);
  }, [envelopePrintSettings]);

  useEffect(() => {
    if (session?.role !== "admin") return;
    void fetchDashboardAccounts(session.token).then(setAccounts).catch((error) => setNotice(error instanceof Error ? error.message : "Accounts could not be loaded."));
  }, [session]);

  useEffect(() => {
    if (session?.role === "staff" && adminOnlyViews.has(view)) setView("orders");
  }, [session, view]);

  useEffect(() => {
    const businessEvent = bookkeepingEventByView[view];
    if (!businessEvent) return;
    setTransactionForm((current) => current.businessEvent === businessEvent ? current : {
      ...emptyTransactionForm(),
      businessEvent,
      categoryId: "",
      accountName: "",
    });
  }, [view]);

  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const packingOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => packingSelection.includes(order.id)),
    "orderNumber",
    "desc",
  ), [orders, packingSelection]);
  const envelopeOrders = envelopeSelection
    .map((id) => orders.find((order) => order.id === id))
    .filter((order): order is Order => Boolean(order));
  const envelopePages = Array.from({ length: Math.ceil(envelopeOrders.length / 2) }, (_, index) => envelopeOrders.slice(index * 2, index * 2 + 2));
  const packingAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => packingStatusFilter === "all" || order.status === packingStatusFilter),
    "orderNumber",
    "desc",
  ), [orders, packingStatusFilter]);
  const envelopeAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => envelopeStatusFilter === "all" || order.status === envelopeStatusFilter),
    "orderNumber",
    "desc",
  ), [orders, envelopeStatusFilter]);
  const filtered = useMemo(() => {
    const source = view === "fulfilled" ? orders.filter((order) => order.status === "shipped") : orders;
    const search = query.trim().toLowerCase();
    const matching = source
      .filter((order) => statusFilter === "all" || order.status === statusFilter)
      .filter((order) => !search || [order.orderNumber, order.customerName, order.phone, order.trackingNumber, order.plushName, order.product, order.character, order.shippingMethod]
        .join(" ").toLowerCase().includes(search));
    return sortOrderRecords(matching, sortKey, sortDirection);
  }, [orders, query, statusFilter, view, sortKey, sortDirection]);

  const counts = useMemo(() => ({
    total: orders.filter((order) => order.status !== "shipped").length,
    voice: orders.filter((order) => order.status === "uploading_audio").length,
    production: orders.filter((order) => order.status === "sent_for_sewing").length,
    selected: dashboardStatus === "total" ? orders.length : orders.filter((order) => order.status === dashboardStatus).length,
    selectedTwo: dashboardStatusTwo === "total" ? orders.length : orders.filter((order) => order.status === dashboardStatusTwo).length,
  }), [orders, dashboardStatus, dashboardStatusTwo]);

  const reportingOrders = useMemo(() => {
    if (salesRange === "active") return orders.filter((order) => order.status !== "shipped");
    if (salesRange === "lifetime") return orders;
    if (salesRange === "today") {
      const today = dateKey(new Date().toISOString());
      return orders.filter((order) => dateKey(order.orderDate) === today);
    }
    const days = salesRange === "7d" ? 7 : 30;
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
    return orders.filter((order) => new Date(order.orderDate).getTime() >= threshold);
  }, [orders, salesRange]);
  const sales = useMemo(() => summarizeSales(reportingOrders, processorSettings, salesFeeSettings.shopifyPercentage), [reportingOrders, processorSettings, salesFeeSettings]);
  const allSalesReportRows = useMemo(() => buildSalesReportRows(orders, processorSettings, salesFeeSettings.shopifyPercentage), [orders, processorSettings, salesFeeSettings]);
  const processorAccountingTotals = useMemo(() => allSalesReportRows.reduce((totals, row) => {
    if (row.paymentProcessor === "Stripe") {
      totals.stripeCollected += row.salePrice;
      totals.stripeProcessingFees += row.processingFee;
    }
    if (row.paymentProcessor === "Xendit") {
      totals.xenditCollected += row.salePrice;
      totals.xenditProcessingFees += row.processingFee;
    }
    return totals;
  }, { stripeCollected: 0, stripeProcessingFees: 0, xenditCollected: 0, xenditProcessingFees: 0 }), [allSalesReportRows]);
  const dateFilteredReportRows = useMemo(() => allSalesReportRows.filter((row) => {
    const date = dateKey(row.orderDate);
    return (!reportStartDate || date >= reportStartDate) && (!reportEndDate || date <= reportEndDate);
  }).sort((a, b) => Number(a.orderNumber) - Number(b.orderNumber)), [allSalesReportRows, reportStartDate, reportEndDate]);
  const visibleReportRows = useMemo(() => reportSelectedOrders.length
    ? dateFilteredReportRows.filter((row) => reportSelectedOrders.includes(row.orderNumber))
    : dateFilteredReportRows, [dateFilteredReportRows, reportSelectedOrders]);
  const reportTotals = useMemo(() => visibleReportRows.reduce((total, row) => ({
    sales: total.sales + row.salePrice,
    discounts: total.discounts + row.totalDiscount,
    processingFees: total.processingFees + row.processingFee,
    shopifyFees: total.shopifyFees + row.shopifyFee,
    fees: total.fees + row.totalFees,
    cash: total.cash + row.cashAfterFees,
  }), { sales: 0, discounts: 0, processingFees: 0, shopifyFees: 0, fees: 0, cash: 0 }), [visibleReportRows]);
  const stock = useMemo(() => summarizeStock(orders, stockSettings), [orders, stockSettings]);
  const historyEvents = useMemo<ActivityEvent[]>(() => [
    ...activity,
    ...orders.flatMap((order) => order.statusHistory.map((event) => ({
      id: `status-${event.id}`,
      orderNumber: order.orderNumber,
      action: "Status changed",
      detail: `${statusLabels[event.status]}${event.note ? ` - ${event.note}` : ""}`,
      actor: event.changedBy,
      createdAt: event.changedAt,
    }))),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [activity, orders]);

  if (!session) return <Login onLogin={setSession} />;
  const currentSession = session;

  function signOut() {
    setSession(null);
    setSelectedOrders([]);
    setSelectedId(null);
  }

  async function logActivity(action: string, detail: string, orderNumber?: string) {
    const createdAt = new Date().toISOString();
    const event = {
      id: `${createdAt}-${Math.random().toString(36).slice(2)}`,
      orderNumber,
      action,
      detail,
      actor: session ? `${session.displayName} (${session.username})` : "System",
      createdAt,
    };
    setActivity((current) => [event, ...current]);
    try { await insertSharedActivity(event); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Activity history could not be saved."); }
  }

  async function updateOrder(orderId: string, patch: Partial<Order>) {
    if (currentSession.role !== "admin") return setNotice("Staff accounts can only move orders to the next stage.");
    const order = orders.find((item) => item.id === orderId);
    if (!order) return;
    const updated = { ...order, ...patch, updatedAt: new Date().toISOString() };
    setOrders((current) => current.map((item) => item.id === orderId ? updated : item));
    try {
      await upsertSharedOrders([updated]);
      await logActivity("Order updated", `Changed ${Object.keys(patch).join(", ")}.`, order.orderNumber);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Order update could not be saved.");
      await loadSharedData();
    }
  }

  async function setStatus(order: Order, status: OrderStatus) {
    if (order.status === status) return;
    if (currentSession.role === "staff" && nextStatus[order.status] !== status) {
      return setNotice("Staff accounts can only move orders to the next stage.");
    }
    const changedAt = new Date().toISOString();
    const updated: Order = {
      ...order,
      status,
      updatedAt: changedAt,
      statusHistory: [...(order.statusHistory ?? []), {
        id: `${order.id}-${changedAt}`,
        status,
        changedAt,
        changedBy: session ? `${session.displayName} (${session.username})` : "Staff",
      }],
    };
    setOrders((current) => current.map((item) => item.id === order.id ? updated : item));
    try { await upsertSharedOrders([updated]); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Status change could not be saved."); await loadSharedData(); return; }
    setNotice(`#${order.orderNumber} updated to ${statusLabels[status]}.`);
  }

  async function bulkMoveNext() {
    const selected = orders.filter((order) => selectedOrders.includes(order.id));
    if (!selected.length) return setNotice("Select at least one order first.");
    const changedAt = new Date().toISOString();
    let moved = 0;
    const changed: Order[] = [];
    const nextOrders = orders.map((order) => {
      if (!selectedOrders.includes(order.id)) return order;
      const status = nextStatus[order.status];
      if (!status) return order;
      moved += 1;
      const updated: Order = {
        ...order,
        status,
        updatedAt: changedAt,
        statusHistory: [...(order.statusHistory ?? []), {
          id: `${order.id}-${changedAt}-${status}`,
          status,
          changedAt,
          changedBy: session ? `${session.displayName} (${session.username})` : "Staff",
          note: "Bulk status update",
        }],
      };
      changed.push(updated);
      return updated;
    });
    setOrders(nextOrders);
    try { await upsertSharedOrders(changed); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Orders could not be saved."); await loadSharedData(); return; }
    setSelectedOrders([]);
    setNotice(`${moved} order${moved === 1 ? "" : "s"} moved to the next status.`);
  }

  function toggleOrderSelection(orderId: string) {
    setSelectedOrders((current) => current.includes(orderId)
      ? current.filter((id) => id !== orderId)
      : [...current, orderId]);
  }

  function reorderFulfilmentColumn(source: FulfilmentColumn, target: FulfilmentColumn) {
    if (source === target || source === "orderNumber" || target === "orderNumber") return;
    setFulfilmentColumns((current) => {
      const next = current.filter((column) => column !== source);
      next.splice(next.indexOf(target), 0, source);
      return next;
    });
    setDraggedColumn(null);
  }

  async function copyCertificateLink(order: Order) {
    const link = certificateLink(order, false);
    if (!link) return setNotice(`#${order.orderNumber} has no certificate code.`);
    await navigator.clipboard.writeText(link);
    setNotice(`Certificate link for #${order.orderNumber} copied without https://.`);
  }

  async function runImport() {
    const { orders: imported, result } = importShopifyData(orderCsv, metafieldCsv, orders, session ? `${session.displayName} (${session.username})` : "Admin");
    try {
      await upsertSharedOrders(imported);
      await ensurePaymentProcessors(imported.map((order) => order.paymentProcessor));
    }
    catch (error) { setNotice(error instanceof Error ? error.message : "Import could not be saved to Supabase."); return; }
    setOrders(imported);
    setOrderCsv("");
    setMetafieldCsv("");
    setNotice(`${result.imported} new orders imported, ${result.updated} updated, ${result.skipped} skipped.`);
    await logActivity("CSV import", `${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped.`);
    setView("orders");
    await loadSharedData();
  }

  async function saveProcessor(setting: PaymentProcessorSetting) {
    try {
      await savePaymentProcessorSetting(setting);
      setNotice(`${setting.processor} processing fee saved.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Processing fee could not be saved.");
      await loadSharedData();
    }
  }

  async function saveShopifyFee() {
    try {
      await saveSalesFeeSettings(salesFeeSettings);
      setNotice("Shopify fee saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Shopify fee could not be saved.");
      await loadSharedData();
    }
  }

  async function createAccount() {
    if (!newAccount.username.trim() || !newAccount.displayName.trim() || newAccount.password.length < 8) {
      return setNotice("Enter a username, display name, and password of at least 8 characters.");
    }
    try {
      await createDashboardAccount(currentSession.token, newAccount, newAccount.password);
      setAccounts(await fetchDashboardAccounts(currentSession.token));
      setNewAccount({ username: "", displayName: "", role: "staff", password: "" });
      setNotice("Account created.");
      await logActivity("Account created", `Created @${newAccount.username} as ${newAccount.role}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Account could not be created.");
    }
  }

  async function saveAccount(account: DashboardAccount, password = "") {
    try {
      await updateDashboardAccount(currentSession.token, account, password);
      setAccounts(await fetchDashboardAccounts(currentSession.token));
      setNotice(`@${account.username} updated.`);
      await logActivity("Account updated", `Updated @${account.username}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Account could not be updated.");
    }
  }

  async function saveStock(setting: StockSetting) {
    try {
      await saveStockSetting(setting);
      setNotice(`${setting.itemKey} stock saved.`);
      await logActivity("Stock updated", `${setting.itemKey} initial stock set to ${setting.initialStock}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Stock could not be saved.");
    }
  }

  async function setupAccountingChart() {
    const existing = new Map(accountingCategories.map((account) => [account.name.toLowerCase(), account]));
    const saved: AccountingCategory[] = [];
    async function ensureAccount(input: Omit<AccountingCategory, "id" | "parentId" | "active"> & { parentName?: string }) {
      const current = existing.get(input.name.toLowerCase());
      const parentId = input.parentName ? existing.get(input.parentName.toLowerCase())?.id ?? "" : "";
      const account: AccountingCategory = {
        id: current?.id ?? crypto.randomUUID(),
        name: input.name,
        accountType: input.accountType,
        reportSection: input.reportSection,
        parentId,
        dataSourceType: current?.dataSourceType ?? input.dataSourceType,
        sourceModule: current?.sourceModule ?? input.sourceModule,
        sourceEntity: current?.sourceEntity ?? input.sourceEntity,
        postingTrigger: current?.postingTrigger ?? input.postingTrigger,
        allowSubAccounts: input.allowSubAccounts,
        allowedTransactionTypes: [],
        active: true,
      };
      await saveAccountingCategory(account);
      existing.set(account.name.toLowerCase(), account);
      saved.push(account);
    }
    try {
      setSavingAccounting(true);
      for (const account of accountingPresetAccounts) await ensureAccount(account);
      for (const processor of processorAccounts) await ensureAccount({ name: processor, accountType: "asset", reportSection: "Current Assets", parentName: "Payment Processors", dataSourceType: "system_generated", sourceModule: "Payment Processor", sourceEntity: `${processor} Transactions`, postingTrigger: "Payment Received", allowSubAccounts: false, allowedTransactionTypes: [] });
      for (const item of stockPurchaseAccounts) await ensureAccount({ name: item, accountType: "asset", reportSection: "Current Assets", parentName: "Inventory", dataSourceType: "hybrid", sourceModule: "Inventory", sourceEntity: item, postingTrigger: "Inventory Purchased", allowSubAccounts: false, allowedTransactionTypes: [] });
      for (const account of cogsAccounts) await ensureAccount({ name: account, accountType: "cost_of_sales", reportSection: "COGS", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] });
      for (const [name, section, allowSubAccounts] of manualExpenseAccounts) {
        const recurringSoftware = section === "Software Expenses";
        await ensureAccount({ name, accountType: "expense", reportSection: section, dataSourceType: recurringSoftware ? "hybrid" : "manual", sourceModule: recurringSoftware ? "Subscription Engine" : "Manual Transactions", sourceEntity: recurringSoftware ? name : "", postingTrigger: recurringSoftware ? "Subscription Renewed" : "Manual Entry", allowSubAccounts, allowedTransactionTypes: [] });
      }
      await loadSharedData();
      setNotice(`${saved.length} chart of accounts entries are ready.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not set up chart of accounts.");
    } finally {
      setSavingAccounting(false);
    }
  }

  function downloadFulfilled() {
    const blob = new Blob([fulfilledOrdersCsv(orders)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meaningful-plushies-fulfilled-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function selectManualOrders() {
    const requested = manualOrderIds.split(/[\s,;#]+/).map((value) => value.replace(/\D/g, "")).filter(Boolean);
    const found = orders.filter((order) => requested.includes(order.orderNumber)).map((order) => order.id);
    const missing = requested.filter((number) => !orders.some((order) => order.orderNumber === number));
    setPackingSelection((current) => [...new Set([...current, ...found])]);
    setNotice(missing.length ? `Selected ${found.length} order(s). Not found: ${missing.map((id) => `#${id}`).join(", ")}.` : `Selected ${found.length} order(s) for printing.`);
  }

  async function printPackingSlips() {
    if (!packingOrders.length) {
      setNotice("Select at least one order before printing.");
      return;
    }
    const changedAt = new Date().toISOString();
    const changed: Order[] = [];
    const nextOrders = orders.map((order) => {
      if (!packingSelection.includes(order.id) || order.status !== "new_order") return order;
      const updated: Order = {
        ...order,
        status: "uploading_audio",
        updatedAt: changedAt,
        statusHistory: [...(order.statusHistory ?? []), {
          id: `${order.id}-${changedAt}-uploading-audio`,
          status: "uploading_audio",
          changedAt,
          changedBy: session ? `${session.displayName} (${session.username})` : "Staff",
          note: "Packing slip printed",
        }],
      };
      changed.push(updated);
      return updated;
    });
    try { await upsertSharedOrders(changed); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Packing-slip changes could not be saved."); return; }
    setOrders(nextOrders);
    printView("print-packing");
    setNotice(`${packingOrders.length} packing slip${packingOrders.length === 1 ? "" : "s"} sent to print. New orders moved to Uploading Audio.`);
    await logActivity("Packing slips printed", `${packingOrders.length} packing slip${packingOrders.length === 1 ? "" : "s"} printed.`);
  }

  function selectManualEnvelopeOrders() {
    const numbers = manualEnvelopeIds.split(/[\s,]+/).map((value) => value.replace(/^#/, "").trim()).filter(Boolean);
    const matches = numbers.flatMap((number) => orders.filter((order) => order.orderNumber === number));
    if (!matches.length) return setNotice("No matching order numbers were found.");
    setEnvelopeSelection((current) => [...current, ...matches.map((order) => order.id).filter((id) => !current.includes(id))]);
    setManualEnvelopeIds("");
    setNotice(`${matches.length} envelope name${matches.length === 1 ? "" : "s"} added in the order entered.`);
  }

  function updateEnvelopePrintSettings(patch: Partial<EnvelopePrintSettings>) {
    setEnvelopePrintSettings((current) => ({ ...current, ...patch }));
  }

  function uploadEnvelopeFont(file: File | null) {
    if (!file) return;
    if (!/\.(otf|ttf)$/i.test(file.name)) {
      setNotice("Please upload a .otf or .ttf font file. PDF generation cannot reliably embed woff or woff2 files.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const fontBase64 = result.includes(",") ? result.split(",").pop() ?? "" : result;
      updateEnvelopePrintSettings({ fontName: file.name, fontBase64 });
      setNotice(`${file.name} loaded for envelope printing.`);
    };
    reader.onerror = () => setNotice("Could not load that font file.");
    reader.readAsDataURL(file);
  }

  async function renderEnvelopeNameImage(name: string) {
    const settings = envelopePrintSettings;
    const printName = name.replace(/\s+/g, " ").trim().toUpperCase();
    const family = `EnvelopePdfFont-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fontFace = new FontFace(family, `url(data:font/opentype;base64,${settings.fontBase64})`);
    await fontFace.load();
    document.fonts.add(fontFace);

    const scale = 4;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(settings.textBoxWidth * scale);
    canvas.height = Math.ceil(settings.textBoxHeight * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the envelope text image.");
    const canvasContext = context;
    canvasContext.scale(scale, scale);
    canvasContext.clearRect(0, 0, settings.textBoxWidth, settings.textBoxHeight);
    canvasContext.textAlign = "center";
    canvasContext.textBaseline = "middle";
    canvasContext.fillStyle = "#425e75";
    canvasContext.strokeStyle = "#425e75";
    canvasContext.lineJoin = "round";
    canvasContext.lineCap = "round";

    function measure(text: string, size: number) {
      canvasContext.font = `${size}px "${family}"`;
      return canvasContext.measureText(text).width + Math.max(0, text.length - 1) * settings.letterSpacing;
    }

    function wrap(size: number) {
      const words = printName.split(" ").filter(Boolean);
      const lines: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && measure(candidate, size) > settings.textBoxWidth) {
          lines.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [printName];
    }

    let fontSize = settings.fontSize;
    let lines = wrap(fontSize);
    while (fontSize > settings.minFontSize && (lines.length * fontSize * settings.lineHeight > settings.textBoxHeight || lines.some((line) => measure(line, fontSize) > settings.textBoxWidth))) {
      fontSize -= 1;
      lines = wrap(fontSize);
    }

    canvasContext.font = `${fontSize}px "${family}"`;
    const lineHeight = fontSize * settings.lineHeight;
    const startY = settings.textBoxHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
    const boldness = Math.max(0, Math.min(8, settings.boldness || 0));
    if (boldness > 0) canvasContext.lineWidth = boldness;
    lines.forEach((line, index) => {
      const x = settings.textBoxWidth / 2;
      const y = startY + index * lineHeight;
      if (boldness > 0) canvasContext.strokeText(line, x, y);
      canvasContext.fillText(line, x, y);
    });

    document.fonts.delete(fontFace);
    return {
      pngBase64: canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, ""),
      width: settings.textBoxWidth,
      height: settings.textBoxHeight,
    };
  }

  async function printEnvelopes() {
    if (!envelopeOrders.length) return;
    if (!envelopePrintSettings.fontBase64) return setNotice("Upload the font you want to use before generating envelopes.");
    try {
      setNotice("Rendering envelope names, then generating the A4 PDF...");
      const names = envelopeOrders.map((order) => order.plushName || "UNNAMED PLUSHIE");
      const nameImages = await Promise.all(names.map(renderEnvelopeNameImage));
      const response = await fetch("/api/envelopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          names,
          nameImages,
          settings: envelopePrintSettings,
        }),
      });
      if (!response.ok) throw new Error(await response.text() || "Envelope PDF could not be generated.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "meaningful-plushies-envelopes.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(`${envelopePages.length} A4 envelope page${envelopePages.length === 1 ? "" : "s"} generated.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Envelope PDF could not be generated.";
      setNotice(`Envelope PDF error: ${message}`);
      window.alert(`Envelope PDF could not be generated.\n\n${message}`);
    }
  }

  async function deleteOrders(orderIds: string[]) {
    const deleting = orders.filter((order) => orderIds.includes(order.id));
    if (!deleting.length || !window.confirm(`Delete ${deleting.length} selected order${deleting.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    try { await deleteSharedOrders(orderIds); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Orders could not be deleted."); return; }
    setOrders((current) => current.filter((order) => !orderIds.includes(order.id)));
    setSelectedOrders([]);
    setSelectedId(null);
    await Promise.all(deleting.map((order) => logActivity("Order deleted", `${order.customerName || "Customer"} - ${order.product || "Order"}.`, order.orderNumber)));
    setNotice(`${deleting.length} order${deleting.length === 1 ? "" : "s"} deleted.`);
  }

  async function readFile(file: File | undefined, target: "orders" | "metafields") {
    if (!file) return;
    const text = await file.text();
    const detected = detectCsvKind(text);
    if (detected === "orders") {
      setOrderCsv(text);
      setNotice(target === "orders" ? "Shopify orders CSV loaded." : "Shopify orders CSV detected and moved to the orders side.");
    } else if (detected === "metafields") {
      setMetafieldCsv(text);
      setNotice(target === "metafields" ? "Order metafields CSV loaded." : "Order metafields CSV detected and moved to the metafields side.");
    } else if (target === "orders") setOrderCsv(text);
    else setMetafieldCsv(text);
  }

  async function readBookkeepingCsv(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const parsedRows = parseLooseCsv(text);
    if (parsedRows.length < 2) {
      setBookkeepingCsvRows([]);
      setBookkeepingCsvFileName(file.name);
      return setNotice("That CSV does not have enough rows to import.");
    }
    const headers = parsedRows[0].map(normalizeHeader);
    const rows = parsedRows.slice(1).map((cells, index) => {
      const row = headers.reduce<Record<string, string>>((values, header, cellIndex) => {
        values[header] = cells[cellIndex]?.trim() ?? "";
        return values;
      }, {});
      const categoryName = csvColumn(row, ["category", "account", "item", "type", "expense category"]) || "Expenses";
      const eventType = csvColumn(row, ["business event", "event", "section", "transaction type", "type"]);
      const quantity = Number(csvColumn(row, ["quantity", "qty"])) || 0;
      const unitCost = parseCsvAmount(csvColumn(row, ["unit cost", "unit price", "price"]));
      const amountValue = parseCsvAmount(csvColumn(row, ["amount", "total", "total amount", "debit", "credit"]));
      const amount = Math.abs(amountValue || (quantity > 0 && unitCost > 0 ? quantity * unitCost : 0));
      const transactionDate = dateKey(csvColumn(row, ["date", "transaction date", "paid date", "document date"])) || localDateKey(new Date());
      const description = csvColumn(row, ["description", "details", "memo", "note", "notes", "name"]) || categoryName;
      const paymentStatus = parseBookkeepingPaymentStatus(csvColumn(row, ["payment status", "status", "payment type"]));
      const depositAmount = Math.abs(parseCsvAmount(csvColumn(row, ["deposit", "deposit amount", "amount paid"])));
      const warnings: string[] = [];
      if (!amount) warnings.push("No amount detected");
      if (!transactionDate) warnings.push("No date detected");
      return {
        id: crypto.randomUUID(),
        rowNumber: index + 2,
        transactionDate,
        description,
        businessEvent: inferBookkeepingEvent(categoryName, eventType),
        categoryName,
        supplier: csvColumn(row, ["supplier", "vendor", "payee", "source", "customer"]),
        amount,
        quantity,
        unitCost,
        paymentStatus,
        paymentMethod: csvColumn(row, ["payment method", "bank", "paid from", "funding source"]) || "Bank Account",
        depositAmount,
        invoiceNumber: csvColumn(row, ["invoice", "invoice number", "receipt number", "reference", "ref"]),
        notes: csvColumn(row, ["notes", "note", "remark", "remarks"]),
        warnings,
      } satisfies BookkeepingCsvImportRow;
    });
    setBookkeepingCsvFileName(file.name);
    setBookkeepingCsvRows(rows);
    setNotice(`${rows.length} bookkeeping row${rows.length === 1 ? "" : "s"} ready to review.`);
  }

  function categoryName(categoryId: string) {
    return accountingCategories.find((category) => category.id === categoryId)?.name ?? "Uncategorised";
  }

  function onInventoryCostFieldChange(field: InventoryCostField, value: string) {
    setInventoryCostManualFields((current) => {
      const nextManualFields = [...current.filter((item) => item !== field), field].slice(-2);
      setTransactionForm((form) => ({
        ...form,
        ...calculateInventoryCostFields(form, { [field]: value }, nextManualFields),
      }));
      return nextManualFields;
    });
  }

  function selectedBusinessEvent() {
    const pageBusinessEvent = bookkeepingEventByView[view];
    return businessEvents.find((event) => event.value === (pageBusinessEvent ?? transactionForm.businessEvent)) ?? businessEvents[0];
  }

  function bookkeepingConfigForEvent(eventValue: string) {
    if (eventValue === "inventory_purchase") return bookkeepingSectionConfigs.inventory;
    if (eventValue === "expense") return bookkeepingSectionConfigs.expense;
    if (eventValue === "asset_purchase") return bookkeepingSectionConfigs.asset;
    if (eventValue === "marketing_expense") return bookkeepingSectionConfigs.marketing;
    return null;
  }

  function bookkeepingCategoriesForSection(section: BookkeepingSectionKey) {
    const config = bookkeepingSectionConfigs[section];
    return accountingCategories
      .filter((category) => category.active && category.reportSection === config.reportSection)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function selectedCategoryRecord() {
    return accountingCategories.find((category) => category.id === transactionForm.categoryId);
  }

  function accountOptionsForEvent(): AccountOption[] {
    const event = selectedBusinessEvent();
    const config = bookkeepingConfigForEvent(event.value);
    if (!config) return event.accounts.map((account) => ({ value: account, label: account }));
    const saved = accountingCategories
      .filter((category) => category.active && category.reportSection === config.reportSection)
      .sort((a, b) => a.name.localeCompare(b.name));
    const savedNames = new Set(saved.map((category) => category.name.toLowerCase()));
    const defaultOptions = config.defaults
      .filter((name) => !savedNames.has(name.toLowerCase()))
      .map((name) => ({ value: name, label: name }));
    const savedOptions = saved.map((category) => ({ value: category.id, label: category.name }));
    const newLabel = event.value === "asset_purchase" ? "+ New asset" : "+ New account";
    if (event.value === "inventory_purchase") return [{ value: rejectedInventoryOption, label: rejectedInventoryOption }, { value: newAssetOptionValue, label: newLabel }, ...savedOptions, ...defaultOptions];
    return [{ value: newAssetOptionValue, label: newLabel }, ...savedOptions, ...defaultOptions];
  }

  function mappedAccountName(event: ReturnType<typeof selectedBusinessEvent>, selection: string) {
    const directMap: Record<string, string> = {
      "Plush toy": "Inventory",
      Plushie: "Inventory",
      "NFC Card": "NFC Chips",
      Packaging: "Inventory",
      "Carton Box": "Inventory",
      "Carton Boxes": "Inventory",
      "Bubble wrap": "Inventory",
      "Carriage Inward": "Inventory",
      "Wax seal": "Inventory",
      "Rejected Inventory": "Rejected Inventory",
      Labour: "Labour Cost",
      Samples: "Samples & Testing",
      "JnT (Carriage Outwards)": "Shipping Cost",
      "Meta ads": "Meta Advertising",
      "TikTok ads": "TikTok Advertising",
      "New asset": "Equipment",
      "From sales report": "Bank Account",
      Stripe: "Stripe",
      Xendit: "Xendit",
      "Owner's Equity": "Owner Capital",
      Drawings: "Owner Drawings",
      Salary: "Salary Expense",
      "Carriage Outwards": "Shipping Cost",
      Printers: "Equipment",
      "Heat Press Machines": "Equipment",
      "Sewing Machines": "Equipment",
      Computers: "Equipment",
      Cameras: "Equipment",
      "Other Equipment": "Equipment",
      "Bank Transfer": "Bank Account",
      "Xendit Payout": "Xendit",
      "Stripe Payout": "Stripe",
      "TikTok Payout": "TikTok Shop",
      "Owner Capital Injection": "Owner Capital",
      "Owner Drawings": "Owner Drawings",
      "Loan Received": "Loan",
      "Loan Repayment": "Loan",
      "Tax Payment": "Tax Payable",
      "Tax Penalty": "Tax Penalties",
    };
    return directMap[selection] ?? selection ?? event.accountingMapping;
  }

  function selectedAccountingAccount() {
    const event = selectedBusinessEvent();
    const selectedCategory = selectedCategoryRecord();
    if (selectedCategory) return selectedCategory;
    const selected = transactionForm.categoryId || transactionForm.accountName;
    const mapped = mappedAccountName(event, selected);
    return accountingCategories.find((category) => category.name.toLowerCase() === mapped.toLowerCase())
      ?? accountingCategories.find((category) => category.name.toLowerCase() === event.accountingMapping.toLowerCase());
  }

  function bookkeepingAccountNameForSave(event: ReturnType<typeof selectedBusinessEvent>) {
    const selectedCategory = selectedCategoryRecord();
    if (selectedCategory) return selectedCategory.name;
    if (transactionForm.categoryId === newAssetOptionValue) return transactionForm.accountName.trim();
    if (transactionForm.categoryId === rejectedInventoryOption) return transactionForm.accountName.trim() || rejectedInventoryOption;
    if (transactionForm.categoryId === "Plush toy" && transactionForm.accountName.trim()) return transactionForm.accountName.trim();
    return transactionForm.categoryId || transactionForm.accountName.trim() || event.accountingMapping;
  }

  function bookkeepingParentId(config: (typeof bookkeepingSectionConfigs)[BookkeepingSectionKey] | null) {
    if (!config) return "";
    const parentName = config.parentAccount.toLowerCase();
    return accountingCategories.find((category) => category.name.toLowerCase() === parentName && !category.parentId)?.id ?? "";
  }

  function emptyTransactionForm(): AccountingTransactionForm {
    return { businessEvent: "inventory_purchase", transactionDate: dateKey(new Date().toISOString()), description: "", accountName: "", amount: "", categoryId: "", transactionType: "expense", paymentStatus: "paid_in_full", paymentMethod: "Bank Account", supplier: "", quantity: "", unitCost: "", depositAmount: "", invoiceNumber: "", dueDate: "", supplierTerms: "", taxTreatment: "none", notes: "" };
  }

  function ledgerPreview(transactionId = "preview", accountOverride?: AccountingCategory | null): AccountingLedgerEntry[] {
    const quantity = Number(transactionForm.quantity) || 0;
    const unitCost = Number(transactionForm.unitCost) || 0;
    const amount = Number(transactionForm.amount) || (quantity > 0 && unitCost > 0 ? quantity * unitCost : 0);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    const event = selectedBusinessEvent();
    const account = accountOverride ?? selectedAccountingAccount();
    const savedAccountName = bookkeepingAccountNameForSave(event);
    const accountName = event.value === "inventory_purchase" && savedAccountName ? savedAccountName : account?.name || savedAccountName || "Selected account";
    const rejectedInventoryItem = transactionForm.categoryId === rejectedInventoryOption ? transactionForm.accountName.trim() || "Inventory" : "";
    const depositAmount = Math.min(amount, Math.max(0, Number(transactionForm.depositAmount) || 0));
    const paidAmount = transactionForm.paymentStatus === "paid_in_full" ? amount : transactionForm.paymentStatus === "deposit_paid" ? depositAmount : 0;
    const outstandingAmount = Math.max(0, amount - paidAmount);
    const now = new Date().toISOString();
    if (event.value === "payment_processor_paid") {
      if (transactionForm.categoryId === "Drawings") {
        return [
          { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName: "Drawings", entryType: "debit", amount, memo: "Owner drawing", createdAt: now },
          { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "credit", amount, memo: "Cash withdrawn from bank", createdAt: now },
        ];
      }
      if (transactionForm.categoryId === "Stripe" || transactionForm.categoryId === "Xendit") {
        return [
          { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "debit", amount, memo: "Transfer to bank", createdAt: now },
          { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName: transactionForm.categoryId, entryType: "credit", amount, memo: "Processor payout to bank", createdAt: now },
        ];
      }
      return [
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "debit", amount, memo: transactionForm.categoryId === "Owner's Equity" ? "Owner capital received" : "Payment received", createdAt: now },
        { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName: transactionForm.categoryId || "Payment Processor", entryType: "credit", amount, memo: transactionForm.categoryId === "Owner's Equity" ? "Owner capital" : "Processor balance reduced", createdAt: now },
      ];
    }
    if (rejectedInventoryItem) {
      return [
        { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName: rejectedInventoryOption, entryType: "debit", amount, memo: `Rejected ${rejectedInventoryItem}`, createdAt: now },
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: rejectedInventoryItem, entryType: "credit", amount, memo: "Inventory rejected and removed", createdAt: now },
      ];
    }
    const primaryIsCredit = ["owner_transaction", "loan"].includes(event.value) && ["Owner Capital Injection", "Loan Received"].includes(transactionForm.categoryId);
    const transferOrRepayment = ["bank_transfer"].includes(event.value) || ["Owner Drawings", "Loan Repayment", "Tax Payment"].includes(transactionForm.categoryId);
    const entries: AccountingLedgerEntry[] = [];
    const primaryEntryType: "debit" | "credit" = primaryIsCredit ? "credit" : "debit";
    entries.push({ id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName, entryType: transferOrRepayment ? "debit" : primaryEntryType, amount, memo: event.label, createdAt: now });
    if (paidAmount > 0) entries.push({ id: crypto.randomUUID(), transactionId, accountId: "", accountName: transactionForm.paymentMethod || "Bank Account", entryType: primaryIsCredit ? "debit" : "credit", amount: paidAmount, memo: "Payment recorded", createdAt: now });
    if (outstandingAmount > 0) entries.push({ id: crypto.randomUUID(), transactionId, accountId: "", accountName: primaryIsCredit ? "Accounts Receivable" : "Accounts Payable", entryType: primaryIsCredit ? "debit" : "credit", amount: outstandingAmount, memo: "Outstanding balance", createdAt: now });
    return entries;
  }

  async function ensureBookkeepingTransactionAccount(event: ReturnType<typeof selectedBusinessEvent>, accountName: string, actor: string) {
    const config = bookkeepingConfigForEvent(event.value);
    if (!config || !accountName) return selectedAccountingAccount();
    const existing = accountingCategories.find((category) => category.active && category.reportSection === config.reportSection && category.name.toLowerCase() === accountName.toLowerCase())
      ?? accountingCategories.find((category) => category.active && category.name.toLowerCase() === accountName.toLowerCase());
    if (existing) return existing;
    const account: AccountingCategory = {
      id: crypto.randomUUID(),
      name: accountName,
      accountType: config.accountType,
      reportSection: config.reportSection,
      parentId: bookkeepingParentId(config),
      dataSourceType: "manual",
      sourceModule: "Book Keeping",
      sourceEntity: config.sourceEntity,
      postingTrigger: "Manual Entry",
      allowSubAccounts: false,
      allowedTransactionTypes: [],
      active: true,
    };
    await saveAccountingCategory(account);
    setAccountingCategories((current) => [...current, account].sort((a, b) => `${a.reportSection}-${a.name}`.localeCompare(`${b.reportSection}-${b.name}`)));
    await insertSharedActivity({ id: crypto.randomUUID(), action: "Bookkeeping account added", detail: `${accountName} added to ${config.label} from a transaction.`, actor, createdAt: new Date().toISOString() });
    return account;
  }

  function stockKeyFromText(value: string) {
    const stockSource = value.toUpperCase();
    return stockSource.includes("BILLY") ? "BILLY"
      : stockSource.includes("TOOTSIE") ? "TOOTSIE"
      : stockSource.includes("HUNNIE") ? "HUNNIE"
      : stockSource.includes("DRAGON") ? "DRAGON WARRIOR"
      : stockSource.includes("SPEAKER") ? "VOICE"
      : stockSource.includes("NFC") ? "NFC"
      : stockSource.includes("BOX") || stockSource.includes("CARTON") ? "BOXES"
      : stockSource.includes("BUBBLE") ? "BUBBLE WRAP"
      : stockSource.includes("WAX") ? "WAX SEAL"
      : stockSource.includes("CARRIAGE") ? "CARRIAGE INWARD"
      : stockSource.includes("PACK") ? "PACKAGING"
      : stockSource.trim();
  }

  function bookkeepingConfigForImport(eventValue: BookkeepingCsvImportRow["businessEvent"]) {
    if (eventValue === "inventory_purchase") return bookkeepingSectionConfigs.inventory;
    if (eventValue === "asset_purchase") return bookkeepingSectionConfigs.asset;
    if (eventValue === "marketing_expense") return bookkeepingSectionConfigs.marketing;
    if (eventValue === "expense") return bookkeepingSectionConfigs.expense;
    return null;
  }

  async function categoryForBookkeepingImport(row: BookkeepingCsvImportRow, actor: string, knownCategories: AccountingCategory[]) {
    const config = bookkeepingConfigForImport(row.businessEvent);
    if (!config) return null;
    const name = row.categoryName.trim() || config.parentAccount;
    const existing = knownCategories.find((category) => category.reportSection === config.reportSection && category.name.toLowerCase() === name.toLowerCase())
      ?? knownCategories.find((category) => category.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const account: AccountingCategory = {
      id: crypto.randomUUID(),
      name,
      accountType: config.accountType,
      reportSection: config.reportSection,
      parentId: bookkeepingParentId(config),
      dataSourceType: "manual",
      sourceModule: "Book Keeping CSV",
      sourceEntity: config.sourceEntity,
      postingTrigger: "CSV Import",
      allowSubAccounts: false,
      allowedTransactionTypes: [],
      active: true,
    };
    await saveAccountingCategory(account);
    knownCategories.push(account);
    await insertSharedActivity({ id: crypto.randomUUID(), action: "Bookkeeping category added", detail: `${name} imported from CSV.`, actor, createdAt: new Date().toISOString() });
    return account;
  }

  function csvImportLedgerEntries(row: BookkeepingCsvImportRow, account: AccountingCategory | null, transactionId: string, createdAt: string): AccountingLedgerEntry[] {
    const amount = row.amount;
    if (amount <= 0) return [];
    if (row.businessEvent === "payment_processor_paid") {
      const processor = row.categoryName.toLowerCase().includes("stripe") ? "Stripe"
        : row.categoryName.toLowerCase().includes("xendit") ? "Xendit"
        : row.categoryName.toLowerCase().includes("drawing") ? "Drawings"
        : row.categoryName.toLowerCase().includes("owner") ? "Owner's Equity"
        : row.categoryName || "Bank Transfer";
      if (processor === "Drawings") return [
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Drawings", entryType: "debit", amount, memo: row.description, createdAt },
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "credit", amount, memo: "Cash withdrawn from bank", createdAt },
      ];
      return [
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "debit", amount, memo: row.description, createdAt },
        { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName: processor, entryType: "credit", amount, memo: processor === "Owner's Equity" ? "Owner capital" : "CSV cash entry", createdAt },
      ];
    }
    const paidAmount = row.paymentStatus === "paid_in_full" ? amount : row.paymentStatus === "deposit_paid" ? Math.min(amount, Math.max(0, row.depositAmount)) : 0;
    const outstandingAmount = Math.max(0, amount - paidAmount);
    const accountName = account?.name ?? row.categoryName;
    const entries: AccountingLedgerEntry[] = [
      { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName, entryType: "debit", amount, memo: row.description, createdAt },
    ];
    if (paidAmount > 0) entries.push({ id: crypto.randomUUID(), transactionId, accountId: "", accountName: row.paymentMethod || "Bank Account", entryType: "credit", amount: paidAmount, memo: "Payment recorded", createdAt });
    if (outstandingAmount > 0) entries.push({ id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Accounts Payable", entryType: "credit", amount: outstandingAmount, memo: "Outstanding balance", createdAt });
    return entries;
  }

  async function importBookkeepingCsvRows() {
    const importable = bookkeepingCsvRows.filter((row) => row.amount > 0);
    if (!importable.length) return setNotice("There are no valid CSV rows to import.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      let imported = 0;
      const knownCategories = [...accountingCategories];
      for (const row of importable) {
        const now = new Date().toISOString();
        const transactionId = crypto.randomUUID();
        const account = await categoryForBookkeepingImport(row, actor, knownCategories);
        const entries = csvImportLedgerEntries(row, account, transactionId, now);
        await saveAccountingTransaction({
          id: transactionId,
          source: "manual",
          sourceId: bookkeepingCsvFileName,
          documentId: "",
          businessEvent: row.businessEvent,
          transactionDate: row.transactionDate,
          description: row.description,
          accountName: account?.name ?? row.categoryName,
          categoryId: account?.id ?? "",
          transactionType: row.businessEvent === "payment_processor_paid" ? "transfer" : "expense",
          paymentStatus: row.paymentStatus,
          paymentMethod: row.paymentMethod || "Bank Account",
          supplier: row.supplier,
          quantity: row.quantity,
          unitCost: row.unitCost,
          depositAmount: row.paymentStatus === "deposit_paid" ? row.depositAmount : row.paymentStatus === "paid_in_full" ? row.amount : 0,
          invoiceNumber: row.invoiceNumber,
          dueDate: "",
          supplierTerms: "",
          debit: entries.filter((entry) => entry.entryType === "debit").reduce((total, entry) => total + entry.amount, 0),
          credit: entries.filter((entry) => entry.entryType === "credit").reduce((total, entry) => total + entry.amount, 0),
          amount: row.amount,
          currency: "MYR",
          taxTreatment: "none",
          notes: row.notes,
          createdBy: actor,
          createdAt: now,
          updatedAt: now,
        });
        await saveAccountingLedgerEntries(transactionId, entries);
        if (row.businessEvent === "inventory_purchase" && row.quantity > 0) {
          const stockKey = stockKeyFromText(`${row.categoryName} ${row.description}`);
          const currentStock = stockSettings.find((setting) => setting.itemKey === stockKey)?.initialStock ?? 0;
          await saveStockSetting({ itemKey: stockKey, initialStock: Math.max(0, currentStock + Math.floor(row.quantity)) });
        }
        imported += 1;
      }
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Bookkeeping CSV import", detail: `${imported} transaction${imported === 1 ? "" : "s"} imported from ${bookkeepingCsvFileName || "CSV"}.`, actor, createdAt: new Date().toISOString() });
      setBookkeepingCsvRows([]);
      setBookkeepingCsvFileName("");
      await loadSharedData();
      setNotice(`${imported} bookkeeping transaction${imported === 1 ? "" : "s"} imported.`);
    } catch (error) {
      setNotice(readableError(error, "Could not import bookkeeping CSV."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function uploadAccountingDocument() {
    if (!accountingDocumentFile) return setNotice("Choose a receipt, invoice, or statement file first.");
    const amount = Number(documentForm.amount);
    if (!documentForm.name.trim()) return setNotice("Add a document name.");
    if (!Number.isFinite(amount) || amount < 0) return setNotice("Enter a valid document amount.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const id = crypto.randomUUID();
      const filePath = await uploadAccountingDocumentFile(accountingDocumentFile, id);
      const now = new Date().toISOString();
      const document: AccountingDocument = {
        id,
        filePath,
        fileName: accountingDocumentFile.name,
        fileType: accountingDocumentFile.type || "application/octet-stream",
        fileSize: accountingDocumentFile.size,
        name: documentForm.name.trim(),
        supplier: documentForm.supplier.trim(),
        description: documentForm.description.trim(),
        documentDate: documentForm.documentDate,
        amount,
        categoryId: documentForm.categoryId,
        transactionType: documentForm.transactionType,
        taxTreatment: documentForm.taxTreatment,
        notes: documentForm.notes.trim(),
        uploadedBy: actor,
        createdAt: now,
        updatedAt: now,
      };
      await saveAccountingDocument(document);
      await saveAccountingTransaction({
        id: crypto.randomUUID(),
        source: "document",
        sourceId: id,
        documentId: id,
        businessEvent: document.transactionType === "income" ? "record_sale" : "administrative_expense",
        transactionDate: document.documentDate,
        description: document.description || document.name,
        accountName: document.supplier || "Cash",
        categoryId: document.categoryId,
        transactionType: document.transactionType,
        paymentStatus: "paid_in_full",
        paymentMethod: "Bank Account",
        supplier: document.supplier,
        quantity: 0,
        unitCost: 0,
        depositAmount: 0,
        invoiceNumber: "",
        dueDate: "",
        supplierTerms: "",
        debit: document.transactionType === "expense" ? amount : 0,
        credit: document.transactionType === "income" ? amount : 0,
        amount,
        currency: "MYR",
        taxTreatment: document.taxTreatment,
        notes: document.notes,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Accounting document uploaded", detail: `${document.name} (${formatMoney(amount)})`, actor, createdAt: now });
      setAccountingDocumentFile(null);
      setDocumentForm({ name: "", supplier: "", description: "", documentDate: dateKey(new Date().toISOString()), amount: "", categoryId: "", transactionType: "expense", taxTreatment: "none", notes: "" });
      await loadSharedData();
      setNotice("Accounting document uploaded and transaction created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not upload accounting document.");
    } finally {
      setSavingAccounting(false);
    }
  }

  async function createManualAccountingTransaction() {
    const quantity = Number(transactionForm.quantity) || 0;
    const unitCost = Number(transactionForm.unitCost) || 0;
    let amount = Number(transactionForm.amount);
    if ((!Number.isFinite(amount) || amount <= 0) && quantity > 0 && unitCost > 0) amount = quantity * unitCost;
    const depositAmount = Number(transactionForm.depositAmount) || 0;
    const event = selectedBusinessEvent();
    const description = transactionForm.description.trim() || (event.value === "payment_processor_paid" && transactionForm.categoryId ? `${transactionForm.categoryId} payout to bank` : "");
    if (!description) return setNotice("Add a transaction description.");
    if (!Number.isFinite(amount) || amount < 0) return setNotice("Enter a valid transaction amount.");
    if (!transactionForm.categoryId && !transactionForm.accountName.trim()) return setNotice("Choose an account or type the item name.");
    if (transactionForm.categoryId === rejectedInventoryOption && !transactionForm.accountName.trim()) return setNotice("Choose which inventory item was rejected.");
    if (transactionForm.paymentStatus === "deposit_paid" && (depositAmount <= 0 || depositAmount >= amount)) return setNotice("Enter a deposit amount that is more than 0 and less than the total.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      let documentId = "";
      const isRejectedInventory = transactionForm.categoryId === rejectedInventoryOption;
      const accountName = bookkeepingAccountNameForSave(event).trim();
      let account = isRejectedInventory ? null : await ensureBookkeepingTransactionAccount(event, accountName, actor);
      if (isRejectedInventory) {
        await ensureBookkeepingTransactionAccount(event, accountName, actor);
        const existingRejectedAccount = accountingCategories.find((category) => category.name.toLowerCase() === rejectedInventoryOption.toLowerCase());
        account = existingRejectedAccount ?? {
          id: crypto.randomUUID(),
          name: rejectedInventoryOption,
          accountType: "expense",
          reportSection: bookkeepingSectionConfigs.expense.reportSection,
          parentId: bookkeepingParentId(bookkeepingSectionConfigs.expense),
          dataSourceType: "manual",
          sourceModule: "Book Keeping",
          sourceEntity: "Rejected stock",
          postingTrigger: "Inventory Rejected",
          allowSubAccounts: false,
          allowedTransactionTypes: [],
          active: true,
        };
        if (!existingRejectedAccount) await saveAccountingCategory(account);
      }
      if (transactionDocumentFile) {
        documentId = crypto.randomUUID();
        const filePath = await uploadAccountingDocumentFile(transactionDocumentFile, documentId);
        await saveAccountingDocument({
          id: documentId,
          filePath,
          fileName: transactionDocumentFile.name,
          fileType: transactionDocumentFile.type || "application/octet-stream",
          fileSize: transactionDocumentFile.size,
          name: transactionForm.invoiceNumber.trim() ? `Invoice ${transactionForm.invoiceNumber.trim()}` : description,
          supplier: transactionForm.supplier.trim(),
          description: `${event.label}: ${description}`,
          documentDate: transactionForm.transactionDate,
          amount,
          categoryId: account?.id ?? "",
          transactionType: event.value === "payment_processor_paid" ? "income" : "expense",
          taxTreatment: transactionForm.taxTreatment,
          notes: transactionForm.notes.trim(),
          uploadedBy: actor,
          createdAt: now,
          updatedAt: now,
        });
      }
      const entries = ledgerPreview(id, account);
      await saveAccountingTransaction({
        id,
        source: documentId ? "document" : "manual",
        sourceId: documentId,
        documentId,
        businessEvent: isRejectedInventory ? "inventory_rejected" : event.value,
        transactionDate: transactionForm.transactionDate,
        description,
        accountName: event.value === "inventory_purchase" ? accountName : account?.name || accountName || "Cash",
        categoryId: account?.id ?? "",
        transactionType: event.value === "payment_processor_paid" ? "transfer" : "expense",
        paymentStatus: transactionForm.paymentStatus,
        paymentMethod: transactionForm.paymentMethod,
        supplier: transactionForm.supplier.trim(),
        quantity,
        unitCost,
        depositAmount: transactionForm.paymentStatus === "deposit_paid" ? depositAmount : transactionForm.paymentStatus === "paid_in_full" ? amount : 0,
        invoiceNumber: transactionForm.invoiceNumber.trim(),
        dueDate: transactionForm.dueDate,
        supplierTerms: transactionForm.supplierTerms.trim(),
        debit: entries.filter((entry) => entry.entryType === "debit").reduce((total, entry) => total + entry.amount, 0),
        credit: entries.filter((entry) => entry.entryType === "credit").reduce((total, entry) => total + entry.amount, 0),
        amount,
        currency: "MYR",
        taxTreatment: transactionForm.taxTreatment,
        notes: transactionForm.notes.trim(),
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      await saveAccountingLedgerEntries(id, entries);
      if (event.value === "inventory_purchase" && quantity > 0) {
        const stockSource = `${account?.name ?? accountName} ${transactionForm.accountName}`.toUpperCase();
        const stockKey = stockSource.includes("BILLY") ? "BILLY"
          : stockSource.includes("TOOTSIE") ? "TOOTSIE"
          : stockSource.includes("HUNNIE") ? "HUNNIE"
          : stockSource.includes("DRAGON") ? "DRAGON WARRIOR"
          : stockSource.includes("SPEAKER") ? "VOICE"
          : stockSource.includes("NFC") ? "NFC"
          : stockSource.includes("BOX") || stockSource.includes("CARTON") ? "BOXES"
          : stockSource.includes("BUBBLE") ? "BUBBLE WRAP"
          : stockSource.includes("WAX") ? "WAX SEAL"
          : stockSource.includes("CARRIAGE") ? "CARRIAGE INWARD"
          : stockSource.includes("PACK") ? "PACKAGING"
          : stockSource.trim();
        const currentStock = stockSettings.find((setting) => setting.itemKey === stockKey)?.initialStock ?? 0;
        await saveStockSetting({ itemKey: stockKey, initialStock: Math.max(0, currentStock + (isRejectedInventory ? -Math.floor(quantity) : Math.floor(quantity))) });
      }
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Accounting transaction created", detail: `${event.label}: ${description} (${formatMoney(amount)})`, actor, createdAt: now });
      setTransactionForm({ ...emptyTransactionForm(), businessEvent: event.value });
      setInventoryCostManualFields([]);
      setTransactionDocumentFile(null);
      await loadSharedData();
      setNotice("Transaction added.");
    } catch (error) {
      setNotice(readableError(error, "Could not create transaction."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function removeAccountingDocument(document: AccountingDocument) {
    if (!confirm(`Delete ${document.name}?`)) return;
    await deleteAccountingDocument(document.id);
    await loadSharedData();
  }

  async function removeAccountingTransaction(transaction: AccountingTransaction) {
    if (!confirm(`Delete ${transaction.description}?`)) return;
    await saveAccountingLedgerEntries(transaction.id, []);
    await deleteAccountingTransaction(transaction.id);
    await loadSharedData();
  }

  function unsettledAmount(transaction: AccountingTransaction) {
    if (transaction.paymentStatus === "deposit_paid") return Math.max(0, transaction.amount - transaction.depositAmount);
    if (transaction.paymentStatus === "on_credit" || transaction.paymentStatus === "pay_later") return transaction.amount;
    return 0;
  }

  async function settleAccountingTransaction(transaction: AccountingTransaction) {
    const amount = unsettledAmount(transaction);
    if (amount <= 0) return setNotice("This payment is already settled.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const now = new Date().toISOString();
      const file = settlementFiles[transaction.id];
      let documentId = "";
      if (file) {
        documentId = crypto.randomUUID();
        const filePath = await uploadAccountingDocumentFile(file, documentId);
        await saveAccountingDocument({
          id: documentId,
          filePath,
          fileName: file.name,
          fileType: file.type || "application/octet-stream",
          fileSize: file.size,
          name: `Payment proof - ${transaction.description}`,
          supplier: transaction.supplier,
          description: `Settlement for ${transaction.description}`,
          documentDate: dateKey(now),
          amount,
          categoryId: transaction.categoryId,
          transactionType: transaction.transactionType === "income" ? "income" : "expense",
          taxTreatment: transaction.taxTreatment,
          notes: transaction.notes,
          uploadedBy: actor,
          createdAt: now,
          updatedAt: now,
        });
      }
      await saveAccountingTransaction({
        ...transaction,
        paymentStatus: "paid_in_full",
        depositAmount: transaction.amount,
        updatedAt: now,
      });
      const paymentId = crypto.randomUUID();
      const entries: AccountingLedgerEntry[] = [
        { id: crypto.randomUUID(), transactionId: paymentId, accountId: transaction.categoryId, accountName: "Accounts Payable", entryType: "debit", amount, memo: "Settlement paid", createdAt: now },
        { id: crypto.randomUUID(), transactionId: paymentId, accountId: "", accountName: "Bank Account", entryType: "credit", amount, memo: "Payment from bank", createdAt: now },
      ];
      await saveAccountingTransaction({
        id: paymentId,
        source: documentId ? "document" : "manual",
        sourceId: documentId,
        documentId,
        businessEvent: "settle_payment",
        transactionDate: dateKey(now),
        description: `Paid unsettled balance: ${transaction.description}`,
        accountName: "Accounts Payable",
        categoryId: transaction.categoryId,
        transactionType: "transfer",
        paymentStatus: "paid_in_full",
        paymentMethod: "Bank Account",
        supplier: transaction.supplier,
        quantity: 0,
        unitCost: 0,
        depositAmount: amount,
        invoiceNumber: transaction.invoiceNumber,
        dueDate: "",
        supplierTerms: "",
        debit: amount,
        credit: amount,
        amount,
        currency: "MYR",
        taxTreatment: transaction.taxTreatment,
        notes: `Settlement for transaction ${transaction.id}`,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      await saveAccountingLedgerEntries(paymentId, entries);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Unsettled payment marked paid", detail: `${transaction.description} (${formatMoney(amount)})`, actor, createdAt: now });
      setSettlementFiles((current) => ({ ...current, [transaction.id]: null }));
      await loadSharedData();
      setNotice("Payment marked as paid and recorded in the book.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not settle payment.");
    } finally {
      setSavingAccounting(false);
    }
  }

  async function saveAccountSettings() {
    if (!accountForm.name.trim()) return setNotice("Add an account name.");
    setSavingAccounting(true);
    try {
      const account: AccountingCategory = {
        id: accountForm.id || crypto.randomUUID(),
        name: accountForm.name.trim(),
        accountType: accountForm.accountType,
        reportSection: accountForm.reportSection || accountForm.accountType,
        parentId: accountForm.parentId,
        dataSourceType: accountForm.dataSourceType,
        sourceModule: accountForm.sourceModule,
        sourceEntity: accountForm.sourceEntity.trim(),
        postingTrigger: accountForm.postingTrigger,
        allowSubAccounts: accountForm.allowSubAccounts,
        allowedTransactionTypes: [],
        active: accountForm.active,
      };
      await saveAccountingCategory(account);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Accounting account saved", detail: `${account.name} mapping updated.`, actor: session?.displayName ?? "Admin", createdAt: new Date().toISOString() });
      setAccountForm({ id: "", name: "", accountType: "expense", reportSection: "Expenses", parentId: "", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, active: true });
      await loadSharedData();
      setNotice("Account settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save account settings.");
    } finally {
      setSavingAccounting(false);
    }
  }

  async function saveBookkeepingCategory() {
    const config = bookkeepingSectionConfigs[bookkeepingCategoryForm.section];
    const name = bookkeepingCategoryForm.name.trim();
    if (!name) return setNotice(`Add a ${config.singularLabel.toLowerCase()} name.`);
    const duplicate = accountingCategories.find((category) => category.reportSection === config.reportSection && category.name.toLowerCase() === name.toLowerCase());
    if (duplicate) return setNotice(`${name} already exists in ${config.label}.`);
    setSavingAccounting(true);
    try {
      const account: AccountingCategory = {
        id: crypto.randomUUID(),
        name,
        accountType: config.accountType,
        reportSection: config.reportSection,
        parentId: bookkeepingParentId(config),
        dataSourceType: "manual",
        sourceModule: "Book Keeping",
        sourceEntity: config.sourceEntity,
        postingTrigger: "Manual Entry",
        allowSubAccounts: false,
        allowedTransactionTypes: [],
        active: true,
      };
      await saveAccountingCategory(account);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Bookkeeping category added", detail: `${name} added to ${config.label}.`, actor: session?.displayName ?? "Admin", createdAt: new Date().toISOString() });
      setBookkeepingCategoryForm((current) => ({ ...current, name: "" }));
      await loadSharedData();
      setNotice(`${name} added.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save bookkeeping category.");
    } finally {
      setSavingAccounting(false);
    }
  }

  async function saveSalesConsumptionRule() {
    const sku = normalizeAccountingItem(salesConsumptionMappingForm.sku);
    const inventoryItem = normalizeAccountingItem(salesConsumptionMappingForm.inventoryItem);
    const quantityPerSale = Number(salesConsumptionMappingForm.quantityPerSale || 0);
    const operatingExpensePerSale = Number(salesConsumptionMappingForm.operatingExpensePerSale || 0);
    if (!sku) return setNotice("Choose the sold SKU or character.");
    if (!inventoryItem && operatingExpensePerSale <= 0) return setNotice("Choose an inventory item or enter operating expense per sale.");
    if (inventoryItem && quantityPerSale <= 0) return setNotice("Enter how many inventory units are used per sale.");
    setSavingAccounting(true);
    try {
      const now = new Date().toISOString();
      const mapping: SalesConsumptionMapping = {
        id: crypto.randomUUID(),
        sku,
        inventoryItem,
        quantityPerSale: inventoryItem ? quantityPerSale : 0,
        operatingExpensePerSale,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      await saveSalesConsumptionMapping(mapping);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Sales consumption mapping added", detail: `${sku} uses ${inventoryItem || "no inventory"}${operatingExpensePerSale ? ` plus ${formatMoney(operatingExpensePerSale)} operating expense` : ""}.`, actor: session?.displayName ?? "Admin", createdAt: now });
      setSalesConsumptionMappingForm(salesConsumptionMappingFormDefaults);
      await loadSharedData();
      setNotice("Sales consumption mapping saved.");
    } catch (error) {
      setNotice(readableError(error, "Could not save sales consumption mapping."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function removeSalesConsumptionRule(mapping: SalesConsumptionMapping) {
    setSavingAccounting(true);
    try {
      await deleteSalesConsumptionMapping(mapping.id);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Sales consumption mapping removed", detail: `${mapping.sku} to ${mapping.inventoryItem || "operating expense"} removed.`, actor: session?.displayName ?? "Admin", createdAt: new Date().toISOString() });
      await loadSharedData();
      setNotice("Sales consumption mapping removed.");
    } catch (error) {
      setNotice(readableError(error, "Could not remove sales consumption mapping."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function saveContentPlan() {
    const title = contentPlanForm.title.trim();
    if (!title) return setNotice("Add a content title.");
    if (!contentPlanForm.plannedDate) return setNotice("Choose a planned date.");
    const now = new Date().toISOString();
    const item: ContentPlanItem = {
      id: crypto.randomUUID(),
      title,
      plannedDate: contentPlanForm.plannedDate,
      platform: contentPlanForm.platform,
      contentType: contentPlanForm.contentType,
      notes: contentPlanForm.notes.trim(),
      posted: false,
      postedAt: "",
      createdBy: session?.displayName ?? "Admin",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveContentPlanItem(item);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Content planned", detail: `${item.title} planned for ${formatDate(item.plannedDate)}.`, actor: session?.displayName ?? "Admin", createdAt: now });
      setContentPlanForm({ title: "", plannedDate: item.plannedDate, platform: item.platform, contentType: item.contentType, notes: "" });
      await loadSharedData();
      setNotice("Content plan saved.");
    } catch (error) {
      setNotice(readableError(error, "Could not save content plan."));
    }
  }

  async function toggleContentPosted(item: ContentPlanItem) {
    const now = new Date().toISOString();
    const updated: ContentPlanItem = {
      ...item,
      posted: !item.posted,
      postedAt: item.posted ? "" : now,
      updatedAt: now,
    };
    try {
      await saveContentPlanItem(updated);
      await insertSharedActivity({ id: crypto.randomUUID(), action: updated.posted ? "Content marked posted" : "Content marked unposted", detail: `${updated.title} on ${formatDate(updated.plannedDate)}.`, actor: session?.displayName ?? "Admin", createdAt: now });
      await loadSharedData();
    } catch (error) {
      setNotice(readableError(error, "Could not update content plan."));
    }
  }

  async function removeContentPlan(item: ContentPlanItem) {
    if (!confirm(`Delete ${item.title}?`)) return;
    try {
      await deleteContentPlanItem(item.id);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Content plan deleted", detail: `${item.title} was removed.`, actor: session?.displayName ?? "Admin", createdAt: new Date().toISOString() });
      await loadSharedData();
      setNotice("Content plan deleted.");
    } catch (error) {
      setNotice(readableError(error, "Could not delete content plan."));
    }
  }

  function addIdeaReference() {
    const name = contentIdeaForm.referenceName.trim();
    const url = contentIdeaForm.referenceUrl.trim();
    if (!name || !url) return setNotice("Add both a reference name and link.");
    setContentIdeaForm((current) => ({
      ...current,
      references: [...current.references, { id: crypto.randomUUID(), name, url }],
      referenceName: "",
      referenceUrl: "",
    }));
  }

  function removeIdeaReference(referenceId: string) {
    setContentIdeaForm((current) => ({
      ...current,
      references: current.references.filter((reference) => reference.id !== referenceId),
    }));
  }

  async function saveContentIdeaItem() {
    const title = contentIdeaForm.title.trim();
    const idea = contentIdeaForm.idea.trim();
    if (!title) return setNotice("Add an idea title.");
    if (!idea) return setNotice("Write down the idea first.");
    const now = new Date().toISOString();
    const item: ContentIdeaItem = {
      id: crypto.randomUUID(),
      title,
      idea,
      references: contentIdeaForm.references,
      createdBy: session?.displayName ?? "Admin",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveContentIdea(item);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Content idea saved", detail: `${item.title} saved with ${item.references.length} reference${item.references.length === 1 ? "" : "s"}.`, actor: session?.displayName ?? "Admin", createdAt: now });
      setContentIdeaForm({ title: "", idea: "", references: [], referenceName: "", referenceUrl: "" });
      await loadSharedData();
      setNotice("Content idea saved.");
    } catch (error) {
      setNotice(readableError(error, "Could not save content idea."));
    }
  }

  async function removeContentIdea(item: ContentIdeaItem) {
    if (!confirm(`Delete ${item.title}?`)) return;
    try {
      await deleteContentIdea(item.id);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Content idea deleted", detail: `${item.title} was removed.`, actor: session?.displayName ?? "Admin", createdAt: new Date().toISOString() });
      await loadSharedData();
      setNotice("Content idea deleted.");
    } catch (error) {
      setNotice(readableError(error, "Could not delete content idea."));
    }
  }

  async function moveContentIdeaToPlanned(item: ContentIdeaItem, plannedDate: string) {
    if (!plannedDate) return setNotice("Choose a planned date before moving the idea.");
    const now = new Date().toISOString();
    const referenceNotes = item.references.length
      ? `\n\nReferences:\n${item.references.map((reference) => `- ${reference.name}: ${reference.url}`).join("\n")}`
      : "";
    const planned: ContentPlanItem = {
      id: crypto.randomUUID(),
      title: item.title,
      plannedDate,
      platform: "Instagram",
      contentType: "Post",
      notes: `${item.idea}${referenceNotes}`.trim(),
      posted: false,
      postedAt: "",
      createdBy: session?.displayName ?? "Admin",
      createdAt: now,
      updatedAt: now,
    };
    try {
      await saveContentPlanItem(planned);
      await deleteContentIdea(item.id);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Content idea moved to planned", detail: `${item.title} planned for ${formatDate(plannedDate)}.`, actor: session?.displayName ?? "Admin", createdAt: now });
      await loadSharedData();
      setNotice("Idea moved to Planned Content.");
    } catch (error) {
      setNotice(readableError(error, "Could not move idea to Planned Content."));
    }
  }

  async function openAccountingDocument(document: AccountingDocument) {
    setPreviewDocument(document);
    setPreviewDocumentUrl("");
    setPreviewDocumentError("");
    try {
      setPreviewDocumentUrl(await createAccountingDocumentSignedUrl(document.filePath));
    } catch (error) {
      setPreviewDocumentError(error instanceof Error ? error.message : "Could not open document.");
    }
  }

  function fulfilmentCell(order: Order, column: FulfilmentColumn) {
    if (column === "orderNumber") return <strong>{orderLabel(order)}</strong>;
    if (column === "meaningfulMessage") return order.meaningfulMessage ? <a href={order.meaningfulMessage} target="_blank" rel="noreferrer">Open message</a> : "-";
    if (column === "plushName") return <strong>{order.plushName || "-"}</strong>;
    if (column === "character") return order.character || "-";
    if (column === "idWebsiteLink") {
      const link = certificateLink(order);
      return link ? <div className="link-copy"><a href={link} target="_blank" rel="noreferrer">{certificateLink(order, false)}</a><button type="button" onClick={() => copyCertificateLink(order)}>Copy</button></div> : "-";
    }
    if (column === "customerName") return order.customerName || "-";
    return order.phone || "-";
  }

  const workspace = workspaceForView(view);
  const availableWorkspaces: Workspace[] = session.role === "admin" ? ["fulfilment", "accounting", "formal_accounting", "inventory", "reports", "content", "settings"] : ["fulfilment"];
  const sidebarNavItems = navItemsForWorkspace(workspace, session.role);
  const workspaceTitle = workspaceLabels[workspace];

  return <main className="app-shell">
    <aside className="side-nav">
      <div className="workspace-switcher">
        <div className="logo"><span>MP</span><div>Meaningful Plushies<small>{workspaceTitle}</small></div></div>
        <label>
          <span>Workspace</span>
          <select value={workspace} onChange={(event) => setView(workspaceDefaultViews[event.target.value as Workspace])}>
            {availableWorkspaces.map((item) => <option key={item} value={item}>{workspaceLabels[item]}</option>)}
          </select>
        </label>
      </div>
      <nav>
        {sidebarNavItems.map((item) => <button key={item.view} className={view === item.view ? "active" : ""} onClick={() => setView(item.view)}><Icon name={item.icon} /> {item.label}</button>)}
      </nav>
      <div className="user-card"><div className="avatar">{session.displayName.slice(0, 1)}</div><div><strong>{session.displayName}</strong><span>@{session.username} | {session.role === "admin" ? "Administrator" : "Fulfilment staff"}</span></div><button title="Sign out" onClick={signOut}><Icon name="logout" /></button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><p>{workspaceTitle.toUpperCase()} WORKSPACE</p><h1>{viewTitle(view)}</h1></div><div className="top-actions"><span className={`role-badge ${session.role}`}>{session.role}</span>{view === "packing_slips" && <button className="button primary print-trigger" onClick={printPackingSlips}>Print {packingOrders.length} A6 slip{packingOrders.length === 1 ? "" : "s"}</button>}{view === "print_envelope" && <button className="button primary" disabled={!envelopeOrders.length || !envelopePrintSettings.fontBase64} onClick={printEnvelopes}>Generate {envelopePages.length} A4 page{envelopePages.length === 1 ? "" : "s"}</button>}{view === "sales_report" && <button className="button primary" onClick={() => printView("print-sales-report")}>Print / Save PDF</button>}{workspace === "fulfilment" && view !== "import" && <button className="button secondary" onClick={() => setView("import")}>Import CSV</button>}</div></header>
      {databaseError && <div className="notice"><span>Database connection: {databaseError}</span></div>}
      {loadingOrders && <div className="notice"><span>Loading shared orders from Supabase...</span></div>}
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>x</button></div>}

      {workspace === "accounting" && session.role === "admin" && <AccountingWorkspacePage
        view={view}
        categories={accountingCategories}
        documents={accountingDocuments}
        transactions={accountingTransactions}
        ledgerEntries={accountingLedgerEntries}
        documentForm={documentForm}
        transactionForm={transactionForm}
        accountForm={accountForm}
        bookkeepingCategoryForm={bookkeepingCategoryForm}
        salesConsumptionMappingForm={salesConsumptionMappingForm}
        salesConsumptionMappings={salesConsumptionMappings}
        selectedFile={accountingDocumentFile}
        transactionFile={transactionDocumentFile}
        saving={savingAccounting}
        onDocumentFormChange={(patch) => setDocumentForm((current) => ({ ...current, ...patch }))}
        onTransactionFormChange={(patch) => setTransactionForm((current) => ({ ...current, ...patch }))}
        onInventoryCostFieldChange={onInventoryCostFieldChange}
        onAccountFormChange={(patch) => setAccountForm((current) => ({ ...current, ...patch }))}
        onBookkeepingCategoryFormChange={(patch) => setBookkeepingCategoryForm((current) => ({ ...current, ...patch }))}
        onSalesConsumptionMappingFormChange={(patch) => setSalesConsumptionMappingForm((current) => ({ ...current, ...patch }))}
        onFileChange={setAccountingDocumentFile}
        onTransactionFileChange={setTransactionDocumentFile}
        onUploadDocument={uploadAccountingDocument}
        onCreateTransaction={createManualAccountingTransaction}
        onReadBookkeepingCsv={readBookkeepingCsv}
        csvRows={bookkeepingCsvRows}
        csvFileName={bookkeepingCsvFileName}
        onImportBookkeepingCsv={importBookkeepingCsvRows}
        onClearBookkeepingCsv={() => { setBookkeepingCsvRows([]); setBookkeepingCsvFileName(""); }}
        onSaveAccount={saveAccountSettings}
        onSaveBookkeepingCategory={saveBookkeepingCategory}
        onSaveSalesConsumptionRule={saveSalesConsumptionRule}
        onRemoveSalesConsumptionRule={removeSalesConsumptionRule}
        onSetupChart={setupAccountingChart}
        onEditAccount={(account) => setAccountForm({ id: account.id, name: account.name, accountType: account.accountType === "income" ? "revenue" : account.accountType, reportSection: account.reportSection, parentId: account.parentId, dataSourceType: account.dataSourceType, sourceModule: account.sourceModule || "Manual Transactions", sourceEntity: account.sourceEntity, postingTrigger: account.postingTrigger || "Manual Entry", allowSubAccounts: account.allowSubAccounts, active: account.active })}
        postingPreview={ledgerPreview()}
        accountOptions={accountOptionsForEvent()}
        onOpenDocument={openAccountingDocument}
        onDeleteDocument={removeAccountingDocument}
        onDeleteTransaction={removeAccountingTransaction}
        transactionDocuments={accountingDocuments}
        settlementFiles={settlementFiles}
        onSettlementFileChange={(transactionId, file) => setSettlementFiles((current) => ({ ...current, [transactionId]: file }))}
        onSettleTransaction={settleAccountingTransaction}
        sales={sales}
        processorAccountingTotals={processorAccountingTotals}
        categoryName={categoryName}
      />}

      {workspace === "formal_accounting" && session.role === "admin" && <FormalAccountingWorkspacePage
        view={view}
        orders={orders}
        transactions={accountingTransactions}
        ledgerEntries={accountingLedgerEntries}
        categories={accountingCategories}
        salesRows={allSalesReportRows}
        salesConsumptionMappings={salesConsumptionMappings}
        categoryName={categoryName}
      />}

      {workspace === "content" && session.role === "admin" && <ContentPlanWorkspacePage
        view={view}
        items={contentPlanItems}
        form={contentPlanForm}
        ideas={contentIdeas}
        ideaForm={contentIdeaForm}
        onFormChange={(patch) => setContentPlanForm((current) => ({ ...current, ...patch }))}
        onIdeaFormChange={(patch) => setContentIdeaForm((current) => ({ ...current, ...patch }))}
        onSave={saveContentPlan}
        onTogglePosted={toggleContentPosted}
        onDelete={removeContentPlan}
        onAddIdeaReference={addIdeaReference}
        onRemoveIdeaReference={removeIdeaReference}
        onSaveIdea={saveContentIdeaItem}
        onDeleteIdea={removeContentIdea}
        onMoveIdeaToPlanned={moveContentIdeaToPlanned}
      />}

      {workspace === "fulfilment" && view !== "import" && view !== "packing_slips" && view !== "print_envelope" && view !== "history" && view !== "settings" && view !== "stock" && view !== "sales_report" && <>
        {view === "orders" && <section className="stats">
          <Stat label="Active orders" value={counts.total} color="navy" />
          <Stat label="Uploading audio" value={counts.voice} color="orange" />
          <Stat label="Sent for sewing" value={counts.production} color="blue" />
          <article className="stat green selectable-stat"><select aria-label="Choose fourth dashboard status" value={dashboardStatus} onChange={(event) => setDashboardStatus(event.target.value as OrderStatus | "total")}>{dashboardSelectableStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><strong>{counts.selected}</strong></article>
          <article className="stat red selectable-stat"><select aria-label="Choose fifth dashboard status" value={dashboardStatusTwo} onChange={(event) => setDashboardStatusTwo(event.target.value as OrderStatus | "total")}>{dashboardSelectableStatuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><strong>{counts.selectedTwo}</strong></article>
        </section>}

        {view === "orders" && session.role === "admin" && <>
          <div className="reporting-header">
            <div><strong>Sales reporting</strong><span>{reportingOrders.length} order records</span></div>
            <div className="range-tabs">
              {salesRanges.map(({ value, label }) => <button key={value} className={salesRange === value ? "active" : ""} onClick={() => setSalesRange(value)}>{label}</button>)}
            </div>
          </div>
          <section className="sales-stats">
            <MoneyStat label="Total sales" value={sales.gross} tone="sales" />
            <SelectableMoneyStat label="Collected from" value={sales[collectedMetric]} tone="transfer" selected={collectedMetric} onChange={(value) => setCollectedMetric(value as CollectedMetric)} options={Object.entries(collectedMetricLabels)} />
            <SelectableMoneyStat label="Discount" value={sales[discountMetric]} tone="discount" selected={discountMetric} onChange={(value) => setDiscountMetric(value as DiscountMetric)} options={Object.entries(discountMetricLabels)} />
            <SelectableMoneyStat label="Fees" value={sales[feeMetric]} tone="fees" selected={feeMetric} onChange={(value) => setFeeMetric(value as FeeMetric)} options={Object.entries(feeMetricLabels)} />
            <MoneyStat label="Total cash after fees" value={sales.collected} tone="collected" />
          </section>
        </>}

        {view !== "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, phone or tracking..." /></div><StatusFilterPills value={statusFilter} onChange={setStatusFilter} /><SortControls sortKey={sortKey} direction={sortDirection} onKey={setSortKey} onDirection={setSortDirection} />{view === "orders" && <button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>}{session.role === "admin" && <button className="button danger" disabled={!selectedOrders.length} onClick={() => deleteOrders(selectedOrders)}>Delete</button>}{view === "fulfilled" && <button className="button secondary" onClick={downloadFulfilled}>Export CSV</button>}</div>
          <div className="table-scroll"><table className="orders-table"><thead><tr><th><input type="checkbox" aria-label="Select visible orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Character</th><th>Voice</th><th>Plush name</th><th>Status</th><th>Tracking number</th><th>Last updated</th><th>View</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id} className={isExpressShipping(order) ? "express-shipping-row" : ""}><td><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={selectedOrders.includes(order.id)} onChange={() => toggleOrderSelection(order.id)} /></td><td><strong>{orderLabel(order)}</strong>{isExpressShipping(order) && <span className="shipping-badge">Express</span>}</td><td>{formatDate(order.orderDate)}</td><td><strong>{order.customerName || "-"}</strong></td><td>{order.phone || "-"}</td><td>{order.character || "-"}</td><td>{order.voiceLength ? `${order.voiceLength}s` : "-"}</td><td>{order.plushName || "-"}</td><td><StatusPill status={order.status} /></td><td><code>{order.trackingNumber || "-"}</code></td><td>{formatDate(order.updatedAt, true)}</td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>No orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {view === "fulfilled" ? orders.filter((order) => order.status === "shipped").length : orders.length} orders</div>
        </section>}

        {view === "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, plush name, character, customer or phone..." /></div><StatusFilterPills value={statusFilter} onChange={setStatusFilter} /><SortControls sortKey={sortKey} direction={sortDirection} onKey={setSortKey} onDirection={setSortDirection} /><button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>{session.role === "admin" && <button className="button danger" disabled={!selectedOrders.length} onClick={() => deleteOrders(selectedOrders)}>Delete</button>}</div>
          <div className="fulfilment-scroll table-scroll"><table className="orders-table fulfilment-table"><thead><tr><th className="select-column"><input type="checkbox" aria-label="Select visible fulfilment orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th className="locked-order-column">Order ID</th>{fulfilmentColumns.filter((column) => column !== "orderNumber").map((column) => <th key={column} className={draggedColumn === column ? "dragging" : ""} draggable onDragStart={(event) => { setDraggedColumn(column); event.dataTransfer.setData("text/plain", column); }} onDragEnd={() => setDraggedColumn(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => reorderFulfilmentColumn(event.dataTransfer.getData("text/plain") as FulfilmentColumn, column)}><span className="drag-handle"><Icon name="drag" /></span>{fulfilmentColumnLabels[column]}</th>)}<th>Status</th><th>View</th></tr></thead><tbody>{filtered.map((order) => { const checked = selectedOrders.includes(order.id); const rowClass = [checked ? "selected-row" : "", isExpressShipping(order) ? "express-shipping-row" : ""].filter(Boolean).join(" "); return <tr key={order.id} className={rowClass} onClick={(event) => { if ((event.target as HTMLElement).closest("button,a,input")) return; toggleOrderSelection(order.id); }}><td className="select-column"><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={checked} onChange={() => toggleOrderSelection(order.id)} /></td><td className="locked-order-column"><strong>{orderLabel(order)}</strong>{isExpressShipping(order) && <span className="shipping-badge">Express</span>}</td>{fulfilmentColumns.filter((column) => column !== "orderNumber").map((column) => <td key={column} className={column === "idWebsiteLink" ? "certificate-cell" : ""}>{fulfilmentCell(order, column)}</td>)}<td><StatusPill status={order.status} /></td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty"><strong>No fulfilment orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {orders.length} orders</div>
        </section>}
      </>}

      {view === "packing_slips" && <section className="packing-page">
        <div className="packing-controls card">
          <div className="packing-manual"><div><h2>Choose orders to print</h2><p>Enter order IDs separated by commas or spaces, or select orders from the list below.</p></div><div className="manual-entry"><input value={manualOrderIds} onChange={(event) => setManualOrderIds(event.target.value)} onKeyDown={(event) => event.key === "Enter" && selectManualOrders()} placeholder="Example: 1359, 1360, 1361" /><button className="button primary" onClick={selectManualOrders}>Add order IDs</button></div></div>
          <div className="packing-list-header"><div><strong>Available orders</strong><span>Order number, descending</span></div><select value={packingStatusFilter} onChange={(event) => setPackingStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><div className="packing-list-actions"><button onClick={() => setPackingSelection((current) => [...new Set([...current, ...packingAvailableOrders.map((order) => order.id)])])}>Select shown</button><button onClick={() => setPackingSelection([])}>Clear</button></div></div>
          <div className="packing-order-list">{packingAvailableOrders.map((order) => <label key={order.id}><input type="checkbox" checked={packingSelection.includes(order.id)} onChange={() => setPackingSelection((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{orderLabel(order)} | {order.plushName || "Unnamed plushie"}</strong><span>{order.customerName} | {order.character || "No character"}</span></div><StatusPill status={order.status} /></label>)}</div>
        </div>
        <div className="packing-preview"><div className="preview-heading"><div><h2>A6 print preview</h2><p>One packing slip will print on each A6 page.</p></div><span>{packingOrders.length} selected</span></div>{packingOrders.length ? <div className="slip-grid">{packingOrders.map((order) => <PackingSlip order={order} key={order.id} />)}</div> : <div className="preview-empty"><strong>No orders selected</strong><p>Enter order IDs or tick orders from the list.</p></div>}</div>
      </section>}

      {view === "print_envelope" && <section className="envelope-page">
        <div className="envelope-controls card no-envelope-print">
          <div className="packing-manual"><div><h2>Choose orders to print</h2><p>Enter order IDs, choose a stage, or select every order shown in that stage.</p></div><div className="manual-entry"><input value={manualEnvelopeIds} onChange={(event) => setManualEnvelopeIds(event.target.value)} onKeyDown={(event) => event.key === "Enter" && selectManualEnvelopeOrders()} placeholder="Example: 1402, 1403, 1404" /><button className="button primary" onClick={selectManualEnvelopeOrders}>Add order IDs</button></div></div>
          <div className="canva-connection connected"><div><strong>Envelope print settings</strong><span>Font, size, spacing, and text box placement are managed in Settings / Print Settings.</span></div><button className="view-button" onClick={() => setView("settings")}>Open settings</button></div>
          <div className="packing-list-header"><div><strong>Available orders</strong><span>Order number, descending</span></div><select value={envelopeStatusFilter} onChange={(event) => setEnvelopeStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><div className="packing-list-actions"><button onClick={() => setEnvelopeSelection((current) => [...new Set([...current, ...envelopeAvailableOrders.map((order) => order.id)])])}>Select shown</button><button onClick={() => setEnvelopeSelection([])}>Clear</button></div></div>
          <div className="packing-order-list">{envelopeAvailableOrders.map((order) => { const selectedIndex = envelopeSelection.indexOf(order.id); return <label key={order.id}><input type="checkbox" checked={selectedIndex >= 0} onChange={() => setEnvelopeSelection((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{orderLabel(order)} | {(order.plushName || "Unnamed plushie").toUpperCase()}</strong><span>{order.customerName || "No customer"} | {order.character || "No character"}</span></div>{selectedIndex >= 0 ? <b className="envelope-order-position">{selectedIndex + 1}</b> : <StatusPill status={order.status} />}</label>; })}</div>
        </div>
        <div className="envelope-preview"><div className="preview-heading"><div><h2>A4 page order</h2><p>Two names are placed on each page using your uploaded font and envelope settings.</p></div><span>{envelopePages.length} pages</span></div>{envelopePages.length ? <div className="envelope-sheet-list">{envelopePages.map((pageOrders, index) => <EnvelopeSheet key={index} pageNumber={index + 1} orders={pageOrders} settings={envelopePrintSettings} />)}</div> : <div className="preview-empty"><strong>No orders selected</strong><p>Choose orders from the list to build the envelope pages.</p></div>}</div>
      </section>}

      {view === "sales_report" && session.role === "admin" && <section className="sales-report-page">
        <div className="report-controls card no-print"><div><label>From<input type="date" value={reportStartDate} onChange={(event) => setReportStartDate(event.target.value)} /></label><label>To<input type="date" value={reportEndDate} onChange={(event) => setReportEndDate(event.target.value)} /></label></div><div><button className="button secondary" onClick={() => setReportSelectedOrders(dateFilteredReportRows.map((row) => row.orderNumber))}>Select shown</button><button className="button secondary" onClick={() => setReportSelectedOrders([])}>Use all matching</button><button className="button primary" onClick={() => printView("print-sales-report")}>Print / Save PDF</button></div></div>
        <div className="report-selection card no-print"><div className="report-selection-heading"><strong>Choose individual orders</strong><span>{reportSelectedOrders.length ? `${reportSelectedOrders.length} selected` : "All orders matching the dates are included"}</span></div><div>{dateFilteredReportRows.map((row) => <label key={row.orderNumber}><input type="checkbox" checked={reportSelectedOrders.includes(row.orderNumber)} onChange={() => setReportSelectedOrders((current) => current.includes(row.orderNumber) ? current.filter((number) => number !== row.orderNumber) : [...current, row.orderNumber])} /><span>#{row.orderNumber}</span><small>{formatDate(row.orderDate)} | {row.customerName}</small></label>)}</div></div>
        <section className="sales-report-print card">
          <div className="report-title"><div><p>MEANINGFUL PLUSHIES</p><h2>Sales Report</h2><span>{reportStartDate || "All dates"}{reportEndDate ? ` to ${reportEndDate}` : ""}</span></div><div><strong>{visibleReportRows.length}</strong><span>orders</span></div></div>
          <div className="report-summary"><div><span>Sale price</span><strong>{formatMoney(reportTotals.sales)}</strong></div><div><span>Discounts</span><strong>{formatMoney(reportTotals.discounts)}</strong></div><div><span>Processor fees</span><strong>{formatMoney(reportTotals.processingFees)}</strong></div><div><span>Shopify fees</span><strong>{formatMoney(reportTotals.shopifyFees)}</strong></div><div><span>Total fees</span><strong>{formatMoney(reportTotals.fees)}</strong></div><div><span>Cash after fees</span><strong>{formatMoney(reportTotals.cash)}</strong></div></div>
          <div className="table-scroll"><table className="orders-table report-table"><thead><tr><th>Order</th><th>Date</th><th>Customer</th><th>Character</th><th>Speaker</th><th>Payment</th><th>Sale price</th><th>Discount</th><th>Processor fee</th><th>Shopify fee</th><th>Cash after fees</th></tr></thead><tbody>{visibleReportRows.map((row) => <tr key={row.orderNumber}><td><strong>#{row.orderNumber}</strong></td><td>{formatDate(row.orderDate)}</td><td>{row.customerName || "-"}</td><td>{row.characters.join(", ") || "-"}</td><td>{row.voiceLengths.map((length) => `${length}s`).join(", ") || "-"}</td><td>{row.paymentProcessor}</td><td>{formatMoney(row.salePrice)}</td><td>{formatMoney(row.totalDiscount)}</td><td>{formatMoney(row.processingFee)}</td><td>{formatMoney(row.shopifyFee)}</td><td><strong>{formatMoney(row.cashAfterFees)}</strong></td></tr>)}</tbody></table></div>
          {!visibleReportRows.length && <div className="empty"><strong>No orders in this report</strong><p>Choose orders or adjust the date range.</p></div>}
        </section>
      </section>}

      {view === "stock" && session.role === "admin" && <section className="stock-page">
        <div className="stock-grid">{stock.characters.map((item) => <article className="stock-card card" key={item.name}><span>{item.name}</span><strong>{item.remaining}</strong><p>{item.sold} sold from {item.initial} initial stock</p></article>)}</div>
        <section className="card voice-stock"><div><span>Shared voice inventory</span><strong>{stock.voiceRemaining}</strong><p>{stock.voiceSold} total sold from {stock.voiceInitial} initial stock</p></div><div className="voice-breakdown">{stock.voices.map((voice) => <article key={voice.length}><strong>{voice.sold}</strong><span>{voice.length}s sold</span></article>)}</div></section>
      </section>}

      {view === "history" && session.role === "admin" && <section className="history-page card"><div className="history-page-header"><div><h2>Activity history</h2><p>Every recorded import, edit, status change, print, and deletion.</p></div><span>{historyEvents.length} actions</span></div><div className="activity-list">{historyEvents.map((event) => <article key={event.id}><div className="activity-icon"><Icon name="history" /></div><div><strong>{event.action}</strong><p>{event.detail}</p><span>{event.orderNumber ? `Order #${event.orderNumber} | ` : ""}{event.actor} | {formatDate(event.createdAt, true)}</span></div></article>)}{!historyEvents.length && <div className="empty"><strong>No activity recorded yet</strong><p>New actions will appear here.</p></div>}</div></section>}

      {view === "settings" && session.role === "admin" && <section className="settings-page card">
        <div className="settings-heading"><div><h2>Accounts and permissions</h2><p>Admins can edit everything. Staff can use workflow pages and only advance order stages.</p></div><span>{accounts.length} accounts</span></div>
        <div className="account-create"><input placeholder="Username" value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value.toLowerCase() })} /><input placeholder="Display name" value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} /><select value={newAccount.role} onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value as UserRole })}><option value="staff">Staff</option><option value="admin">Admin</option></select><input type="password" placeholder="Password (8+ characters)" value={newAccount.password} onChange={(event) => setNewAccount({ ...newAccount, password: event.target.value })} /><button className="button primary" onClick={createAccount}>Create account</button></div>
        <div className="account-list">{accounts.map((account) => <div className="account-row" key={account.id}><strong>@{account.username}</strong><input value={account.displayName} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, displayName: event.target.value } : item))} /><select value={account.role} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: event.target.value as UserRole } : item))}><option value="staff">Staff</option><option value="admin">Admin</option></select><input type="password" placeholder="New password (optional)" value={accountPasswords[account.id] ?? ""} onChange={(event) => setAccountPasswords((current) => ({ ...current, [account.id]: event.target.value }))} /><label><input type="checkbox" checked={account.active} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: event.target.checked } : item))} /> Active</label><button className="button primary" onClick={() => saveAccount(account, accountPasswords[account.id])}>Save</button></div>)}</div>

        <div className="settings-heading"><div><h2>Initial stock</h2><p>Character stock is separate. Voice stock is one shared pool, so any 5s, 10s, or 20s sale deducts one unit.</p></div></div>
        <div className="stock-settings">{[...bookkeepingInventoryStockKeys, "VOICE"].map((itemKey) => { const setting = stockSettings.find((item) => item.itemKey === itemKey) ?? { itemKey, initialStock: 0 }; return <div key={itemKey}><strong>{itemKey === "VOICE" ? "SHARED VOICE UNITS" : itemKey}</strong><input type="number" min="0" step="1" value={setting.initialStock} onChange={(event) => setStockSettings((current) => [...current.filter((item) => item.itemKey !== itemKey), { itemKey, initialStock: Number(event.target.value) }])} /><button className="button primary" onClick={() => saveStock(setting)}>Save</button></div>; })}</div>

        <div className="settings-heading"><div><h2>Print settings</h2><p>Control the Print Envelope font, text size, spacing, and name box placement. Names are converted to all caps before printing.</p></div></div>
        <EnvelopeSettingsPanel settings={envelopePrintSettings} onChange={updateEnvelopePrintSettings} onFontUpload={uploadEnvelopeFont} onReset={() => setEnvelopePrintSettings(defaultEnvelopePrintSettings)} />

        <div className="settings-heading"><div><h2>Payment processor fees</h2><p>New Shopify payment methods appear here automatically. Set a percentage, a fixed RM amount, both, or leave both at zero for no fee.</p></div><span>{processorSettings.length} processors</span></div>
        <div className="processor-list">
          <div className="processor-row shopify-fee-row"><strong>Shopify fee (Stripe and Xendit)</strong><label><input type="number" min="0" step="0.01" value={salesFeeSettings.shopifyPercentage} onChange={(event) => setSalesFeeSettings({ shopifyPercentage: Number(event.target.value) })} /><span>%</span></label><span className="shopify-fee-note">Calculated from the amount collected</span><button className="button primary" onClick={saveShopifyFee}>Save</button></div>
          <div className="processor-row processor-header"><strong>Payment method</strong><strong>Percentage</strong><strong>Fixed amount</strong><span /></div>
          {processorSettings.map((setting) => <div className="processor-row" key={setting.processor}><strong>{setting.processor}</strong><label><input type="number" min="0" step="0.01" value={setting.percentage} onChange={(event) => setProcessorSettings((current) => current.map((item) => item.processor === setting.processor ? { ...item, percentage: Number(event.target.value) } : item))} /><span>%</span></label><label><span>RM</span><input type="number" min="0" step="0.01" value={setting.fixedAmount} onChange={(event) => setProcessorSettings((current) => current.map((item) => item.processor === setting.processor ? { ...item, fixedAmount: Number(event.target.value) } : item))} /></label><button className="button primary" onClick={() => saveProcessor(setting)}>Save</button></div>)}
          {!processorSettings.length && <div className="empty"><strong>No payment methods discovered yet</strong><p>Import a Shopify orders CSV and its payment methods will appear here.</p></div>}
        </div>
      </section>}

      {view === "import" && <section className="import-page">
        <div className="import-intro"><span>CSV</span><div><h2>Import Shopify exports</h2><p>Upload or paste the CSV files into either side. The app auto-detects the Shopify orders export and the metafields export, then matches line items with each Product block.</p></div></div>
        <div className="import-columns">
          <ImportBox number="1" title="Shopify order export" required value={orderCsv} onChange={setOrderCsv} onFile={(file) => readFile(file, "orders")} placeholder="Name, Email, Financial Status, Lineitem name..." />
          <ImportBox number="2" title="Order metafields export" value={metafieldCsv} onChange={setMetafieldCsv} onFile={(file) => readFile(file, "metafields")} placeholder="Order GID, Order name, Metafield value..." />
        </div>
        <div className="import-action"><div><strong>Safe repeat imports</strong><p>Existing order numbers are updated without removing status, tracking, notes, or photos.</p></div><button className="button primary large" disabled={!orderCsv.trim() && detectCsvKind(metafieldCsv) !== "orders"} onClick={runImport}>Validate and import orders</button></div>
      </section>}
    </section>

    {selected && <OrderDrawer order={selected} role={session.role} actor={session.displayName} onClose={() => setSelectedId(null)} onUpdate={(patch) => updateOrder(selected.id, patch)} onStatus={(status) => setStatus(selected, status)} />}
    {previewDocument && <DocumentPreviewModal document={previewDocument} url={previewDocumentUrl} error={previewDocumentError} onClose={() => { setPreviewDocument(null); setPreviewDocumentUrl(""); setPreviewDocumentError(""); }} />}
  </main>;
}

function AccountingWorkspacePage({
  view,
  categories,
  documents,
  transactions,
  ledgerEntries,
  documentForm,
  transactionForm,
  accountForm,
  bookkeepingCategoryForm,
  salesConsumptionMappingForm,
  salesConsumptionMappings,
  selectedFile,
  transactionFile,
  saving,
  onDocumentFormChange,
  onTransactionFormChange,
  onInventoryCostFieldChange,
  onAccountFormChange,
  onBookkeepingCategoryFormChange,
  onSalesConsumptionMappingFormChange,
  onFileChange,
  onTransactionFileChange,
  onUploadDocument,
  onCreateTransaction,
  onReadBookkeepingCsv,
  csvRows,
  csvFileName,
  onImportBookkeepingCsv,
  onClearBookkeepingCsv,
  onSaveAccount,
  onSaveBookkeepingCategory,
  onSaveSalesConsumptionRule,
  onRemoveSalesConsumptionRule,
  onSetupChart,
  onEditAccount,
  postingPreview,
  accountOptions,
  onOpenDocument,
  onDeleteDocument,
  onDeleteTransaction,
  transactionDocuments,
  settlementFiles,
  onSettlementFileChange,
  onSettleTransaction,
  sales,
  processorAccountingTotals,
  categoryName,
}: {
  view: View;
  categories: AccountingCategory[];
  documents: AccountingDocument[];
  transactions: AccountingTransaction[];
  ledgerEntries: AccountingLedgerEntry[];
  documentForm: AccountingDocumentForm;
  transactionForm: AccountingTransactionForm;
  accountForm: AccountingAccountForm;
  bookkeepingCategoryForm: BookkeepingCategoryForm;
  salesConsumptionMappingForm: SalesConsumptionMappingForm;
  salesConsumptionMappings: SalesConsumptionMapping[];
  selectedFile: File | null;
  transactionFile: File | null;
  saving: boolean;
  onDocumentFormChange: (patch: Partial<AccountingDocumentForm>) => void;
  onTransactionFormChange: (patch: Partial<AccountingTransactionForm>) => void;
  onInventoryCostFieldChange: (field: InventoryCostField, value: string) => void;
  onAccountFormChange: (patch: Partial<AccountingAccountForm>) => void;
  onBookkeepingCategoryFormChange: (patch: Partial<BookkeepingCategoryForm>) => void;
  onSalesConsumptionMappingFormChange: (patch: Partial<SalesConsumptionMappingForm>) => void;
  onFileChange: (file: File | null) => void;
  onTransactionFileChange: (file: File | null) => void;
  onUploadDocument: () => void;
  onCreateTransaction: () => void;
  onReadBookkeepingCsv: (file: File | undefined) => void;
  csvRows: BookkeepingCsvImportRow[];
  csvFileName: string;
  onImportBookkeepingCsv: () => void;
  onClearBookkeepingCsv: () => void;
  onSaveAccount: () => void;
  onSaveBookkeepingCategory: () => void;
  onSaveSalesConsumptionRule: () => void;
  onRemoveSalesConsumptionRule: (mapping: SalesConsumptionMapping) => void;
  onSetupChart: () => void;
  onEditAccount: (account: AccountingCategory) => void;
  postingPreview: AccountingLedgerEntry[];
  accountOptions: AccountOption[];
  onOpenDocument: (document: AccountingDocument) => void;
  onDeleteDocument: (document: AccountingDocument) => void;
  onDeleteTransaction: (transaction: AccountingTransaction) => void;
  transactionDocuments: AccountingDocument[];
  settlementFiles: Record<string, File | null>;
  onSettlementFileChange: (transactionId: string, file: File | null) => void;
  onSettleTransaction: (transaction: AccountingTransaction) => void;
  sales: SalesSummary;
  processorAccountingTotals: { stripeCollected: number; stripeProcessingFees: number; xenditCollected: number; xenditProcessingFees: number };
  categoryName: (categoryId: string) => string;
}) {
  const cashTransferTransactionIds = new Set(transactions.filter((transaction) => transaction.businessEvent === "payment_processor_paid").map((transaction) => transaction.id));
  const incomeTransactions = transactions.filter((transaction) => transaction.transactionType === "income");
  const cashTransferToBank = ledgerEntries
    .filter((entry) => cashTransferTransactionIds.has(entry.transactionId) && entry.accountName === "Bank Account" && entry.entryType === "debit" && entry.memo.toLowerCase().includes("transfer to bank"))
    .reduce((total, entry) => total + entry.amount, 0);
  const expenseTransactions = transactions.filter((transaction) => transaction.transactionType === "expense");
  const income = incomeTransactions.reduce((total, transaction) => total + transaction.amount, 0) + cashTransferToBank;
  const expenses = expenseTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const profit = income - expenses;
  const event = businessEvents.find((item) => item.value === transactionForm.businessEvent) ?? businessEvents[0];
  const expenseByCategory = expenseTransactions.reduce<Record<string, number>>((totals, transaction) => {
    const key = categoryName(transaction.categoryId);
    totals[key] = (totals[key] ?? 0) + transaction.amount;
    return totals;
  }, {});

  const categoryOptions = categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>);
  const groupedEvents = Array.from(new Set(businessEvents.map((item) => item.group)));
  const parentOptions = categories.filter((category) => category.allowSubAccounts && !category.parentId);
  const inventoryMappingOptions = [...new Set([
    ...bookkeepingInventoryStockKeys,
    ...categories.filter((category) => category.reportSection === bookkeepingSectionConfigs.inventory.reportSection || category.name === "Inventory" || (category.parentId && categoryName(category.parentId) === "Inventory")).map((category) => normalizeAccountingItem(category.name)),
  ])].sort((a, b) => a.localeCompare(b));
  const categoryEventValue = bookkeepingEventByView[view];
  const categoryEvent = businessEvents.find((item) => item.value === categoryEventValue);
  const unsettledTransactions = transactions.filter((transaction) => ["deposit_paid", "on_credit", "pay_later"].includes(transaction.paymentStatus));

  if (view === "accounting_dashboard") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>BOOK KEEPING BOOK</p><h2>All transactions</h2><span>Every money-in and money-out record saved from the bookkeeping category pages.</span></div><div className="accounting-status-pill">{transactions.length} records</div></div>
    <section className="accounting-summary-grid">
      <MoneyStat label="Money in" value={income} tone="collected" />
      <MoneyStat label="Money out" value={expenses} tone="fees" />
      <MoneyStat label="Net" value={profit} tone={profit < 0 ? "fees" : "sales"} />
    </section>
    <AccountingTransactionsTable transactions={transactions} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onDelete={onDeleteTransaction} />
  </section>;

  if (view === "accounting_payable") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>UNSETTLED PAYMENTS</p><h2>Deposits and credit purchases</h2><span>Transactions stay here until the remaining payment is marked paid. Upload the payment proof when you settle it.</span></div><div className="accounting-status-pill">{unsettledTransactions.length} unsettled</div></div>
    <UnsettledPaymentsTable transactions={unsettledTransactions} files={settlementFiles} saving={saving} onFileChange={onSettlementFileChange} onSettle={onSettleTransaction} />
  </section>;

  if (view === "accounting_files") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>SOURCE DOCUMENTS</p><h2>Files linked to transactions</h2><span>Every receipt, invoice, payment proof, or source document attached to a bookkeeping transaction appears here.</span></div><div className="accounting-status-pill">{documents.filter((document) => transactions.some((transaction) => transaction.documentId === document.id)).length} files</div></div>
    <AccountingFilesTable documents={documents} transactions={transactions} ledgerEntries={ledgerEntries} categoryName={categoryName} onOpen={onOpenDocument} />
  </section>;

  if (view === "accounting_csv_import") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>BOOK KEEPING CSV IMPORT</p><h2>Import transactions automatically</h2><span>Upload a CSV and the system will map each row into bookkeeping entries. Review the preview before saving.</span></div><div className="accounting-status-pill">{csvRows.length} rows</div></div>
    <section className="csv-import-layout">
      <div className="accounting-form card">
        <h3>Upload CSV</h3>
        <FileDropZone accept=".csv,text/csv" title="Choose or drop bookkeeping CSV" description={csvFileName || "CSV columns can be in any order"} onFile={(file) => onReadBookkeepingCsv(file ?? undefined)} className="compact-file-drop" />
        <section className="posting-preview">
          <h3>Accepted columns</h3>
          <p>Use any of these common headers. Extra columns are ignored.</p>
          <div><span>Date</span><strong>date, transaction date</strong></div>
          <div><span>Details</span><strong>description, memo, notes</strong></div>
          <div><span>Category</span><strong>category, account, item</strong></div>
          <div><span>Amount</span><strong>amount, total, debit, credit</strong></div>
          <div><span>Inventory</span><strong>quantity, unit cost</strong></div>
        </section>
        <div className="csv-import-actions"><button className="button primary" disabled={!csvRows.some((row) => row.amount > 0) || saving} onClick={onImportBookkeepingCsv}>{saving ? "Importing..." : `Import ${csvRows.filter((row) => row.amount > 0).length} rows`}</button><button className="button secondary" type="button" onClick={onClearBookkeepingCsv}>Clear</button></div>
      </div>
      <section className="card accounting-table-card">
        <h3>Import preview</h3>
        <div className="table-scroll"><table className="orders-table"><thead><tr><th>Row</th><th>Date</th><th>Detected type</th><th>Category</th><th>Description</th><th>Amount</th><th>Payment</th><th>Warnings</th></tr></thead><tbody>{csvRows.map((row) => <tr key={row.id} className={row.warnings.length ? "csv-warning-row" : ""}><td>{row.rowNumber}</td><td>{formatDate(row.transactionDate)}</td><td>{businessEvents.find((event) => event.value === row.businessEvent)?.label}</td><td><strong>{row.categoryName}</strong>{row.quantity > 0 && <><br /><small>{row.quantity} x {formatMoney(row.unitCost)}</small></>}</td><td>{row.description}<br /><small>{row.supplier || "-"}</small></td><td><strong>{formatMoney(row.amount)}</strong></td><td>{row.paymentStatus.replace(/_/g, " ")}<br /><small>{row.paymentMethod}</small></td><td>{row.warnings.length ? row.warnings.join(", ") : "-"}</td></tr>)}</tbody></table>{!csvRows.length && <div className="empty"><strong>No CSV loaded yet</strong><p>Upload a CSV to preview the bookkeeping entries before importing.</p></div>}</div>
      </section>
    </section>
  </section>;

  if (categoryEvent) {
    const isInventory = categoryEvent.value === "inventory_purchase";
    const isAsset = categoryEvent.value === "asset_purchase";
    const isMoneyIn = categoryEvent.value === "payment_processor_paid";
    const selectedAccountLabel = accountOptions.find((option) => option.value === transactionForm.categoryId)?.label ?? transactionForm.categoryId;
    const newAccountLabel = isAsset ? "New asset name" : isInventory ? "New inventory account name" : categoryEvent.value === "marketing_expense" ? "New marketing account name" : "New expense account name";
    const calculatedAmount = Number(transactionForm.amount) || ((Number(transactionForm.quantity) || 0) * (Number(transactionForm.unitCost) || 0));
    const processorPayouts = transactions.filter((transaction) => transaction.businessEvent === "payment_processor_paid");
    const processorPayoutIds = new Set(processorPayouts.map((transaction) => transaction.id));
    const stripePaid = processorPayouts.filter((transaction) => transaction.accountName === "Stripe").reduce((total, transaction) => total + transaction.amount, 0);
    const xenditPaid = processorPayouts.filter((transaction) => transaction.accountName === "Xendit").reduce((total, transaction) => total + transaction.amount, 0);
    const ownerEquity = processorPayouts.filter((transaction) => transaction.accountName === "Owner's Equity").reduce((total, transaction) => total + transaction.amount, 0);
    const drawings = processorPayouts.filter((transaction) => transaction.accountName === "Drawings").reduce((total, transaction) => total + transaction.amount, 0);
    const bankLedgerNet = ledgerEntries
      .filter((entry) => processorPayoutIds.has(entry.transactionId) && entry.accountName === "Bank Account")
      .reduce((total, entry) => total + (entry.entryType === "debit" ? entry.amount : -entry.amount), 0);
    const bankBalance = sales.bankTransfer + bankLedgerNet;
    const stripeBalance = Math.max(0, processorAccountingTotals.stripeCollected - processorAccountingTotals.stripeProcessingFees - stripePaid);
    const xenditBalance = Math.max(0, processorAccountingTotals.xenditCollected - processorAccountingTotals.xenditProcessingFees - xenditPaid);
    const processorFeeBalance = processorAccountingTotals.stripeProcessingFees + processorAccountingTotals.xenditProcessingFees;
    const processorBalance = transactionForm.categoryId === "Stripe"
      ? stripeBalance
      : transactionForm.categoryId === "Xendit"
        ? xenditBalance
        : transactionForm.categoryId === "Bank Transfer"
          ? sales.bankTransfer
          : transactionForm.categoryId === "Owner's Equity" || transactionForm.categoryId === "Drawings"
            ? 0
          : 0;
    if (isMoneyIn) return <section className="accounting-workspace">
      <div className="accounting-hero card"><div><p>CASH</p><h2>Payment processor payouts</h2><span>Collection totals come from the fulfilment sales report. When Stripe or Xendit pays out, record the payout here: debit Bank, credit the payment processor.</span></div><div className="accounting-status-pill">{formatMoney(sales.totalCollected)}</div></div>
      <section className="sales-stats">
        <MoneyStat label="Bank transfer collected" value={sales.bankTransfer} tone="transfer" />
        <MoneyStat label="Stripe collected" value={sales.stripeCollected} tone="sales" />
        <MoneyStat label="Xendit collected" value={sales.xenditCollected} tone="collected" />
        <MoneyStat label="Total collected" value={sales.totalCollected} tone="sales" />
        <MoneyStat label="Cash after processor fees" value={sales.totalCollected - sales.processingFees} tone="collected" />
      </section>
      <section className="bookkeeping-balance-row">
        <MoneyStat label="Bank Account" value={bankBalance} tone="collected" />
        <MoneyStat label="Stripe" value={stripeBalance} tone="sales" />
        <MoneyStat label="Xendit" value={xenditBalance} tone="transfer" />
        <MoneyStat label="Payment Processing Fees" value={processorFeeBalance} tone="fees" />
        <MoneyStat label="Owner's Equity" value={ownerEquity} tone="sales" />
        <MoneyStat label="Drawings" value={drawings} tone="fees" />
      </section>
      <section className="accounting-form-grid">
        <div className="accounting-form card">
          <h3>Record payment received</h3>
          <label>Date received<input type="date" value={transactionForm.transactionDate} onChange={(input) => onTransactionFormChange({ transactionDate: input.target.value })} /></label>
          <label>Transaction type<select value={transactionForm.categoryId} onChange={(input) => onTransactionFormChange({ categoryId: input.target.value, accountName: "", amount: input.target.value === "Stripe" ? String(stripeBalance || "") : input.target.value === "Xendit" ? String(xenditBalance || "") : "" })}><option value="">Choose transaction</option><option value="Stripe">Stripe payout</option><option value="Xendit">Xendit payout</option><option value="Bank Transfer">Bank transfer received</option><option value="Owner's Equity">Owner's Equity</option><option value="Drawings">Drawings</option></select></label>
          {transactionForm.categoryId && <p className="accounting-file-name">{transactionForm.categoryId === "Bank Transfer" ? "Bank transfer sales are already in bank. Use this only if you want to record a manual received amount." : `Unrecorded balance from sales report: ${formatMoney(processorBalance)}`}</p>}
          <label>{transactionForm.categoryId === "Stripe" || transactionForm.categoryId === "Xendit" ? "Net amount received in bank" : "Amount received"}<input type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(input) => onTransactionFormChange({ amount: input.target.value })} /></label>
          <label>Description<input value={transactionForm.description} onChange={(input) => onTransactionFormChange({ description: input.target.value })} placeholder="Example: Stripe payout to bank" /></label>
          <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Source document" description="Choose or drop receipt, invoice, CSV, or image" selectedName={transactionFile?.name} onFile={onTransactionFileChange} />
          <section className="posting-preview">
            <h3>Posting preview</h3>
            {transactionForm.categoryId === "Drawings" ? <><div><span>Debit Drawings</span><strong>{formatMoney(calculatedAmount || 0)}</strong></div><div><span>Credit Bank Account</span><strong>{formatMoney(calculatedAmount || 0)}</strong></div></> : transactionForm.categoryId === "Stripe" || transactionForm.categoryId === "Xendit" ? <><div><span>Debit Bank Account</span><strong>{formatMoney(calculatedAmount || 0)}</strong></div><div><span>Credit {transactionForm.categoryId}</span><strong>{formatMoney(calculatedAmount || 0)}</strong></div></> : <><div><span>Debit Bank Account</span><strong>{formatMoney(calculatedAmount || 0)}</strong></div><div><span>Credit {transactionForm.categoryId || "payment processor"}</span><strong>{formatMoney(calculatedAmount || 0)}</strong></div></>}
          </section>
          <button className="button primary" disabled={saving} onClick={onCreateTransaction}>{saving ? "Saving..." : "Save payout"}</button>
        </div>
        <AccountingTransactionsTable transactions={processorPayouts} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onDelete={onDeleteTransaction} />
      </section>
    </section>;
    return <section className="accounting-workspace">
      <div className="accounting-hero card"><div><p>{categoryEvent.group.toUpperCase()}</p><h2>{categoryEvent.label}</h2><span>{isInventory ? "Record stock bought by batch. Quantity updates the inventory stock settings after saving." : isMoneyIn ? "Record payout money received from payment processors or sales reports." : "Record a simple bookkeeping transaction with source document proof."}</span></div><div className="accounting-status-pill">{formatMoney(calculatedAmount || 0)}</div></div>
      <section className="accounting-form-grid">
        <div className="accounting-form card">
          <h3>New {categoryEvent.label} record</h3>
          <label>Date<input type="date" value={transactionForm.transactionDate} onChange={(input) => onTransactionFormChange({ transactionDate: input.target.value })} /></label>
          <label>{isInventory ? "Inventory item" : isMoneyIn ? "Money in type" : isAsset ? "Asset" : "Category"}<select value={transactionForm.categoryId} onChange={(input) => onTransactionFormChange({ categoryId: input.target.value, accountName: "" })}><option value="">Choose</option>{accountOptions.map((account) => <option key={account.value} value={account.value}>{account.label}</option>)}</select></label>
          {isInventory && selectedAccountLabel === "Plush toy" && <label>Plush character<select value={transactionForm.accountName} onChange={(input) => onTransactionFormChange({ accountName: input.target.value })}><option value="">Choose character</option><option value="BILLY">BILLY</option><option value="TOOTSIE">TOOTSIE</option><option value="HUNNIE">HUNNIE</option><option value="DRAGON WARRIOR">DRAGON WARRIOR</option></select></label>}
          {isInventory && transactionForm.categoryId === rejectedInventoryOption && <label>Rejected item<select value={transactionForm.accountName} onChange={(input) => onTransactionFormChange({ accountName: input.target.value })}><option value="">Choose rejected item</option><option value="BILLY">BILLY</option><option value="TOOTSIE">TOOTSIE</option><option value="HUNNIE">HUNNIE</option><option value="DRAGON WARRIOR">DRAGON WARRIOR</option><option value="PACKAGING">PACKAGING</option><option value="BOXES">BOXES</option><option value="BUBBLE WRAP">BUBBLE WRAP</option><option value="WAX SEAL">WAX SEAL</option></select></label>}
          {transactionForm.categoryId === newAssetOptionValue && <label>{newAccountLabel}<input value={transactionForm.accountName} onChange={(input) => onTransactionFormChange({ accountName: input.target.value })} placeholder={isAsset ? "Example: Printer, heat press machine..." : isInventory ? "Example: Speaker, wax seal, bubble wrap..." : categoryEvent.value === "marketing_expense" ? "Example: Meta ads, TikTok ads..." : "Example: Labour, samples, JnT..."} /></label>}
          <div className="accounting-two-cols"><label>{isInventory ? "Unit price" : "Amount"}<input type="number" min="0" step="0.01" value={isInventory ? transactionForm.unitCost : transactionForm.amount} onChange={(input) => isInventory ? onInventoryCostFieldChange("unitCost", input.target.value) : onTransactionFormChange({ amount: input.target.value })} /></label>{isInventory ? <label>{transactionForm.categoryId === rejectedInventoryOption ? "Quantity rejected" : "Quantity bought"}<input type="number" min="0" step="1" value={transactionForm.quantity} onChange={(input) => onInventoryCostFieldChange("quantity", input.target.value)} /></label> : <label>Supplier / source<input value={transactionForm.supplier} onChange={(input) => onTransactionFormChange({ supplier: input.target.value })} placeholder={isMoneyIn ? "Stripe, Xendit, TikTok Shop..." : "Supplier name"} /></label>}</div>
          {isInventory && <label>Total batch cost<input type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(input) => onInventoryCostFieldChange("amount", input.target.value)} placeholder="Enter any 2 fields and the missing one calculates" /></label>}
          {isInventory && <label>Supplier<input value={transactionForm.supplier} onChange={(input) => onTransactionFormChange({ supplier: input.target.value })} placeholder="Supplier name" /></label>}
          <label>Description<input value={transactionForm.description} onChange={(input) => onTransactionFormChange({ description: input.target.value })} placeholder={isInventory ? "Example: June Billy plush batch" : "Short note for the book"} /></label>
          {!isMoneyIn && <><h3>Payment</h3><label>Payment method<select value={transactionForm.paymentStatus} onChange={(input) => onTransactionFormChange({ paymentStatus: input.target.value as AccountingTransactionForm["paymentStatus"] })}><option value="paid_in_full">Bank</option><option value="deposit_paid">Deposit Paid</option><option value="on_credit">On Credit</option></select></label></>}
          {transactionForm.paymentStatus === "deposit_paid" && <div className="accounting-two-cols"><label>Deposit paid<input type="number" min="0" step="0.01" value={transactionForm.depositAmount} onChange={(input) => onTransactionFormChange({ depositAmount: input.target.value })} /></label><label>Remaining<input readOnly value={formatMoney(Math.max(0, calculatedAmount - (Number(transactionForm.depositAmount) || 0)))} /></label></div>}
          <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Source document" description="Choose or drop receipt, invoice, CSV, or image" selectedName={transactionFile?.name} onFile={onTransactionFileChange} />
          <label>Notes<textarea value={transactionForm.notes} onChange={(event) => onTransactionFormChange({ notes: event.target.value })} /></label>
          <button className="button primary" disabled={saving} onClick={onCreateTransaction}>{saving ? "Saving..." : "Save to book"}</button>
        </div>
        <AccountingTransactionsTable transactions={transactions.filter((transaction) => transaction.businessEvent === categoryEvent.value || (categoryEvent.value === "inventory_purchase" && transaction.businessEvent === "inventory_rejected"))} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onDelete={onDeleteTransaction} />
      </section>
    </section>;
  }

  if (view === "accounting_documents") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>DOCUMENT INBOX</p><h2>Upload accounting documents</h2><span>Upload receipts, invoices, bank statements, or expense proof. Each upload also creates a transaction.</span></div><div className="accounting-status-pill">{documents.length} documents</div></div>
    <section className="accounting-form-grid">
      <div className="accounting-form card">
        <h3>New document</h3>
        <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp" title="File" description="Choose or drop receipt, invoice, statement, or image" selectedName={selectedFile?.name} onFile={onFileChange} />
        <label>Name<input value={documentForm.name} onChange={(event) => onDocumentFormChange({ name: event.target.value })} placeholder="June supplier invoice" /></label>
        <label>Supplier / source<input value={documentForm.supplier} onChange={(event) => onDocumentFormChange({ supplier: event.target.value })} placeholder="Shopify, Meta, supplier name..." /></label>
        <label>Description<input value={documentForm.description} onChange={(event) => onDocumentFormChange({ description: event.target.value })} placeholder="What is this for?" /></label>
        <div className="accounting-two-cols"><label>Date<input type="date" value={documentForm.documentDate} onChange={(event) => onDocumentFormChange({ documentDate: event.target.value })} /></label><label>Amount<input type="number" min="0" step="0.01" value={documentForm.amount} onChange={(event) => onDocumentFormChange({ amount: event.target.value })} /></label></div>
        <div className="accounting-two-cols"><label>Type<select value={documentForm.transactionType} onChange={(event) => onDocumentFormChange({ transactionType: event.target.value as "income" | "expense" })}><option value="expense">Expense</option><option value="income">Income</option></select></label><label>Category<select value={documentForm.categoryId} onChange={(event) => onDocumentFormChange({ categoryId: event.target.value })}><option value="">Uncategorised</option>{categoryOptions}</select></label></div>
        <label>Notes<textarea value={documentForm.notes} onChange={(event) => onDocumentFormChange({ notes: event.target.value })} /></label>
        <button className="button primary" disabled={saving} onClick={onUploadDocument}>{saving ? "Saving..." : "Upload document"}</button>
      </div>
      <AccountingDocumentsTable documents={documents} categoryName={categoryName} onOpen={onOpenDocument} onDelete={onDeleteDocument} />
    </section>
  </section>;

  if (view === "accounting_transactions") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>TRANSACTION ENTRY ENGINE</p><h2>Record what happened</h2><span>Use normal business language. The system creates the accounting entries behind the scenes.</span></div><div className="accounting-status-pill">{transactions.length} transactions</div></div>
    <section className="accounting-form-grid">
      <div className="accounting-form card">
        <h3>Step 1: Choose category</h3>
        <div className="business-event-grid">{businessEvents.map((item) => <button type="button" key={item.value} className={transactionForm.businessEvent === item.value ? "selected" : ""} onClick={() => onTransactionFormChange({ businessEvent: item.value, categoryId: "", accountName: "" })}><strong>{item.label}</strong><span>{item.accountingMapping}</span></button>)}</div>
        <h3>Step 2: Select item / account</h3>
        <label>Account<select value={transactionForm.categoryId} onChange={(input) => onTransactionFormChange({ categoryId: input.target.value, accountName: "" })}><option value="">Choose account</option>{accountOptions.map((account) => <option key={account.value} value={account.value}>{account.label}</option>)}</select></label>
        {event.value === "inventory_purchase" && transactionForm.categoryId === "Plushie" && <label>Which plushie / character?<input value={transactionForm.accountName} onChange={(input) => onTransactionFormChange({ accountName: input.target.value })} placeholder="Billy, Tootsie, Hunnie, Dragon Warrior..." /></label>}
        {!accountOptions.length && <p className="accounting-file-name">No accounts are configured for this category yet.</p>}
        <h3>Step 3: Transaction details</h3>
        <div className="accounting-two-cols"><label>Date<input type="date" value={transactionForm.transactionDate} onChange={(input) => onTransactionFormChange({ transactionDate: input.target.value })} /></label><label>Total amount<input type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(input) => event.value === "inventory_purchase" ? onInventoryCostFieldChange("amount", input.target.value) : onTransactionFormChange({ amount: input.target.value })} /></label></div>
        <div className="accounting-two-cols"><label>Supplier / customer<input value={transactionForm.supplier} onChange={(input) => onTransactionFormChange({ supplier: input.target.value })} placeholder="Supplier, customer, platform..." /></label><label>Invoice number<input value={transactionForm.invoiceNumber} onChange={(input) => onTransactionFormChange({ invoiceNumber: input.target.value })} placeholder="Optional" /></label></div>
        <label>Description<input value={transactionForm.description} onChange={(input) => onTransactionFormChange({ description: input.target.value })} placeholder="Boxes purchase, Meta ad spend, payout..." /></label>
        <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Receipt / invoice / payment slip" description="Choose or drop the source document" selectedName={transactionFile?.name} onFile={onTransactionFileChange} />
        {event.value === "inventory_purchase" && <div className="accounting-two-cols"><label>Quantity<input type="number" min="0" step="1" value={transactionForm.quantity} onChange={(input) => onInventoryCostFieldChange("quantity", input.target.value)} /></label><label>Unit cost<input type="number" min="0" step="0.01" value={transactionForm.unitCost} onChange={(input) => onInventoryCostFieldChange("unitCost", input.target.value)} /></label></div>}
        <h3>Step 4: Payment terms</h3>
        <label>Payment type<select value={transactionForm.paymentStatus} onChange={(input) => onTransactionFormChange({ paymentStatus: input.target.value as AccountingTransactionForm["paymentStatus"] })}><option value="paid_in_full">Paid In Full</option><option value="deposit_paid">Deposit Paid</option><option value="on_credit">On Credit</option></select></label>
        {transactionForm.paymentStatus !== "on_credit" && <label>Funding source<select value={transactionForm.paymentMethod} onChange={(input) => onTransactionFormChange({ paymentMethod: input.target.value })}>{paymentAccounts.map((account) => <option key={account} value={account}>{account}</option>)}</select></label>}
        {transactionForm.paymentStatus === "deposit_paid" && <div className="accounting-two-cols"><label>Deposit amount<input type="number" min="0" step="0.01" value={transactionForm.depositAmount} onChange={(input) => onTransactionFormChange({ depositAmount: input.target.value })} /></label><label>Remaining amount<input disabled value={formatMoney(Math.max(0, (Number(transactionForm.amount) || 0) - (Number(transactionForm.depositAmount) || 0)))} readOnly /></label></div>}
        {transactionForm.paymentStatus === "on_credit" && <div className="accounting-two-cols"><label>Due date<input type="date" value={transactionForm.dueDate} onChange={(input) => onTransactionFormChange({ dueDate: input.target.value })} /></label><label>Supplier terms<input value={transactionForm.supplierTerms} onChange={(input) => onTransactionFormChange({ supplierTerms: input.target.value })} placeholder="30 days, COD, monthly..." /></label></div>}
        <label>Notes<textarea value={transactionForm.notes} onChange={(event) => onTransactionFormChange({ notes: event.target.value })} /></label>
        <section className="posting-preview">
          <h3>Step 5: Posting preview</h3>
          <p>You are recording: <strong>{event.label}</strong>{transactionForm.quantity ? `, quantity ${transactionForm.quantity}` : ""}{transactionForm.unitCost ? `, cost ${formatMoney(Number(transactionForm.unitCost))} each` : ""}.</p>
          {postingPreview.length ? postingPreview.map((entry, index) => <div key={entry.id}><span>{index === 0 ? `Increase / record ${entry.accountName}` : entry.accountName.includes("Payable") || entry.accountName.includes("Receivable") ? `Create outstanding balance in ${entry.accountName}` : `Record payment from ${entry.accountName}`}</span><strong>{formatMoney(entry.amount)}</strong></div>) : <p>Enter an amount and select an account to preview what the system will do.</p>}
        </section>
        <button className="button primary" disabled={saving} onClick={onCreateTransaction}>{saving ? "Saving..." : "Save transaction"}</button>
      </div>
      <AccountingTransactionsTable transactions={transactions} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onDelete={onDeleteTransaction} />
    </section>
  </section>;

  if (view === "accounting_settings") {
    const sectionEntries = Object.entries(bookkeepingSectionConfigs) as [BookkeepingSectionKey, typeof bookkeepingSectionConfigs[BookkeepingSectionKey]][];
    return <section className="accounting-workspace">
      <div className="accounting-hero card"><div><p>BOOK KEEPING SETTINGS</p><h2>Saved accounts</h2><span>Create new accounts directly from Inventory, Expenses, Assets, or Marketing by choosing + New account in the entry form.</span></div><div className="accounting-status-pill">{categories.filter((category) => Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === category.reportSection)).length} items</div></div>
      <section>
        <section className="card accounting-table-card"><h3>Saved category accounts</h3><div className="table-scroll"><table className="orders-table"><thead><tr><th>Section</th><th>Account item</th><th>Type</th><th>Parent</th></tr></thead><tbody>{sectionEntries.flatMap(([key, config]) => {
          const rows = categories.filter((category) => category.reportSection === config.reportSection).sort((a, b) => a.name.localeCompare(b.name));
          return rows.map((account) => <tr key={account.id}><td>{config.label}</td><td><strong>{account.name}</strong><br /><small>Used by {config.sourceEntity}</small></td><td>{account.accountType}</td><td>{account.parentId ? categoryName(account.parentId) : config.parentAccount}</td></tr>);
        })}</tbody></table>{!categories.some((category) => Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === category.reportSection)) && <div className="empty"><strong>No saved category accounts yet</strong><p>Create one from a bookkeeping entry form using + New account.</p></div>}</div></section>
        <section className="card accounting-table-card">
          <div className="accounting-form-heading"><div><h3>Sales consumption mapping</h3><p>Tell the system what each sold character uses. This drives FIFO COGS and prepaid operating expense usage.</p></div><button className="button primary" disabled={saving} onClick={onSaveSalesConsumptionRule}>{saving ? "Saving..." : "Add mapping"}</button></div>
          <div className="accounting-form-grid compact">
            <label>Sold SKU / character<select value={salesConsumptionMappingForm.sku} onChange={(input) => onSalesConsumptionMappingFormChange({ sku: input.target.value })}>{stockCharacters.map((character) => <option key={character} value={character}>{character}</option>)}</select></label>
            <label>Inventory item used<select value={salesConsumptionMappingForm.inventoryItem} onChange={(input) => onSalesConsumptionMappingFormChange({ inventoryItem: input.target.value })}><option value="">No inventory item</option>{inventoryMappingOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label>Units used per sale<input type="number" min="0" step="0.0001" value={salesConsumptionMappingForm.quantityPerSale} onChange={(input) => onSalesConsumptionMappingFormChange({ quantityPerSale: input.target.value })} /></label>
            <label>Operating expense per sale<input type="number" min="0" step="0.01" value={salesConsumptionMappingForm.operatingExpensePerSale} onChange={(input) => onSalesConsumptionMappingFormChange({ operatingExpensePerSale: input.target.value })} placeholder="RM 0.00" /></label>
          </div>
          <div className="table-scroll"><table className="orders-table"><thead><tr><th>Sold SKU</th><th>Inventory item</th><th>Units per sale</th><th>Operating expense per sale</th><th /></tr></thead><tbody>{salesConsumptionMappings.map((mapping) => <tr key={mapping.id}><td><strong>{mapping.sku}</strong></td><td>{mapping.inventoryItem || "-"}</td><td>{mapping.quantityPerSale.toLocaleString("en-MY")}</td><td>{formatMoney(mapping.operatingExpensePerSale)}</td><td><button className="view-button danger-text" onClick={() => onRemoveSalesConsumptionRule(mapping)}>Delete</button></td></tr>)}</tbody></table>{!salesConsumptionMappings.length && <div className="empty"><strong>No sales consumption mappings yet</strong><p>Without a mapping, the system falls back to consuming the sold character itself.</p></div>}</div>
        </section>
      </section>
    </section>;
  }

  if (view === "accounting_profit_loss") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>PROFIT & LOSS</p><h2>Current profit and loss</h2><span>Based on all active accounting transactions currently saved in Supabase.</span></div><div className={`accounting-status-pill ${profit < 0 ? "loss" : ""}`}>{formatMoney(profit)}</div></div>
    <section className="accounting-summary-grid">
      <MoneyStat label="Income" value={income} tone="collected" />
      <MoneyStat label="Expenses" value={expenses} tone="fees" />
      <MoneyStat label="Net profit" value={profit} tone={profit < 0 ? "fees" : "sales"} />
    </section>
    <section className="accounting-report card">
      <h3>Expense breakdown</h3>
      {Object.entries(expenseByCategory).length ? Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([name, amount]) => <div key={name}><span>{name}</span><strong>{formatMoney(amount)}</strong></div>) : <div className="empty"><strong>No expenses yet</strong><p>Upload documents or add expense transactions to build this report.</p></div>}
    </section>
  </section>;

  return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>ACCOUNTING MVP</p><h2>Accounting overview</h2><span>Start by uploading documents, adding transactions, then review the Profit & Loss page.</span></div><div className="accounting-status-pill">Live in Supabase</div></div>
    <div className="accounting-module-grid">
      <article className="accounting-module-card card"><Icon name="documents" /><strong>{documents.length} documents</strong><span>Receipts, invoices, and statements uploaded.</span></article>
      <article className="accounting-module-card card"><Icon name="cash" /><strong>{transactions.length} transactions</strong><span>Manual and document-linked entries.</span></article>
      <article className="accounting-module-card card"><Icon name="report" /><strong>{formatMoney(profit)}</strong><span>Current net profit from saved transactions.</span></article>
      <article className="accounting-module-card card"><Icon name="ledger" /><strong>{categories.length} categories</strong><span>Accounting categories available for coding.</span></article>
    </div>
  </section>;
}

function AccountingDocumentsTable({ documents, categoryName, onOpen, onDelete }: { documents: AccountingDocument[]; categoryName: (categoryId: string) => string; onOpen: (document: AccountingDocument) => void; onDelete: (document: AccountingDocument) => void }) {
  return <section className="card accounting-table-card"><h3>Uploaded documents</h3><div className="table-scroll"><table className="orders-table"><thead><tr><th>Date</th><th>Name</th><th>Supplier</th><th>Category</th><th>Type</th><th>Amount</th><th>File</th><th /></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td>{formatDate(document.documentDate)}</td><td><strong>{document.name}</strong><br /><small>{document.description || document.fileName}</small></td><td>{document.supplier || "-"}</td><td>{categoryName(document.categoryId)}</td><td>{document.transactionType}</td><td><strong>{formatMoney(document.amount)}</strong></td><td><button className="view-button" onClick={() => onOpen(document)}>Open</button></td><td><button className="view-button danger-text" onClick={() => onDelete(document)}>Delete</button></td></tr>)}</tbody></table>{!documents.length && <div className="empty"><strong>No documents uploaded yet</strong><p>Use the form to upload the first receipt or invoice.</p></div>}</div></section>;
}

function AccountingFilesTable({ documents, transactions, ledgerEntries, categoryName, onOpen }: { documents: AccountingDocument[]; transactions: AccountingTransaction[]; ledgerEntries: AccountingLedgerEntry[]; categoryName: (categoryId: string) => string; onOpen: (document: AccountingDocument) => void }) {
  const rows = documents
    .map((document) => ({ document, transaction: transactions.find((item) => item.documentId === document.id) }))
    .filter((row): row is { document: AccountingDocument; transaction: AccountingTransaction } => Boolean(row.transaction))
    .sort((a, b) => {
      const dateCompare = dateKey(a.transaction.transactionDate).localeCompare(dateKey(b.transaction.transactionDate));
      return dateCompare || a.transaction.createdAt.localeCompare(b.transaction.createdAt) || a.document.fileName.localeCompare(b.document.fileName);
    });
  return <section className="card accounting-table-card file-library-card">
    <h3>Linked source documents</h3>
    <div className="table-scroll"><table className="orders-table"><thead><tr><th>Date</th><th>File</th><th>Linked transaction</th><th>Account</th><th>Posting</th><th>Amount</th><th>Preview</th></tr></thead><tbody>{rows.map(({ document, transaction }) => {
      const entries = ledgerEntries.filter((entry) => entry.transactionId === transaction.id);
      return <tr key={document.id} className="has-source-document" onClick={(event) => { if ((event.target as HTMLElement).closest("button,a,input")) return; onOpen(document); }}>
        <td>{formatDate(transaction.transactionDate)}</td>
        <td><strong className="source-document-text">{document.name || document.fileName}</strong><br /><small>{document.fileName} | {formatFileSize(document.fileSize)}</small></td>
        <td><strong>{transaction.description}</strong><br /><small>{transaction.supplier || transaction.source || "-"}</small></td>
        <td>{categoryName(transaction.categoryId)}</td>
        <td>{entries.length ? entries.map((entry) => <div key={entry.id} className="ledger-line"><span>{entry.entryType === "debit" ? "Debit" : "Credit"} {entry.accountName}</span><strong>{formatMoney(entry.amount)}</strong></div>) : "-"}</td>
        <td><strong>{formatMoney(transaction.amount)}</strong></td>
        <td><button className="view-button document-link" onClick={() => onOpen(document)}>View file</button></td>
      </tr>;
    })}</tbody></table>{!rows.length && <div className="empty"><strong>No linked source documents yet</strong><p>Attach a file when creating a bookkeeping transaction, and it will appear here.</p></div>}</div>
  </section>;
}

function AccountingTransactionsTable({ transactions, ledgerEntries, documents, categoryName, onOpenDocument, onDelete }: { transactions: AccountingTransaction[]; ledgerEntries: AccountingLedgerEntry[]; documents: AccountingDocument[]; categoryName: (categoryId: string) => string; onOpenDocument: (document: AccountingDocument) => void; onDelete: (transaction: AccountingTransaction) => void }) {
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateCompare = dateKey(a.transactionDate).localeCompare(dateKey(b.transactionDate));
    return dateCompare || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
  return <section className="card accounting-table-card"><h3>Transaction ledger</h3><div className="table-scroll"><table className="orders-table"><thead><tr><th>Date</th><th>Description</th><th>Business event</th><th>Account</th><th>Payment</th><th>Ledger posting</th><th>Document</th><th /></tr></thead><tbody>{sortedTransactions.map((transaction) => {
    const entries = ledgerEntries.filter((entry) => entry.transactionId === transaction.id);
    const document = documents.find((item) => item.id === transaction.documentId);
	    const paymentLabel = transaction.paymentStatus === "deposit_paid" ? `Deposit ${formatMoney(transaction.depositAmount)}` : transaction.paymentStatus === "on_credit" ? "On Credit" : "Paid In Full";
	    if (document) return <tr key={transaction.id} className="has-source-document" onClick={(event) => { if ((event.target as HTMLElement).closest("button,a,input")) return; onOpenDocument(document); }}><td>{formatDate(transaction.transactionDate)}</td><td><strong className="source-document-text">{transaction.description}</strong><span className="source-document-pill">Source document</span><br /><small>{transaction.supplier || transaction.source}{transaction.invoiceNumber ? ` - Invoice ${transaction.invoiceNumber}` : ""}</small></td><td>{businessEvents.find((event) => event.value === transaction.businessEvent)?.label ?? (transaction.businessEvent || "-")}</td><td>{categoryName(transaction.categoryId)}</td><td>{paymentLabel}<br /><small>{transaction.paymentStatus === "on_credit" ? transaction.dueDate || transaction.supplierTerms || "Outstanding" : transaction.paymentMethod || "Bank Account"}</small></td><td>{entries.length ? entries.map((entry, index) => <div key={entry.id} className="ledger-line"><span>{index === 0 ? `Record ${entry.accountName}` : entry.accountName.includes("Payable") || entry.accountName.includes("Receivable") ? `Outstanding ${entry.accountName}` : `Payment from ${entry.accountName}`}</span><strong>{formatMoney(entry.amount)}</strong></div>) : <small>{formatMoney(transaction.amount)}</small>}</td><td><button className="view-button document-link" onClick={() => onOpenDocument(document)}>View file</button></td><td><button className="view-button danger-text" onClick={() => onDelete(transaction)}>Delete</button></td></tr>;
    return <tr key={transaction.id}><td>{formatDate(transaction.transactionDate)}</td><td><strong>{transaction.description}</strong><br /><small>{transaction.supplier || transaction.source}{transaction.invoiceNumber ? ` · Invoice ${transaction.invoiceNumber}` : ""}</small></td><td>{businessEvents.find((event) => event.value === transaction.businessEvent)?.label ?? (transaction.businessEvent || "-")}</td><td>{categoryName(transaction.categoryId)}</td><td>{paymentLabel}<br /><small>{transaction.paymentStatus === "on_credit" ? transaction.dueDate || transaction.supplierTerms || "Outstanding" : transaction.paymentMethod || "Bank Account"}</small></td><td>{entries.length ? entries.map((entry, index) => <div key={entry.id} className="ledger-line"><span>{index === 0 ? `Record ${entry.accountName}` : entry.accountName.includes("Payable") || entry.accountName.includes("Receivable") ? `Outstanding ${entry.accountName}` : `Payment from ${entry.accountName}`}</span><strong>{formatMoney(entry.amount)}</strong></div>) : <small>{formatMoney(transaction.amount)}</small>}</td><td>{document ? <button className="view-button" onClick={() => onOpenDocument(document)}>Open</button> : "-"}</td><td><button className="view-button danger-text" onClick={() => onDelete(transaction)}>Delete</button></td></tr>;
  })}</tbody></table>{!transactions.length && <div className="empty"><strong>No transactions yet</strong><p>Record a business event to start the ledger.</p></div>}</div></section>;
}

function DocumentPreviewModal({ document, url, error, onClose }: { document: AccountingDocument; url: string; error: string; onClose: () => void }) {
  const isImage = document.fileType.startsWith("image/");
  const isPdf = document.fileType === "application/pdf" || document.fileName.toLowerCase().endsWith(".pdf");
  return <div className="document-preview-backdrop" role="dialog" aria-modal="true" aria-label={`Preview ${document.name}`} onClick={onClose}>
    <section className="document-preview-modal" onClick={(event) => event.stopPropagation()}>
      <header>
        <div><p>SOURCE DOCUMENT</p><h2>{document.name || document.fileName}</h2><span>{document.fileName} | {formatFileSize(document.fileSize)}</span></div>
        <button className="view-button" onClick={onClose}>Close</button>
      </header>
      {error && <div className="notice document-preview-error"><span>{error}</span></div>}
      {!error && !url && <div className="preview-empty"><strong>Loading file...</strong><p>Creating a secure preview link from Supabase.</p></div>}
      {!error && url && isImage && <img className="document-preview-image" src={url} alt={document.name || document.fileName} />}
      {!error && url && isPdf && <iframe className="document-preview-frame" src={url} title={document.name || document.fileName} />}
      {!error && url && !isImage && !isPdf && <div className="preview-empty"><strong>Preview not available for this file type</strong><p>You can still open or download the source document.</p><a className="button primary" href={url} target="_blank" rel="noreferrer">Open file</a></div>}
      {url && <footer><a className="view-button document-link" href={url} target="_blank" rel="noreferrer">Open in new tab</a></footer>}
    </section>
  </div>;
}

function ContentPlanWorkspacePage({
  view,
  items,
  form,
  ideas,
  ideaForm,
  onFormChange,
  onIdeaFormChange,
  onSave,
  onTogglePosted,
  onDelete,
  onAddIdeaReference,
  onRemoveIdeaReference,
  onSaveIdea,
  onDeleteIdea,
  onMoveIdeaToPlanned,
}: {
  view: View;
  items: ContentPlanItem[];
  form: ContentPlanForm;
  ideas: ContentIdeaItem[];
  ideaForm: ContentIdeaForm;
  onFormChange: (patch: Partial<ContentPlanForm>) => void;
  onIdeaFormChange: (patch: Partial<ContentIdeaForm>) => void;
  onSave: () => void;
  onTogglePosted: (item: ContentPlanItem) => void;
  onDelete: (item: ContentPlanItem) => void;
  onAddIdeaReference: () => void;
  onRemoveIdeaReference: (referenceId: string) => void;
  onSaveIdea: () => void;
  onDeleteIdea: (item: ContentIdeaItem) => void;
  onMoveIdeaToPlanned: (item: ContentIdeaItem, plannedDate: string) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = form.plannedDate ? new Date(`${form.plannedDate}T00:00:00`) : new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  if (view === "content_dashboard") return <ContentDashboardPage
    items={items}
    ideas={ideas}
    onTogglePosted={onTogglePosted}
    onMoveIdeaToPlanned={onMoveIdeaToPlanned}
  />;
  if (view === "content_ideas") return <ContentIdeaBrainstormingPage
    ideas={ideas}
    form={ideaForm}
    onFormChange={onIdeaFormChange}
    onAddReference={onAddIdeaReference}
    onRemoveReference={onRemoveIdeaReference}
    onSave={onSaveIdea}
    onDelete={onDeleteIdea}
  />;
  const sortedItems = [...items].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.createdAt.localeCompare(b.createdAt));
  const monthStart = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const key = localDateKey(date);
    return {
      key,
      date,
      inMonth: date.getMonth() === visibleMonth.getMonth(),
      items: sortedItems.filter((item) => item.plannedDate === key),
    };
  });
  const plannedCount = items.filter((item) => !item.posted).length;
  const postedCount = items.filter((item) => item.posted).length;
  const monthLabel = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(visibleMonth);
  const changeMonth = (offset: number) => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave();
  }
  return <section className="content-plan-workspace">
    <div className="accounting-hero card"><div><p>CONTENT PLAN</p><h2>Content calendar</h2><span>Plan what to post, keep notes for each idea, and mark each item as posted once it goes live.</span></div><div className="content-plan-status"><strong>{plannedCount}</strong><span>planned</span><strong>{postedCount}</strong><span>posted</span></div></div>
    <section className="content-plan-grid">
      <form className="content-plan-form card" onSubmit={submit}>
        <h3>Plan a content item</h3>
        <label>Title<input value={form.title} onChange={(event) => onFormChange({ title: event.target.value })} placeholder="Example: Father's Day plushie story" /></label>
        <label>Planned date<input type="date" value={form.plannedDate} onChange={(event) => onFormChange({ plannedDate: event.target.value })} /></label>
        <div className="accounting-two-cols">
          <label>Platform<select value={form.platform} onChange={(event) => onFormChange({ platform: event.target.value })}><option>Instagram</option><option>TikTok</option><option>Facebook</option><option>Threads</option><option>Email</option><option>Other</option></select></label>
          <label>Content type<select value={form.contentType} onChange={(event) => onFormChange({ contentType: event.target.value })}><option>Post</option><option>Reel</option><option>Story</option><option>Carousel</option><option>Video</option><option>Live</option><option>Email</option></select></label>
        </div>
        <label>Notes<textarea value={form.notes} onChange={(event) => onFormChange({ notes: event.target.value })} placeholder="Caption angle, hook, props, offer, or anything to remember..." /></label>
        <button className="button primary" type="submit">Add to calendar</button>
      </form>
      <section className="content-calendar card">
        <div className="content-calendar-header">
          <button className="view-button" onClick={() => changeMonth(-1)}>Previous</button>
          <div><strong>{monthLabel}</strong><span>{sortedItems.length} total content item{sortedItems.length === 1 ? "" : "s"}</span></div>
          <button className="view-button" onClick={() => changeMonth(1)}>Next</button>
        </div>
        <div className="content-calendar-weekdays">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
        <div className="content-calendar-grid">
          {calendarDays.map((day) => <article key={day.key} className={`content-calendar-day ${day.inMonth ? "" : "muted"} ${day.key === form.plannedDate ? "selected" : ""}`} onClick={() => onFormChange({ plannedDate: day.key })}>
            <strong>{day.date.getDate()}</strong>
            <div>{day.items.slice(0, 3).map((item) => <span key={item.id} className={item.posted ? "posted" : ""}>{item.platform}: {item.title}</span>)}</div>
            {day.items.length > 3 && <small>+{day.items.length - 3} more</small>}
          </article>)}
        </div>
      </section>
    </section>
    <section className="card accounting-table-card content-plan-list">
      <h3>Planned content</h3>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>Date</th><th>Content</th><th>Platform</th><th>Type</th><th>Status</th><th>Notes</th><th /></tr></thead><tbody>{sortedItems.map((item) => <tr key={item.id} className={item.posted ? "posted-content-row" : ""}>
        <td>{formatDate(item.plannedDate)}</td>
        <td><strong>{item.title}</strong><br /><small>Created by {item.createdBy}</small></td>
        <td>{item.platform || "-"}</td>
        <td>{item.contentType || "-"}</td>
        <td><button className={`content-status-button ${item.posted ? "posted" : ""}`} onClick={() => onTogglePosted(item)}>{item.posted ? "Posted" : "Mark posted"}</button>{item.postedAt && <small>{formatDate(item.postedAt, true)}</small>}</td>
        <td className="content-notes-cell">{item.notes || "-"}</td>
        <td><button className="view-button danger-text" onClick={() => onDelete(item)}>Delete</button></td>
      </tr>)}</tbody></table>{!items.length && <div className="empty"><strong>No content planned yet</strong><p>Add your first idea and it will appear on the calendar.</p></div>}</div>
    </section>
  </section>;
}

function ContentDashboardPage({
  items,
  ideas,
  onTogglePosted,
  onMoveIdeaToPlanned,
}: {
  items: ContentPlanItem[];
  ideas: ContentIdeaItem[];
  onTogglePosted: (item: ContentPlanItem) => void;
  onMoveIdeaToPlanned: (item: ContentIdeaItem, plannedDate: string) => void;
}) {
  const [ideaPlanDates, setIdeaPlanDates] = useState<Record<string, string>>({});
  const plannedItems = [...items].filter((item) => !item.posted).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.createdAt.localeCompare(b.createdAt));
  const doneItems = [...items].filter((item) => item.posted).sort((a, b) => (b.postedAt || b.updatedAt).localeCompare(a.postedAt || a.updatedAt));
  const sortedIdeas = [...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  return <section className="content-plan-workspace">
    <div className="accounting-hero card"><div><p>CONTENT DASHBOARD</p><h2>Plan, brainstorm, and finish content</h2><span>See planned posts and raw ideas in one place. Move good ideas into the calendar, then mark planned content as done once it has been posted.</span></div><div className="content-plan-status"><strong>{plannedItems.length}</strong><span>planned</span><strong>{ideas.length}</strong><span>ideas</span><strong>{doneItems.length}</strong><span>done</span></div></div>
    <section className="content-dashboard-grid">
      <section className="card content-dashboard-panel">
        <div className="content-panel-header"><div><p>PLANNED CONTENT</p><h3>Ready to post</h3></div><span>{plannedItems.length} active</span></div>
        <div className="content-dashboard-list">
          {plannedItems.map((item) => <article key={item.id} className="content-dashboard-card planned">
            <div><strong>{item.title}</strong><span>{formatDate(item.plannedDate)} | {item.platform || "-"} | {item.contentType || "-"}</span></div>
            {item.notes && <p>{item.notes}</p>}
            <button className="content-status-button posted" onClick={() => onTogglePosted(item)}>Move to done</button>
          </article>)}
          {!plannedItems.length && <div className="empty compact"><strong>No planned content waiting</strong><p>Move ideas here or add posts in Planned Content.</p></div>}
        </div>
      </section>
      <section className="card content-dashboard-panel">
        <div className="content-panel-header"><div><p>BRAINSTORM IDEAS</p><h3>Move ideas into the calendar</h3></div><span>{ideas.length} ideas</span></div>
        <div className="content-dashboard-list">
          {sortedIdeas.map((idea) => {
            const plannedDate = ideaPlanDates[idea.id] ?? localDateKey(new Date());
            return <article key={idea.id} className="content-dashboard-card idea">
              <div><strong>{idea.title}</strong><span>Updated {formatDate(idea.updatedAt, true)}</span></div>
              <p>{idea.idea}</p>
              {idea.references.length > 0 && <div className="dashboard-reference-row">{idea.references.slice(0, 3).map((reference) => <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer">{reference.name || reference.url}</a>)}</div>}
              <div className="dashboard-move-row"><label>Plan date<input type="date" value={plannedDate} onChange={(event) => setIdeaPlanDates((current) => ({ ...current, [idea.id]: event.target.value }))} /></label><button className="button primary" onClick={() => onMoveIdeaToPlanned(idea, plannedDate)}>Move to planned</button></div>
            </article>;
          })}
          {!ideas.length && <div className="empty compact"><strong>No brainstorm ideas yet</strong><p>Add rough ideas in Idea Brainstorming.</p></div>}
        </div>
      </section>
    </section>
    <section className="card content-dashboard-panel done-panel">
      <div className="content-panel-header"><div><p>DONE</p><h3>Posted content</h3></div><span>{doneItems.length} posted</span></div>
      <div className="content-done-list">{doneItems.slice(0, 12).map((item) => <article key={item.id}><strong>{item.title}</strong><span>{formatDate(item.postedAt || item.updatedAt, true)} | planned {formatDate(item.plannedDate)}</span></article>)}{!doneItems.length && <div className="empty compact"><strong>No posted content yet</strong><p>Mark planned items as done after posting.</p></div>}</div>
    </section>
  </section>;
}

function ContentIdeaBrainstormingPage({
  ideas,
  form,
  onFormChange,
  onAddReference,
  onRemoveReference,
  onSave,
  onDelete,
}: {
  ideas: ContentIdeaItem[];
  form: ContentIdeaForm;
  onFormChange: (patch: Partial<ContentIdeaForm>) => void;
  onAddReference: () => void;
  onRemoveReference: (referenceId: string) => void;
  onSave: () => void;
  onDelete: (item: ContentIdeaItem) => void;
}) {
  const sortedIdeas = [...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  function submit(event: FormEvent) {
    event.preventDefault();
    onSave();
  }
  return <section className="content-plan-workspace">
    <div className="accounting-hero card"><div><p>IDEA BRAINSTORMING</p><h2>Content ideas and references</h2><span>Capture rough ideas before they become planned posts. Add named links so every reference stays attached to the idea.</span></div><div className="accounting-status-pill">{ideas.length} idea{ideas.length === 1 ? "" : "s"}</div></div>
    <section className="content-plan-grid">
      <form className="content-plan-form card" onSubmit={submit}>
        <h3>New idea</h3>
        <label>Idea title<input value={form.title} onChange={(event) => onFormChange({ title: event.target.value })} placeholder="Example: Customer story angle" /></label>
        <label>Brainstorming notes<textarea value={form.idea} onChange={(event) => onFormChange({ idea: event.target.value })} placeholder="Write the hook, concept, caption angle, shot list, or rough thought..." /></label>
        <div className="idea-reference-box">
          <h3>Reference links</h3>
          <label>Reference name<input value={form.referenceName} onChange={(event) => onFormChange({ referenceName: event.target.value })} placeholder="Example: TikTok hook example" /></label>
          <label>Reference link<input value={form.referenceUrl} onChange={(event) => onFormChange({ referenceUrl: event.target.value })} placeholder="https://..." /></label>
          <button className="button secondary" type="button" onClick={onAddReference}>Add reference</button>
          {form.references.length > 0 && <div className="idea-reference-list">{form.references.map((reference) => <div key={reference.id}><a href={reference.url} target="_blank" rel="noreferrer">{reference.name || reference.url}</a><button type="button" onClick={() => onRemoveReference(reference.id)}>Remove</button></div>)}</div>}
        </div>
        <button className="button primary" type="submit">Save idea</button>
      </form>
      <section className="idea-board">
        {sortedIdeas.map((idea) => <article key={idea.id} className="idea-card card">
          <div className="idea-card-header"><div><strong>{idea.title}</strong><span>Updated {formatDate(idea.updatedAt, true)} by {idea.createdBy}</span></div><button className="view-button danger-text" onClick={() => onDelete(idea)}>Delete</button></div>
          <p>{idea.idea}</p>
          {idea.references.length > 0 && <div className="saved-reference-list"><span>References</span>{idea.references.map((reference) => <a key={reference.id} href={reference.url} target="_blank" rel="noreferrer">{reference.name || reference.url}</a>)}</div>}
        </article>)}
        {!ideas.length && <div className="empty card"><strong>No brainstorming ideas yet</strong><p>Save ideas here first, then move the best ones into Planned Content when you are ready.</p></div>}
      </section>
    </section>
  </section>;
}

function isExpressShipping(order: Pick<Order, "shippingMethod">) {
  return (order.shippingMethod || "").toLowerCase().includes("express");
}

function FormalAccountingWorkspacePage({ view, orders, transactions, ledgerEntries, categories, salesRows, salesConsumptionMappings, categoryName }: { view: View; orders: Order[]; transactions: AccountingTransaction[]; ledgerEntries: AccountingLedgerEntry[]; categories: AccountingCategory[]; salesRows: SalesReportRow[]; salesConsumptionMappings: SalesConsumptionMapping[]; categoryName: (categoryId: string) => string }) {
  const [selectedTAccountSection, setSelectedTAccountSection] = useState("Cash");
  const [selectedTAccountName, setSelectedTAccountName] = useState("all");
  const [selectedUnitCostItem, setSelectedUnitCostItem] = useState("all");
  const [selectedFinancialReport, setSelectedFinancialReport] = useState<FinancialReportType>("income_statement");
  const [accountingPeriodMode, setAccountingPeriodMode] = useState<AccountingPeriodMode>("this_month");
  const [accountingStartDate, setAccountingStartDate] = useState(monthStartKey());
  const [accountingEndDate, setAccountingEndDate] = useState(monthEndKey());
  const inventoryItemName = (value: string) => value.trim().toUpperCase().replace(/\s+/g, " ");
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateCompare = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime();
    return dateCompare || a.createdAt.localeCompare(b.createdAt);
  });
  const entriesByTransaction = ledgerEntries.reduce<Record<string, AccountingLedgerEntry[]>>((groups, entry) => {
    groups[entry.transactionId] = [...(groups[entry.transactionId] ?? []), entry];
    return groups;
  }, {});
  const generatedSalesGroups = Object.values(salesRows.reduce<Record<string, { id: string; date: string; processor: string; salePrice: number; processingFees: number }>>((groups, row) => {
    const date = dateKey(row.orderDate);
    const salePrice = Number(row.salePrice) || 0;
    if (!date || salePrice <= 0) return groups;
    const processor = row.paymentProcessor === "Bank Transfer" ? "Bank Transfer" : row.paymentProcessor === "Stripe" ? "Stripe" : row.paymentProcessor === "Xendit" ? "Xendit" : row.paymentProcessor || "Unassigned";
    const key = `${date}-${processor}`;
    groups[key] = groups[key] ?? { id: `sales-${key}`, date, processor, salePrice: 0, processingFees: 0 };
    groups[key].salePrice += salePrice;
    groups[key].processingFees += Number(row.processingFee) || 0;
    return groups;
  }, {})).sort((a, b) => a.date.localeCompare(b.date) || a.processor.localeCompare(b.processor)).map((group) => {
    const cashAccount = group.processor === "Bank Transfer" ? "Bank Account" : group.processor;
    const processorFee = group.processor === "Stripe" || group.processor === "Xendit" ? group.processingFees : 0;
    const cashAmount = Math.max(0, group.salePrice - processorFee);
    const entries: AccountingLedgerEntry[] = [
      { id: `${group.id}-cash`, transactionId: group.id, accountId: "", accountName: cashAccount, entryType: "debit", amount: cashAmount, memo: `${group.processor} sales collected`, createdAt: group.date },
      { id: `${group.id}-sales`, transactionId: group.id, accountId: "", accountName: "Sales", entryType: "credit", amount: group.salePrice, memo: `${group.processor} daily sales`, createdAt: group.date },
    ];
    if (processorFee > 0) {
      entries.push(
        { id: `${group.id}-fee-expense`, transactionId: group.id, accountId: "", accountName: "Payment Processing Fees", entryType: "debit", amount: processorFee, memo: `${group.processor} processing fees`, createdAt: group.date },
      );
    }
    return { ...group, description: `${group.processor} sales`, entries };
  });
  const purchaseBatchSources = sortedTransactions
    .filter((transaction) => transaction.businessEvent === "inventory_purchase" && (!accountingEndDate || dateKey(transaction.transactionDate) <= accountingEndDate))
    .map((transaction) => {
      const quantityBought = Number(transaction.quantity) || 0;
      const unitCost = Number(transaction.unitCost) || (quantityBought > 0 ? transaction.amount / quantityBought : 0);
      const itemName = inventoryItemName(transaction.accountName || categoryName(transaction.categoryId));
      return {
        id: transaction.id,
        date: dateKey(transaction.transactionDate),
        createdAt: transaction.createdAt,
        itemName,
        description: transaction.description,
        supplier: transaction.supplier,
        quantityBought,
        quantityLeft: quantityBought,
        quantitySold: 0,
        quantityRejected: 0,
        unitCost,
        totalCost: Number(transaction.amount) || quantityBought * unitCost,
      };
    })
    .filter((batch) => batch.itemName && batch.quantityBought > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const batchCounters = new Map<string, number>();
  const purchaseBatchStates = purchaseBatchSources.map((batch) => {
    const batchNumber = (batchCounters.get(batch.itemName) ?? 0) + 1;
    batchCounters.set(batch.itemName, batchNumber);
    return { ...batch, batchNumber };
  });
  const cogsGroups: { id: string; date: string; description: string; entries: AccountingLedgerEntry[] }[] = [];
  const operatingExpenseGroups: { id: string; date: string; description: string; entries: AccountingLedgerEntry[] }[] = [];
  const activeSalesMappingsBySku = salesConsumptionMappings
    .filter((mapping) => mapping.active)
    .reduce<Record<string, SalesConsumptionMapping[]>>((groups, mapping) => {
      const sku = inventoryItemName(mapping.sku);
      groups[sku] = [...(groups[sku] ?? []), mapping];
      return groups;
    }, {});
  const consumptionEvents = [
    ...orders
      .flatMap((order) => {
        const date = dateKey(order.orderDate);
        const sku = inventoryItemName(order.character);
        if (!sku || (accountingEndDate && date > accountingEndDate)) return [];
        const mappings = activeSalesMappingsBySku[sku] ?? [];
        const consumptionMappings: SalesConsumptionMapping[] = mappings.length ? mappings : [{
          id: `fallback-${sku}`,
          sku,
          inventoryItem: sku,
          quantityPerSale: 1,
          operatingExpensePerSale: 0,
          active: true,
          createdAt: "",
          updatedAt: "",
        }];
        const inPeriod = (!accountingStartDate || date >= accountingStartDate) && (!accountingEndDate || date <= accountingEndDate);
        return consumptionMappings.flatMap((mapping) => {
          const events: { id: string; date: string; itemName: string; quantity: number; type: "sale"; inPeriod: boolean; sku: string; operatingExpense: number }[] = [];
          const itemName = inventoryItemName(mapping.inventoryItem);
          if (itemName && mapping.quantityPerSale > 0) {
            events.push({ id: `sale-${order.id}-${mapping.id}-inventory`, date, itemName, quantity: mapping.quantityPerSale, type: "sale", inPeriod, sku, operatingExpense: 0 });
          }
          if (mapping.operatingExpensePerSale > 0) {
            events.push({ id: `sale-${order.id}-${mapping.id}-opex`, date, itemName: "PREPAID OPERATING EXPENSE", quantity: 0, type: "sale", inPeriod, sku, operatingExpense: mapping.operatingExpensePerSale });
          }
          return events;
        });
      }),
    ...sortedTransactions
      .filter((transaction) => transaction.businessEvent === "inventory_rejected" && (!accountingEndDate || dateKey(transaction.transactionDate) <= accountingEndDate))
      .map((transaction) => ({ id: `reject-${transaction.id}`, date: dateKey(transaction.transactionDate), itemName: inventoryItemName(transaction.accountName), quantity: Number(transaction.quantity) || (transaction.unitCost > 0 ? transaction.amount / transaction.unitCost : 0), type: "reject" as const, inPeriod: false, sku: "", operatingExpense: 0 })),
  ].filter((event) => event.itemName && (event.quantity > 0 || event.operatingExpense > 0)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  consumptionEvents.forEach((event) => {
    if (event.operatingExpense > 0 && event.inPeriod) {
      operatingExpenseGroups.push({
        id: `operating-expense-${event.id}`,
        date: event.date,
        description: `${event.sku} operating expense used`,
        entries: [
          { id: `operating-expense-${event.id}-debit`, transactionId: `operating-expense-${event.id}`, accountId: "", accountName: "Operating Expense", entryType: "debit", amount: event.operatingExpense, memo: `${event.sku} operating expense used`, createdAt: event.date },
          { id: `operating-expense-${event.id}-credit`, transactionId: `operating-expense-${event.id}`, accountId: "", accountName: "Prepaid Operating Expense", entryType: "credit", amount: event.operatingExpense, memo: "Prepaid operating expense released by sale", createdAt: event.date },
        ],
      });
      return;
    }
    let remaining = event.quantity;
    for (const batch of purchaseBatchStates) {
      if (remaining <= 0) break;
      if (batch.itemName !== event.itemName || batch.quantityLeft <= 0) continue;
      const used = Math.min(batch.quantityLeft, remaining);
      batch.quantityLeft -= used;
      remaining -= used;
      if (event.type === "reject") {
        batch.quantityRejected += used;
      } else {
        batch.quantitySold += used;
        if (event.inPeriod) {
          const amount = used * batch.unitCost;
          cogsGroups.push({
            id: `cogs-${event.id}-${batch.id}`,
            date: event.date,
            description: `${batch.itemName} FIFO cost from batch ${batch.batchNumber}`,
            entries: [
              { id: `cogs-${event.id}-${batch.id}-debit`, transactionId: `cogs-${event.id}-${batch.id}`, accountId: "", accountName: cogsAccountForInventoryItem(batch.itemName), entryType: "debit", amount, memo: `${batch.itemName} sold from batch ${batch.batchNumber}`, createdAt: event.date },
              { id: `cogs-${event.id}-${batch.id}-credit`, transactionId: `cogs-${event.id}-${batch.id}`, accountId: "", accountName: batch.itemName, entryType: "credit", amount, memo: "Inventory consumed by sale", createdAt: event.date },
            ],
          });
        }
      }
    }
  });
  const allLedgerEntries = [...ledgerEntries, ...generatedSalesGroups.flatMap((group) => group.entries), ...cogsGroups.flatMap((group) => group.entries), ...operatingExpenseGroups.flatMap((group) => group.entries)];
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const generatedTransactionDescriptions = new Map([...generatedSalesGroups.map((group) => [group.id, group.description] as const), ...cogsGroups.map((group) => [group.id, group.description] as const), ...operatingExpenseGroups.map((group) => [group.id, group.description] as const)]);
  const entryDate = (entry: AccountingLedgerEntry) => dateKey(transactionById.get(entry.transactionId)?.transactionDate || entry.createdAt);
  const isInAccountingRange = (date: string) => Boolean(date) && (!accountingStartDate || date >= accountingStartDate) && (!accountingEndDate || date <= accountingEndDate);
  const isBeforeAccountingRange = (date: string) => Boolean(date) && Boolean(accountingStartDate) && date < accountingStartDate;
  const periodLedgerEntries = allLedgerEntries.filter((entry) => isInAccountingRange(entryDate(entry)));
  const totalDebits = periodLedgerEntries.filter((entry) => entry.entryType === "debit").reduce((total, entry) => total + entry.amount, 0);
  const totalCredits = periodLedgerEntries.filter((entry) => entry.entryType === "credit").reduce((total, entry) => total + entry.amount, 0);
  const accountGroups = allLedgerEntries.reduce<Record<string, AccountingLedgerEntry[]>>((groups, entry) => {
    groups[entry.accountName] = [...(groups[entry.accountName] ?? []), entry];
    return groups;
  }, {});
  const tAccountSections: { title: string; reportSections: string[]; names: string[]; eventValues?: AccountingTransaction["businessEvent"][] }[] = [
    { title: "Inventory", reportSections: [bookkeepingSectionConfigs.inventory.reportSection], names: ["Inventory", ...businessEvents.find((event) => event.value === "inventory_purchase")!.accounts], eventValues: ["inventory_purchase"] },
    { title: "Expense", reportSections: [bookkeepingSectionConfigs.expense.reportSection, "Admin Fees", "Software Expenses", "Tax", "Salary", "COGS"], names: ["Expenses", "Payment Processing Fees", "Operating Expense", rejectedInventoryOption, ...businessEvents.find((event) => event.value === "expense")!.accounts], eventValues: ["expense", "inventory_rejected"] },
    { title: "Assets", reportSections: [bookkeepingSectionConfigs.asset.reportSection, "Non Current Assets"], names: ["Equipment", "Prepaid Operating Expense", ...businessEvents.find((event) => event.value === "asset_purchase")!.accounts], eventValues: ["asset_purchase"] },
    { title: "Marketing", reportSections: [bookkeepingSectionConfigs.marketing.reportSection, "Marketing Expenses"], names: ["Marketing Expenses", ...businessEvents.find((event) => event.value === "marketing_expense")!.accounts], eventValues: ["marketing_expense"] },
    { title: "Cash", reportSections: [], names: ["Bank Account", "Stripe", "Xendit", "Payment Processing Fees", "Owner's Equity", "Drawings"], eventValues: ["payment_processor_paid"] },
    { title: "Sales", reportSections: ["Revenue"], names: ["Sales", "Shopify Sales", "TikTok Shop Sales", "Shipping Revenue"] },
  ];
  const cashAccountNames = new Set(["Bank Account", "Payment Processors", "Stripe", "Xendit", "TikTok Shop", "Owner Capital", "Owner Drawings"]);
  const categoryBelongsToSection = (category: AccountingCategory, section: typeof tAccountSections[number]) => {
    if (!category.active) return false;
    const parentName = category.parentId ? categoryName(category.parentId) : "";
    if (section.title === "Cash") return cashAccountNames.has(category.name) || cashAccountNames.has(parentName);
    if (section.title === "Inventory") return category.name === "Inventory" || parentName === "Inventory" || category.reportSection === bookkeepingSectionConfigs.inventory.reportSection;
    if (section.title === "Marketing") return category.reportSection === bookkeepingSectionConfigs.marketing.reportSection || category.reportSection === "Marketing Expenses";
    if (section.title === "Assets") return category.accountType === "asset" && !cashAccountNames.has(category.name) && !cashAccountNames.has(parentName) && category.name !== "Inventory" && parentName !== "Inventory";
    if (section.title === "Expense") return category.accountType === "expense" && category.reportSection !== "Marketing Expenses" && category.reportSection !== bookkeepingSectionConfigs.marketing.reportSection;
    if (section.title === "Sales") return category.accountType === "revenue" || category.reportSection === "Revenue";
    return section.reportSections.includes(category.reportSection);
  };
  const sectionAccountNames = (section: typeof tAccountSections[number]) => {
    const savedNames = categories
      .filter((category) => categoryBelongsToSection(category, section))
      .map((category) => category.name);
    const allNames = new Set([...section.names, ...savedNames]);
    transactions.forEach((transaction) => {
      if (section.eventValues?.includes(transaction.businessEvent)) allNames.add(transaction.accountName || categoryName(transaction.categoryId));
    });
    allLedgerEntries.forEach((entry) => {
      const category = categories.find((item) => item.id === entry.accountId);
      if (category && categoryBelongsToSection(category, section)) allNames.add(entry.accountName);
      if (section.names.includes(entry.accountName)) allNames.add(entry.accountName);
    });
    return [...allNames].filter(Boolean).sort((a, b) => a.localeCompare(b));
  };
  const totalTAccounts = tAccountSections.reduce((total, section) => total + sectionAccountNames(section).length, 0);
  const selectedSection = tAccountSections.find((section) => section.title === selectedTAccountSection) ?? tAccountSections[0];
  const selectedSectionAccountNames = sectionAccountNames(selectedSection);
  const visibleAccountNames = selectedTAccountName === "all" ? selectedSectionAccountNames : selectedSectionAccountNames.filter((name) => name === selectedTAccountName);
  const filteredTransactions = sortedTransactions.filter((transaction) => isInAccountingRange(dateKey(transaction.transactionDate)));
  const filteredGeneratedSalesGroups = generatedSalesGroups.filter((group) => isInAccountingRange(group.date));
  const manualJournalRows = filteredTransactions.flatMap((transaction) => {
    const entries = entriesByTransaction[transaction.id] ?? [];
    if (!entries.length) return [{
      id: transaction.id,
      date: dateKey(transaction.transactionDate),
      reference: transaction.id.slice(0, 8),
      account: transaction.accountName || categoryName(transaction.categoryId),
      accountNote: "Posted from book keeping",
      description: transaction.description,
      debit: transaction.debit,
      credit: transaction.credit,
      lineIndex: 0,
    }];
    return entries.map((entry, index) => ({
      id: entry.id,
      date: dateKey(transaction.transactionDate),
      reference: transaction.id.slice(0, 8),
      account: entry.accountName,
      accountNote: categories.find((category) => category.id === entry.accountId)?.reportSection || "Posted from book keeping",
      description: index === 0 ? transaction.description : entry.memo,
      debit: entry.entryType === "debit" ? entry.amount : 0,
      credit: entry.entryType === "credit" ? entry.amount : 0,
      lineIndex: index,
    }));
  });
  const generatedJournalRows = filteredGeneratedSalesGroups.flatMap((group) => group.entries.map((entry, index) => ({
    id: entry.id,
    date: group.date,
    reference: group.id.replace("sales-", "").slice(0, 14),
    account: entry.accountName,
    accountNote: entry.accountName === "Sales" ? "Automatic Sales" : entry.accountName === "Payment Processing Fees" ? "Automatic Expense" : "Automatic Cash",
    description: index === 0 ? group.description : entry.memo,
    debit: entry.entryType === "debit" ? entry.amount : 0,
    credit: entry.entryType === "credit" ? entry.amount : 0,
    lineIndex: index,
  })));
  const generatedCogsJournalRows = cogsGroups
    .filter((group) => (!accountingStartDate || group.date >= accountingStartDate) && (!accountingEndDate || group.date <= accountingEndDate))
    .flatMap((group) => group.entries.map((entry, index) => ({
      id: entry.id,
      date: group.date,
      reference: group.id.replace("cogs-", "").slice(0, 14),
      account: entry.accountName,
      accountNote: cogsAccounts.includes(entry.accountName as (typeof cogsAccounts)[number]) ? "Automatic COGS" : "Automatic Inventory",
      description: index === 0 ? group.description : entry.memo,
      debit: entry.entryType === "debit" ? entry.amount : 0,
      credit: entry.entryType === "credit" ? entry.amount : 0,
      lineIndex: index,
    })));
  const generatedOperatingExpenseJournalRows = operatingExpenseGroups
    .filter((group) => (!accountingStartDate || group.date >= accountingStartDate) && (!accountingEndDate || group.date <= accountingEndDate))
    .flatMap((group) => group.entries.map((entry, index) => ({
      id: entry.id,
      date: group.date,
      reference: group.id.replace("operating-expense-", "").slice(0, 14),
      account: entry.accountName,
      accountNote: entry.accountName === "Operating Expense" ? "Automatic Expense" : "Automatic Prepaid Expense",
      description: index === 0 ? group.description : entry.memo,
      debit: entry.entryType === "debit" ? entry.amount : 0,
      credit: entry.entryType === "credit" ? entry.amount : 0,
      lineIndex: index,
    })));
  const journalRows = [...manualJournalRows, ...generatedJournalRows, ...generatedCogsJournalRows, ...generatedOperatingExpenseJournalRows].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference) || a.lineIndex - b.lineIndex || a.id.localeCompare(b.id));
  function useThisMonthPeriod() {
    setAccountingPeriodMode("this_month");
    setAccountingStartDate(monthStartKey());
    setAccountingEndDate(monthEndKey());
  }
  function useLifetimePeriod() {
    setAccountingPeriodMode("lifetime");
    setAccountingStartDate("");
    setAccountingEndDate("");
  }
  function useCustomPeriod() {
    setAccountingPeriodMode("custom");
  }
  const periodLabel = accountingStartDate || accountingEndDate
    ? `${accountingStartDate ? formatDate(accountingStartDate) : "Beginning"} to ${accountingEndDate ? formatDate(accountingEndDate) : "Today"}`
    : "All dates";
  const dateInputsDisabled = accountingPeriodMode !== "custom";
  const dateFilter = <section className="card accounting-date-filter"><div className="accounting-date-copy"><strong>Accounting period</strong><span>This date range is shared by General Journal, T Accounts, Unit Costs, and Financial Reports.</span></div><div className="accounting-period-panel"><div className="accounting-period-selector"><button className={accountingPeriodMode === "this_month" ? "active" : ""} onClick={useThisMonthPeriod}>This month</button><button className={accountingPeriodMode === "lifetime" ? "active" : ""} onClick={useLifetimePeriod}>Lifetime</button><button className={accountingPeriodMode === "custom" ? "active" : ""} onClick={useCustomPeriod}>Calendar</button></div><label className={dateInputsDisabled ? "locked" : ""}>From<input type="date" value={accountingStartDate} disabled={dateInputsDisabled} onChange={(event) => setAccountingStartDate(event.target.value)} /></label><label className={dateInputsDisabled ? "locked" : ""}>To<input type="date" value={accountingEndDate} disabled={dateInputsDisabled} onChange={(event) => setAccountingEndDate(event.target.value)} /></label></div></section>;
  const unitCostRows = purchaseBatchStates
    .filter((batch) => (!accountingStartDate || batch.date >= accountingStartDate) && (!accountingEndDate || batch.date <= accountingEndDate));
  const unitCostSummaries = Object.values(unitCostRows.reduce<Record<string, { itemName: string; purchaseCount: number; totalQuantity: number; quantityLeft: number; quantityRejected: number; totalCost: number; latestUnitCost: number; latestPurchaseDate: string }>>((groups, row) => {
    const current = groups[row.itemName] ?? { itemName: row.itemName, purchaseCount: 0, totalQuantity: 0, quantityLeft: 0, quantityRejected: 0, totalCost: 0, latestUnitCost: 0, latestPurchaseDate: "" };
    current.purchaseCount += 1;
    current.totalQuantity += row.quantityBought;
    current.quantityLeft += row.quantityLeft;
    current.quantityRejected += row.quantityRejected;
    current.totalCost += row.totalCost;
    if (!current.latestPurchaseDate || row.date >= current.latestPurchaseDate) {
      current.latestPurchaseDate = row.date;
      current.latestUnitCost = row.unitCost;
    }
    groups[row.itemName] = current;
    return groups;
  }, {})).sort((a, b) => a.itemName.localeCompare(b.itemName));
  const visibleUnitCostRows = (selectedUnitCostItem === "all" ? unitCostRows : unitCostRows.filter((row) => row.itemName === selectedUnitCostItem))
    .sort((a, b) => a.itemName.localeCompare(b.itemName) || a.date.localeCompare(b.date) || a.batchNumber - b.batchNumber);
  const balanceForAccount = (accountName: string, entries = periodLedgerEntries) => entries
    .filter((entry) => entry.accountName === accountName)
    .reduce((total, entry) => total + (entry.entryType === "debit" ? entry.amount : -entry.amount), 0);
  const cashMovementForEntry = (entry: AccountingLedgerEntry) => entry.entryType === "debit" ? entry.amount : -entry.amount;
  const openingCashBalance = allLedgerEntries
    .filter((entry) => entry.accountName === "Bank Account" && isBeforeAccountingRange(entryDate(entry)))
    .reduce((total, entry) => total + cashMovementForEntry(entry), 0);
  const bankPeriodEntries = allLedgerEntries.filter((entry) => entry.accountName === "Bank Account" && isInAccountingRange(entryDate(entry)));
  const cashFlowActivityForEntry = (entry: AccountingLedgerEntry): CashFlowActivity => {
    const transaction = transactionById.get(entry.transactionId);
    const event = transaction?.businessEvent ?? "";
    const category = transaction?.categoryId ?? transaction?.accountName ?? "";
    const text = `${event} ${category} ${transaction?.description ?? ""} ${entry.memo}`.toLowerCase();
    if (event === "asset_purchase" || text.includes("equipment") || text.includes("asset")) return "investing";
    if (text.includes("owner") || text.includes("drawing") || text.includes("loan")) return "financing";
    return "operating";
  };
  const cashFlowDetailForEntry = (entry: AccountingLedgerEntry) => {
    const transaction = transactionById.get(entry.transactionId);
    const generatedDescription = generatedTransactionDescriptions.get(entry.transactionId);
    if (generatedDescription) return generatedDescription;
    if (transaction?.businessEvent === "payment_processor_paid" && transaction.accountName) return `${transaction.accountName} payout received`;
    return transaction?.description || entry.memo || entry.accountName;
  };
  const rawCashFlowRows = bankPeriodEntries
    .map((entry) => ({
      id: entry.id,
      date: entryDate(entry),
      activity: cashFlowActivityForEntry(entry),
      details: cashFlowDetailForEntry(entry),
      amount: cashMovementForEntry(entry),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.details.localeCompare(b.details) || a.id.localeCompare(b.id));
  const bankTransferSalesRows = rawCashFlowRows.filter((row) => row.details === "Bank Transfer sales");
  const cashFlowRows = [
    ...(bankTransferSalesRows.length ? [{
      id: "cash-flow-bank-transfer-sales",
      date: bankTransferSalesRows[0].date,
      activity: "operating" as CashFlowActivity,
      details: "Bank Transfer sales",
      amount: bankTransferSalesRows.reduce((total, row) => total + row.amount, 0),
    }] : []),
    ...rawCashFlowRows.filter((row) => row.details !== "Bank Transfer sales"),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.details.localeCompare(b.details) || a.id.localeCompare(b.id));
  const cashFlowSections: { key: CashFlowActivity; title: string }[] = [
    { key: "operating", title: "Cash Flows From Operating Activities" },
    { key: "investing", title: "Cash Flows From Investing Activities" },
    { key: "financing", title: "Cash Flows From Financing Activities" },
  ];
  const cashFlowSectionTotal = (activity: CashFlowActivity) => cashFlowRows
    .filter((row) => row.activity === activity)
    .reduce((total, row) => total + row.amount, 0);
  const netCashFlow = cashFlowRows.reduce((total, row) => total + row.amount, 0);
  const closingCashBalance = openingCashBalance + netCashFlow;
  const bankAccountClosingBalance = balanceForAccount("Bank Account", allLedgerEntries.filter((entry) => !accountingEndDate || entryDate(entry) <= accountingEndDate));
  const cashReconciles = Math.abs(closingCashBalance - bankAccountClosingBalance) < 0.01;
  const balancesForNames = (names: string[]) => names.map((name) => ({ name, balance: balanceForAccount(name) })).filter((item) => Math.abs(item.balance) > 0.005);
  const inventoryBalances = balancesForNames(sectionAccountNames(tAccountSections[0]));
  const expenseBalances = balancesForNames(sectionAccountNames(tAccountSections[1]));
  const assetBalances = balancesForNames(sectionAccountNames(tAccountSections[2]));
  const marketingBalances = balancesForNames(sectionAccountNames(tAccountSections[3]));
  const cashBalances = balancesForNames(sectionAccountNames(tAccountSections[4]));
  const salesRevenue = Math.abs(balanceForAccount("Sales"));
  const cogsAccountNames = [...new Set([
    ...cogsAccounts,
    ...categories.filter((category) => category.accountType === "cost_of_sales" || category.reportSection === "COGS").map((category) => category.name),
  ])];
  const costOfGoodsSoldRows = balancesForNames(cogsAccountNames);
  const totalCostOfGoodsSold = costOfGoodsSoldRows.reduce((total, item) => total + Math.abs(item.balance), 0);
  const grossProfit = salesRevenue - totalCostOfGoodsSold;
  const operatingExpenses = [...expenseBalances, ...marketingBalances];
  const totalExpenses = operatingExpenses.reduce((total, item) => total + Math.max(0, item.balance), 0);
  const netProfit = grossProfit - totalExpenses;
  const balanceSheetCashBalances = cashBalances.filter((item) => item.name !== "Payment Processing Fees");
  const assetReportRows = [...balanceSheetCashBalances, ...inventoryBalances, ...assetBalances];
  const totalAssets = assetReportRows.reduce((total, item) => total + item.balance, 0);
  const equityRows = balancesForNames(["Owner's Equity", "Drawings"]);
  const totalEquity = equityRows.reduce((total, item) => total + (item.name === "Drawings" ? -Math.abs(item.balance) : Math.abs(item.balance)), 0) + netProfit;
  const financialReportLabels: Record<FinancialReportType, string> = {
    income_statement: "Income Statement",
    balance_sheet: "Balance Sheet",
    cash_summary: "Cash Flow Statement",
  };

  if (view === "accounting_unit_costs") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>ACCOUNTING</p><h2>Unit Costs</h2><span>Each inventory item is shown by FIFO batch. Sales consume the earliest batch first; rejected inventory is removed as an expense.</span></div><div className="accounting-status-pill">{unitCostRows.length} batches</div></div>
    {dateFilter}
    <section className="accounting-summary-grid">
      <MoneyStat label="Inventory purchases" value={unitCostRows.reduce((total, row) => total + row.totalCost, 0)} tone="sales" />
      <Stat label="Items tracked" value={unitCostSummaries.length} color="navy" />
      <Stat label="Units left" value={unitCostRows.reduce((total, row) => total + row.quantityLeft, 0)} color="green" />
    </section>
    <section className="card accounting-table-card">
      <div className="accounting-form-heading"><div><h3>Inventory item overview</h3><p>Quantity left is calculated after FIFO sales and rejected inventory removals.</p></div><label className="unit-cost-filter">Item<select value={selectedUnitCostItem} onChange={(event) => setSelectedUnitCostItem(event.target.value)}><option value="all">View all</option>{unitCostSummaries.map((summary) => <option key={summary.itemName} value={summary.itemName}>{summary.itemName}</option>)}</select></label></div>
      <div className="table-scroll"><table className="orders-table unit-cost-table"><thead><tr><th>Item</th><th>Batches</th><th>Quantity bought</th><th>Quantity rejected</th><th>Quantity left</th><th>Weighted avg unit cost</th><th>Latest unit cost</th></tr></thead><tbody>
        {unitCostSummaries.filter((summary) => selectedUnitCostItem === "all" || summary.itemName === selectedUnitCostItem).map((summary) => <tr key={summary.itemName}><td><strong>{summary.itemName}</strong></td><td>{summary.purchaseCount}</td><td>{summary.totalQuantity.toLocaleString("en-MY")}</td><td>{summary.quantityRejected.toLocaleString("en-MY")}</td><td><strong>{summary.quantityLeft.toLocaleString("en-MY")}</strong></td><td>{formatMoney(summary.totalQuantity > 0 ? summary.totalCost / summary.totalQuantity : 0)}</td><td>{formatMoney(summary.latestUnitCost)}</td></tr>)}
        {!unitCostSummaries.length && <tr><td colSpan={7}>No inventory purchase batches found for this period.</td></tr>}
      </tbody></table></div>
    </section>
    <section className="card accounting-table-card">
      <h3>FIFO batch details</h3>
      <div className="table-scroll"><table className="orders-table unit-cost-table"><thead><tr><th>Item</th><th>Date bought</th><th>Batch no.</th><th>Quantity bought</th><th>Quantity sold</th><th>Quantity rejected</th><th>Quantity left</th><th>Price</th><th>Batch cost</th></tr></thead><tbody>
        {visibleUnitCostRows.map((row) => <tr key={row.id}><td><strong>{row.itemName}</strong></td><td>{formatDate(row.date)}</td><td>Batch {row.batchNumber}</td><td>{row.quantityBought.toLocaleString("en-MY")}</td><td>{row.quantitySold.toLocaleString("en-MY")}</td><td>{row.quantityRejected.toLocaleString("en-MY")}</td><td><strong>{row.quantityLeft.toLocaleString("en-MY")}</strong></td><td>{formatMoney(row.unitCost)}</td><td>{formatMoney(row.totalCost)}</td></tr>)}
        {!visibleUnitCostRows.length && <tr><td colSpan={9}>No purchase details match this item and period.</td></tr>}
      </tbody></table></div>
    </section>
  </section>;

  if (view === "accounting_financial_reports") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>ACCOUNTING</p><h2>Financial Reports</h2><span>Choose one statement, set the accounting period, then print or save as PDF.</span></div><div className="accounting-status-pill">{financialReportLabels[selectedFinancialReport]}</div></div>
    {dateFilter}
    <div className="range-tabs t-account-tabs no-print">{(Object.entries(financialReportLabels) as [FinancialReportType, string][]).map(([key, label]) => <button key={key} className={selectedFinancialReport === key ? "active" : ""} onClick={() => setSelectedFinancialReport(key)}>{label}</button>)}</div>
    <div className="financial-report-actions no-print"><button className="button primary" onClick={() => printView("print-financial-report")}>Print / Save PDF</button></div>
    <section className="financial-statement card">
      <header className="financial-statement-title"><p>Meaningful Plushies</p><h2>{financialReportLabels[selectedFinancialReport]}</h2><span>{selectedFinancialReport === "balance_sheet" ? `As at ${accountingEndDate ? formatDate(accountingEndDate) : formatDate(dateKey(new Date().toISOString()))}` : `For the period ${periodLabel}`}</span></header>
      {selectedFinancialReport === "income_statement" && <div className="statement-table">
        <div className="statement-section-title">Revenue</div>
        <div className="statement-row"><span>Sales revenue</span><strong>{formatMoney(salesRevenue)}</strong></div>
        <div className="statement-total"><span>Total revenue</span><strong>{formatMoney(salesRevenue)}</strong></div>
        <div className="statement-section-title">Less: Cost of Goods Sold</div>
        {costOfGoodsSoldRows.map((item) => <div className="statement-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(Math.abs(item.balance))}</strong></div>)}
        {!costOfGoodsSoldRows.length && <div className="statement-row muted"><span>No cost of goods sold recorded</span><strong>{formatMoney(0)}</strong></div>}
        <div className="statement-total"><span>Total cost of goods sold</span><strong>{formatMoney(totalCostOfGoodsSold)}</strong></div>
        <div className="statement-grand-total statement-gross-profit"><span>Gross profit</span><strong>{formatMoney(grossProfit)}</strong></div>
        <div className="statement-section-title">Less: Operating Expenses</div>
        {operatingExpenses.map((item) => <div className="statement-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(Math.abs(item.balance))}</strong></div>)}
        {!operatingExpenses.length && <div className="statement-row muted"><span>No expenses recorded</span><strong>{formatMoney(0)}</strong></div>}
        <div className="statement-total"><span>Total expenses</span><strong>{formatMoney(totalExpenses)}</strong></div>
        <div className="statement-grand-total"><span>Net profit / (loss)</span><strong>{formatMoney(netProfit)}</strong></div>
      </div>}
      {selectedFinancialReport === "balance_sheet" && <div className="statement-table">
        <div className="statement-section-title">Assets</div>
        {assetReportRows.map((item) => <div className="statement-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(item.balance)}</strong></div>)}
        {!assetReportRows.length && <div className="statement-row muted"><span>No assets recorded</span><strong>{formatMoney(0)}</strong></div>}
        <div className="statement-total"><span>Total assets</span><strong>{formatMoney(totalAssets)}</strong></div>
        <div className="statement-section-title">Equity</div>
        <div className="statement-row"><span>Current year earnings</span><strong>{formatMoney(netProfit)}</strong></div>
        {equityRows.map((item) => <div className="statement-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(item.name === "Drawings" ? -Math.abs(item.balance) : Math.abs(item.balance))}</strong></div>)}
        <div className="statement-total"><span>Total equity</span><strong>{formatMoney(totalEquity)}</strong></div>
        <div className="statement-grand-total"><span>Total equity and liabilities</span><strong>{formatMoney(totalEquity)}</strong></div>
      </div>}
      {selectedFinancialReport === "cash_summary" && <div className="statement-table">
        <div className="statement-row"><span>Opening cash balance</span><strong>{formatMoney(openingCashBalance)}</strong></div>
        {cashFlowSections.map((section) => {
          const rows = cashFlowRows.filter((row) => row.activity === section.key);
          const total = cashFlowSectionTotal(section.key);
          return <div className="cash-flow-section" key={section.key}>
            <div className="statement-section-title">{section.title}</div>
            {rows.map((row) => <div className="statement-row cash-flow-row" key={row.id}><span><small>{formatDate(row.date)}</small>{row.details}</span><strong>{formatMoney(row.amount)}</strong></div>)}
            {!rows.length && <div className="statement-row muted"><span>No cash movements recorded</span><strong>{formatMoney(0)}</strong></div>}
            <div className="statement-total"><span>Net cash from {section.key} activities</span><strong>{formatMoney(total)}</strong></div>
          </div>;
        })}
        <div className="statement-grand-total"><span>Net increase / (decrease) in cash</span><strong>{formatMoney(netCashFlow)}</strong></div>
        <div className="statement-total"><span>Closing cash balance</span><strong>{formatMoney(closingCashBalance)}</strong></div>
        <div className={`statement-reconciliation ${cashReconciles ? "ok" : "error"}`}><span>Reconciliation to Bank Account</span><strong>{cashReconciles ? "Matched" : `Difference ${formatMoney(closingCashBalance - bankAccountClosingBalance)}`}</strong></div>
      </div>}
    </section>
  </section>;

  if (view === "accounting_t_accounts") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>ACCOUNTING</p><h2>T Accounts</h2><span>All created bookkeeping accounts appear here, even before they have transactions. Debits and credits are grouped by account section.</span></div><div className="accounting-status-pill">{totalTAccounts} accounts</div></div>
    {dateFilter}
    <section className="accounting-summary-grid">
      <MoneyStat label="Total debits" value={totalDebits} tone="sales" />
      <MoneyStat label="Total credits" value={totalCredits} tone="collected" />
      <MoneyStat label="Difference" value={Math.abs(totalDebits - totalCredits)} tone={Math.abs(totalDebits - totalCredits) > 0.01 ? "fees" : "transfer"} />
    </section>
    <div className="range-tabs t-account-tabs">{tAccountSections.map((section) => <button key={section.title} className={selectedTAccountSection === section.title ? "active" : ""} onClick={() => { setSelectedTAccountSection(section.title); setSelectedTAccountName("all"); }}>{section.title}</button>)}</div>
    <label className="t-account-selector">T account<select value={selectedTAccountName} onChange={(event) => setSelectedTAccountName(event.target.value)}><option value="all">View all</option>{selectedSectionAccountNames.map((accountName) => <option key={accountName} value={accountName}>{accountName}</option>)}</select></label>
    {[selectedSection].map((section) => {
      const accountNames = visibleAccountNames;
      return <section className="accounting-workspace" key={section.title}>
        <div className="reporting-header"><div><strong>{section.title}</strong><span>{accountNames.length} T account{accountNames.length === 1 ? "" : "s"}</span></div></div>
        <section className="t-account-list">
          {accountNames.map((accountName) => {
            const entries = [...(accountGroups[accountName] ?? [])].sort((a, b) => {
              const dateCompare = entryDate(a).localeCompare(entryDate(b));
              return dateCompare || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
            });
            const openingBalance = entries.filter((entry) => isBeforeAccountingRange(entryDate(entry))).reduce((total, entry) => total + (entry.entryType === "debit" ? entry.amount : -entry.amount), 0);
            const periodEntries = entries.filter((entry) => isInAccountingRange(entryDate(entry)));
            const debits = periodEntries.filter((entry) => entry.entryType === "debit");
            const credits = periodEntries.filter((entry) => entry.entryType === "credit");
            const debitTotal = debits.reduce((total, entry) => total + entry.amount, 0);
            const creditTotal = credits.reduce((total, entry) => total + entry.amount, 0);
            const closingBalance = openingBalance + debitTotal - creditTotal;
            const details = (entry: AccountingLedgerEntry) => transactionById.get(entry.transactionId)?.description || generatedTransactionDescriptions.get(entry.transactionId) || entry.memo;
            const debitRows = [
              ...(openingBalance > 0 ? [{ id: `${accountName}-bd-debit`, date: accountingStartDate, details: "Balance b/d", amount: openingBalance }] : []),
              ...debits.map((entry) => ({ id: entry.id, date: entryDate(entry), details: details(entry), amount: entry.amount })),
              ...(closingBalance < 0 ? [{ id: `${accountName}-cd-debit`, date: accountingEndDate || dateKey(new Date().toISOString()), details: "Balance c/d", amount: Math.abs(closingBalance) }] : []),
            ];
            const creditRows = [
              ...(openingBalance < 0 ? [{ id: `${accountName}-bd-credit`, date: accountingStartDate, details: "Balance b/d", amount: Math.abs(openingBalance) }] : []),
              ...credits.map((entry) => ({ id: entry.id, date: entryDate(entry), details: details(entry), amount: entry.amount })),
              ...(closingBalance > 0 ? [{ id: `${accountName}-cd-credit`, date: accountingEndDate || dateKey(new Date().toISOString()), details: "Balance c/d", amount: closingBalance }] : []),
            ];
            const rowCount = Math.max(debitRows.length, creditRows.length, 1);
            const sideTotal = Math.max(debitRows.reduce((total, row) => total + row.amount, 0), creditRows.reduce((total, row) => total + row.amount, 0));
            return <article className="card accounting-table-card t-account-card" key={`${section.title}-${accountName}`}>
              <h3>{accountName}</h3>
              <div className="table-scroll t-account-scroll"><table className="orders-table t-account-table"><colgroup><col className="t-date-col" /><col className="t-details-col" /><col className="t-amount-col" /><col className="t-date-col" /><col className="t-details-col" /><col className="t-amount-col" /></colgroup><thead><tr><th colSpan={3}>Debit</th><th colSpan={3}>Credit</th></tr><tr><th>Date</th><th>Details</th><th>Amount</th><th>Date</th><th>Details</th><th>Amount</th></tr></thead><tbody>{Array.from({ length: rowCount }).map((_, index) => {
                const debit = debitRows[index];
                const credit = creditRows[index];
                return <tr key={`${accountName}-${index}`}><td>{debit?.date ? formatDate(debit.date) : ""}</td><td>{debit?.details ?? ""}</td><td>{debit ? formatMoney(debit.amount) : ""}</td><td>{credit?.date ? formatDate(credit.date) : ""}</td><td>{credit?.details ?? ""}</td><td>{credit ? formatMoney(credit.amount) : ""}</td></tr>;
              })}<tr><td /><td><strong>Total</strong></td><td><strong>{formatMoney(sideTotal)}</strong></td><td /><td><strong>Total</strong></td><td><strong>{formatMoney(sideTotal)}</strong></td></tr><tr className="t-account-balance-row"><td colSpan={6}><strong>Balance: {formatMoney(Math.abs(closingBalance))} {closingBalance >= 0 ? "debit" : "credit"}</strong></td></tr></tbody></table></div>
            </article>;
          })}
          {!accountNames.length && <div className="empty"><strong>No {section.title.toLowerCase()} accounts yet</strong><p>Add category items in Book Keeping Settings and they will appear here.</p></div>}
        </section>
      </section>;
    })}
  </section>;

  return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>ACCOUNTING</p><h2>General Journal</h2><span>Every bookkeeping transaction is converted into debit and credit journal lines. This is the formal journal before posting to T accounts.</span></div><div className="accounting-status-pill">{ledgerEntries.length} lines</div></div>
    {dateFilter}
    <section className="accounting-summary-grid">
      <MoneyStat label="Journal debits" value={totalDebits} tone="sales" />
      <MoneyStat label="Journal credits" value={totalCredits} tone="collected" />
      <MoneyStat label="Out of balance" value={Math.abs(totalDebits - totalCredits)} tone={Math.abs(totalDebits - totalCredits) > 0.01 ? "fees" : "transfer"} />
    </section>
    <section className="card accounting-table-card general-journal-card"><h3>Journal entries</h3><div className="table-scroll general-journal-scroll"><table className="orders-table general-journal-table"><colgroup><col className="journal-date-col" /><col className="journal-ref-col" /><col className="journal-account-col" /><col className="journal-description-col" /><col className="journal-money-col" /><col className="journal-money-col" /></colgroup><thead><tr><th>Date</th><th>Reference</th><th>Account</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{journalRows.map((row, index) => {
      const nextRow = journalRows[index + 1];
      const isGroupEnd = !nextRow || nextRow.reference !== row.reference || nextRow.date !== row.date;
      return <tr key={row.id} className={isGroupEnd ? "journal-group-end" : ""}><td>{formatDate(row.date)}</td><td>{row.reference}</td><td><strong>{row.account}</strong><br /><small>{row.accountNote}</small></td><td>{row.description}</td><td>{row.debit ? formatMoney(row.debit) : "-"}</td><td>{row.credit ? formatMoney(row.credit) : "-"}</td></tr>;
    })}</tbody></table>{!journalRows.length && <div className="empty"><strong>No journal entries in this period</strong><p>Change the date range or save more bookkeeping transactions.</p></div>}</div></section>
  </section>;
}

function UnsettledPaymentsTable({ transactions, files, saving, onFileChange, onSettle }: { transactions: AccountingTransaction[]; files: Record<string, File | null>; saving: boolean; onFileChange: (transactionId: string, file: File | null) => void; onSettle: (transaction: AccountingTransaction) => void }) {
  function remaining(transaction: AccountingTransaction) {
    if (transaction.paymentStatus === "deposit_paid") return Math.max(0, transaction.amount - transaction.depositAmount);
    return transaction.amount;
  }
  return <section className="card accounting-table-card"><h3>To be paid</h3><div className="table-scroll"><table className="orders-table"><thead><tr><th>Date</th><th>Description</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Payment proof</th><th /></tr></thead><tbody>{transactions.map((transaction) => <tr key={transaction.id}><td>{formatDate(transaction.transactionDate)}</td><td><strong>{transaction.description}</strong><br /><small>{transaction.invoiceNumber ? `Invoice ${transaction.invoiceNumber}` : transaction.businessEvent}</small></td><td>{transaction.supplier || "-"}</td><td>{formatMoney(transaction.amount)}</td><td>{transaction.paymentStatus === "deposit_paid" ? formatMoney(transaction.depositAmount) : "-"}</td><td><strong>{formatMoney(remaining(transaction))}</strong></td><td><FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Upload proof" description="Drop file here" selectedName={files[transaction.id]?.name} onFile={(file) => onFileChange(transaction.id, file)} className="inline-file-drop-zone" /></td><td><button className="view-button" disabled={saving} onClick={() => onSettle(transaction)}>Mark paid</button></td></tr>)}</tbody></table>{!transactions.length && <div className="empty"><strong>No unsettled payments</strong><p>Deposit-paid and on-credit transactions will appear here until they are marked paid.</p></div>}</div></section>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try { onLogin(await loginDashboardAccount(username, password)); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Sign in failed."); }
    finally { setSigningIn(false); }
  }
  return <main className="login-page"><section className="login-brand"><div className="login-logo">MP</div><p>MEANINGFUL PLUSHIES</p><h1>A calmer way to manage every plushie.</h1><span>Track voice, production, packing and delivery from one simple workspace.</span></section><section className="login-panel"><form onSubmit={submit}><p className="eyebrow">STAFF PORTAL</p><h2>Welcome back</h2><span>Sign in with the account created by your administrator.</span>{error && <p className="login-error">{error}</p>}<label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label><button className="button primary large" type="submit" disabled={signingIn}>{signingIn ? "Signing in..." : "Sign in"}</button></form></section></main>;
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return <article className={`stat ${color}`}><span>{label}</span><strong>{value}</strong></article>;
}

function MoneyStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <article className={`money-stat ${tone}`}><span>{label}</span><strong>{formatMoney(value)}</strong></article>;
}

function MoneyStatWithNote({ label, value, tone, note }: { label: string; value: number; tone: string; note: string }) {
  return <article className={`money-stat ${tone}`}><span>{label}</span><em>{note}</em><strong>{formatMoney(value)}</strong></article>;
}

function SelectableMoneyStat({ label, value, tone, selected, options, onChange }: { label: string; value: number; tone: string; selected: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <article className={`money-stat ${tone} selectable-money-stat`}><span>{label}</span><select value={selected} onChange={(event) => onChange(event.target.value)}>{options.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select><strong>{formatMoney(value)}</strong></article>;
}

function SortControls({ sortKey, direction, onKey, onDirection }: { sortKey: SortKey; direction: SortDirection; onKey: (key: SortKey) => void; onDirection: (direction: SortDirection) => void }) {
  const value: SortChoice = `${sortKey}:${direction}`;
  return <select className="combined-sort-select" aria-label="Sort orders" value={value} onChange={(event) => { const [key, nextDirection] = event.target.value.split(":") as [SortKey, SortDirection]; onKey(key); onDirection(nextDirection); }}>{(Object.keys(sortChoiceLabels) as SortChoice[]).map((choice) => <option key={choice} value={choice}>{sortChoiceLabels[choice]}</option>)}</select>;
}

function StatusFilterPills({ value, onChange }: { value: "all" | OrderStatus; onChange: (status: "all" | OrderStatus) => void }) {
  return <div className="status-filter-pills" aria-label="Filter by stage">{(["all", ...orderStatuses] as ("all" | OrderStatus)[]).map((status) => <button type="button" key={status} className={value === status ? "active" : ""} onClick={() => onChange(status)}>{status === "all" ? "All" : statusLabels[status]}</button>)}</div>;
}

function StatusPill({ status }: { status: OrderStatus }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status]}</span>;
}

function FileDropZone({ accept, title, description, selectedName, className = "", onFile }: { accept: string; title: string; description?: string; selectedName?: string; className?: string; onFile: (file: File | null) => void }) {
  const [dragging, setDragging] = useState(false);
  function chooseFile(file: File | undefined) {
    onFile(file ?? null);
  }
  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }
  return <label
    className={`file-drop file-drop-zone ${dragging ? "dragging" : ""} ${className}`}
    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
    onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
    onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
    onDrop={onDrop}
  >
    <input type="file" accept={accept} onChange={(event) => chooseFile(event.target.files?.[0])} />
    <strong>{selectedName || title}</strong>
    <span>{selectedName ? "File ready. Drop another file to replace it." : description || "Click to choose, or drag and drop a file here"}</span>
  </label>;
}

function ImportBox({ number, title, required, value, onChange, onFile, placeholder }: { number: string; title: string; required?: boolean; value: string; onChange: (value: string) => void; onFile: (file?: File) => void; placeholder: string }) {
  return <article className="card import-box"><div className="import-heading"><span>{number}</span><div><h3>{title}</h3><p>{required ? "Required" : "Optional, but recommended"}</p></div></div><FileDropZone accept=".csv,text/csv" title="Choose or drop CSV file" description="or paste the CSV content below" onFile={(file) => onFile(file ?? undefined)} /><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></article>;
}

function OrderDrawer({ order, role, actor, onClose, onUpdate, onStatus }: { order: Order; role: UserRole; actor: string; onClose: () => void; onUpdate: (patch: Partial<Order>) => void; onStatus: (status: OrderStatus) => void }) {
  const admin = role === "admin";
  const following = nextStatus[order.status];

  function uploadPhoto(file?: File) {
    if (!file) return;
    if (file.size > 3_000_000) return alert("Please choose an image smaller than 3 MB.");
    const reader = new FileReader();
    reader.onload = () => onUpdate({ photoDataUrl: String(reader.result), photoName: file.name });
    reader.readAsDataURL(file);
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="order-drawer"><div className="drawer-header"><div><p>ORDER DETAIL</p><h2>{orderLabel(order)}</h2></div><button onClick={onClose}>x</button></div><div className="drawer-body">
    <section className="detail-summary"><div><span>Current status</span><StatusPill status={order.status} /></div><div><span>Last updated</span><strong>{formatDate(order.updatedAt, true)}</strong></div></section>
    <section className="detail-section"><h3>Quick actions</h3><div className="status-actions">{following && <button className="button primary" onClick={() => onStatus(following)}>Move to {statusLabels[following]}</button>}{admin && <button className="button issue-button" onClick={() => onStatus("issue")}>Mark issue</button>}{admin && order.status === "issue" && <button className="button secondary" onClick={() => onStatus("sent_for_sewing")}>Resolve issue</button>}<a className="button whatsapp" href={whatsappLink(order)} target="_blank">Open WhatsApp</a></div></section>
    <section className="detail-section"><h3>Customer and order</h3><div className="field-grid"><Field label="Order number" value={`#${order.orderNumber}`} /><Field label="Order date" value={formatDate(order.orderDate, true)} /><Field label="Payment method" value={order.paymentProcessor || "Unknown"} /><Editable label="Customer name" value={order.customerName} disabled={!admin} onChange={(value) => onUpdate({ customerName: value })} /><Editable label="Phone" value={order.phone} disabled={!admin} onChange={(value) => onUpdate({ phone: value })} /><Editable wide label="Address" value={order.address} disabled={!admin} onChange={(value) => onUpdate({ address: value })} /></div></section>
    <section className="detail-section"><h3>Plushie details</h3><div className="field-grid"><Editable label="Product name" value={order.product} disabled={!admin} onChange={(value) => onUpdate({ product: value })} /><Editable label="Character" value={order.character} disabled={!admin} onChange={(value) => onUpdate({ character: value })} /><Editable label="Set indicator" value={order.setIndicator ?? ""} disabled={!admin} onChange={(value) => onUpdate({ setIndicator: value })} /><Editable label="ID website link" value={order.idWebsiteLink ?? ""} disabled={!admin} onChange={(value) => onUpdate({ idWebsiteLink: value })} /><Editable label="Voice length" value={String(order.voiceLength || "")} disabled={!admin} onChange={(value) => onUpdate({ voiceLength: Number(value) || 0 })} /><Editable label="Plush name" value={order.plushName} disabled={!admin} onChange={(value) => onUpdate({ plushName: value })} /><Editable wide label="Remark" value={order.remark ?? ""} disabled={!admin} onChange={(value) => onUpdate({ remark: value })} /><Editable wide textarea label="Meaningful note" value={order.meaningfulNote} disabled={!admin} onChange={(value) => onUpdate({ meaningfulNote: value })} /><div className="field wide"><label>Meaningful message</label>{order.meaningfulMessage ? <a href={order.meaningfulMessage} target="_blank" rel="noreferrer">Open customer message</a> : <span>Not provided</span>}</div><div className="field"><label>Voice upload</label>{admin ? <select value={order.voiceUploadStatus} onChange={(event) => onUpdate({ voiceUploadStatus: event.target.value as Order["voiceUploadStatus"] })}><option value="missing">Missing</option><option value="received">Received</option><option value="checked">Checked</option></select> : <strong>{order.voiceUploadStatus}</strong>}</div></div></section>
    <section className="detail-section"><h3>Delivery</h3><div className="field-grid"><Field label="Shipping method" value={order.shippingMethod || "Not imported"} /><Editable label="Courier" value={order.courier} disabled={!admin} placeholder="J&T Express" onChange={(value) => onUpdate({ courier: value })} /><Editable label="Tracking number" value={order.trackingNumber} disabled={!admin} placeholder="Enter tracking number" onChange={(value) => onUpdate({ trackingNumber: value })} /></div></section>
    <section className="detail-section"><h3>Tailor / packing photo</h3><div className="photo-field">{order.photoDataUrl ? <img src={order.photoDataUrl} alt="Tailor or packing evidence" /> : <div className="photo-placeholder">No photo uploaded</div>}{admin && <FileDropZone accept="image/*" title={order.photoDataUrl ? "Replace photo" : "Upload photo"} description="Click or drop an image" selectedName={order.photoName} onFile={(file) => uploadPhoto(file ?? undefined)} className="photo-file-drop" />}</div></section>
    <section className="detail-section"><h3>Internal notes</h3><textarea className="notes" value={order.internalNotes} disabled={!admin} onChange={(event) => onUpdate({ internalNotes: event.target.value })} placeholder="Add notes visible to your team..." /></section>
    <section className="detail-section"><h3>Status history</h3><div className="history">{[...order.statusHistory].reverse().map((event) => <div key={event.id}><span></span><div><strong>{statusLabels[event.status]}</strong><p>{event.changedBy} | {formatDate(event.changedAt, true)}</p>{event.note && <small>{event.note}</small>}</div></div>)}</div></section>
    {!admin && <p className="permission-note">Signed in as Staff. You can only move orders to the next stage.</p>}
  </div></aside></div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return <div className="field"><label>{label}</label><strong>{value || "-"}</strong></div>;
}

function Editable({ label, value, onChange, disabled, placeholder, wide, textarea }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; wide?: boolean; textarea?: boolean }) {
  return <div className={`field ${wide ? "wide" : ""}`}><label>{label}</label>{textarea ? <textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /> : <input value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />}</div>;
}

function PackingSlip({ order }: { order: Order }) {
  return <article className="a6-slip"><header><span>ORDER ID</span><strong>{orderLabel(order)}</strong></header><div className="slip-fields"><div className="primary-slip-field"><label>CHARACTER:</label><p>{order.character || "-"}</p></div><div className="primary-slip-field"><label>PLUSH NAME:</label><p>{order.plushName || "-"}</p></div><div><label>CUSTOMER:</label><p>{order.customerName || "-"}</p></div><div><label>PHONE:</label><p>{order.phone || "-"}</p></div><div className="remark-row"><label>REMARK:</label><p>{order.remark || "-"}</p></div></div><footer>Meaningful Plushies</footer></article>;
}

function EnvelopeSettingsPanel({ settings, onChange, onFontUpload, onReset }: { settings: EnvelopePrintSettings; onChange: (patch: Partial<EnvelopePrintSettings>) => void; onFontUpload: (file: File | null) => void; onReset: () => void }) {
  const numberChange = (key: keyof EnvelopePrintSettings) => (event: ChangeEvent<HTMLInputElement>) => onChange({ [key]: Number(event.target.value) } as Partial<EnvelopePrintSettings>);
  const previewFontFamily = settings.fontBase64 ? "EnvelopeUploadedFont" : undefined;
  return <section className="envelope-settings">
    {settings.fontBase64 && <style>{`@font-face{font-family:"EnvelopeUploadedFont";src:url(data:font/opentype;base64,${settings.fontBase64}) format("opentype");font-display:block;}`}</style>}
    <div className="envelope-settings-header"><div><strong>Print Envelope</strong><span>Upload any font, then tune the size and text box placement. Names are rendered as all caps before the PDF is created.</span></div><button className="view-button" type="button" onClick={onReset}>Reset</button></div>
    <FileDropZone accept=".otf,.ttf,font/otf,font/ttf" title="Font file" description="Use .otf or .ttf. Click or drop the font here." selectedName={settings.fontName || ""} onFile={onFontUpload} className="envelope-font-upload" />
    <div className="envelope-font-sample" style={{ fontFamily: previewFontFamily }}><span>Font preview</span><strong style={{ WebkitTextStroke: settings.boldness ? `${settings.boldness / 2}px #425e75` : undefined }}>SNUGGLEBEAR</strong><small>{settings.fontBase64 ? "This is the all-caps style that will become the envelope name image." : "Upload a font to see the preview here."}</small></div>
    <div className="envelope-settings-grid">
      <label>Font size<input type="number" step="1" value={settings.fontSize} onChange={numberChange("fontSize")} /></label>
      <label>Minimum size<input type="number" step="1" value={settings.minFontSize} onChange={numberChange("minFontSize")} /></label>
      <label>Boldness<input type="number" min="0" max="8" step="0.25" value={settings.boldness} onChange={numberChange("boldness")} /></label>
      <label>Letter spacing<input type="number" step="0.1" value={settings.letterSpacing} onChange={numberChange("letterSpacing")} /></label>
      <label>Line height<input type="number" step="0.01" value={settings.lineHeight} onChange={numberChange("lineHeight")} /></label>
      <label>Box width<input type="number" step="1" value={settings.textBoxWidth} onChange={numberChange("textBoxWidth")} /></label>
      <label>Box height<input type="number" step="1" value={settings.textBoxHeight} onChange={numberChange("textBoxHeight")} /></label>
      <label>Top X<input type="number" step="0.1" value={settings.topX} onChange={numberChange("topX")} /></label>
      <label>Top Y<input type="number" step="0.1" value={settings.topY} onChange={numberChange("topY")} /></label>
      <label>Bottom X<input type="number" step="0.1" value={settings.bottomX} onChange={numberChange("bottomX")} /></label>
      <label>Bottom Y<input type="number" step="0.1" value={settings.bottomY} onChange={numberChange("bottomY")} /></label>
    </div>
  </section>;
}

function EnvelopeSheet({ orders, pageNumber, settings }: { orders: Order[]; pageNumber: number; settings: EnvelopePrintSettings }) {
  return <article className="envelope-sheet"><span>PAGE {pageNumber}</span><div><small>TOP NAME | X {settings.topX}, Y {settings.topY}</small><strong>{(orders[0]?.plushName || "-").toUpperCase()}</strong></div><div><small>BOTTOM NAME | X {settings.bottomX}, Y {settings.bottomY}</small><strong>{(orders[1]?.plushName || "-").toUpperCase()}</strong></div></article>;
}

type IconName = "orders" | "fulfilment" | "packing" | "envelope" | "import" | "shipped" | "logout" | "search" | "history" | "drag" | "settings" | "stock" | "report" | "accounting" | "cash" | "documents" | "ledger" | "tax" | "calendar" | "idea";

function Icon({ name }: { name: IconName }) {
  const common: SVGProps<SVGSVGElement> = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "orders") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
  if (name === "fulfilment") return <svg {...common}><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>;
  if (name === "packing") return <svg {...common}><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>;
  if (name === "envelope") return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>;
  if (name === "import") return <svg {...common}><path d="M12 3v12M7 8l5-5 5 5M5 15v5h14v-5"/></svg>;
  if (name === "shipped") return <svg {...common}><path d="M20 6 9 17l-5-5"/></svg>;
  if (name === "logout") return <svg {...common}><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9"/></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>;
  if (name === "settings") return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>;
  if (name === "stock") return <svg {...common}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="m4 7v10l8 4 8-4V7M12 11v10"/></svg>;
  if (name === "report") return <svg {...common}><path d="M6 3h12v18H6zM9 8h6M9 12h6M9 16h4"/></svg>;
  if (name === "accounting") return <svg {...common}><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h8M8 16h3"/></svg>;
  if (name === "cash") return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v0M18 15v0"/></svg>;
  if (name === "documents") return <svg {...common}><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v5h4M10 12h6M10 16h6M5 7v14"/></svg>;
  if (name === "ledger") return <svg {...common}><path d="M5 4h14v16H5zM9 4v16M5 9h14M5 14h14"/></svg>;
  if (name === "tax") return <svg {...common}><path d="M7 17 17 7"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/></svg>;
  if (name === "calendar") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>;
  if (name === "idea") return <svg {...common}><path d="M9 18h6M10 22h4M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.7-1.5 1.7-1.5 2.8v.7h-4v-.7c0-1.1-.6-2.1-1.5-2.8Z"/></svg>;
  if (name === "drag") return <svg {...common}><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none"/></svg>;
  return <svg {...common}><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>;
}

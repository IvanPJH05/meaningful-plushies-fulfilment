"use client";

import "./settings.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent, SVGProps } from "react";
import { applyTikTokDetailEntries, detectCsvKind, fulfilledOrdersCsv, importShopifyData, importTikTokShopData, normalizePaymentProcessor, parseTikTokDetailsBlock, tikTokCertificateJson, tikTokDetailsToText } from "../lib/importer";
import { parseBankStatementCsv } from "../lib/bank-statements";
import { buildSalesReportRows, summarizeSales, type SalesReportRow, type SalesSummary } from "../lib/sales";
import { stockCharacters, summarizeStock } from "../lib/stock";
import {
  createDashboardAccount,
  createAccountingDocumentSignedUrl,
  deleteSalesConsumptionMapping,
  deleteContentIdea,
  deleteContentPlanItem,
  deleteDashboardAccount,
  deleteSharedOrders,
  deleteAccountingDocument,
  deleteAccountingTransaction,
  deleteAccountingBankStatementLine,
  ensurePaymentProcessors,
  fetchAccountingCategories,
  fetchAccountingBankStatementLines,
  fetchAccountingDocuments,
  fetchAccountingLedgerEntries,
  fetchAccountingTransactions,
  fetchContentIdeas,
  fetchContentPlanItems,
  fetchCreatorCommissions,
  fetchCreatorPayouts,
  fetchCreatorProfiles,
  fetchEnvelopePrintSettings,
  fetchMetaCapiLogs,
  fetchMetaCapiSettings,
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
  saveAccountingBankStatementLine,
  saveAccountingBankStatementLines,
  saveAccountingCategory,
  saveAccountingLedgerEntries,
  saveAccountingTransaction,
  saveContentIdea,
  saveContentPlanItem,
  saveCreatorPayout,
  saveCreatorPayoutInfo,
  saveCreatorProfile,
  saveEnvelopePrintSettings,
  saveMetaCapiSettings,
  saveSalesConsumptionMapping,
  saveStockSetting,
  savePaymentProcessorSetting,
  saveSalesFeeSettings,
  subscribeToSharedData,
  syncCreatorCommissions,
  supabaseConfigured,
  updateDashboardAccount,
  updateCreatorCommissionStatus,
  uploadAccountingDocumentFile,
  upsertSharedOrders,
  type DashboardSession,
} from "../lib/supabase";
import { orderStatuses, type AccountingBankStatementLine, type AccountingCategory, type AccountingDocument, type AccountingLedgerEntry, type AccountingTransaction, type CommissionStatus, type ContentIdeaItem, type ContentIdeaReference, type ContentPlanItem, type CreatorCommission, type CreatorPayout, type CreatorProfile, type CreatorStatus, type CreatorTier, type DashboardAccount, type EnvelopePrintSettings, type MetaAdsEnvironment, type MetaAdsInsight, type MetaAdsSummary, type MetaCapiLog, type MetaCapiSettings, type Order, type OrderStatus, type PaymentProcessorSetting, type SalesConsumptionMapping, type SalesFeeSetting, type StockSetting, type UserRole } from "../lib/types";

type Session = DashboardSession;
type View =
  | "orders" | "fulfilment" | "packing_slips" | "print_envelope" | "import" | "tiktok_shop" | "fulfilled" | "history" | "settings" | "meta_capi" | "stock" | "sales_report"
  | "accounting_dashboard" | "accounting_documents" | "accounting_transactions" | "accounting_csv_import" | "accounting_profit_loss" | "accounting_balance_sheet"
  | "accounting_cash_flow" | "accounting_operating_costs" | "accounting_general_ledger" | "accounting_trial_balance" | "accounting_payable" | "accounting_receivable"
  | "accounting_other_income"
  | "accounting_bank_reconciliation" | "accounting_product_profitability" | "accounting_marketing_profitability" | "accounting_cash_position"
  | "accounting_tax_reports" | "accounting_settings" | "accounting_files" | "accounting_general_journal" | "accounting_t_accounts" | "accounting_unit_costs" | "accounting_financial_reports"
  | "content_dashboard" | "content_plan" | "content_ideas"
  | "ads_dashboard"
  | "creator_dashboard" | "creator_accounts" | "creator_sales" | "creator_commissions" | "creator_payouts" | "creator_analytics" | "creator_free_samples";
type Workspace = "fulfilment" | "accounting" | "formal_accounting" | "creator" | "inventory" | "reports" | "content" | "ads" | "settings";
type SalesRange = "active" | "today" | "7d" | "30d" | "lifetime";
type SortKey = "orderNumber" | "importedAt" | "updatedAt";
type SortDirection = "asc" | "desc";
type SortChoice = `${SortKey}:${SortDirection}`;
type SourceFilter = "all" | "shopify" | "tiktok";
type CollectedMetric = "bankTransfer" | "stripeCollected" | "xenditCollected" | "totalCollected";
type DiscountMetric = "productDiscounted" | "shippingDiscounted";
type FeeMetric = "processingFees" | "shopifyFees" | "totalFees";
type FinancialReportType = "income_statement" | "balance_sheet" | "cash_summary";
type AccountingPeriodMode = "this_month" | "lifetime" | "custom";
type CashFlowActivity = "operating" | "investing" | "financing";
type TikTokCertificatePayload = ReturnType<typeof tikTokCertificateJson>;
type TikTokDetailFormEntry = {
  id: string;
  identifier: string;
  details: string;
  username: string;
  plushName: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  favouritePerson: string;
  belongsTo: string;
  meaningfulNote: string;
  fileDataUrl: string;
  fileName: string;
  fileType: string;
};
type FreeCreatorSample = {
  id: string;
  creatorName: string;
  creatorUrl: string;
  sampleCode: string;
  orderNumber?: string;
  givenAt: string;
  notes: string;
};
type StoredUiPreferences = {
  view?: View;
  query?: string;
  statusFilter?: "all" | OrderStatus;
  packingStatusFilter?: "all" | OrderStatus;
  envelopeStatusFilter?: "all" | OrderStatus;
  tikTokStatusFilter?: "all" | OrderStatus;
  sourceFilter?: SourceFilter;
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
type OtherIncomeSaleLine = {
  character: string;
  quantity: string;
  unitPrice: string;
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
type BookkeepingSectionKey = "inventory" | "expense" | "asset" | "marketing" | "otherIncome";
type BookkeepingCategoryForm = {
  section: BookkeepingSectionKey;
  name: string;
};
type SalesConsumptionMappingForm = {
  sku: string;
  inventoryItem: string;
  quantityPerSale: string;
};
type OperatingCostReleaseForm = {
  transactionDate: string;
  amount: string;
  description: string;
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
type BankStatementMatchForm = {
  businessEvent: string;
  accountName: string;
  notes: string;
};
type EnvelopeSlot = {
  order: Order | null;
  manualName: string;
  name: string;
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
    defaults: ["BILLY", "TOOTSIE", "HUNNIE", "DRAGON WARRIOR", "Packaging", "Carton Box", "Bubble wrap", "Carriage Inward", "Wax seal"],
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
  otherIncome: {
    label: "Other income accounts",
    singularLabel: "Other income account",
    reportSection: "Revenue",
    accountType: "revenue",
    parentAccount: "Revenue",
    sourceEntity: "Other income sale",
    defaults: ["Offline sales"],
  },
};
const prepaidOperatingCostAccountName = "Pre-paid Operating Cost";
const legacyPrepaidOperatingCostAccountNames = ["Prepaid Operating Expense", "Operating Costs"];
function isPrepaidOperatingCostAccountName(name: string) {
  return [prepaidOperatingCostAccountName, ...legacyPrepaidOperatingCostAccountNames].some((accountName) => accountName.toLowerCase() === name.toLowerCase());
}
function displayAccountingAccountName(name: string) {
  return isPrepaidOperatingCostAccountName(name) ? prepaidOperatingCostAccountName : name;
}
const businessEvents = [
  { group: "Money out", value: "inventory_purchase", label: "Inventory", transactionLabel: "Inventory Purchase", accountingMapping: "Inventory", accounts: ["BILLY", "TOOTSIE", "HUNNIE", "DRAGON WARRIOR", "Packaging", "Carton Box", "Bubble wrap", "Carriage Inward", "Wax seal"] },
  { group: "Money out", value: "expense", label: "Expenses", transactionLabel: "Expense", accountingMapping: "Expenses", accounts: ["Labour", "Samples", "JnT (Carriage Outwards)"] },
  { group: "Money out", value: "asset_purchase", label: "Assets", transactionLabel: "Asset Purchase", accountingMapping: "Assets", accounts: ["New asset"] },
  { group: "Money out", value: "marketing_expense", label: "Marketing", transactionLabel: "Marketing Expense", accountingMapping: "Marketing", accounts: ["Meta ads", "TikTok ads"] },
  { group: "Money in", value: "payment_processor_paid", label: "Cash", transactionLabel: "Cash", accountingMapping: "Cash", accounts: ["Bank Transfer", "Stripe", "Xendit", "Payment Processing Fees", "Owner's Equity", "Drawings"] },
  { group: "Money in", value: "other_income", label: "Other Income", transactionLabel: "Other Income", accountingMapping: "Other Income", accounts: ["Offline sales"] },
  { group: "Money out", value: "operating_cost", label: "Operating Cost", transactionLabel: "Operating Cost", accountingMapping: prepaidOperatingCostAccountName, accounts: [prepaidOperatingCostAccountName] },
] as const;
const rejectedInventoryOption = "Rejected Inventory";
const bookkeepingEventByView: Partial<Record<View, (typeof businessEvents)[number]["value"]>> = {
  accounting_transactions: "inventory_purchase",
  accounting_documents: "expense",
  accounting_balance_sheet: "asset_purchase",
  accounting_profit_loss: "marketing_expense",
  accounting_cash_flow: "payment_processor_paid",
  accounting_other_income: "other_income",
  accounting_operating_costs: "operating_cost",
};

const accountingPresetAccounts: Omit<AccountingCategory, "id" | "parentId" | "active">[] = [
  { name: "Bank Account", accountType: "asset", reportSection: "Current Assets", dataSourceType: "system_generated", sourceModule: "Payment Processor", sourceEntity: "Payouts", postingTrigger: "Payout Received", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Accounts Receivable", accountType: "asset", reportSection: "Current Assets", dataSourceType: "system_generated", sourceModule: "Shopify", sourceEntity: "Orders", postingTrigger: "Order Paid", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: "Payment Processors", accountType: "asset", reportSection: "Current Assets", dataSourceType: "system_generated", sourceModule: "Payment Processor", sourceEntity: "Processor Balances", postingTrigger: "Payment Received", allowSubAccounts: true, allowedTransactionTypes: [] },
  { name: "Inventory", accountType: "asset", reportSection: "Current Assets", dataSourceType: "hybrid", sourceModule: "Inventory", sourceEntity: "Inventory Items", postingTrigger: "Inventory Purchased", allowSubAccounts: true, allowedTransactionTypes: [] },
  { name: "Prepaid Expenses", accountType: "asset", reportSection: "Current Assets", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
  { name: prepaidOperatingCostAccountName, accountType: "asset", reportSection: "Current Assets", dataSourceType: "manual", sourceModule: "Book Keeping", sourceEntity: "Operating cost purchases", postingTrigger: "Manual Entry", allowSubAccounts: false, allowedTransactionTypes: [] },
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
  { name: "Operating Expense", accountType: "expense", reportSection: "Admin Fees", dataSourceType: "system_generated", sourceModule: "Fulfilment", sourceEntity: "Sales consumption mappings", postingTrigger: "Payment Received", allowSubAccounts: false, allowedTransactionTypes: [] },
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
const softwareExpenseAccountNames = manualExpenseAccounts
  .filter(([, section]) => section === "Software Expenses")
  .map(([name]) => name);
const expenseOptionReportSections = [
  bookkeepingSectionConfigs.expense.reportSection,
  "Software Expenses",
  "Admin Fees",
  "Salary",
  "Tax",
];
const cogsAccounts = ["Plushie Cost", "Speaker Cost", "Packaging Cost", "Shipping Cost", "Labour Cost", "NFC Cost", "Other Direct Costs"] as const;

const salesConsumptionMappingFormDefaults: SalesConsumptionMappingForm = {
  sku: "BILLY",
  inventoryItem: "",
  quantityPerSale: "1",
};
const defaultOtherIncomeSaleLines = (): OtherIncomeSaleLine[] => stockCharacters.map((character) => ({ character, quantity: "", unitPrice: "" }));

function normalizeAccountingItem(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

function inventoryAccountKey(value: string) {
  const normalized = normalizeAccountingItem(value);
  if (normalized === "PLUSH TOY") return "";
  const aliases: Record<string, string> = {
    "PLUSHIE SPEAKER": "SPEAKER",
    SPEAKERS: "SPEAKER",
    "NFC CARDS": "NFC CARD",
    "NFC CHIPS": "NFC CARD",
    BOXES: "CARTON BOX",
  };
  if (aliases[normalized]) return aliases[normalized];
  const character = stockCharacters.find((item) => normalized === item || normalized.includes(item));
  const isPlushSkinName = /\bPLUSH(?:IE)?\b/.test(normalized) || /\bSKIN\b/.test(normalized);
  if (character && (normalized === character || isPlushSkinName)) return character;
  const withoutPlushSkinWords = normalized.replace(/\bPLUSH(?:IE)?\b/g, "").replace(/\bSKIN\b/g, "").replace(/\s+/g, " ").trim();
  if (aliases[withoutPlushSkinWords]) return aliases[withoutPlushSkinWords];
  const exactCharacter = stockCharacters.find((item) => withoutPlushSkinWords === item);
  return exactCharacter ?? withoutPlushSkinWords;
}

function cogsAccountForInventoryItem(itemName: string) {
  const normalized = inventoryAccountKey(itemName);
  if (normalized.includes("SPEAKER") || normalized.includes("VOICE")) return "Speaker Cost";
  if (normalized.includes("NFC")) return "NFC Cost";
  if (normalized.includes("PACK") || normalized.includes("BOX") || normalized.includes("BUBBLE") || normalized.includes("WAX")) return "Packaging Cost";
  if (normalized.includes("SHIPPING") || normalized.includes("CARRIAGE")) return "Shipping Cost";
  if (normalized.includes("LABOUR") || normalized.includes("LABOR")) return "Labour Cost";
  if (stockCharacters.includes(normalized as (typeof stockCharacters)[number]) || normalized.includes("PLUSH")) return "Plushie Cost";
  return "Other Direct Costs";
}
const processorAccounts = ["Xendit", "Stripe", "TikTok Shop"] as const;

const fulfilmentViews: readonly View[] = ["orders", "fulfilment", "packing_slips", "print_envelope", "import", "tiktok_shop", "fulfilled"];
const accountingViews: readonly View[] = [
  "accounting_dashboard",
  "accounting_bank_reconciliation",
  "accounting_transactions",
  "accounting_csv_import",
  "accounting_payable",
  "accounting_files",
  "accounting_documents",
  "accounting_balance_sheet",
  "accounting_profit_loss",
  "accounting_cash_flow",
  "accounting_other_income",
  "accounting_operating_costs",
  "accounting_settings",
];
const formalAccountingViews: readonly View[] = ["accounting_general_journal", "accounting_t_accounts", "accounting_unit_costs", "accounting_financial_reports"];
const contentViews: readonly View[] = ["content_dashboard", "content_plan", "content_ideas"];
const adsViews: readonly View[] = ["ads_dashboard"];
const creatorViews: readonly View[] = ["creator_dashboard", "creator_accounts", "creator_sales", "creator_commissions", "creator_payouts", "creator_analytics", "creator_free_samples"];
const creatorAdminViews: readonly View[] = ["creator_accounts", "creator_sales", "creator_commissions", "creator_payouts", "creator_analytics", "creator_free_samples"];
const dashboardViews: readonly View[] = [...fulfilmentViews, "history", "settings", "meta_capi", "stock", "sales_report", ...accountingViews, ...formalAccountingViews, ...contentViews, ...adsViews, ...creatorViews];
const adminOnlyViews = new Set<View>(["history", "settings", "meta_capi", "stock", "sales_report", ...accountingViews, ...formalAccountingViews, ...contentViews, ...adsViews, ...creatorAdminViews]);
const workspaceDefaultViews: Record<Workspace, View> = {
  fulfilment: "orders",
  accounting: "accounting_dashboard",
  formal_accounting: "accounting_general_journal",
  creator: "creator_dashboard",
  inventory: "stock",
  reports: "sales_report",
  content: "content_dashboard",
  ads: "ads_dashboard",
  settings: "settings",
};
const workspaceLabels: Record<Workspace, string> = {
  fulfilment: "Fulfilment",
  accounting: "Book Keeping",
  formal_accounting: "Accounting",
  creator: "Creator Program",
  inventory: "Inventory",
  reports: "Reports",
  content: "Content Plan",
  ads: "Ads",
  settings: "Settings",
};
const orderStatusFilterValues = ["all", ...orderStatuses] as const;
const sourceFilterValues = ["all", "shopify", "tiktok"] as const;
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
const freeCreatorSamplesStorageKey = "meaningful-plushies-free-creator-samples";
const freeCreatorSampleProductLink = "https://meaningfulplushies.com/products/meanngful-plushie";
const defaultMetaCapiSettings: MetaCapiSettings = { enabled: false, purchaseMode: "manual_only", testEventCode: "", pixelId: "", browserPixelEnabled: false, trackingNotes: "" };
const defaultMetaAdsEnvironment: MetaAdsEnvironment = { adAccountConfigured: false, tokenConfigured: false, tokenMasked: "", graphVersion: "v20.0" };
const defaultMetaAdsSummary: MetaAdsSummary = { spend: 0, purchases: 0, revenue: 0, roas: 0, cpa: 0, impressions: 0, clicks: 0, linkClicks: 0 };
const shopifyStorefrontUrl = process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_URL || "https://meaningfulplushies.com";
const influencerOrderPagePath = process.env.NEXT_PUBLIC_INFLUENCER_ORDER_PAGE_PATH || "/products/build-your-meaningful-plushie";
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

function creatorFreeOrderCode(profile: CreatorProfile) {
  const base = (profile.discountCode || profile.email || profile.displayName || "CREATOR")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.startsWith("FREE-") ? base : `FREE-${base || "CREATOR"}`;
}

function creatorFreeOrderLink(profile: CreatorProfile) {
  const store = shopifyStorefrontUrl.replace(/\/+$/, "") || "https://meaningfulplushies.com";
  const path = influencerOrderPagePath.startsWith("/") ? influencerOrderPagePath : `/${influencerOrderPagePath}`;
  const redirect = `${path}${path.includes("?") ? "&" : "?"}creator=${encodeURIComponent(profile.discountCode || profile.email || profile.displayName)}`;
  const url = new URL(`/discount/${encodeURIComponent(creatorFreeOrderCode(profile))}`, store);
  url.searchParams.set("redirect", redirect);
  return url.toString();
}

function emptyTikTokDetailEntry(): TikTokDetailFormEntry {
  return {
    id: crypto.randomUUID(),
    identifier: "",
    details: "",
    username: "",
    plushName: "",
    gender: "",
    birthDate: "",
    birthPlace: "",
    favouritePerson: "",
    belongsTo: "",
    meaningfulNote: "",
    fileDataUrl: "",
    fileName: "",
    fileType: "",
  };
}

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
  { view: "tiktok_shop", label: "TikTok Shop", icon: "report" },
];

const fulfilmentAdminNavItems: NavItem[] = [
  { view: "sales_report", label: "Sales Report", icon: "report" },
];

const accountingNavItems: NavItem[] = [
  { view: "accounting_dashboard", label: "Book Keeping Book", icon: "ledger" },
  { view: "accounting_payable", label: "Unsettled Payments", icon: "cash" },
  { view: "accounting_files", label: "Files", icon: "documents" },
  { view: "accounting_bank_reconciliation", label: "Bank Statement", icon: "cash" },
  { view: "accounting_csv_import", label: "CSV Import", icon: "import" },
  { view: "accounting_transactions", label: "Inventory", icon: "stock" },
  { view: "accounting_documents", label: "Expenses", icon: "documents" },
  { view: "accounting_balance_sheet", label: "Assets", icon: "accounting" },
  { view: "accounting_profit_loss", label: "Marketing", icon: "report" },
  { view: "accounting_cash_flow", label: "Cash", icon: "cash" },
  { view: "accounting_other_income", label: "Other Income", icon: "cash" },
  { view: "accounting_operating_costs", label: "Operating Cost", icon: "ledger" },
  { view: "accounting_settings", label: "Book Keeping Settings", icon: "settings" },
];
const formalAccountingNavItems: NavItem[] = [
  { view: "accounting_general_journal", label: "General Journal", icon: "ledger" },
  { view: "accounting_t_accounts", label: "T Accounts", icon: "accounting" },
  { view: "accounting_unit_costs", label: "Unit Costs", icon: "stock" },
  { view: "accounting_financial_reports", label: "Financial Reports", icon: "report" },
];

const creatorNavItems: NavItem[] = [
  { view: "creator_dashboard", label: "Creator Dashboard", icon: "creator" },
];

const creatorAdminNavItems: NavItem[] = [
  { view: "creator_dashboard", label: "Overview", icon: "creator" },
  { view: "creator_accounts", label: "Creator Accounts", icon: "creator" },
  { view: "creator_sales", label: "Creator Sales", icon: "report" },
  { view: "creator_commissions", label: "Commissions", icon: "cash" },
  { view: "creator_payouts", label: "Payouts", icon: "cash" },
  { view: "creator_free_samples", label: "Free Creator Sample", icon: "report" },
  { view: "creator_analytics", label: "Analytics", icon: "ledger" },
];

const inventoryNavItems: NavItem[] = [{ view: "stock", label: "Stock Count", icon: "stock" }];
const reportsNavItems: NavItem[] = [{ view: "sales_report", label: "Sales Report", icon: "report" }];
const contentNavItems: NavItem[] = [
  { view: "content_dashboard", label: "Dashboard", icon: "report" },
  { view: "content_plan", label: "Planned Content", icon: "calendar" },
  { view: "content_ideas", label: "Idea Brainstorming", icon: "idea" },
];
const adsNavItems: NavItem[] = [
  { view: "ads_dashboard", label: "Ads Dashboard", icon: "report" },
];
const settingsNavItems: NavItem[] = [
  { view: "settings", label: "Fulfilment Settings", icon: "settings" },
  { view: "meta_capi", label: "Meta CAPI", icon: "report" },
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

function formatMonthLabel(value: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value || "this month";
  return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(date);
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

function printView(className: "print-packing" | "print-sales-report" | "print-financial-report" | "print-bank-statement" | "print-bookkeeping-ledger") {
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

function tikTokShortOrderLabel(order: Order) {
  const match = order.orderNumber.match(/\b(TT\d+)\b\s+(\d+)/i);
  if (!match) return orderLabel(order);
  return `#${match[1].toUpperCase()} ${match[2].slice(-4)}`;
}

function packingSlipOrderLabel(order: Order) {
  return order.salesChannel === "tiktok" ? tikTokShortOrderLabel(order) : orderLabel(order);
}

function meaningfulMessageLink(order: Order) {
  return order.salesChannel === "tiktok" ? order.tikTokFileDataUrl || "" : order.meaningfulMessage || "";
}

function meaningfulMessageDownloadName(order: Order) {
  if (order.salesChannel !== "tiktok" || !order.tikTokFileDataUrl) return undefined;
  return order.tikTokFileName || `${tikTokShortOrderLabel(order).replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-message`;
}

function orderSourceMatches(order: Order, source: SourceFilter) {
  if (source === "all") return true;
  return (order.salesChannel ?? "shopify") === source;
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

function orderSortNumber(value: string) {
  const tikTokMatch = value.match(/\bTT(\d+)\b/i);
  if (tikTokMatch) return Number(tikTokMatch[1]);
  const digits = value.match(/\d+/)?.[0] ?? "";
  return digits ? Number(digits) : 0;
}

function sortOrderRecords<T extends Pick<Order, "orderNumber" | "importedAt" | "updatedAt" | "setIndicator">>(
  records: T[], key: SortKey, direction: SortDirection,
) {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...records].sort((a, b) => {
    if (key === "orderNumber") {
      const orderComparison = multiplier * (orderSortNumber(a.orderNumber) - orderSortNumber(b.orderNumber));
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
  if (!session?.token || !session.username || !session.displayName || !["admin", "staff", "creator"].includes(session.role)) return null;
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
  if (role === "creator") return creatorNavItems.some((item) => item.view === view) ? view : "creator_dashboard";
  return role === "staff" && adminOnlyViews.has(view) ? "orders" : view;
}

function workspaceForView(view: View): Workspace {
  if (creatorViews.includes(view)) return "creator";
  if (adsViews.includes(view)) return "ads";
  if (contentViews.includes(view)) return "content";
  if (formalAccountingViews.includes(view)) return "formal_accounting";
  if (accountingViews.includes(view)) return "accounting";
  if (view === "stock") return "inventory";
  if (view === "sales_report") return "reports";
  if (view === "history" || view === "settings" || view === "meta_capi") return "settings";
  return "fulfilment";
}

function navItemsForWorkspace(workspace: Workspace, role: UserRole): NavItem[] {
  if (role === "creator") return creatorNavItems;
  if (role !== "admin") return fulfilmentNavItems;
  if (workspace === "accounting") return accountingNavItems;
  if (workspace === "formal_accounting") return formalAccountingNavItems;
  if (workspace === "creator") return creatorAdminNavItems;
  if (workspace === "inventory") return inventoryNavItems;
  if (workspace === "reports") return reportsNavItems;
  if (workspace === "content") return contentNavItems;
  if (workspace === "ads") return adsNavItems;
  if (workspace === "settings") return settingsNavItems;
  return [...fulfilmentNavItems, ...fulfilmentAdminNavItems];
}

function viewTitle(view: View) {
  const titleOverrides: Partial<Record<View, string>> = {
    orders: "Orders Dashboard",
    import: "Import Shopify Orders",
    tiktok_shop: "TikTok Shop",
    fulfilled: "Shipped Orders",
    history: "Activity History",
    meta_capi: "Meta Conversions API",
    content_dashboard: "Content Dashboard",
    content_plan: "Planned Content",
    content_ideas: "Idea Brainstorming",
    ads_dashboard: "Ads Dashboard",
  };
  if (titleOverrides[view]) return titleOverrides[view]!;
  const item = [...fulfilmentNavItems, ...fulfilmentAdminNavItems, ...accountingNavItems, ...formalAccountingNavItems, ...creatorAdminNavItems, ...inventoryNavItems, ...reportsNavItems, ...contentNavItems, ...adsNavItems, ...settingsNavItems]
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
  const [tikTokStatusFilter, setTikTokStatusFilter] = useState<"all" | OrderStatus>(() => choice(storedUi.tikTokStatusFilter, "all", orderStatusFilterValues));
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>(() => choice(storedUi.sourceFilter, "all", sourceFilterValues));
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
  const [metaCapiSettings, setMetaCapiSettings] = useState<MetaCapiSettings>(defaultMetaCapiSettings);
  const [metaCapiLogs, setMetaCapiLogs] = useState<MetaCapiLog[]>([]);
  const [metaCapiEnvironment, setMetaCapiEnvironment] = useState({ pixelConfigured: false, tokenConfigured: false, tokenMasked: "", testEventCodeConfigured: false });
  const [metaCapiRetryOrders, setMetaCapiRetryOrders] = useState("");
  const [metaCapiBusy, setMetaCapiBusy] = useState("");
  const [metaAdsStartDate, setMetaAdsStartDate] = useState(() => monthStartKey());
  const [metaAdsEndDate, setMetaAdsEndDate] = useState(() => localDateKey(new Date()));
  const [metaAdsEnvironment, setMetaAdsEnvironment] = useState<MetaAdsEnvironment>(defaultMetaAdsEnvironment);
  const [metaAdsSummary, setMetaAdsSummary] = useState<MetaAdsSummary>(defaultMetaAdsSummary);
  const [metaAdsInsights, setMetaAdsInsights] = useState<MetaAdsInsight[]>([]);
  const [metaAdsConfigured, setMetaAdsConfigured] = useState(false);
  const [metaAdsLoading, setMetaAdsLoading] = useState(false);
  const [metaAdsError, setMetaAdsError] = useState("");
  const [stockSettings, setStockSettings] = useState<StockSetting[]>([]);
  const [accounts, setAccounts] = useState<DashboardAccount[]>([]);
  const [accountingCategories, setAccountingCategories] = useState<AccountingCategory[]>([]);
  const [accountingDocuments, setAccountingDocuments] = useState<AccountingDocument[]>([]);
  const [accountingTransactions, setAccountingTransactions] = useState<AccountingTransaction[]>([]);
  const [accountingLedgerEntries, setAccountingLedgerEntries] = useState<AccountingLedgerEntry[]>([]);
  const [bankStatementLines, setBankStatementLines] = useState<AccountingBankStatementLine[]>([]);
  const [salesConsumptionMappings, setSalesConsumptionMappings] = useState<SalesConsumptionMapping[]>([]);
  const [contentPlanItems, setContentPlanItems] = useState<ContentPlanItem[]>([]);
  const [contentIdeas, setContentIdeas] = useState<ContentIdeaItem[]>([]);
  const [accountingDocumentFile, setAccountingDocumentFile] = useState<File | null>(null);
  const [transactionDocumentFile, setTransactionDocumentFile] = useState<File | null>(null);
  const [editingTransactionId, setEditingTransactionId] = useState("");
  const [editingTransactionForm, setEditingTransactionForm] = useState<AccountingTransactionForm | null>(null);
  const [editingTransactionFile, setEditingTransactionFile] = useState<File | null>(null);
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
  const [otherIncomeSaleLines, setOtherIncomeSaleLines] = useState<OtherIncomeSaleLine[]>(defaultOtherIncomeSaleLines);
  const [salesConsumptionMappingForm, setSalesConsumptionMappingForm] = useState<SalesConsumptionMappingForm>(salesConsumptionMappingFormDefaults);
  const [operatingCostReleaseForm, setOperatingCostReleaseForm] = useState<OperatingCostReleaseForm>(() => ({ transactionDate: dateKey(new Date().toISOString()), amount: "", description: "" }));
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
  const [bankStatementCsv, setBankStatementCsv] = useState("");
  const [bankStatementFileName, setBankStatementFileName] = useState("");
  const [bankStatementMatchForms, setBankStatementMatchForms] = useState<Record<string, BankStatementMatchForm>>({});
  const [inventoryCostManualFields, setInventoryCostManualFields] = useState<InventoryCostField[]>([]);
  const [accountPasswords, setAccountPasswords] = useState<Record<string, string>>({});
  const [newAccount, setNewAccount] = useState({ username: "", displayName: "", role: "staff" as UserRole, password: "" });
  const [creatorProfiles, setCreatorProfiles] = useState<CreatorProfile[]>([]);
  const [creatorCommissions, setCreatorCommissions] = useState<CreatorCommission[]>([]);
  const [creatorPayouts, setCreatorPayouts] = useState<CreatorPayout[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [draggedColumn, setDraggedColumn] = useState<FulfilmentColumn | null>(null);
  const [fulfilmentColumns, setFulfilmentColumns] = useState<FulfilmentColumn[]>(() => cleanFulfilmentColumns(storedUi.fulfilmentColumns));
  const [manualOrderIds, setManualOrderIds] = useState("");
  const [manualEnvelopeIds, setManualEnvelopeIds] = useState("");
  const [manualEnvelopeNames, setManualEnvelopeNames] = useState<Record<number, string>>({});
  const [envelopePrintSettings, setEnvelopePrintSettings] = useState<EnvelopePrintSettings>(() => storedEnvelopeSettings);
  const [envelopeSettingsLoaded, setEnvelopeSettingsLoaded] = useState(false);
  const [orderCsv, setOrderCsv] = useState("");
  const [metafieldCsv, setMetafieldCsv] = useState("");
  const [tikTokCsv, setTikTokCsv] = useState("");
  const [tikTokDetailEntries, setTikTokDetailEntries] = useState<TikTokDetailFormEntry[]>(() => [emptyTikTokDetailEntry()]);
  const [selectedTikTokJsonOrders, setSelectedTikTokJsonOrders] = useState<string[]>([]);
  const [exportingTikTokShopify, setExportingTikTokShopify] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [refreshingOrderNumber, setRefreshingOrderNumber] = useState("");

  const normalizeSharedOrders = useCallback((sharedOrders: Order[]) => sharedOrders.map((order) => {
    const status = legacyStatus[order.status] ?? order.status;
    return {
      ...order,
      salesChannel: order.salesChannel ?? "shopify",
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
      discountCodes: order.discountCodes ?? (order.discountCodeUsed ? [order.discountCodeUsed] : []),
      discountCodeUsed: order.discountCodeUsed ?? "",
      creatorFreeOrder: order.creatorFreeOrder ?? false,
      shippingMethod: order.shippingMethod ?? "",
      setIndicator: order.setIndicator ?? "",
      idWebsiteLink: order.idWebsiteLink ?? "",
      statusHistory: (order.statusHistory ?? []).map((event) => ({
        ...event,
        status: legacyStatus[event.status] ?? event.status,
      })),
    };
  }), []);

  const normalizeSalesConsumptionMappings = useCallback((mappings: SalesConsumptionMapping[]) => mappings.map((mapping) => ({
    ...mapping,
    inventoryItem: inventoryAccountKey(mapping.inventoryItem),
  })), []);

  const loadSharedData = useCallback(async (showLoading = false) => {
    if (!supabaseConfigured) {
      setDatabaseError("Supabase is not configured. Add the public Supabase URL and anon key in Vercel.");
      setLoadingOrders(false);
      return;
    }
    if (showLoading) setLoadingOrders(true);
    try {
      const [sharedOrders, sharedProcessorSettings, sharedSalesFeeSettings] = await Promise.all([
        fetchSharedOrders(),
        fetchPaymentProcessorSettings(),
        fetchSalesFeeSettings(),
      ]);
      setOrders(normalizeSharedOrders(sharedOrders));
      setProcessorSettings(sharedProcessorSettings);
      setSalesFeeSettings(sharedSalesFeeSettings);
      setDatabaseError("");
      setLoadingOrders(false);

      const [
        sharedActivity,
        sharedStockSettings,
        sharedAccountingCategories,
        sharedAccountingDocuments,
        sharedAccountingTransactions,
        sharedAccountingLedgerEntries,
        sharedBankStatementLines,
        sharedSalesConsumptionMappings,
        sharedContentPlanItems,
        sharedContentIdeas,
        sharedEnvelopePrintSettings,
        sharedMetaCapiSettings,
        sharedMetaCapiLogs,
      ] = await Promise.all([
        fetchSharedActivity(), fetchStockSettings(),
        fetchAccountingCategories(), fetchAccountingDocuments(), fetchAccountingTransactions(), fetchAccountingLedgerEntries(), fetchAccountingBankStatementLines(), fetchSalesConsumptionMappings(), fetchContentPlanItems(), fetchContentIdeas(), fetchEnvelopePrintSettings(), fetchMetaCapiSettings(), fetchMetaCapiLogs(),
      ]);
      setActivity(sharedActivity);
      setStockSettings(sharedStockSettings);
      setAccountingCategories(sharedAccountingCategories);
      setAccountingDocuments(sharedAccountingDocuments);
      setAccountingTransactions(sharedAccountingTransactions);
      setAccountingLedgerEntries(sharedAccountingLedgerEntries);
      setBankStatementLines(sharedBankStatementLines);
      setSalesConsumptionMappings(normalizeSalesConsumptionMappings(sharedSalesConsumptionMappings));
      setContentPlanItems(sharedContentPlanItems);
      setContentIdeas(sharedContentIdeas);
      setEnvelopePrintSettings({ ...defaultEnvelopePrintSettings, ...readStoredEnvelopeSettings(), ...sharedEnvelopePrintSettings });
      setMetaCapiSettings(sharedMetaCapiSettings);
      setMetaCapiLogs(sharedMetaCapiLogs);
      setEnvelopeSettingsLoaded(true);
      setDatabaseError("");
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : "Could not load shared data from Supabase.");
    } finally {
      setLoadingOrders(false);
    }
  }, [normalizeSalesConsumptionMappings, normalizeSharedOrders]);

  const loadChangedSharedData = useCallback(async (changedTables: string[]) => {
    if (!supabaseConfigured || !changedTables.length) return;
    const tables = new Set(changedTables);
    try {
      await Promise.all([
        tables.has("fulfilment_orders") ? fetchSharedOrders().then((sharedOrders) => setOrders(normalizeSharedOrders(sharedOrders))) : Promise.resolve(),
        tables.has("activity_events") ? fetchSharedActivity().then(setActivity) : Promise.resolve(),
        tables.has("payment_processor_settings") ? fetchPaymentProcessorSettings().then(setProcessorSettings) : Promise.resolve(),
        tables.has("sales_fee_settings") ? fetchSalesFeeSettings().then(setSalesFeeSettings) : Promise.resolve(),
        tables.has("stock_settings") ? fetchStockSettings().then(setStockSettings) : Promise.resolve(),
        tables.has("sales_consumption_mappings") ? fetchSalesConsumptionMappings().then((mappings) => setSalesConsumptionMappings(normalizeSalesConsumptionMappings(mappings))) : Promise.resolve(),
        tables.has("accounting_categories") ? fetchAccountingCategories().then(setAccountingCategories) : Promise.resolve(),
        tables.has("accounting_documents") ? fetchAccountingDocuments().then(setAccountingDocuments) : Promise.resolve(),
        tables.has("accounting_transactions") ? fetchAccountingTransactions().then(setAccountingTransactions) : Promise.resolve(),
        tables.has("accounting_ledger_entries") ? fetchAccountingLedgerEntries().then(setAccountingLedgerEntries) : Promise.resolve(),
        tables.has("accounting_bank_statement_lines") ? fetchAccountingBankStatementLines().then(setBankStatementLines) : Promise.resolve(),
        tables.has("content_plan_items") ? fetchContentPlanItems().then(setContentPlanItems) : Promise.resolve(),
        tables.has("content_idea_items") ? fetchContentIdeas().then(setContentIdeas) : Promise.resolve(),
        tables.has("meta_capi_settings") ? fetchMetaCapiSettings().then(setMetaCapiSettings) : Promise.resolve(),
        tables.has("meta_capi_logs") ? fetchMetaCapiLogs().then(setMetaCapiLogs) : Promise.resolve(),
        tables.has("envelope_print_settings") ? fetchEnvelopePrintSettings().then((settings) => {
          setEnvelopePrintSettings({ ...defaultEnvelopePrintSettings, ...readStoredEnvelopeSettings(), ...settings });
          setEnvelopeSettingsLoaded(true);
        }) : Promise.resolve(),
        (tables.has("creator_profiles") && session && (session.role === "admin" || session.role === "creator")) ? fetchCreatorProfiles(session.token).then(setCreatorProfiles) : Promise.resolve(),
        (tables.has("creator_commissions") && session && (session.role === "admin" || session.role === "creator")) ? fetchCreatorCommissions(session.token).then(setCreatorCommissions) : Promise.resolve(),
        (tables.has("creator_payouts") && session && (session.role === "admin" || session.role === "creator")) ? fetchCreatorPayouts(session.token).then(setCreatorPayouts) : Promise.resolve(),
      ]);
      setDatabaseError("");
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : "Could not refresh the latest Supabase changes.");
    }
  }, [normalizeSalesConsumptionMappings, normalizeSharedOrders, session]);

  useEffect(() => {
    void loadSharedData(true);
    if (!supabaseConfigured) return;
    const changedTables = new Set<string>();
    let refreshTimer: number | undefined;
    const flushChanges = () => {
      const tables = Array.from(changedTables);
      changedTables.clear();
      refreshTimer = undefined;
      void loadChangedSharedData(tables);
    };
    const unsubscribe = subscribeToSharedData((table) => {
      changedTables.add(table);
      if (refreshTimer) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(flushChanges, 800);
    });
    return () => {
      if (refreshTimer) window.clearTimeout(refreshTimer);
      unsubscribe();
    };
  }, [loadChangedSharedData, loadSharedData]);

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
      tikTokStatusFilter,
      sourceFilter,
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
    tikTokStatusFilter,
    sourceFilter,
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
    if (!envelopeSettingsLoaded || !supabaseConfigured) return;
    const saveTimer = window.setTimeout(() => {
      void saveEnvelopePrintSettings(envelopePrintSettings).catch((error) => {
        setNotice(error instanceof Error ? `Envelope print settings could not be saved: ${error.message}` : "Envelope print settings could not be saved.");
      });
    }, 500);
    return () => window.clearTimeout(saveTimer);
  }, [envelopePrintSettings, envelopeSettingsLoaded]);

  useEffect(() => {
    if (session?.role !== "admin") return;
    void fetchDashboardAccounts(session.token).then(setAccounts).catch((error) => setNotice(error instanceof Error ? error.message : "Accounts could not be loaded."));
    void reloadMetaCapiStatus().catch((error) => setNotice(readableError(error, "Meta CAPI status could not be loaded.")));
  }, [session]);

  useEffect(() => {
    if (session?.role === "staff" && adminOnlyViews.has(view)) setView("orders");
    if (session?.role === "creator" && !creatorViews.includes(view)) setView("creator_dashboard");
  }, [session, view]);

  const loadCreatorData = useCallback(async () => {
    if (!session || !supabaseConfigured || (session.role !== "admin" && session.role !== "creator")) return;
    const [profiles, commissions, payouts] = await Promise.all([
      fetchCreatorProfiles(session.token),
      fetchCreatorCommissions(session.token),
      fetchCreatorPayouts(session.token),
    ]);
    setCreatorProfiles(profiles);
    setCreatorCommissions(commissions);
    setCreatorPayouts(payouts);
  }, [session]);

  useEffect(() => {
    void loadCreatorData().catch((error) => setNotice(error instanceof Error ? error.message : "Creator Program could not be loaded."));
  }, [loadCreatorData]);

  useEffect(() => {
    if (session?.role !== "admin" || workspaceForView(view) !== "ads") return;
    void loadMetaAdsDashboard();
  }, [session?.role, view, metaAdsStartDate, metaAdsEndDate]);

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
  const manualEnvelopeLastIndex = Math.max(-1, ...Object.entries(manualEnvelopeNames)
    .filter(([, name]) => name.trim())
    .map(([index]) => Number(index)));
  const envelopeSlotCount = Math.max(envelopeOrders.length, manualEnvelopeLastIndex + 1);
  const envelopePageCount = Math.ceil(envelopeSlotCount / 2);
  const envelopeSlots: EnvelopeSlot[] = Array.from({ length: envelopePageCount * 2 }, (_, index) => {
    const order = envelopeOrders[index] ?? null;
    const manualName = manualEnvelopeNames[index] ?? "";
    const name = (order?.plushName || manualName).replace(/\s+/g, " ").trim();
    return { order, manualName, name };
  });
  const envelopePages = Array.from({ length: envelopePageCount }, (_, index) => envelopeSlots.slice(index * 2, index * 2 + 2));
  const envelopePrintableNames = envelopeSlots.map((slot) => slot.name).filter(Boolean);
  const packingAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => orderSourceMatches(order, sourceFilter) && (packingStatusFilter === "all" || order.status === packingStatusFilter)),
    "orderNumber",
    "desc",
  ), [orders, packingStatusFilter, sourceFilter]);
  const envelopeAvailableOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => orderSourceMatches(order, sourceFilter) && (envelopeStatusFilter === "all" || order.status === envelopeStatusFilter)),
    "orderNumber",
    "desc",
  ), [orders, envelopeStatusFilter, sourceFilter]);
  const filtered = useMemo(() => {
    const source = view === "fulfilled" ? orders.filter((order) => order.status === "shipped") : orders;
    const search = query.trim().toLowerCase();
    const matching = source
      .filter((order) => orderSourceMatches(order, sourceFilter))
      .filter((order) => statusFilter === "all" || order.status === statusFilter)
      .filter((order) => !search || [order.orderNumber, order.customerName, order.phone, order.trackingNumber, order.plushName, order.product, order.character, order.shippingMethod]
        .join(" ").toLowerCase().includes(search));
    return sortOrderRecords(matching, sortKey, sortDirection);
  }, [orders, query, sourceFilter, statusFilter, view, sortKey, sortDirection]);
  const selectedShopifyOrderCount = useMemo(() => new Set(orders
    .filter((order) => selectedOrders.includes(order.id) && (order.salesChannel ?? "shopify") === "shopify")
    .map((order) => order.orderNumber)).size, [orders, selectedOrders]);
  const selectedTikTokOrderCount = useMemo(() => new Set(orders
    .filter((order) => selectedOrders.includes(order.id) && order.salesChannel === "tiktok")
    .map((order) => tiktokOrderIdFromOrder(order))).size, [orders, selectedOrders]);

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
  const tikTokOrders = useMemo(() => sortOrderRecords(
    orders.filter((order) => order.salesChannel === "tiktok"),
    "orderNumber",
    "asc",
  ), [orders]);
  const tikTokAvailableOrders = useMemo(() => sortOrderRecords(
    tikTokOrders.filter((order) => tikTokStatusFilter === "all" || order.status === tikTokStatusFilter),
    "orderNumber",
    "desc",
  ), [tikTokOrders, tikTokStatusFilter]);
  const selectedTikTokCertificatePayload = useMemo<TikTokCertificatePayload[]>(() => tikTokOrders
    .filter((order) => selectedTikTokJsonOrders.includes(order.id))
    .map(tikTokCertificateJson), [tikTokOrders, selectedTikTokJsonOrders]);
  const selectedTikTokCertificateJson = useMemo(() => JSON.stringify(selectedTikTokCertificatePayload, null, 2), [selectedTikTokCertificatePayload]);
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
  const otherIncomeCharacterSales = useMemo(() => accountingTransactions
    .filter((transaction) => transaction.businessEvent === "other_income")
    .reduce<Partial<Record<(typeof stockCharacters)[number], number>>>((totals, transaction) => {
      const character = inventoryAccountKey(transaction.supplier) as (typeof stockCharacters)[number];
      if (stockCharacters.includes(character)) totals[character] = (totals[character] ?? 0) + (Number(transaction.quantity) || 0);
      return totals;
    }, {}), [accountingTransactions]);
  const stock = useMemo(() => summarizeStock(orders, stockSettings, otherIncomeCharacterSales), [orders, stockSettings, otherIncomeCharacterSales]);
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

  async function refreshShopifyOrderNumbers(orderNumbers: string[]) {
    const uniqueOrderNumbers = [...new Set(orderNumbers.filter(Boolean))];
    if (!uniqueOrderNumbers.length) {
      setNotice("Select at least one Shopify order to refresh.");
      return;
    }
    setRefreshingOrderNumber(uniqueOrderNumbers.length === 1 ? uniqueOrderNumbers[0] : "bulk");
    try {
      const response = await fetch("/api/shopify/orders/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumbers: uniqueOrderNumbers }),
      });
      const result = await response.json() as { ok?: boolean; changed?: boolean; updated?: number; checked?: number; failed?: number; error?: string; results?: { ok?: boolean; error?: string }[] };
      if (!response.ok || !result.ok) throw new Error(result.error || "Shopify refresh failed.");
      await loadSharedData(false);
      const prefix = uniqueOrderNumbers.length === 1 ? `#${uniqueOrderNumbers[0]}` : `${uniqueOrderNumbers.length} Shopify orders`;
      const failureReason = result.results?.find((item) => !item.ok)?.error;
      const failureText = result.failed ? ` ${result.failed} could not be refreshed${failureReason ? `: ${failureReason}` : "."}` : "";
      setNotice(result.changed
        ? `${prefix} refreshed from Shopify. ${result.updated ?? 0} fulfilment row${result.updated === 1 ? "" : "s"} updated.${failureText}`
        : result.failed
          ? `${prefix} checked against Shopify.${failureText}`
          : `${prefix} checked against Shopify. No differences found.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Shopify order could not be refreshed.");
    } finally {
      setRefreshingOrderNumber("");
    }
  }

  async function refreshShopifyOrder(order: Order) {
    if ((order.salesChannel ?? "shopify") !== "shopify") {
      setNotice("Only Shopify orders can be refreshed from Shopify.");
      return;
    }
    await refreshShopifyOrderNumbers([order.orderNumber]);
  }

  async function bulkRefreshShopifyOrders() {
    const selectedShopifyOrderNumbers = orders
      .filter((order) => selectedOrders.includes(order.id) && (order.salesChannel ?? "shopify") === "shopify")
      .map((order) => order.orderNumber);
    await refreshShopifyOrderNumbers(selectedShopifyOrderNumbers);
  }

  function tiktokOrderIdFromOrder(order: Order) {
    if (order.id.startsWith("tiktok-")) return order.id.replace(/^tiktok-/, "");
    return order.orderNumber.match(/\bTT\d+\s+(\d{8,})\b/i)?.[1] ?? "";
  }

  async function refreshTikTokOrderIds(orderIds: string[]) {
    const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
    if (!uniqueOrderIds.length) {
      setNotice("Select at least one TikTok order to refresh.");
      return;
    }
    setRefreshingOrderNumber(uniqueOrderIds.length === 1 ? uniqueOrderIds[0] : "tiktok-bulk");
    try {
      const response = await fetch("/api/tiktok/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: uniqueOrderIds }),
      });
      const result = await response.json() as { ok?: boolean; changed?: boolean; updated?: number; checked?: number; failed?: number; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "TikTok sync failed.");
      await loadSharedData(false);
      const prefix = uniqueOrderIds.length === 1 ? `TikTok order ${uniqueOrderIds[0]}` : `${uniqueOrderIds.length} TikTok orders`;
      const failureText = result.failed ? ` ${result.failed} could not be synced.` : "";
      setNotice(result.changed
        ? `${prefix} synced. ${result.updated ?? 0} fulfilment row${result.updated === 1 ? "" : "s"} updated. Plushie details still need manual input.${failureText}`
        : `${prefix} checked. No differences found.${failureText}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "TikTok order could not be synced.");
    } finally {
      setRefreshingOrderNumber("");
    }
  }

  async function refreshTikTokOrder(order: Order) {
    if (order.salesChannel !== "tiktok") {
      setNotice("Only TikTok Shop orders can be refreshed from TikTok.");
      return;
    }
    await refreshTikTokOrderIds([tiktokOrderIdFromOrder(order)]);
  }

  async function bulkRefreshTikTokOrders() {
    const selectedTikTokOrderIds = orders
      .filter((order) => selectedOrders.includes(order.id) && order.salesChannel === "tiktok")
      .map(tiktokOrderIdFromOrder);
    await refreshTikTokOrderIds(selectedTikTokOrderIds);
  }

  async function copyTikTokCertificateJson() {
    await navigator.clipboard.writeText(selectedTikTokCertificateJson);
    setNotice(`${selectedTikTokCertificatePayload.length} TikTok JSON ${selectedTikTokCertificatePayload.length === 1 ? "entry" : "entries"} copied.`);
  }

  async function exportTikTokCertificateJsonToShopify() {
    if (!selectedTikTokCertificatePayload.length) {
      setNotice("Select at least one TikTok order before exporting to Shopify.");
      return;
    }
    setExportingTikTokShopify(true);
    try {
      const response = await fetch("/api/shopify/tiktok-certificates/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: selectedTikTokCertificatePayload }),
      });
      const result = await response.json() as { ok?: boolean; error?: string; uploadDate?: string; count?: number };
      if (!response.ok || !result.ok) throw new Error(result.error || "TikTok JSON could not be exported to Shopify.");
      const count = result.count ?? selectedTikTokCertificatePayload.length;
      setNotice(`${count} TikTok JSON ${count === 1 ? "entry" : "entries"} exported to Shopify for ${result.uploadDate || "today"}.`);
    } catch (error) {
      setNotice(readableError(error, "TikTok JSON could not be exported to Shopify."));
    } finally {
      setExportingTikTokShopify(false);
    }
  }

  async function runImport() {
    const { orders: imported, result } = importShopifyData(orderCsv, metafieldCsv, orders, session ? `${session.displayName} (${session.username})` : "Admin");
    try {
      await upsertSharedOrders(imported);
      await ensurePaymentProcessors(imported.map((order) => order.paymentProcessor));
      await syncCreatorCommissions();
    }
    catch (error) { setNotice(readableError(error, "Import could not be saved to Supabase.")); return; }
    setOrders(imported);
    setOrderCsv("");
    setMetafieldCsv("");
    setNotice(`${result.imported} new orders imported, ${result.updated} updated, ${result.skipped} skipped.`);
    await logActivity("CSV import", `${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped.`);
    setView("orders");
    await loadSharedData();
  }

  function tikTokEntryParsedFields(entry: TikTokDetailFormEntry) {
    return {
      username: entry.username.trim(),
      plushName: entry.plushName.trim(),
      gender: entry.gender.trim(),
      birthDate: entry.birthDate.trim(),
      birthPlace: entry.birthPlace.trim(),
      favouritePerson: entry.favouritePerson.trim(),
      belongsTo: entry.belongsTo.trim(),
      meaningfulNote: entry.meaningfulNote.trim(),
    };
  }

  function tikTokEntryCanonicalDetails(entry: TikTokDetailFormEntry) {
    return tikTokDetailsToText(tikTokEntryParsedFields(entry));
  }

  function detailEntryPayload(entry: TikTokDetailFormEntry) {
    return {
      identifier: entry.identifier.trim(),
      details: tikTokEntryCanonicalDetails(entry) || entry.details.trim(),
      parsed: tikTokEntryParsedFields(entry),
      fileDataUrl: entry.fileDataUrl,
      fileName: entry.fileName,
      fileType: entry.fileType,
    };
  }

  async function runTikTokImport() {
    const details = tikTokDetailEntries
      .map(detailEntryPayload)
      .filter((entry) => entry.identifier || entry.details || entry.fileDataUrl);
    const actor = session ? `${session.displayName} (${session.username})` : "Admin";
    const { orders: imported, result, importedOrders } = tikTokCsv.trim()
      ? importTikTokShopData(tikTokCsv, details, orders, actor)
      : applyTikTokDetailEntries(details, orders, actor);
    try {
      await upsertSharedOrders(imported);
      await ensurePaymentProcessors(importedOrders.map((order) => order.paymentProcessor));
    }
    catch (error) { setNotice(readableError(error, "TikTok Shop import could not be saved to Supabase.")); return; }
    setOrders(imported);
    setTikTokCsv("");
    setTikTokDetailEntries([emptyTikTokDetailEntry()]);
    setSelectedTikTokJsonOrders(importedOrders.map((order) => order.id));
    setNotice(tikTokCsv.trim()
      ? `TikTok Shop: ${result.imported} new orders imported, ${result.updated} updated, ${result.skipped} skipped.${result.warnings.length ? ` ${result.warnings[0]}` : ""}`
      : `TikTok details: ${result.updated} existing order${result.updated === 1 ? "" : "s"} updated, ${result.skipped} skipped.${result.warnings.length ? ` ${result.warnings[0]}` : ""}`);
    await logActivity("TikTok Shop import", `${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped.`);
    await loadSharedData();
  }

  function updateTikTokDetailEntry(id: string, patch: Partial<Omit<TikTokDetailFormEntry, "id">>) {
    setTikTokDetailEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  function updateTikTokDetailText(id: string, details: string) {
    const parsed = parseTikTokDetailsBlock(details);
    updateTikTokDetailEntry(id, {
      details,
      username: parsed.username,
      plushName: parsed.plushName,
      gender: parsed.gender,
      birthDate: parsed.birthDate,
      birthPlace: parsed.birthPlace,
      favouritePerson: parsed.favouritePerson,
      belongsTo: parsed.belongsTo,
      meaningfulNote: parsed.meaningfulNote,
    });
  }

  function uploadTikTokDetailFile(id: string, file: File | null) {
    if (!file) return updateTikTokDetailEntry(id, { fileDataUrl: "", fileName: "", fileType: "" });
    if (file.size > 5_000_000) {
      setNotice("Please choose a TikTok order file smaller than 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateTikTokDetailEntry(id, {
      fileDataUrl: String(reader.result),
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
    });
    reader.onerror = () => setNotice("Could not load that TikTok order file.");
    reader.readAsDataURL(file);
  }

  function addTikTokDetailEntry() {
    setTikTokDetailEntries((current) => [...current, emptyTikTokDetailEntry()]);
  }

  function removeTikTokDetailEntry(id: string) {
    setTikTokDetailEntries((current) => current.length > 1 ? current.filter((entry) => entry.id !== id) : [emptyTikTokDetailEntry()]);
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

  async function reloadMetaCapiStatus() {
    const response = await fetch("/api/meta-capi");
    const result = await response.json() as {
      ok?: boolean;
      error?: string;
      settings?: MetaCapiSettings;
      logs?: MetaCapiLog[];
      environment?: typeof metaCapiEnvironment;
    };
    if (!response.ok || !result.ok) throw new Error(result.error || "Meta CAPI status could not be loaded.");
    setMetaCapiSettings(result.settings ?? defaultMetaCapiSettings);
    setMetaCapiLogs(result.logs ?? []);
    setMetaCapiEnvironment(result.environment ?? { pixelConfigured: false, tokenConfigured: false, tokenMasked: "", testEventCodeConfigured: false });
  }

  async function saveMetaCapiAdminSettings() {
    setMetaCapiBusy("save");
    try {
      await saveMetaCapiSettings(metaCapiSettings);
      await reloadMetaCapiStatus();
      setNotice("Meta CAPI settings saved.");
    } catch (error) {
      setNotice(readableError(error, "Meta CAPI settings could not be saved."));
    } finally {
      setMetaCapiBusy("");
    }
  }

  function parseMetaRetryOrders(value: string) {
    return value.split(/[,\s#]+/).map((item) => item.trim()).filter(Boolean);
  }

  async function runMetaCapiAction(action: "test_purchase" | "test_whatsapp_purchase" | "retry_orders") {
    setMetaCapiBusy(action);
    try {
      const response = await fetch("/api/meta-capi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, orderNumbers: parseMetaRetryOrders(metaCapiRetryOrders) }),
      });
      const result = await response.json() as {
        ok?: boolean;
        error?: string;
        result?: { sent: number; skipped: number; failed?: number; needsReview: number };
      };
      if (!response.ok || !result.ok) throw new Error(result.error || "Meta CAPI action failed.");
      await reloadMetaCapiStatus();
      await loadSharedData();
      const summary = result.result
        ? `${result.result.sent} sent, ${result.result.skipped} skipped, ${result.result.failed ?? 0} failed, ${result.result.needsReview} needs review.`
        : "Done.";
      setNotice(`Meta CAPI: ${summary}`);
    } catch (error) {
      setNotice(readableError(error, "Meta CAPI action failed."));
    } finally {
      setMetaCapiBusy("");
    }
  }

  async function loadMetaAdsDashboard() {
    setMetaAdsLoading(true);
    setMetaAdsError("");
    try {
      const params = new URLSearchParams({ from: metaAdsStartDate, to: metaAdsEndDate });
      const response = await fetch(`/api/meta-ads?${params.toString()}`);
      const result = await response.json() as {
        ok?: boolean;
        error?: string;
        configured?: boolean;
        environment?: MetaAdsEnvironment;
        summary?: MetaAdsSummary;
        insights?: MetaAdsInsight[];
      };
      if (!response.ok || !result.ok) throw new Error(result.error || "Meta ads dashboard could not be loaded.");
      setMetaAdsConfigured(result.configured === true);
      setMetaAdsEnvironment(result.environment ?? defaultMetaAdsEnvironment);
      setMetaAdsSummary(result.summary ?? defaultMetaAdsSummary);
      setMetaAdsInsights(result.insights ?? []);
    } catch (error) {
      setMetaAdsError(readableError(error, "Meta ads dashboard could not be loaded."));
    } finally {
      setMetaAdsLoading(false);
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

  function updateManualEnvelopeName(slotIndex: number, value: string) {
    setManualEnvelopeNames((current) => {
      const next = { ...current, [slotIndex]: value };
      if (!value.trim()) delete next[slotIndex];
      return next;
    });
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
    if (!envelopePrintableNames.length) return;
    if (!envelopePrintSettings.fontBase64) return setNotice("Upload the font you want to use before generating envelopes.");
    try {
      setNotice("Rendering envelope names, then generating the A4 PDF...");
      const names = envelopePrintableNames;
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
      setNotice(`${Math.ceil(names.length / 2)} A4 envelope page${Math.ceil(names.length / 2) === 1 ? "" : "s"} generated.`);
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

  async function readFile(file: File | undefined, target: "orders" | "metafields" | "tiktok") {
    if (!file) return;
    const text = await file.text();
    if (target === "tiktok") {
      setTikTokCsv(text);
      setNotice("TikTok Shop CSV loaded.");
      return;
    }
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

  function updateOtherIncomeSaleLine(character: string, patch: Partial<OtherIncomeSaleLine>) {
    setOtherIncomeSaleLines((current) => current.map((line) => line.character === character ? { ...line, ...patch } : line));
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
    if (eventValue === "other_income") return bookkeepingSectionConfigs.otherIncome;
    return null;
  }

  function bookkeepingCategoriesForSection(section: BookkeepingSectionKey) {
    const config = bookkeepingSectionConfigs[section];
    return accountingCategories
      .filter((category) => category.active && category.reportSection === config.reportSection)
      .filter((category) => section !== "inventory" || Boolean(inventoryAccountKey(category.name)))
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
      .filter((category) => category.active)
      .filter((category) => event.value === "expense"
        ? category.accountType === "expense" && expenseOptionReportSections.includes(category.reportSection)
        : category.reportSection === config.reportSection)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (event.value === "inventory_purchase") {
      const canonicalSaved = [...new Set(saved.map((category) => inventoryAccountKey(category.name)).filter((name) => name && name !== "INVENTORY"))];
      const canonicalNames = new Set(canonicalSaved.map((name) => name.toLowerCase()));
      const defaultOptions = config.defaults
        .map((name) => inventoryAccountKey(name) || normalizeAccountingItem(name))
        .filter((name) => name && name !== "PLUSH TOY" && !canonicalNames.has(name.toLowerCase()))
        .map((name) => ({ value: name, label: name }));
      const savedOptions = canonicalSaved.map((name) => ({ value: name, label: name }));
      return [{ value: rejectedInventoryOption, label: rejectedInventoryOption }, { value: newAssetOptionValue, label: "+ New account" }, ...savedOptions, ...defaultOptions]
        .filter((option, index, options) => options.findIndex((item) => item.value.toLowerCase() === option.value.toLowerCase()) === index);
    }
    const savedNames = new Set(saved.map((category) => category.name.toLowerCase()));
    const defaults = event.value === "expense"
      ? [...config.defaults, ...softwareExpenseAccountNames]
      : [...config.defaults];
    const defaultOptions = defaults
      .filter((name) => !savedNames.has(name.toLowerCase()))
      .map((name) => ({ value: name, label: name }));
    const savedOptions = saved.map((category) => ({ value: category.id, label: category.name }));
    const newLabel = event.value === "asset_purchase" ? "+ New asset" : "+ New account";
    return [{ value: newAssetOptionValue, label: newLabel }, ...savedOptions, ...defaultOptions];
  }

  function mappedAccountName(event: ReturnType<typeof selectedBusinessEvent>, selection: string) {
    if (event.value === "inventory_purchase" && selection && selection !== rejectedInventoryOption && selection !== newAssetOptionValue) {
      return inventoryAccountKey(selection) || event.accountingMapping;
    }
    const directMap: Record<string, string> = {
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
      "Prepaid Operating Expense": prepaidOperatingCostAccountName,
      "Operating Costs": prepaidOperatingCostAccountName,
      [prepaidOperatingCostAccountName]: prepaidOperatingCostAccountName,
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
    if (event.value === "operating_cost") {
      return accountingCategories.find((category) => isPrepaidOperatingCostAccountName(category.name));
    }
    const selectedCategory = selectedCategoryRecord();
    if (selectedCategory) return selectedCategory;
    const selected = transactionForm.categoryId || transactionForm.accountName;
    const mapped = mappedAccountName(event, selected);
    return accountingCategories.find((category) => category.name.toLowerCase() === mapped.toLowerCase())
      ?? accountingCategories.find((category) => category.name.toLowerCase() === event.accountingMapping.toLowerCase());
  }

  function bookkeepingAccountNameForSave(event: ReturnType<typeof selectedBusinessEvent>) {
    if (event.value === "operating_cost") return prepaidOperatingCostAccountName;
    const selectedCategory = selectedCategoryRecord();
    if (selectedCategory) return selectedCategory.name;
    if (transactionForm.categoryId === newAssetOptionValue) return transactionForm.accountName.trim();
    if (transactionForm.categoryId === rejectedInventoryOption) return transactionForm.accountName.trim() || rejectedInventoryOption;
    if (event.value === "inventory_purchase") return inventoryAccountKey(transactionForm.categoryId || transactionForm.accountName.trim()) || event.accountingMapping;
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
    if (event.value === "other_income") {
      return [
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: transactionForm.paymentMethod || "Bank Account", entryType: "debit", amount, memo: "Other income received", createdAt: now },
        { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName, entryType: "credit", amount, memo: event.label, createdAt: now },
      ];
    }
    if (event.value === "operating_cost") {
      const entries: AccountingLedgerEntry[] = [
        { id: crypto.randomUUID(), transactionId, accountId: account?.id ?? "", accountName: prepaidOperatingCostAccountName, entryType: "debit", amount, memo: "Pre-paid operating cost recorded", createdAt: now },
      ];
      if (paidAmount > 0) entries.push({ id: crypto.randomUUID(), transactionId, accountId: "", accountName: transactionForm.paymentMethod || "Bank Account", entryType: "credit", amount: paidAmount, memo: "Pre-paid operating cost paid", createdAt: now });
      if (outstandingAmount > 0) entries.push({ id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Accounts Payable", entryType: "credit", amount: outstandingAmount, memo: "Outstanding pre-paid operating cost", createdAt: now });
      return entries;
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
    if (event.value === "operating_cost") {
      const existing = accountingCategories.find((category) => category.active && isPrepaidOperatingCostAccountName(category.name));
      if (existing) return existing;
      const account: AccountingCategory = {
        id: crypto.randomUUID(),
        name: prepaidOperatingCostAccountName,
        accountType: "asset",
        reportSection: "Current Assets",
        parentId: "",
        dataSourceType: "manual",
        sourceModule: "Book Keeping",
        sourceEntity: "Operating cost purchases",
        postingTrigger: "Manual Entry",
        allowSubAccounts: false,
        allowedTransactionTypes: [],
        active: true,
      };
      await saveAccountingCategory(account);
      setAccountingCategories((current) => [...current, account].sort((a, b) => `${a.reportSection}-${a.name}`.localeCompare(`${b.reportSection}-${b.name}`)));
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Bookkeeping account added", detail: `${prepaidOperatingCostAccountName} added for operating costs.`, actor, createdAt: new Date().toISOString() });
      return account;
    }
    const config = bookkeepingConfigForEvent(event.value);
    if (!config || !accountName) return selectedAccountingAccount();
    const isSoftwareExpense = event.value === "expense" && softwareExpenseAccountNames.some((name) => name.toLowerCase() === accountName.toLowerCase());
    const targetConfig = isSoftwareExpense
      ? { ...config, reportSection: "Software Expenses", parentAccount: "Software Expenses", sourceEntity: "Software expense" }
      : config;
    const existing = accountingCategories.find((category) => category.active && category.reportSection === targetConfig.reportSection && category.name.toLowerCase() === accountName.toLowerCase())
      ?? accountingCategories.find((category) => category.active && category.name.toLowerCase() === accountName.toLowerCase());
    if (existing) return existing;
    const account: AccountingCategory = {
      id: crypto.randomUUID(),
      name: accountName,
      accountType: targetConfig.accountType,
      reportSection: targetConfig.reportSection,
      parentId: bookkeepingParentId(targetConfig),
      dataSourceType: "manual",
      sourceModule: "Book Keeping",
      sourceEntity: targetConfig.sourceEntity,
      postingTrigger: "Manual Entry",
      allowSubAccounts: false,
      allowedTransactionTypes: [],
      active: true,
    };
    await saveAccountingCategory(account);
    setAccountingCategories((current) => [...current, account].sort((a, b) => `${a.reportSection}-${a.name}`.localeCompare(`${b.reportSection}-${b.name}`)));
    await insertSharedActivity({ id: crypto.randomUUID(), action: "Bookkeeping account added", detail: `${accountName} added to ${targetConfig.label} from a transaction.`, actor, createdAt: new Date().toISOString() });
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

  function bankStatementConfigForEvent(eventValue: string) {
    if (eventValue === "inventory_purchase") return bookkeepingSectionConfigs.inventory;
    if (eventValue === "asset_purchase") return bookkeepingSectionConfigs.asset;
    if (eventValue === "marketing_expense") return bookkeepingSectionConfigs.marketing;
    if (eventValue === "other_income") return bookkeepingSectionConfigs.otherIncome;
    if (eventValue === "operating_cost") return { ...bookkeepingSectionConfigs.expense, reportSection: "Current Assets", parentAccount: prepaidOperatingCostAccountName, accountType: "asset" as const, sourceEntity: "Bank statement prepaid operating cost" };
    if (eventValue === "payment_processor_paid") return { label: "Cash", parentAccount: "Bank Account", accountType: "asset" as const, reportSection: "Current Assets", sourceEntity: "Bank statement cash movement" };
    return bookkeepingSectionConfigs.expense;
  }

  async function ensureBankStatementAccount(eventValue: string, accountName: string, actor: string) {
    const config = bankStatementConfigForEvent(eventValue);
    const name = eventValue === "operating_cost" ? prepaidOperatingCostAccountName : accountName.trim() || config.parentAccount;
    const existing = accountingCategories.find((category) => category.active && category.name.toLowerCase() === name.toLowerCase())
      ?? accountingCategories.find((category) => category.active && category.reportSection === config.reportSection && category.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const account: AccountingCategory = {
      id: crypto.randomUUID(),
      name,
      accountType: config.accountType,
      reportSection: config.reportSection,
      parentId: config.reportSection === "Current Assets" ? "" : bookkeepingParentId(config as (typeof bookkeepingSectionConfigs)[BookkeepingSectionKey]),
      dataSourceType: "manual",
      sourceModule: "Bank Statement",
      sourceEntity: config.sourceEntity,
      postingTrigger: "Bank Statement Match",
      allowSubAccounts: false,
      allowedTransactionTypes: [],
      active: true,
    };
    await saveAccountingCategory(account);
    setAccountingCategories((current) => [...current, account].sort((a, b) => `${a.reportSection}-${a.name}`.localeCompare(`${b.reportSection}-${b.name}`)));
    await insertSharedActivity({ id: crypto.randomUUID(), action: "Bank statement account added", detail: `${name} added while matching bank statement.`, actor, createdAt: new Date().toISOString() });
    return account;
  }

  function bankStatementLedgerEntries(line: AccountingBankStatementLine, form: BankStatementMatchForm, account: AccountingCategory, transactionId: string, createdAt: string): AccountingLedgerEntry[] {
    const amount = line.moneyOut > 0 ? line.moneyOut : line.moneyIn;
    const accountName = form.businessEvent === "operating_cost" ? prepaidOperatingCostAccountName : account.name;
    if (form.businessEvent === "payment_processor_paid") {
      if (accountName === "Drawings") return [
        { id: crypto.randomUUID(), transactionId, accountId: account.id, accountName: "Drawings", entryType: "debit", amount, memo: line.description, createdAt },
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "credit", amount, memo: "Bank statement owner drawing", createdAt },
      ];
      if (accountName === "Stripe" || accountName === "Xendit") return [
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "debit", amount, memo: "Processor payout from bank statement", createdAt },
        { id: crypto.randomUUID(), transactionId, accountId: account.id, accountName, entryType: "credit", amount, memo: line.description, createdAt },
      ];
      return [
        { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "debit", amount, memo: "Bank statement money in", createdAt },
        { id: crypto.randomUUID(), transactionId, accountId: account.id, accountName, entryType: "credit", amount, memo: line.description, createdAt },
      ];
    }
    if (line.moneyIn > 0) return [
      { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "debit", amount, memo: "Bank statement money in", createdAt },
      { id: crypto.randomUUID(), transactionId, accountId: account.id, accountName, entryType: "credit", amount, memo: line.description, createdAt },
    ];
    return [
      { id: crypto.randomUUID(), transactionId, accountId: account.id, accountName, entryType: "debit", amount, memo: line.description, createdAt },
      { id: crypto.randomUUID(), transactionId, accountId: "", accountName: "Bank Account", entryType: "credit", amount, memo: "Bank statement payment", createdAt },
    ];
  }

  async function readBankStatementCsv(file?: File) {
    if (!file && !bankStatementCsv.trim()) return setNotice("Choose a bank statement CSV file or paste CSV content first.");
    const rows = file?.type === "application/pdf" || file?.name.toLowerCase().endsWith(".pdf")
      ? await (async () => {
        const formData = new FormData();
        formData.append("file", file as File);
        const response = await fetch("/api/accounting/bank-statement-pdf", { method: "POST", body: formData });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Could not read the PDF bank statement.");
        return payload.rows as ReturnType<typeof parseBankStatementCsv>;
      })()
      : parseBankStatementCsv(file ? await file.text() : bankStatementCsv);
    const validRows = rows.filter((row) => row.transactionDate && (row.moneyIn > 0 || row.moneyOut > 0));
    if (!validRows.length) return setNotice("No bank statement rows could be detected. Check the file has date, description, and amount/debit/credit columns.");
    setSavingAccounting(true);
    try {
      const now = new Date().toISOString();
      const importId = crypto.randomUUID();
      const lines: AccountingBankStatementLine[] = validRows.map((row) => ({
        id: crypto.randomUUID(),
        importId,
        rowNumber: row.rowNumber,
        transactionDate: row.transactionDate,
        description: row.description,
        reference: row.reference,
        moneyIn: row.moneyIn,
        moneyOut: row.moneyOut,
        balance: row.balance,
        rawData: row.rawData,
        matchedTransactionId: "",
        matchStatus: "unmatched",
        suggestedEvent: row.suggestedEvent,
        suggestedAccount: row.suggestedAccount,
        notes: row.warnings.join(", "),
        createdAt: now,
        updatedAt: now,
      }));
      await saveAccountingBankStatementLines(lines);
      setBankStatementLines((current) => [...lines, ...current]);
      setBankStatementMatchForms((current) => ({
        ...current,
        ...Object.fromEntries(lines.map((line) => [line.id, { businessEvent: line.suggestedEvent || "expense", accountName: line.suggestedAccount || "", notes: "" }])),
      }));
      setBankStatementCsv("");
      setBankStatementFileName(file?.name ?? bankStatementFileName);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Bank statement imported", detail: `${lines.length} bank line${lines.length === 1 ? "" : "s"} imported for matching.`, actor: session?.displayName ?? "Admin", createdAt: now });
      setNotice(`${lines.length} bank statement line${lines.length === 1 ? "" : "s"} imported.`);
    } catch (error) {
      setNotice(readableError(error, "Could not import bank statement lines. Run the latest Supabase schema first."));
    } finally {
      setSavingAccounting(false);
    }
  }

  function updateBankStatementMatchForm(lineId: string, patch: Partial<BankStatementMatchForm>) {
    const defaults: BankStatementMatchForm = { businessEvent: "expense", accountName: "", notes: "" };
    setBankStatementMatchForms((current) => ({ ...current, [lineId]: { ...defaults, ...current[lineId], ...patch } }));
  }

  function bankStatementLineAmount(line: AccountingBankStatementLine) {
    return line.moneyOut > 0 ? line.moneyOut : line.moneyIn;
  }

  function looksLikeInternalTransfer(line: AccountingBankStatementLine) {
    const description = line.description.toLowerCase();
    return (
      description.includes("mp gift shop") ||
      (description.includes("ivan phang") && description.includes("transfer fr a/c")) ||
      line.suggestedEvent === "internal_transfer"
    );
  }

  function findInternalTransferPair(line: AccountingBankStatementLine) {
    const amount = bankStatementLineAmount(line);
    const lineDate = Date.parse(line.transactionDate);
    if (!amount || Number.isNaN(lineDate)) return null;
    return bankStatementLines.find((candidate) => {
      if (candidate.id === line.id || candidate.matchStatus !== "unmatched") return false;
      if (!looksLikeInternalTransfer(candidate)) return false;
      const candidateAmount = bankStatementLineAmount(candidate);
      const candidateDate = Date.parse(candidate.transactionDate);
      const oppositeDirection = (line.moneyIn > 0 && candidate.moneyOut > 0) || (line.moneyOut > 0 && candidate.moneyIn > 0);
      const sameAmount = Math.abs(candidateAmount - amount) < 0.005;
      const closeDate = !Number.isNaN(candidateDate) && Math.abs(candidateDate - lineDate) <= 7 * 24 * 60 * 60 * 1000;
      return oppositeDirection && sameAmount && closeDate;
    }) ?? null;
  }

  async function pairInternalTransferLine(line: AccountingBankStatementLine) {
    const amount = bankStatementLineAmount(line);
    if (amount <= 0) return setNotice("This bank line has no amount to pair.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const now = new Date().toISOString();
      const pair = findInternalTransferPair(line);
      const updatedLine: AccountingBankStatementLine = {
        ...line,
        matchStatus: "ignored",
        suggestedEvent: "internal_transfer",
        suggestedAccount: "Owner Transfer",
        notes: pair ? `Internal transfer paired with ${formatDate(pair.transactionDate)} row ${pair.rowNumber}.` : "Internal transfer excluded from books. Matching bank line not imported yet.",
        updatedAt: now,
      };
      const updates = [updatedLine];
      if (pair) {
        updates.push({
          ...pair,
          matchStatus: "ignored",
          suggestedEvent: "internal_transfer",
          suggestedAccount: "Owner Transfer",
          notes: `Internal transfer paired with ${formatDate(line.transactionDate)} row ${line.rowNumber}.`,
          updatedAt: now,
        });
      }
      await saveAccountingBankStatementLines(updates);
      setBankStatementLines((current) => current.map((item) => updates.find((updated) => updated.id === item.id) ?? item));
      await insertSharedActivity({
        id: crypto.randomUUID(),
        action: pair ? "Bank statement internal transfer paired" : "Bank statement internal transfer excluded",
        detail: pair ? `${formatMoney(amount)} paired between own bank accounts.` : `${formatMoney(amount)} excluded as an own-account transfer.`,
        actor,
        createdAt: now,
      });
      setNotice(pair ? "Internal transfer paired and excluded from income/expenses." : "Internal transfer excluded. Import the other bank statement later if you want it visibly paired.");
    } catch (error) {
      setNotice(readableError(error, "Could not pair this internal transfer."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function matchBankStatementLine(line: AccountingBankStatementLine) {
    const form = bankStatementMatchForms[line.id] ?? { businessEvent: line.suggestedEvent || "expense", accountName: line.suggestedAccount || "", notes: "" };
    if (!form.businessEvent || form.businessEvent === "ignore") return ignoreBankStatementLine(line);
    if (form.businessEvent === "internal_transfer") return pairInternalTransferLine(line);
    const amount = line.moneyOut > 0 ? line.moneyOut : line.moneyIn;
    if (amount <= 0) return setNotice("This bank line has no amount to match.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const now = new Date().toISOString();
      const transactionId = crypto.randomUUID();
      const account = await ensureBankStatementAccount(form.businessEvent, form.accountName || line.suggestedAccount, actor);
      const entries = bankStatementLedgerEntries(line, form, account, transactionId, now);
      await saveAccountingTransaction({
        id: transactionId,
        source: "bank_statement",
        sourceId: line.id,
        documentId: "",
        businessEvent: form.businessEvent,
        transactionDate: line.transactionDate,
        description: line.description,
        accountName: account.name,
        categoryId: account.id,
        transactionType: line.moneyIn > 0 && form.businessEvent !== "payment_processor_paid" ? "income" : form.businessEvent === "payment_processor_paid" ? "transfer" : "expense",
        paymentStatus: "paid_in_full",
        paymentMethod: "Bank Account",
        supplier: line.reference,
        quantity: 0,
        unitCost: 0,
        depositAmount: amount,
        invoiceNumber: line.reference,
        dueDate: "",
        supplierTerms: "",
        debit: entries.filter((entry) => entry.entryType === "debit").reduce((total, entry) => total + entry.amount, 0),
        credit: entries.filter((entry) => entry.entryType === "credit").reduce((total, entry) => total + entry.amount, 0),
        amount,
        currency: "MYR",
        taxTreatment: "none",
        notes: form.notes || line.notes,
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      await saveAccountingLedgerEntries(transactionId, entries);
      const updatedLine: AccountingBankStatementLine = { ...line, matchedTransactionId: transactionId, matchStatus: "matched", suggestedEvent: form.businessEvent, suggestedAccount: account.name, notes: form.notes || line.notes, updatedAt: now };
      await saveAccountingBankStatementLine(updatedLine);
      setBankStatementLines((current) => current.map((item) => item.id === line.id ? updatedLine : item));
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Bank statement line matched", detail: `${line.description} matched to ${account.name} (${formatMoney(amount)}).`, actor, createdAt: now });
      await loadSharedData(false);
      setNotice("Bank line matched and saved to the book.");
    } catch (error) {
      setNotice(readableError(error, "Could not create transaction from this bank line."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function ignoreBankStatementLine(line: AccountingBankStatementLine) {
    const updatedLine: AccountingBankStatementLine = { ...line, matchStatus: "ignored", updatedAt: new Date().toISOString() };
    await saveAccountingBankStatementLine(updatedLine);
    setBankStatementLines((current) => current.map((item) => item.id === line.id ? updatedLine : item));
    setNotice("Bank line ignored.");
  }

  async function removeBankStatementLine(line: AccountingBankStatementLine) {
    await deleteAccountingBankStatementLine(line.id);
    setBankStatementLines((current) => current.filter((item) => item.id !== line.id));
    setNotice("Bank statement line removed.");
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
    const otherIncomeLinesToSave = otherIncomeSaleLines
      .map((line) => ({ character: inventoryAccountKey(line.character), quantity: Number(line.quantity) || 0, unitPrice: Number(line.unitPrice) || 0 }))
      .filter((line) => line.character && line.quantity > 0 && line.unitPrice > 0);
    const otherIncomeTotal = otherIncomeLinesToSave.reduce((total, line) => total + line.quantity * line.unitPrice, 0);
    const depositAmount = Number(transactionForm.depositAmount) || 0;
    const event = selectedBusinessEvent();
    if (event.value === "other_income") amount = otherIncomeTotal;
    const description = transactionForm.description.trim() || (event.value === "payment_processor_paid" && transactionForm.categoryId ? `${transactionForm.categoryId} payout to bank` : event.value === "other_income" ? "Other income sale" : "");
    if (!description) return setNotice("Add a transaction description.");
    if (!Number.isFinite(amount) || amount < 0) return setNotice("Enter a valid transaction amount.");
    if (event.value !== "operating_cost" && !transactionForm.categoryId && !transactionForm.accountName.trim()) return setNotice("Choose an account or type the item name.");
    if (event.value === "other_income" && !otherIncomeLinesToSave.length) return setNotice("Enter at least one character quantity and price.");
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
      if (event.value === "other_income") {
        if (!account) return setNotice("Choose or create an other income account.");
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
            categoryId: account.id,
            transactionType: "income",
            taxTreatment: transactionForm.taxTreatment,
            notes: transactionForm.notes.trim(),
            uploadedBy: actor,
            createdAt: now,
            updatedAt: now,
          });
        }
        for (const line of otherIncomeLinesToSave) {
          const lineAmount = line.quantity * line.unitPrice;
          const lineId = crypto.randomUUID();
          const lineDescription = `${description} - ${line.character}`;
          const entries: AccountingLedgerEntry[] = [
            { id: crypto.randomUUID(), transactionId: lineId, accountId: "", accountName: transactionForm.paymentMethod || "Bank Account", entryType: "debit", amount: lineAmount, memo: "Other income received", createdAt: now },
            { id: crypto.randomUUID(), transactionId: lineId, accountId: account.id, accountName: account.name, entryType: "credit", amount: lineAmount, memo: line.character, createdAt: now },
          ];
          await saveAccountingTransaction({
            id: lineId,
            source: documentId ? "document" : "manual",
            sourceId: documentId,
            documentId,
            businessEvent: event.value,
            transactionDate: transactionForm.transactionDate,
            description: lineDescription,
            accountName: account.name,
            categoryId: account.id,
            transactionType: "income",
            paymentStatus: "paid_in_full",
            paymentMethod: transactionForm.paymentMethod || "Bank Account",
            supplier: line.character,
            quantity: line.quantity,
            unitCost: line.unitPrice,
            depositAmount: lineAmount,
            invoiceNumber: transactionForm.invoiceNumber.trim(),
            dueDate: "",
            supplierTerms: "",
            debit: lineAmount,
            credit: lineAmount,
            amount: lineAmount,
            currency: "MYR",
            taxTreatment: transactionForm.taxTreatment,
            notes: transactionForm.notes.trim(),
            createdBy: actor,
            createdAt: now,
            updatedAt: now,
          });
          await saveAccountingLedgerEntries(lineId, entries);
        }
        await insertSharedActivity({ id: crypto.randomUUID(), action: "Other income recorded", detail: `${account.name}: ${formatMoney(amount)} from ${otherIncomeLinesToSave.length} character line${otherIncomeLinesToSave.length === 1 ? "" : "s"}.`, actor, createdAt: now });
        setTransactionForm({ ...emptyTransactionForm(), businessEvent: event.value, accountName: "" });
        setOtherIncomeSaleLines(defaultOtherIncomeSaleLines());
        setTransactionDocumentFile(null);
        await loadSharedData();
        setNotice("Other income added.");
        return;
      }
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
        accountName: event.value === "operating_cost" ? prepaidOperatingCostAccountName : event.value === "inventory_purchase" ? accountName : account?.name || accountName || "Cash",
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

  function startEditAccountingTransaction(transaction: AccountingTransaction) {
    setEditingTransactionId(transaction.id);
    setEditingTransactionFile(null);
    setEditingTransactionForm({
      businessEvent: transaction.businessEvent || "inventory_purchase",
      transactionDate: dateKey(transaction.transactionDate),
      description: transaction.description,
      accountName: transaction.accountName,
      amount: String(transaction.amount || ""),
      categoryId: transaction.categoryId,
      transactionType: transaction.transactionType,
      paymentStatus: transaction.paymentStatus === "paid_now" || transaction.paymentStatus === "pay_later" ? "paid_in_full" : transaction.paymentStatus,
      paymentMethod: transaction.paymentMethod || "Bank Account",
      supplier: transaction.supplier,
      quantity: transaction.quantity ? String(transaction.quantity) : "",
      unitCost: transaction.unitCost ? String(transaction.unitCost) : "",
      depositAmount: transaction.depositAmount ? String(transaction.depositAmount) : "",
      invoiceNumber: transaction.invoiceNumber,
      dueDate: transaction.dueDate,
      supplierTerms: transaction.supplierTerms,
      taxTreatment: transaction.taxTreatment || "none",
      notes: transaction.notes,
    });
  }

  function cancelEditAccountingTransaction() {
    setEditingTransactionId("");
    setEditingTransactionForm(null);
    setEditingTransactionFile(null);
  }

  async function saveEditedAccountingTransaction() {
    if (!editingTransactionForm || !editingTransactionId) return;
    const original = accountingTransactions.find((transaction) => transaction.id === editingTransactionId);
    if (!original) return setNotice("Could not find the transaction to edit.");
    const amount = Number(editingTransactionForm.amount);
    if (!editingTransactionForm.description.trim()) return setNotice("Add a transaction description.");
    if (!Number.isFinite(amount) || amount < 0) return setNotice("Enter a valid transaction amount.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const now = new Date().toISOString();
      const selectedCategory = accountingCategories.find((category) => category.id === editingTransactionForm.categoryId);
      const accountName = selectedCategory?.name || editingTransactionForm.accountName.trim() || original.accountName;
      let documentId = original.documentId;
      if (editingTransactionFile) {
        documentId = crypto.randomUUID();
        const filePath = await uploadAccountingDocumentFile(editingTransactionFile, documentId);
        await saveAccountingDocument({
          id: documentId,
          filePath,
          fileName: editingTransactionFile.name,
          fileType: editingTransactionFile.type || "application/octet-stream",
          fileSize: editingTransactionFile.size,
          name: editingTransactionForm.invoiceNumber.trim() ? `Invoice ${editingTransactionForm.invoiceNumber.trim()}` : editingTransactionForm.description.trim(),
          supplier: editingTransactionForm.supplier.trim(),
          description: editingTransactionForm.description.trim(),
          documentDate: editingTransactionForm.transactionDate,
          amount,
          categoryId: editingTransactionForm.categoryId,
          transactionType: editingTransactionForm.transactionType === "transfer" ? "expense" : editingTransactionForm.transactionType,
          taxTreatment: editingTransactionForm.taxTreatment,
          notes: editingTransactionForm.notes.trim(),
          uploadedBy: actor,
          createdAt: now,
          updatedAt: now,
        });
      }
      const oldEntries = accountingLedgerEntries.filter((entry) => entry.transactionId === original.id);
      const scale = original.amount > 0 ? amount / original.amount : 1;
      const updatedEntries = oldEntries.map((entry, index) => {
        const isPrimary = index === 0 || entry.accountId === original.categoryId || entry.accountName === original.accountName;
        return {
          ...entry,
          accountId: isPrimary ? editingTransactionForm.categoryId : entry.accountId,
          accountName: isPrimary ? accountName : entry.accountName,
          amount: Math.max(0, entry.amount * scale),
        };
      });
      const debit = updatedEntries.filter((entry) => entry.entryType === "debit").reduce((total, entry) => total + entry.amount, 0);
      const credit = updatedEntries.filter((entry) => entry.entryType === "credit").reduce((total, entry) => total + entry.amount, 0);
      await saveAccountingTransaction({
        ...original,
        source: documentId ? "document" : original.source,
        sourceId: documentId || original.sourceId,
        documentId,
        businessEvent: editingTransactionForm.businessEvent,
        transactionDate: editingTransactionForm.transactionDate,
        description: editingTransactionForm.description.trim(),
        accountName,
        categoryId: editingTransactionForm.categoryId,
        transactionType: editingTransactionForm.transactionType,
        paymentStatus: editingTransactionForm.paymentStatus,
        paymentMethod: editingTransactionForm.paymentMethod,
        supplier: editingTransactionForm.supplier.trim(),
        quantity: Number(editingTransactionForm.quantity) || 0,
        unitCost: Number(editingTransactionForm.unitCost) || 0,
        depositAmount: Number(editingTransactionForm.depositAmount) || 0,
        invoiceNumber: editingTransactionForm.invoiceNumber.trim(),
        dueDate: editingTransactionForm.dueDate,
        supplierTerms: editingTransactionForm.supplierTerms.trim(),
        debit: updatedEntries.length ? debit : original.debit,
        credit: updatedEntries.length ? credit : original.credit,
        amount,
        taxTreatment: editingTransactionForm.taxTreatment,
        notes: editingTransactionForm.notes.trim(),
        updatedAt: now,
      });
      if (updatedEntries.length) await saveAccountingLedgerEntries(original.id, updatedEntries);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Accounting transaction edited", detail: `${editingTransactionForm.description.trim()} updated.`, actor, createdAt: now });
      cancelEditAccountingTransaction();
      await loadSharedData();
      setNotice("Transaction updated.");
    } catch (error) {
      setNotice(readableError(error, "Could not update transaction."));
    } finally {
      setSavingAccounting(false);
    }
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
    if (!sku) return setNotice("Choose the sold SKU or character.");
    if (!inventoryItem) return setNotice("Choose an inventory account used for this character.");
    if (quantityPerSale <= 0) return setNotice("Enter how many inventory units are used per sale.");
    setSavingAccounting(true);
    try {
      const now = new Date().toISOString();
      const mapping: SalesConsumptionMapping = {
        id: crypto.randomUUID(),
        sku,
        inventoryItem,
        quantityPerSale,
        operatingExpensePerSale: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      await saveSalesConsumptionMapping(mapping);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Sales consumption mapping added", detail: `${sku} uses ${inventoryItem}.`, actor: session?.displayName ?? "Admin", createdAt: now });
      setSalesConsumptionMappingForm({ ...salesConsumptionMappingFormDefaults, sku });
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
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Sales consumption mapping removed", detail: `${mapping.sku} to ${mapping.inventoryItem || "inventory"} removed.`, actor: session?.displayName ?? "Admin", createdAt: new Date().toISOString() });
      await loadSharedData();
      setNotice("Sales consumption mapping removed.");
    } catch (error) {
      setNotice(readableError(error, "Could not remove sales consumption mapping."));
    } finally {
      setSavingAccounting(false);
    }
  }

  async function releaseOperatingCost() {
    const amount = Number(operatingCostReleaseForm.amount);
    const transactionDate = operatingCostReleaseForm.transactionDate || dateKey(new Date().toISOString());
    const description = operatingCostReleaseForm.description.trim() || `Operating cost used for ${formatMonthLabel(transactionDate)}`;
    if (!Number.isFinite(amount) || amount <= 0) return setNotice("Enter the operating cost amount used for the month.");
    setSavingAccounting(true);
    try {
      const actor = session?.displayName ?? "Admin";
      const now = new Date().toISOString();
      let operatingExpenseAccount = accountingCategories.find((category) => category.active && category.name.toLowerCase() === "operating expense");
      if (!operatingExpenseAccount) {
        operatingExpenseAccount = {
          id: crypto.randomUUID(),
          name: "Operating Expense",
          accountType: "expense",
          reportSection: bookkeepingSectionConfigs.expense.reportSection,
          parentId: bookkeepingParentId(bookkeepingSectionConfigs.expense),
          dataSourceType: "manual",
          sourceModule: "Book Keeping",
          sourceEntity: "Operating cost release",
          postingTrigger: "Monthly Release",
          allowSubAccounts: false,
          allowedTransactionTypes: [],
          active: true,
        };
        await saveAccountingCategory(operatingExpenseAccount);
      }
      const id = crypto.randomUUID();
      const entries: AccountingLedgerEntry[] = [
        { id: crypto.randomUUID(), transactionId: id, accountId: operatingExpenseAccount.id, accountName: "Operating Expense", entryType: "debit", amount, memo: description, createdAt: now },
        { id: crypto.randomUUID(), transactionId: id, accountId: "", accountName: prepaidOperatingCostAccountName, entryType: "credit", amount, memo: "Pre-paid operating cost released", createdAt: now },
      ];
      await saveAccountingTransaction({
        id,
        source: "manual",
        sourceId: "",
        documentId: "",
        businessEvent: "operating_cost_release",
        transactionDate,
        description,
        accountName: "Operating Expense",
        categoryId: operatingExpenseAccount.id,
        transactionType: "expense",
        paymentStatus: "paid_in_full",
        paymentMethod: prepaidOperatingCostAccountName,
        supplier: "",
        quantity: 0,
        unitCost: 0,
        depositAmount: amount,
        invoiceNumber: "",
        dueDate: "",
        supplierTerms: "",
        debit: amount,
        credit: amount,
        amount,
        currency: "MYR",
        taxTreatment: "none",
        notes: "Released from prepaid operating cost.",
        createdBy: actor,
        createdAt: now,
        updatedAt: now,
      });
      await saveAccountingLedgerEntries(id, entries);
      await insertSharedActivity({ id: crypto.randomUUID(), action: "Operating cost released", detail: `${formatMoney(amount)} moved from ${prepaidOperatingCostAccountName} to Operating Expense.`, actor, createdAt: now });
      setOperatingCostReleaseForm({ transactionDate, amount: "", description: "" });
      await loadSharedData();
      setNotice("Operating cost released into expenses.");
    } catch (error) {
      setNotice(readableError(error, "Could not release operating cost."));
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
    if (column === "meaningfulMessage") {
      const link = meaningfulMessageLink(order);
      const downloadName = meaningfulMessageDownloadName(order);
      return link ? <a href={link} download={downloadName} target={downloadName ? undefined : "_blank"} rel="noreferrer">{downloadName ? "Download message" : "Open message"}</a> : "-";
    }
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
  const availableWorkspaces: Workspace[] = session.role === "admin"
    ? ["fulfilment", "accounting", "formal_accounting", "creator", "inventory", "reports", "content", "ads", "settings"]
    : session.role === "creator" ? ["creator"] : ["fulfilment"];
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
      <div className="user-card"><div className="avatar">{session.displayName.slice(0, 1)}</div><div><strong>{session.displayName}</strong><span>@{session.username} | {session.role === "admin" ? "Administrator" : session.role === "creator" ? "Creator" : "Fulfilment staff"}</span></div><button title="Sign out" onClick={signOut}><Icon name="logout" /></button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div><p>{workspaceTitle.toUpperCase()} WORKSPACE</p><h1>{viewTitle(view)}</h1></div><div className="top-actions"><span className={`role-badge ${session.role}`}>{session.role}</span>{view === "packing_slips" && <button className="button primary print-trigger" onClick={printPackingSlips}>Print {packingOrders.length} A6 slip{packingOrders.length === 1 ? "" : "s"}</button>}{view === "print_envelope" && <button className="button primary" disabled={!envelopePrintableNames.length || !envelopePrintSettings.fontBase64} onClick={printEnvelopes}>Generate {Math.ceil(envelopePrintableNames.length / 2)} A4 page{Math.ceil(envelopePrintableNames.length / 2) === 1 ? "" : "s"}</button>}{view === "sales_report" && <button className="button primary" onClick={() => printView("print-sales-report")}>Print / Save PDF</button>}{workspace === "fulfilment" && view !== "import" && <button className="button secondary" onClick={() => setView("import")}>Import CSV</button>}</div></header>
      {databaseError && <div className="notice"><span>Database connection: {databaseError}</span></div>}
      {loadingOrders && <div className="notice"><span>Loading shared orders from Supabase...</span></div>}
      {notice && <div className="notice"><span>{notice}</span><button onClick={() => setNotice("")}>x</button></div>}

      {workspace === "accounting" && session.role === "admin" && <AccountingWorkspacePage
        view={view}
        orders={orders}
        categories={accountingCategories}
        documents={accountingDocuments}
        transactions={accountingTransactions}
        ledgerEntries={accountingLedgerEntries}
        bankStatementLines={bankStatementLines}
        bankStatementCsv={bankStatementCsv}
        bankStatementFileName={bankStatementFileName}
        bankStatementMatchForms={bankStatementMatchForms}
        documentForm={documentForm}
        transactionForm={transactionForm}
        accountForm={accountForm}
        bookkeepingCategoryForm={bookkeepingCategoryForm}
        otherIncomeSaleLines={otherIncomeSaleLines}
        salesConsumptionMappingForm={salesConsumptionMappingForm}
        salesConsumptionMappings={salesConsumptionMappings}
        operatingCostReleaseForm={operatingCostReleaseForm}
        onOperatingCostReleaseFormChange={(patch) => setOperatingCostReleaseForm((current) => ({ ...current, ...patch }))}
        selectedFile={accountingDocumentFile}
        transactionFile={transactionDocumentFile}
        saving={savingAccounting}
        onDocumentFormChange={(patch) => setDocumentForm((current) => ({ ...current, ...patch }))}
        onTransactionFormChange={(patch) => setTransactionForm((current) => ({ ...current, ...patch }))}
        onInventoryCostFieldChange={onInventoryCostFieldChange}
        onAccountFormChange={(patch) => setAccountForm((current) => ({ ...current, ...patch }))}
        onBookkeepingCategoryFormChange={(patch) => setBookkeepingCategoryForm((current) => ({ ...current, ...patch }))}
        onOtherIncomeSaleLineChange={updateOtherIncomeSaleLine}
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
        onBankStatementCsvChange={setBankStatementCsv}
        onReadBankStatement={readBankStatementCsv}
        onClearBankStatement={() => { setBankStatementCsv(""); setBankStatementFileName(""); }}
        onBankStatementMatchFormChange={updateBankStatementMatchForm}
        onMatchBankStatementLine={matchBankStatementLine}
        onIgnoreBankStatementLine={ignoreBankStatementLine}
        onDeleteBankStatementLine={removeBankStatementLine}
        onSaveAccount={saveAccountSettings}
        onSaveBookkeepingCategory={saveBookkeepingCategory}
        onSaveSalesConsumptionRule={saveSalesConsumptionRule}
        onRemoveSalesConsumptionRule={removeSalesConsumptionRule}
        onReleaseOperatingCost={releaseOperatingCost}
        onSetupChart={setupAccountingChart}
        onEditAccount={(account) => setAccountForm({ id: account.id, name: account.name, accountType: account.accountType === "income" ? "revenue" : account.accountType, reportSection: account.reportSection, parentId: account.parentId, dataSourceType: account.dataSourceType, sourceModule: account.sourceModule || "Manual Transactions", sourceEntity: account.sourceEntity, postingTrigger: account.postingTrigger || "Manual Entry", allowSubAccounts: account.allowSubAccounts, active: account.active })}
        postingPreview={ledgerPreview()}
        accountOptions={accountOptionsForEvent()}
        onOpenDocument={openAccountingDocument}
        onDeleteDocument={removeAccountingDocument}
        onDeleteTransaction={removeAccountingTransaction}
        onEditTransaction={startEditAccountingTransaction}
        editingTransactionId={editingTransactionId}
        editingTransactionForm={editingTransactionForm}
        editingTransactionFile={editingTransactionFile}
        onEditingTransactionFormChange={(patch) => setEditingTransactionForm((current) => current ? { ...current, ...patch } : current)}
        onEditingTransactionFileChange={setEditingTransactionFile}
        onSaveEditedTransaction={saveEditedAccountingTransaction}
        onCancelEditTransaction={cancelEditAccountingTransaction}
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
        salesConsumptionMappingForm={salesConsumptionMappingForm}
        saving={savingAccounting}
        onSalesConsumptionMappingFormChange={(patch) => setSalesConsumptionMappingForm((current) => ({ ...current, ...patch }))}
        onSaveSalesConsumptionRule={saveSalesConsumptionRule}
        onRemoveSalesConsumptionRule={removeSalesConsumptionRule}
        categoryName={categoryName}
      />}

      {workspace === "creator" && (session.role === "admin" || session.role === "creator") && <CreatorProgramWorkspacePage
        view={view}
        session={session}
        accounts={accounts}
        creatorProfiles={creatorProfiles}
        creatorCommissions={creatorCommissions}
        creatorPayouts={creatorPayouts}
        orders={orders}
        onCreateAccount={async (account, password) => {
          await createDashboardAccount(session.token, account, password);
          const refreshedAccounts = await fetchDashboardAccounts(session.token);
          setAccounts(refreshedAccounts);
          return refreshedAccounts;
        }}
        onUpdateAccount={async (account, password) => {
          await updateDashboardAccount(session.token, account, password);
          const refreshedAccounts = await fetchDashboardAccounts(session.token);
          setAccounts(refreshedAccounts);
          await loadCreatorData();
        }}
        onDeleteAccount={async (accountId) => {
          await deleteDashboardAccount(session.token, accountId);
          const refreshedAccounts = await fetchDashboardAccounts(session.token);
          setAccounts(refreshedAccounts);
          await loadCreatorData();
        }}
        onSaveProfile={async (profile) => {
          await saveCreatorProfile(session.token, profile);
          await syncCreatorCommissions();
          await loadCreatorData();
        }}
        onUpdateCommission={async (commission) => {
          await updateCreatorCommissionStatus(session.token, commission);
          await loadCreatorData();
        }}
        onSavePayoutInfo={async (profile) => {
          await saveCreatorPayoutInfo(session.token, profile);
          await loadCreatorData();
        }}
        onSavePayout={async (payout) => {
          await saveCreatorPayout(session.token, payout);
          await loadCreatorData();
        }}
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

      {workspace === "ads" && session.role === "admin" && <AdsWorkspacePage
        startDate={metaAdsStartDate}
        endDate={metaAdsEndDate}
        environment={metaAdsEnvironment}
        trackingSettings={metaCapiSettings}
        capiEnvironment={metaCapiEnvironment}
        summary={metaAdsSummary}
        insights={metaAdsInsights}
        configured={metaAdsConfigured}
        loading={metaAdsLoading}
        error={metaAdsError}
        capiLogs={metaCapiLogs}
        onStartDateChange={setMetaAdsStartDate}
        onEndDateChange={setMetaAdsEndDate}
        onRefresh={loadMetaAdsDashboard}
      />}

      {workspace === "fulfilment" && view !== "import" && view !== "tiktok_shop" && view !== "packing_slips" && view !== "print_envelope" && view !== "history" && view !== "settings" && view !== "stock" && view !== "sales_report" && <>
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
          <div className={`toolbar ${view === "orders" ? "orders-toolbar" : ""}`}>
            <div className="toolbar-row toolbar-filter-row"><div className="search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, customer, phone or tracking..." /></div><SourceFilterSelect value={sourceFilter} onChange={setSourceFilter} /><StatusFilterPills value={statusFilter} onChange={setStatusFilter} /><SortControls sortKey={sortKey} direction={sortDirection} onKey={setSortKey} onDirection={setSortDirection} /></div>
            <div className="toolbar-row toolbar-action-row">{view === "orders" && <button className="button secondary" disabled={!selectedShopifyOrderCount || Boolean(refreshingOrderNumber)} onClick={bulkRefreshShopifyOrders}>{refreshingOrderNumber === "bulk" ? "Refreshing..." : `Refresh ${selectedShopifyOrderCount} Shopify`}</button>}{view === "orders" && <button className="button secondary" disabled={!selectedTikTokOrderCount || Boolean(refreshingOrderNumber)} onClick={bulkRefreshTikTokOrders}>{refreshingOrderNumber === "tiktok-bulk" ? "Syncing..." : `Sync ${selectedTikTokOrderCount} TikTok`}</button>}{view === "orders" && <button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>}{session.role === "admin" && <button className="button danger" disabled={!selectedOrders.length} onClick={() => deleteOrders(selectedOrders)}>Delete</button>}{view === "fulfilled" && <button className="button secondary" onClick={downloadFulfilled}>Export CSV</button>}</div>
          </div>
          <div className="table-scroll"><table className="orders-table"><thead><tr><th><input type="checkbox" aria-label="Select visible orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th>Order</th><th>Date</th><th>Customer</th><th>Phone</th><th>Character</th><th>Voice</th><th>Plush name</th><th>Status</th><th>Tracking number</th><th>Last updated</th><th>{view === "orders" ? "Actions" : "View"}</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id} className={isExpressShipping(order) ? "express-shipping-row" : ""}><td><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={selectedOrders.includes(order.id)} onChange={() => toggleOrderSelection(order.id)} /></td><td><strong>{orderLabel(order)}</strong>{order.salesChannel === "tiktok" && <span className="tiktok-badge">TikTok Shop</span>}{isExpressShipping(order) && <span className="shipping-badge">Express</span>}</td><td>{formatDate(order.orderDate)}</td><td><strong>{order.customerName || "-"}</strong></td><td>{order.phone || "-"}</td><td>{order.character || "-"}</td><td>{order.voiceLength ? `${order.voiceLength}s` : "-"}</td><td>{order.plushName || "-"}</td><td><StatusPill status={order.status} /></td><td><code>{order.trackingNumber || "-"}</code></td><td>{formatDate(order.updatedAt, true)}</td><td><div className="row-actions"><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button>{view === "orders" && (order.salesChannel ?? "shopify") === "shopify" && <button className="view-button refresh-order-button" disabled={refreshingOrderNumber === order.orderNumber} onClick={() => refreshShopifyOrder(order)}>{refreshingOrderNumber === order.orderNumber ? "Refreshing..." : "Refresh"}</button>}{view === "orders" && order.salesChannel === "tiktok" && <button className="view-button refresh-order-button" disabled={refreshingOrderNumber === tiktokOrderIdFromOrder(order)} onClick={() => refreshTikTokOrder(order)}>{refreshingOrderNumber === tiktokOrderIdFromOrder(order) ? "Syncing..." : "Sync"}</button>}</div></td></tr>)}</tbody></table>{!filtered.length && <div className="empty"><strong>No orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {view === "fulfilled" ? orders.filter((order) => order.status === "shipped").length : orders.length} orders</div>
        </section>}

        {view === "fulfilment" && <section className="card orders-card">
          <div className="toolbar"><div className="search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, plush name, character, customer or phone..." /></div><SourceFilterSelect value={sourceFilter} onChange={setSourceFilter} /><StatusFilterPills value={statusFilter} onChange={setStatusFilter} /><SortControls sortKey={sortKey} direction={sortDirection} onKey={setSortKey} onDirection={setSortDirection} /><button className="button primary" disabled={!selectedOrders.length} onClick={bulkMoveNext}>Move {selectedOrders.length} to next status</button>{session.role === "admin" && <button className="button danger" disabled={!selectedOrders.length} onClick={() => deleteOrders(selectedOrders)}>Delete</button>}</div>
          <div className="fulfilment-scroll table-scroll"><table className="orders-table fulfilment-table"><thead><tr><th className="select-column"><input type="checkbox" aria-label="Select visible fulfilment orders" checked={Boolean(filtered.length) && filtered.every((order) => selectedOrders.includes(order.id))} onChange={(event) => setSelectedOrders(event.target.checked ? filtered.map((order) => order.id) : [])} /></th><th className="locked-order-column">Order ID</th>{fulfilmentColumns.filter((column) => column !== "orderNumber").map((column) => <th key={column} className={draggedColumn === column ? "dragging" : ""} draggable onDragStart={(event) => { setDraggedColumn(column); event.dataTransfer.setData("text/plain", column); }} onDragEnd={() => setDraggedColumn(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => reorderFulfilmentColumn(event.dataTransfer.getData("text/plain") as FulfilmentColumn, column)}><span className="drag-handle"><Icon name="drag" /></span>{fulfilmentColumnLabels[column]}</th>)}<th>Status</th><th>View</th></tr></thead><tbody>{filtered.map((order) => { const checked = selectedOrders.includes(order.id); const rowClass = [checked ? "selected-row" : "", isExpressShipping(order) ? "express-shipping-row" : ""].filter(Boolean).join(" "); return <tr key={order.id} className={rowClass} onClick={(event) => { if ((event.target as HTMLElement).closest("button,a,input")) return; toggleOrderSelection(order.id); }}><td className="select-column"><input type="checkbox" aria-label={`Select order ${order.orderNumber}`} checked={checked} onChange={() => toggleOrderSelection(order.id)} /></td><td className="locked-order-column"><strong>{orderLabel(order)}</strong>{order.salesChannel === "tiktok" && <span className="tiktok-badge">TikTok Shop</span>}{isExpressShipping(order) && <span className="shipping-badge">Express</span>}</td>{fulfilmentColumns.filter((column) => column !== "orderNumber").map((column) => <td key={column} className={column === "idWebsiteLink" ? "certificate-cell" : ""}>{fulfilmentCell(order, column)}</td>)}<td><StatusPill status={order.status} /></td><td><button className="view-button" onClick={() => setSelectedId(order.id)}>View</button></td></tr>; })}</tbody></table>{!filtered.length && <div className="empty"><strong>No fulfilment orders found</strong><p>Try another search or status filter.</p></div>}</div>
          <div className="table-footer">Showing {filtered.length} of {orders.length} orders</div>
        </section>}
      </>}

      {view === "packing_slips" && <section className="packing-page">
        <div className="packing-controls card">
          <div className="packing-manual"><div><h2>Choose orders to print</h2><p>Enter order IDs separated by commas or spaces, or select orders from the list below.</p></div><div className="manual-entry"><input value={manualOrderIds} onChange={(event) => setManualOrderIds(event.target.value)} onKeyDown={(event) => event.key === "Enter" && selectManualOrders()} placeholder="Example: 1359, 1360, 1361" /><button className="button primary" onClick={selectManualOrders}>Add order IDs</button></div></div>
          <div className="packing-list-header"><div><strong>Available orders</strong><span>Order number, descending</span></div><SourceFilterSelect value={sourceFilter} onChange={setSourceFilter} /><select value={packingStatusFilter} onChange={(event) => setPackingStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><div className="packing-list-actions"><button onClick={() => setPackingSelection((current) => [...new Set([...current, ...packingAvailableOrders.map((order) => order.id)])])}>Select shown</button><button onClick={() => setPackingSelection([])}>Clear</button></div></div>
          <div className="packing-order-list">{packingAvailableOrders.map((order) => <label key={order.id}><input type="checkbox" checked={packingSelection.includes(order.id)} onChange={() => setPackingSelection((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{orderLabel(order)} | {order.plushName || "Unnamed plushie"}</strong><span>{order.customerName} | {order.character || "No character"}</span></div><StatusPill status={order.status} /></label>)}</div>
        </div>
        <div className="packing-preview"><div className="preview-heading"><div><h2>A6 print preview</h2><p>One packing slip will print on each A6 page.</p></div><span>{packingOrders.length} selected</span></div>{packingOrders.length ? <div className="slip-grid">{packingOrders.map((order) => <PackingSlip order={order} key={order.id} />)}</div> : <div className="preview-empty"><strong>No orders selected</strong><p>Enter order IDs or tick orders from the list.</p></div>}</div>
      </section>}

      {view === "print_envelope" && <section className="envelope-page">
        <div className="envelope-controls card no-envelope-print">
          <div className="packing-manual"><div><h2>Choose orders to print</h2><p>Enter order IDs, choose a stage, or select every order shown in that stage.</p></div><div className="manual-entry"><input value={manualEnvelopeIds} onChange={(event) => setManualEnvelopeIds(event.target.value)} onKeyDown={(event) => event.key === "Enter" && selectManualEnvelopeOrders()} placeholder="Example: 1402, 1403, 1404" /><button className="button primary" onClick={selectManualEnvelopeOrders}>Add order IDs</button></div></div>
          <div className="canva-connection connected"><div><strong>Envelope print settings</strong><span>Font, size, spacing, and text box placement are managed in Settings / Print Settings.</span></div><button className="view-button" onClick={() => setView("settings")}>Open settings</button></div>
          <div className="packing-list-header"><div><strong>Available orders</strong><span>Order number, descending</span></div><SourceFilterSelect value={sourceFilter} onChange={setSourceFilter} /><select value={envelopeStatusFilter} onChange={(event) => setEnvelopeStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><div className="packing-list-actions"><button onClick={() => setEnvelopeSelection((current) => [...new Set([...current, ...envelopeAvailableOrders.map((order) => order.id)])])}>Select shown</button><button onClick={() => setEnvelopeSelection([])}>Clear</button></div></div>
          <div className="packing-order-list">{envelopeAvailableOrders.map((order) => { const selectedIndex = envelopeSelection.indexOf(order.id); return <label key={order.id}><input type="checkbox" checked={selectedIndex >= 0} onChange={() => setEnvelopeSelection((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{orderLabel(order)} | {(order.plushName || "Unnamed plushie").toUpperCase()}</strong><span>{order.customerName || "No customer"} | {order.character || "No character"}</span></div>{selectedIndex >= 0 ? <b className="envelope-order-position">{selectedIndex + 1}</b> : <StatusPill status={order.status} />}</label>; })}</div>
        </div>
        <div className="envelope-preview"><div className="preview-heading"><div><h2>A4 page order</h2><p>Two names are placed on each page using your uploaded font and envelope settings.</p></div><span>{envelopePages.length} pages</span></div>{envelopePages.length ? <div className="envelope-sheet-list">{envelopePages.map((pageSlots, index) => <EnvelopeSheet key={index} pageNumber={index + 1} slots={pageSlots} slotOffset={index * 2} settings={envelopePrintSettings} onManualNameChange={updateManualEnvelopeName} />)}</div> : <div className="preview-empty"><strong>No orders selected</strong><p>Choose orders from the list to build the envelope pages.</p></div>}</div>
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

      {view === "meta_capi" && session.role === "admin" && <section className="settings-page card meta-capi-page">
        <div className="settings-heading"><div><h2>Ads tracking settings</h2><p>Save the Meta Pixel ID here, then use server-side Meta CAPI to check whether purchase tracking is working. Other tracking notes can live here too.</p></div><span>{metaCapiLogs.length} logs</span></div>
        <div className="meta-capi-grid">
          <article className={`meta-capi-status ${metaCapiEnvironment.pixelConfigured ? "ready" : "missing"}`}><span>Pixel ID</span><strong>{metaCapiEnvironment.pixelConfigured ? metaCapiSettings.pixelId || "Configured in Vercel" : "Missing"}</strong><p>Pixel ID can be saved here. Vercel env is still supported.</p></article>
          <article className={`meta-capi-status ${metaCapiEnvironment.tokenConfigured ? "ready" : "missing"}`}><span>Access token</span><strong>{metaCapiEnvironment.tokenConfigured ? metaCapiEnvironment.tokenMasked : "Missing"}</strong><p>Add `META_CAPI_ACCESS_TOKEN` in Vercel.</p></article>
          <article className={`meta-capi-status ${metaCapiEnvironment.testEventCodeConfigured || metaCapiSettings.testEventCode ? "ready" : ""}`}><span>Test events</span><strong>{metaCapiEnvironment.testEventCodeConfigured || metaCapiSettings.testEventCode ? "Ready" : "Optional"}</strong><p>Use this while checking Meta Events Manager.</p></article>
        </div>
        <div className="meta-capi-panels">
          <section className="meta-capi-panel">
            <h3>Tracking setup</h3>
            <label>Meta Pixel ID<input value={metaCapiSettings.pixelId} onChange={(event) => setMetaCapiSettings((current) => ({ ...current, pixelId: event.target.value.replace(/[^\d]/g, "") }))} placeholder="Example: 123456789012345" /></label>
            <label className="meta-capi-toggle"><input type="checkbox" checked={metaCapiSettings.browserPixelEnabled} onChange={(event) => setMetaCapiSettings((current) => ({ ...current, browserPixelEnabled: event.target.checked }))} /><span>Browser Pixel is installed on Shopify</span></label>
            <label>Tracking notes<textarea value={metaCapiSettings.trackingNotes} onChange={(event) => setMetaCapiSettings((current) => ({ ...current, trackingNotes: event.target.value }))} placeholder="Example: Pixel installed through Shopify customer events. TikTok tracking not connected yet." /></label>
            <p className="meta-capi-help">The Pixel ID is safe to save here. Access tokens stay in Vercel because they are private keys.</p>
          </section>
          <section className="meta-capi-panel">
            <h3>Server purchase event rules</h3>
            <label className="meta-capi-toggle"><input type="checkbox" checked={metaCapiSettings.enabled} onChange={(event) => setMetaCapiSettings((current) => ({ ...current, enabled: event.target.checked }))} /><span>Enable Meta CAPI purchase tracking</span></label>
            <label>Send mode<select value={metaCapiSettings.purchaseMode} onChange={(event) => setMetaCapiSettings((current) => ({ ...current, purchaseMode: event.target.value as MetaCapiSettings["purchaseMode"] }))}><option value="manual_only">Only RM0/manual-payment Shopify orders</option><option value="all">All Shopify purchase orders</option><option value="disabled">Disabled</option></select></label>
            <label>Test event code<input value={metaCapiSettings.testEventCode} onChange={(event) => setMetaCapiSettings((current) => ({ ...current, testEventCode: event.target.value }))} placeholder="Optional Meta test event code" /></label>
            <button className="button primary" disabled={metaCapiBusy === "save"} onClick={saveMetaCapiAdminSettings}>{metaCapiBusy === "save" ? "Saving..." : "Save Meta settings"}</button>
          </section>
          <section className="meta-capi-panel">
            <h3>Test and retry</h3>
            <p>Test events use fake order data. Retry sends real saved Shopify order numbers again and updates the order-level Meta status.</p>
            <div className="meta-capi-actions"><button className="button secondary" disabled={Boolean(metaCapiBusy)} onClick={() => runMetaCapiAction("test_purchase")}>{metaCapiBusy === "test_purchase" ? "Sending..." : "Test normal Shopify purchase"}</button><button className="button secondary" disabled={Boolean(metaCapiBusy)} onClick={() => runMetaCapiAction("test_whatsapp_purchase")}>{metaCapiBusy === "test_whatsapp_purchase" ? "Sending..." : "Test RM0/manual payment"}</button></div>
            <label>Retry Shopify order numbers<textarea value={metaCapiRetryOrders} onChange={(event) => setMetaCapiRetryOrders(event.target.value)} placeholder="Example: 1468, 1469, 1470" /></label>
            <button className="button primary" disabled={Boolean(metaCapiBusy) || !metaCapiRetryOrders.trim()} onClick={() => runMetaCapiAction("retry_orders")}>{metaCapiBusy === "retry_orders" ? "Retrying..." : "Retry selected orders"}</button>
          </section>
        </div>
        <div className="meta-capi-log-card">
          <div className="settings-heading compact"><div><h2>Recent Meta events</h2><p>Shows the last 100 server-side purchase attempts.</p></div><button className="button secondary" onClick={reloadMetaCapiStatus}>Refresh logs</button></div>
          <div className="table-scroll"><table className="orders-table meta-capi-log-table"><thead><tr><th>Date</th><th>Order</th><th>Status</th><th>Value</th><th>Event ID</th><th>Response</th><th>Error</th></tr></thead><tbody>{metaCapiLogs.map((log) => <tr key={log.id}><td>{formatDate(log.createdAt, true)}</td><td>{log.orderNumber || "-"}</td><td><span className={`meta-capi-log-status ${log.status}`}>{log.status.replace("_", " ")}</span></td><td>{formatMoney(log.value)}</td><td><code>{log.eventId}</code></td><td>{log.responseId || "-"}</td><td>{log.error || "-"}</td></tr>)}</tbody></table>{!metaCapiLogs.length && <div className="empty"><strong>No Meta events yet</strong><p>Run a test event or wait for a matching Shopify order.</p></div>}</div>
        </div>
      </section>}

      {view === "settings" && session.role === "admin" && <section className="settings-page card">
        <div className="settings-heading"><div><h2>Accounts and permissions</h2><p>Admins can edit everything. Staff can use workflow pages and only advance order stages.</p></div><span>{accounts.length} accounts</span></div>
        <div className="account-create"><input placeholder="Username" value={newAccount.username} onChange={(event) => setNewAccount({ ...newAccount, username: event.target.value.toLowerCase() })} /><input placeholder="Display name" value={newAccount.displayName} onChange={(event) => setNewAccount({ ...newAccount, displayName: event.target.value })} /><select value={newAccount.role} onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value as UserRole })}><option value="staff">Staff</option><option value="creator">Creator</option><option value="admin">Admin</option></select><input type="password" placeholder="Password (8+ characters)" value={newAccount.password} onChange={(event) => setNewAccount({ ...newAccount, password: event.target.value })} /><button className="button primary" onClick={createAccount}>Create account</button></div>
        <div className="account-list">{accounts.map((account) => <div className="account-row" key={account.id}><strong>@{account.username}</strong><input value={account.displayName} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, displayName: event.target.value } : item))} /><select value={account.role} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, role: event.target.value as UserRole } : item))}><option value="staff">Staff</option><option value="creator">Creator</option><option value="admin">Admin</option></select><input type="password" placeholder="New password (optional)" value={accountPasswords[account.id] ?? ""} onChange={(event) => setAccountPasswords((current) => ({ ...current, [account.id]: event.target.value }))} /><label><input type="checkbox" checked={account.active} onChange={(event) => setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, active: event.target.checked } : item))} /> Active</label><button className="button primary" onClick={() => saveAccount(account, accountPasswords[account.id])}>Save</button></div>)}</div>

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
        <section className="tiktok-import-section card">
          <div className="settings-heading"><div><h2>TikTok Shop import</h2><p>Upload the TikTok Shop order export to create new orders, or paste plushie details with an Order ID to update existing TikTok orders. The editable preview is what gets saved.</p></div><span>{tikTokOrders.length} TikTok orders</span></div>
          <div className="import-columns">
            <ImportBox number="3" title="TikTok Shop order export" value={tikTokCsv} onChange={setTikTokCsv} onFile={(file) => readFile(file, "tiktok")} placeholder="Optional if the TikTok order already exists. Order ID, Variation, Order Amount, Buyer Username..." />
            <div className="import-box">
              <div className="import-box-header"><span>4</span><div><strong>TikTok plushie details</strong><small>Use the Order ID as the identifier. If you have the full username, paste it in the detail box as Username.</small></div></div>
              <div className="tiktok-detail-entry-list">
                {tikTokDetailEntries.map((entry, index) => <article className="tiktok-detail-entry" key={entry.id}>
                  <div className="tiktok-detail-entry-header"><strong>Entry {index + 1}</strong>{tikTokDetailEntries.length > 1 && <button className="view-button" type="button" onClick={() => removeTikTokDetailEntry(entry.id)}>Remove</button>}</div>
                  <label>Identifier<input value={entry.identifier} onChange={(event) => updateTikTokDetailEntry(entry.id, { identifier: event.target.value })} placeholder="Order ID, for example 584697260225955022" /></label>
                  <label>Paste customer details<textarea value={entry.details} onChange={(event) => updateTikTokDetailText(entry.id, event.target.value)} placeholder={"Nama Plushie - Mochi\nJantina Plushie- Female\nTarikh Lahir Plushie - 28/6/2025\nTempat Lahir Plushie - Perak\nOrang Kegemaran Plushie - Panda shomel\nMainan lembut itu milik... Ayangku\nNota bermakna - Ayangku mochi ni adik pda oreo otey."} /></label>
                  <div className="tiktok-detail-preview">
                    <strong>Editable preview</strong>
                    <label>Username<input value={entry.username} onChange={(event) => updateTikTokDetailEntry(entry.id, { username: event.target.value })} placeholder="username" /></label>
                    <label>Plushie's Name<input value={entry.plushName} onChange={(event) => updateTikTokDetailEntry(entry.id, { plushName: event.target.value })} placeholder="Mochi" /></label>
                    <label>Plushie's Gender<input value={entry.gender} onChange={(event) => updateTikTokDetailEntry(entry.id, { gender: event.target.value })} placeholder="Female" /></label>
                    <label>Plushie's Birth Date<input value={entry.birthDate} onChange={(event) => updateTikTokDetailEntry(entry.id, { birthDate: event.target.value })} placeholder="28/6/2025" /></label>
                    <label>Plushie's Birth Place<input value={entry.birthPlace} onChange={(event) => updateTikTokDetailEntry(entry.id, { birthPlace: event.target.value })} placeholder="Perak" /></label>
                    <label>Plushie's Favourite Person<input value={entry.favouritePerson} onChange={(event) => updateTikTokDetailEntry(entry.id, { favouritePerson: event.target.value })} placeholder="Panda shomel" /></label>
                    <label>Plushie Belongs to<input value={entry.belongsTo} onChange={(event) => updateTikTokDetailEntry(entry.id, { belongsTo: event.target.value })} placeholder="Ayangku" /></label>
                    <label className="wide">Meaningful Note<textarea value={entry.meaningfulNote} onChange={(event) => updateTikTokDetailEntry(entry.id, { meaningfulNote: event.target.value })} placeholder="Nota bermakna..." /></label>
                  </div>
                  <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.txt,.doc,.docx" title="TikTok order file" description="Choose or drop the file for this order" selectedName={entry.fileName} onFile={(file) => uploadTikTokDetailFile(entry.id, file)} className="compact-file-drop" />
                </article>)}
              </div>
              <button className="button secondary tiktok-add-entry" type="button" onClick={addTikTokDetailEntry}>Add Entry</button>
            </div>
          </div>
          <div className="import-action"><div><strong>Auto certificate code</strong><p>With CSV, new TikTok orders are created. Without CSV, existing TikTok orders are updated from the editable preview using the Order ID.</p></div><button className="button primary large" disabled={!tikTokCsv.trim() && !tikTokDetailEntries.some((entry) => entry.identifier.trim() && (tikTokEntryCanonicalDetails(entry) || entry.fileDataUrl))} onClick={runTikTokImport}>{tikTokCsv.trim() ? "Import TikTok Shop orders" : "Update TikTok details"}</button></div>
        </section>
      </section>}

      {view === "tiktok_shop" && <section className="packing-page tiktok-shop-page">
        <div className="packing-controls card">
          <div className="packing-manual"><div><h2>TikTok certificate data</h2><p>Choose a stage, select the TikTok orders you need, then copy the generated JSON below.</p></div><div className="packing-list-actions"><button className="button primary" onClick={() => setSelectedTikTokJsonOrders(tikTokAvailableOrders.map((order) => order.id))}>Select shown</button><button className="button secondary" onClick={() => setSelectedTikTokJsonOrders([])}>Clear</button></div></div>
          <div className="packing-list-header"><div><strong>Available TikTok orders</strong><span>{tikTokAvailableOrders.length} shown from {tikTokOrders.length} TikTok orders</span></div><select value={tikTokStatusFilter} onChange={(event) => setTikTokStatusFilter(event.target.value as "all" | OrderStatus)}><option value="all">All statuses</option>{orderStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></div>
          <div className="packing-order-list">{tikTokAvailableOrders.map((order) => <label key={order.id}><input type="checkbox" checked={selectedTikTokJsonOrders.includes(order.id)} onChange={() => setSelectedTikTokJsonOrders((current) => current.includes(order.id) ? current.filter((id) => id !== order.id) : [...current, order.id])} /><div><strong>{tikTokShortOrderLabel(order)} | {order.plushName || "Unnamed plushie"}</strong><span>{order.customerName || "No username"} | {order.character || "No character"} {order.voiceLength ? `${order.voiceLength}S` : ""}</span></div><StatusPill status={order.status} /></label>)}</div>
          {!tikTokAvailableOrders.length && <div className="empty"><strong>No TikTok orders in this stage</strong><p>Import TikTok Shop orders first, or choose another stage.</p></div>}
        </div>
        <div className="packing-preview tiktok-json-panel"><div className="preview-heading"><div><h2>TikTok Shop JSON</h2><p>Selected orders are converted into certificate JSON.</p></div><div className="json-copy-actions"><span>{selectedTikTokCertificatePayload.length} selected</span><button className="button secondary" type="button" disabled={!selectedTikTokCertificatePayload.length || exportingTikTokShopify} onClick={exportTikTokCertificateJsonToShopify}>{exportingTikTokShopify ? "Exporting..." : "Export to Shopify"}</button><button className="button primary" type="button" onClick={copyTikTokCertificateJson}>Copy JSON</button></div></div><textarea className="tiktok-json-output" readOnly value={selectedTikTokCertificateJson} /></div>
      </section>}
    </section>

    {selected && <OrderDrawer order={selected} role={session.role} actor={session.displayName} onClose={() => setSelectedId(null)} onUpdate={(patch) => updateOrder(selected.id, patch)} onStatus={(status) => setStatus(selected, status)} />}
    {previewDocument && <DocumentPreviewModal document={previewDocument} url={previewDocumentUrl} error={previewDocumentError} onClose={() => { setPreviewDocument(null); setPreviewDocumentUrl(""); setPreviewDocumentError(""); }} />}
  </main>;
}

function AccountingWorkspacePage({
  view,
  orders,
  categories,
  documents,
  transactions,
  ledgerEntries,
  bankStatementLines,
  bankStatementCsv,
  bankStatementFileName,
  bankStatementMatchForms,
  documentForm,
  transactionForm,
  accountForm,
  bookkeepingCategoryForm,
  otherIncomeSaleLines,
  salesConsumptionMappingForm,
  salesConsumptionMappings,
  operatingCostReleaseForm,
  selectedFile,
  transactionFile,
  saving,
  onDocumentFormChange,
  onTransactionFormChange,
  onInventoryCostFieldChange,
  onAccountFormChange,
  onBookkeepingCategoryFormChange,
  onOtherIncomeSaleLineChange,
  onSalesConsumptionMappingFormChange,
  onOperatingCostReleaseFormChange,
  onFileChange,
  onTransactionFileChange,
  onUploadDocument,
  onCreateTransaction,
  onReadBookkeepingCsv,
  csvRows,
  csvFileName,
  onImportBookkeepingCsv,
  onClearBookkeepingCsv,
  onBankStatementCsvChange,
  onReadBankStatement,
  onClearBankStatement,
  onBankStatementMatchFormChange,
  onMatchBankStatementLine,
  onIgnoreBankStatementLine,
  onDeleteBankStatementLine,
  onSaveAccount,
  onSaveBookkeepingCategory,
  onSaveSalesConsumptionRule,
  onRemoveSalesConsumptionRule,
  onReleaseOperatingCost,
  onSetupChart,
  onEditAccount,
  postingPreview,
  accountOptions,
  onOpenDocument,
  onDeleteDocument,
  onDeleteTransaction,
  onEditTransaction,
  editingTransactionId,
  editingTransactionForm,
  editingTransactionFile,
  onEditingTransactionFormChange,
  onEditingTransactionFileChange,
  onSaveEditedTransaction,
  onCancelEditTransaction,
  transactionDocuments,
  settlementFiles,
  onSettlementFileChange,
  onSettleTransaction,
  sales,
  processorAccountingTotals,
  categoryName,
}: {
  view: View;
  orders: Order[];
  categories: AccountingCategory[];
  documents: AccountingDocument[];
  transactions: AccountingTransaction[];
  ledgerEntries: AccountingLedgerEntry[];
  bankStatementLines: AccountingBankStatementLine[];
  bankStatementCsv: string;
  bankStatementFileName: string;
  bankStatementMatchForms: Record<string, BankStatementMatchForm>;
  documentForm: AccountingDocumentForm;
  transactionForm: AccountingTransactionForm;
  accountForm: AccountingAccountForm;
  bookkeepingCategoryForm: BookkeepingCategoryForm;
  otherIncomeSaleLines: OtherIncomeSaleLine[];
  salesConsumptionMappingForm: SalesConsumptionMappingForm;
  salesConsumptionMappings: SalesConsumptionMapping[];
  operatingCostReleaseForm: OperatingCostReleaseForm;
  selectedFile: File | null;
  transactionFile: File | null;
  saving: boolean;
  onDocumentFormChange: (patch: Partial<AccountingDocumentForm>) => void;
  onTransactionFormChange: (patch: Partial<AccountingTransactionForm>) => void;
  onInventoryCostFieldChange: (field: InventoryCostField, value: string) => void;
  onAccountFormChange: (patch: Partial<AccountingAccountForm>) => void;
  onBookkeepingCategoryFormChange: (patch: Partial<BookkeepingCategoryForm>) => void;
  onOtherIncomeSaleLineChange: (character: string, patch: Partial<OtherIncomeSaleLine>) => void;
  onSalesConsumptionMappingFormChange: (patch: Partial<SalesConsumptionMappingForm>) => void;
  onOperatingCostReleaseFormChange: (patch: Partial<OperatingCostReleaseForm>) => void;
  onFileChange: (file: File | null) => void;
  onTransactionFileChange: (file: File | null) => void;
  onUploadDocument: () => void;
  onCreateTransaction: () => void;
  onReadBookkeepingCsv: (file: File | undefined) => void;
  csvRows: BookkeepingCsvImportRow[];
  csvFileName: string;
  onImportBookkeepingCsv: () => void;
  onClearBookkeepingCsv: () => void;
  onBankStatementCsvChange: (value: string) => void;
  onReadBankStatement: (file?: File) => void;
  onClearBankStatement: () => void;
  onBankStatementMatchFormChange: (lineId: string, patch: Partial<BankStatementMatchForm>) => void;
  onMatchBankStatementLine: (line: AccountingBankStatementLine) => void;
  onIgnoreBankStatementLine: (line: AccountingBankStatementLine) => void;
  onDeleteBankStatementLine: (line: AccountingBankStatementLine) => void;
  onSaveAccount: () => void;
  onSaveBookkeepingCategory: () => void;
  onSaveSalesConsumptionRule: () => void;
  onRemoveSalesConsumptionRule: (mapping: SalesConsumptionMapping) => void;
  onReleaseOperatingCost: () => void;
  onSetupChart: () => void;
  onEditAccount: (account: AccountingCategory) => void;
  postingPreview: AccountingLedgerEntry[];
  accountOptions: AccountOption[];
  onOpenDocument: (document: AccountingDocument) => void;
  onDeleteDocument: (document: AccountingDocument) => void;
  onDeleteTransaction: (transaction: AccountingTransaction) => void;
  onEditTransaction: (transaction: AccountingTransaction) => void;
  editingTransactionId: string;
  editingTransactionForm: AccountingTransactionForm | null;
  editingTransactionFile: File | null;
  onEditingTransactionFormChange: (patch: Partial<AccountingTransactionForm>) => void;
  onEditingTransactionFileChange: (file: File | null) => void;
  onSaveEditedTransaction: () => void;
  onCancelEditTransaction: () => void;
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
    ...stockCharacters,
    ...categories
      .filter((category) => category.active)
      .filter((category) => category.reportSection === bookkeepingSectionConfigs.inventory.reportSection || (category.parentId && categoryName(category.parentId) === "Inventory"))
      .map((category) => inventoryAccountKey(category.name))
      .filter((name) => name && name !== "INVENTORY"),
  ])]
    .sort((a, b) => a.localeCompare(b));
  const categoryEventValue = bookkeepingEventByView[view];
  const categoryEvent = businessEvents.find((item) => item.value === categoryEventValue);
  const unsettledTransactions = transactions.filter((transaction) => ["deposit_paid", "on_credit", "pay_later"].includes(transaction.paymentStatus));
  const operatingCostTransactions = transactions.filter((transaction) => transaction.businessEvent === "operating_cost");
  const operatingCostReleaseTransactions = transactions.filter((transaction) => transaction.businessEvent === "operating_cost_release");
  const operatingCostPageTransactions = [...operatingCostTransactions, ...operatingCostReleaseTransactions].sort((a, b) => dateKey(a.transactionDate).localeCompare(dateKey(b.transactionDate)) || a.createdAt.localeCompare(b.createdAt));
  const operatingCostTransactionIds = new Set(operatingCostTransactions.map((transaction) => transaction.id));
  const operatingCostAdded = operatingCostTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const operatingCostPaid = ledgerEntries
    .filter((entry) => operatingCostTransactionIds.has(entry.transactionId) && entry.entryType === "credit" && normalizeAccountingItem(entry.accountName) === "BANK ACCOUNT")
    .reduce((total, entry) => total + entry.amount, 0);
  const operatingCostUsed = operatingCostReleaseTransactions.reduce((total, transaction) => total + transaction.amount, 0);
  const operatingCostRemaining = Math.max(0, operatingCostAdded - operatingCostUsed);
  const bankStatementUnmatched = bankStatementLines.filter((line) => line.matchStatus === "unmatched");
  const bankStatementMatched = bankStatementLines.filter((line) => line.matchStatus === "matched");
  const bankStatementIgnored = bankStatementLines.filter((line) => line.matchStatus === "ignored");
  const [selectedBankStatementMonth, setSelectedBankStatementMonth] = useState("all");
  const bankStatementReferenceGroups = useMemo(() => {
    const sorted = [...bankStatementLines].sort((a, b) => dateKey(a.transactionDate).localeCompare(dateKey(b.transactionDate)) || a.rowNumber - b.rowNumber);
    const grouped = new Map<string, AccountingBankStatementLine[]>();
    for (const line of sorted) {
      const key = dateKey(line.transactionDate).slice(0, 7) || "unknown";
      grouped.set(key, [...(grouped.get(key) ?? []), line]);
    }
    return [...grouped.entries()].map(([month, lines]) => ({ month, lines }));
  }, [bankStatementLines]);
  const bankStatementMonthOptions = bankStatementReferenceGroups.map((group) => group.month);
  const shownBankStatementGroups = selectedBankStatementMonth === "all"
    ? bankStatementReferenceGroups
    : bankStatementReferenceGroups.filter((group) => group.month === selectedBankStatementMonth);
  function formatStatementNumber(value: number | null) {
    if (value === null || !Number.isFinite(value)) return "";
    return new Intl.NumberFormat("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  function formatStatementDate(value: string) {
    const key = dateKey(value);
    if (!key || key.length < 10) return value || "-";
    return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
  }
  function bookkeepingLedgerRows(sourceTransactions = transactions) {
    return [...sourceTransactions].sort((a, b) => {
      const dateCompare = dateKey(a.transactionDate).localeCompare(dateKey(b.transactionDate));
      return dateCompare || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    }).map((transaction) => {
      const entries = ledgerEntries.filter((entry) => entry.transactionId === transaction.id);
      const document = transactionDocuments.find((item) => item.id === transaction.documentId);
      const paymentLabel = transaction.paymentStatus === "deposit_paid" ? `Deposit ${formatMoney(transaction.depositAmount)}` : transaction.paymentStatus === "on_credit" ? "On Credit" : "Paid In Full";
      const eventLabel = businessEvents.find((event) => event.value === transaction.businessEvent)?.label ?? (transaction.businessEvent || "-");
      const accountName = displayAccountingAccountName(transaction.accountName || categoryName(transaction.categoryId));
      const ledgerPosting = entries.length
        ? entries.map((entry, index) => {
          const name = displayAccountingAccountName(entry.accountName);
          const label = index === 0 ? `Record ${name}` : name.includes("Payable") || name.includes("Receivable") ? `Outstanding ${name}` : `Payment from ${name}`;
          return `${label}: ${formatMoney(entry.amount)}`;
        }).join(" | ")
        : formatMoney(transaction.amount);
      return { transaction, entries, document, paymentLabel, eventLabel, accountName, ledgerPosting };
    });
  }
  function csvCell(value: string | number) {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
  function downloadBookkeepingLedgerCsv() {
    const rows = bookkeepingLedgerRows();
    const headers = ["Date", "Description", "Supplier/Source", "Business Event", "Account", "Payment", "Payment Method", "Amount", "Debit", "Credit", "Ledger Posting", "Document"];
    const lines = rows.map(({ transaction, document, paymentLabel, eventLabel, accountName, ledgerPosting }) => [
      dateKey(transaction.transactionDate),
      transaction.description,
      transaction.supplier || transaction.source,
      eventLabel,
      accountName,
      paymentLabel,
      transaction.paymentStatus === "on_credit" ? transaction.dueDate || transaction.supplierTerms || "Outstanding" : transaction.paymentMethod || "Bank Account",
      transaction.amount.toFixed(2),
      transaction.debit.toFixed(2),
      transaction.credit.toFixed(2),
      ledgerPosting,
      document?.fileName || "",
    ].map(csvCell).join(","));
    const csv = [headers.map(csvCell).join(","), ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `meaningful-plushies-bookkeeping-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function bankStatementUiConfigForEvent(eventValue: string) {
    if (eventValue === "inventory_purchase") return bookkeepingSectionConfigs.inventory;
    if (eventValue === "asset_purchase") return bookkeepingSectionConfigs.asset;
    if (eventValue === "marketing_expense") return bookkeepingSectionConfigs.marketing;
    if (eventValue === "other_income") return bookkeepingSectionConfigs.otherIncome;
    if (eventValue === "operating_cost") return { ...bookkeepingSectionConfigs.expense, reportSection: "Current Assets", parentAccount: prepaidOperatingCostAccountName, accountType: "asset" as const, sourceEntity: "Bank statement prepaid operating cost" };
    return bookkeepingSectionConfigs.expense;
  }
  function bankStatementAccountOptions(eventValue: string) {
    if (eventValue === "payment_processor_paid") return ["Bank Transfer", "Stripe", "Xendit", "Owner's Equity", "Drawings"];
    if (eventValue === "internal_transfer") return ["Owner Transfer", "Personal Bank Transfer"];
    if (eventValue === "operating_cost") return [prepaidOperatingCostAccountName];
    const config = bankStatementUiConfigForEvent(eventValue);
    const saved = categories
      .filter((category) => category.active && (category.reportSection === config.reportSection || category.accountType === config.accountType))
      .map((category) => category.name);
    return [...new Set([...(("defaults" in config ? config.defaults : []) ?? []), ...saved, config.parentAccount])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }
  const transactionEditPanel = editingTransactionForm ? <section className="accounting-form card">
    <div className="accounting-form-heading"><div><h3>Edit transaction</h3><p>Update the transaction details or attach a replacement source document.</p></div><button className="view-button" onClick={onCancelEditTransaction}>Cancel</button></div>
    <div className="accounting-two-cols"><label>Date<input type="date" value={editingTransactionForm.transactionDate} onChange={(input) => onEditingTransactionFormChange({ transactionDate: input.target.value })} /></label><label>Amount<input type="number" min="0" step="0.01" value={editingTransactionForm.amount} onChange={(input) => onEditingTransactionFormChange({ amount: input.target.value })} /></label></div>
    <div className="accounting-two-cols"><label>Account<select value={editingTransactionForm.categoryId} onChange={(input) => onEditingTransactionFormChange({ categoryId: input.target.value, accountName: "" })}><option value="">Choose account</option>{categories.filter((category) => category.active && Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === category.reportSection)).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Account name<input value={editingTransactionForm.accountName} onChange={(input) => onEditingTransactionFormChange({ accountName: input.target.value })} placeholder="Use this if no saved account applies" /></label></div>
    <div className="accounting-two-cols"><label>Supplier / customer<input value={editingTransactionForm.supplier} onChange={(input) => onEditingTransactionFormChange({ supplier: input.target.value })} /></label><label>Invoice number<input value={editingTransactionForm.invoiceNumber} onChange={(input) => onEditingTransactionFormChange({ invoiceNumber: input.target.value })} /></label></div>
    <label>Description<input value={editingTransactionForm.description} onChange={(input) => onEditingTransactionFormChange({ description: input.target.value })} /></label>
    <div className="accounting-two-cols"><label>Quantity<input type="number" min="0" step="0.0001" value={editingTransactionForm.quantity} onChange={(input) => onEditingTransactionFormChange({ quantity: input.target.value })} /></label><label>Unit cost<input type="number" min="0" step="0.01" value={editingTransactionForm.unitCost} onChange={(input) => onEditingTransactionFormChange({ unitCost: input.target.value })} /></label></div>
    <label>Payment type<select value={editingTransactionForm.paymentStatus} onChange={(input) => onEditingTransactionFormChange({ paymentStatus: input.target.value as AccountingTransactionForm["paymentStatus"] })}><option value="paid_in_full">Paid In Full</option><option value="deposit_paid">Deposit Paid</option><option value="on_credit">On Credit</option></select></label>
    {editingTransactionForm.paymentStatus !== "on_credit" && <label>Funding source<select value={editingTransactionForm.paymentMethod} onChange={(input) => onEditingTransactionFormChange({ paymentMethod: input.target.value })}>{paymentAccounts.map((account) => <option key={account} value={account}>{account}</option>)}</select></label>}
    {editingTransactionForm.paymentStatus === "deposit_paid" && <label>Deposit amount<input type="number" min="0" step="0.01" value={editingTransactionForm.depositAmount} onChange={(input) => onEditingTransactionFormChange({ depositAmount: input.target.value })} /></label>}
    {editingTransactionForm.paymentStatus === "on_credit" && <div className="accounting-two-cols"><label>Due date<input type="date" value={editingTransactionForm.dueDate} onChange={(input) => onEditingTransactionFormChange({ dueDate: input.target.value })} /></label><label>Supplier terms<input value={editingTransactionForm.supplierTerms} onChange={(input) => onEditingTransactionFormChange({ supplierTerms: input.target.value })} /></label></div>}
    <label>Notes<textarea value={editingTransactionForm.notes} onChange={(input) => onEditingTransactionFormChange({ notes: input.target.value })} /></label>
    <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Replace or add source document" description="Choose or drop a new file if you want to update the linked document" selectedName={editingTransactionFile?.name} onFile={onEditingTransactionFileChange} />
    <button className="button primary" disabled={saving} onClick={onSaveEditedTransaction}>{saving ? "Saving..." : "Save transaction changes"}</button>
  </section> : null;

  if (view === "accounting_dashboard") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>BOOK KEEPING BOOK</p><h2>All transactions</h2><span>Every money-in and money-out record saved from the bookkeeping category pages.</span></div><div className="accounting-status-pill">{transactions.length} records</div></div>
    <section className="accounting-summary-grid">
      <MoneyStat label="Money in" value={income} tone="collected" />
      <MoneyStat label="Money out" value={expenses} tone="fees" />
      <MoneyStat label="Net" value={profit} tone={profit < 0 ? "fees" : "sales"} />
    </section>
    <div className="ledger-export-actions no-print"><button className="button secondary" disabled={!transactions.length} onClick={downloadBookkeepingLedgerCsv}>Download CSV</button><button className="button primary" disabled={!transactions.length} onClick={() => printView("print-bookkeeping-ledger")}>Print / Save PDF</button></div>
    {transactionEditPanel}
    <AccountingTransactionsTable transactions={transactions} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
    <section className="bookkeeping-ledger-print card">
      <header className="financial-statement-title"><p>Meaningful Plushies</p><h2>Book Keeping Transaction Ledger</h2><span>Generated on {formatDate(new Date().toISOString(), true)}</span></header>
      <table className="bookkeeping-ledger-print-table">
        <thead><tr><th>Date</th><th>Description</th><th>Business Event</th><th>Account</th><th>Payment</th><th>Ledger Posting</th><th>Amount</th><th>Document</th></tr></thead>
        <tbody>{bookkeepingLedgerRows().map(({ transaction, document, paymentLabel, eventLabel, accountName, ledgerPosting }) => <tr key={transaction.id}>
          <td>{formatDate(transaction.transactionDate)}</td>
          <td><strong>{transaction.description}</strong><small>{transaction.supplier || transaction.source}{transaction.invoiceNumber ? ` - Invoice ${transaction.invoiceNumber}` : ""}</small></td>
          <td>{eventLabel}</td>
          <td>{accountName}</td>
          <td>{paymentLabel}<small>{transaction.paymentStatus === "on_credit" ? transaction.dueDate || transaction.supplierTerms || "Outstanding" : transaction.paymentMethod || "Bank Account"}</small></td>
          <td>{ledgerPosting}</td>
          <td>{formatMoney(transaction.amount)}</td>
          <td>{document?.fileName || "-"}</td>
        </tr>)}</tbody>
      </table>
    </section>
  </section>;

  if (view === "accounting_payable") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>UNSETTLED PAYMENTS</p><h2>Deposits and credit purchases</h2><span>Transactions stay here until the remaining payment is marked paid. Upload the payment proof when you settle it.</span></div><div className="accounting-status-pill">{unsettledTransactions.length} unsettled</div></div>
    <UnsettledPaymentsTable transactions={unsettledTransactions} files={settlementFiles} saving={saving} onFileChange={onSettlementFileChange} onSettle={onSettleTransaction} />
  </section>;

  if (view === "accounting_operating_costs") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>OPERATING COST</p><h2>Pre-paid operating costs</h2><span>Record operating-cost purchases as prepaid first. At month end, enter the amount used to move it into Operating Expense.</span></div><div className="accounting-status-pill">{formatMoney(operatingCostRemaining)} prepaid left</div></div>
    <section className="accounting-summary-grid">
      <MoneyStat label="Prepaid operating cost added" value={operatingCostAdded} tone="sales" />
      <MoneyStat label="Paid into prepaid" value={operatingCostPaid} tone="collected" />
      <MoneyStat label="Released to expense" value={operatingCostUsed} tone="fees" />
      <MoneyStat label="Prepaid remaining" value={operatingCostRemaining} tone="transfer" />
    </section>
    <section className="accounting-form-grid">
      <div className="accounting-form card">
        <h3>Add prepaid operating cost</h3>
        <label>Date<input type="date" value={transactionForm.transactionDate} onChange={(input) => onTransactionFormChange({ transactionDate: input.target.value })} /></label>
        <label>Amount added to prepaid<input type="number" min="0" step="0.01" value={transactionForm.amount} onChange={(input) => onTransactionFormChange({ amount: input.target.value })} /></label>
        <label>Supplier / source<input value={transactionForm.supplier} onChange={(input) => onTransactionFormChange({ supplier: input.target.value })} placeholder="Supplier or source" /></label>
        <label>Description<input value={transactionForm.description} onChange={(input) => onTransactionFormChange({ description: input.target.value })} placeholder="Example: Carton handling cost, fulfilment materials..." /></label>
        <h3>Payment</h3>
        <label>Payment method<select value={transactionForm.paymentStatus} onChange={(input) => onTransactionFormChange({ paymentStatus: input.target.value as AccountingTransactionForm["paymentStatus"] })}><option value="paid_in_full">Bank</option><option value="deposit_paid">Deposit Paid</option><option value="on_credit">On Credit</option></select></label>
        {transactionForm.paymentStatus === "deposit_paid" && <div className="accounting-two-cols"><label>Deposit paid<input type="number" min="0" step="0.01" value={transactionForm.depositAmount} onChange={(input) => onTransactionFormChange({ depositAmount: input.target.value })} /></label><label>Remaining<input readOnly value={formatMoney(Math.max(0, (Number(transactionForm.amount) || 0) - (Number(transactionForm.depositAmount) || 0)))} /></label></div>}
        {transactionForm.paymentStatus === "on_credit" && <div className="accounting-two-cols"><label>Due date<input type="date" value={transactionForm.dueDate} onChange={(input) => onTransactionFormChange({ dueDate: input.target.value })} /></label><label>Supplier terms<input value={transactionForm.supplierTerms} onChange={(input) => onTransactionFormChange({ supplierTerms: input.target.value })} placeholder="30 days, monthly..." /></label></div>}
        <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Source document" description="Choose or drop receipt, invoice, CSV, or image" selectedName={transactionFile?.name} onFile={onTransactionFileChange} />
        <section className="posting-preview">
          <h3>Posting preview</h3>
          {postingPreview.length ? postingPreview.map((entry) => <div key={entry.id}><span>{entry.entryType === "debit" ? "Debit" : "Credit"} {entry.accountName}</span><strong>{formatMoney(entry.amount)}</strong></div>) : <div><span>Enter an amount to preview posting</span><strong>{formatMoney(0)}</strong></div>}
        </section>
        <button className="button primary" disabled={saving} onClick={onCreateTransaction}>{saving ? "Saving..." : "Save prepaid cost"}</button>
      </div>
      <div>
        <section className="accounting-form card operating-release-card">
          <h3>Release monthly operating cost</h3>
          <p className="accounting-file-name">This reduces {prepaidOperatingCostAccountName} and records the amount as Operating Expense.</p>
          <label>Month / date used<input type="date" value={operatingCostReleaseForm.transactionDate} onChange={(input) => onOperatingCostReleaseFormChange({ transactionDate: input.target.value })} /></label>
          <label>Amount used this month<input type="number" min="0" step="0.01" value={operatingCostReleaseForm.amount} onChange={(input) => onOperatingCostReleaseFormChange({ amount: input.target.value })} placeholder="RM 0.00" /></label>
          <label>Description<input value={operatingCostReleaseForm.description} onChange={(input) => onOperatingCostReleaseFormChange({ description: input.target.value })} placeholder={`Operating cost used for ${formatMonthLabel(operatingCostReleaseForm.transactionDate)}`} /></label>
          <section className="posting-preview">
            <h3>Posting preview</h3>
            <div><span>Debit Operating Expense</span><strong>{formatMoney(Number(operatingCostReleaseForm.amount) || 0)}</strong></div>
            <div><span>Credit {prepaidOperatingCostAccountName}</span><strong>{formatMoney(Number(operatingCostReleaseForm.amount) || 0)}</strong></div>
          </section>
          <button className="button primary" disabled={saving} onClick={onReleaseOperatingCost}>{saving ? "Saving..." : "Release to expense"}</button>
        </section>
        {transactionEditPanel}
        <AccountingTransactionsTable transactions={operatingCostPageTransactions} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
      </div>
    </section>
  </section>;

  if (view === "accounting_files") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>SOURCE DOCUMENTS</p><h2>Files linked to transactions</h2><span>Every receipt, invoice, payment proof, or source document attached to a bookkeeping transaction appears here.</span></div><div className="accounting-status-pill">{documents.filter((document) => transactions.some((transaction) => transaction.documentId === document.id)).length} files</div></div>
    <AccountingFilesTable documents={documents} transactions={transactions} ledgerEntries={ledgerEntries} categoryName={categoryName} onOpen={onOpenDocument} />
  </section>;

  if (view === "accounting_bank_reconciliation") return <section className="accounting-workspace">
    <div className="accounting-hero card"><div><p>BANK STATEMENT MATCHING</p><h2>Import bank statement, then match each line</h2><span>Upload Maybank/Public Bank PDF statements or CSV exports. Each line stays here until it is matched, ignored, or removed.</span></div><div className="accounting-status-pill">{bankStatementUnmatched.length} unmatched</div></div>
    <section className="accounting-summary-grid">
      <article className="money-stat transfer"><span>Unmatched lines</span><strong>{bankStatementUnmatched.length}</strong></article>
      <article className="money-stat collected"><span>Matched lines</span><strong>{bankStatementMatched.length}</strong></article>
      <article className="money-stat fees"><span>Ignored lines</span><strong>{bankStatementIgnored.length}</strong></article>
    </section>
    <section className="csv-import-layout bank-statement-layout">
      <div className="accounting-form card">
        <h3>Import bank statement</h3>
        <FileDropZone accept="application/pdf,.pdf,.csv,text/csv" title="Choose or drop bank statement" description={bankStatementFileName || "PDF or CSV from your bank"} onFile={(file) => onReadBankStatement(file ?? undefined)} className="compact-file-drop" />
        <label>Or paste CSV content<textarea value={bankStatementCsv} onChange={(event) => onBankStatementCsvChange(event.target.value)} placeholder="Date, Description, Debit, Credit, Balance..." /></label>
        <div className="csv-import-actions"><button className="button primary" disabled={saving || !bankStatementCsv.trim()} onClick={() => onReadBankStatement()}>{saving ? "Importing..." : "Import pasted CSV"}</button><button className="button secondary" type="button" onClick={onClearBankStatement}>Clear</button></div>
        <section className="posting-preview">
          <h3>How this works</h3>
          <div><span>Money out</span><strong>Choose expense, inventory, asset, marketing, or operating cost</strong></div>
          <div><span>Money in</span><strong>Choose other income, Stripe, Xendit, owner equity, or transfer</strong></div>
          <div><span>After matching</span><strong>The book, journal, T accounts, and reports update</strong></div>
        </section>
      </div>
      <section className="card accounting-table-card bank-statement-card">
        <h3>Statement lines</h3>
        <div className="table-scroll"><table className="orders-table bank-statement-table"><thead><tr><th>Status</th><th>Date</th><th>Description</th><th>Money in</th><th>Money out</th><th>Match as</th><th>Account</th><th>Notes</th><th /></tr></thead><tbody>{bankStatementLines.map((line) => {
          const form = bankStatementMatchForms[line.id] ?? { businessEvent: line.suggestedEvent || (line.moneyIn > 0 ? "other_income" : "expense"), accountName: line.suggestedAccount || "", notes: "" };
          const options = bankStatementAccountOptions(form.businessEvent);
          return <tr key={line.id} className={`bank-line-${line.matchStatus}`}>
            <td><span className={`source-document-pill ${line.matchStatus === "matched" ? "matched" : line.matchStatus === "ignored" ? "ignored" : ""}`}>{line.matchStatus}</span></td>
            <td>{formatDate(line.transactionDate)}<br /><small>{line.reference || `Row ${line.rowNumber}`}</small></td>
            <td><strong>{line.description}</strong>{line.notes && <><br /><small>{line.notes}</small></>}</td>
            <td>{line.moneyIn > 0 ? <strong>{formatMoney(line.moneyIn)}</strong> : "-"}</td>
            <td>{line.moneyOut > 0 ? <strong>{formatMoney(line.moneyOut)}</strong> : "-"}</td>
            <td><select value={form.businessEvent} disabled={line.matchStatus !== "unmatched"} onChange={(event) => onBankStatementMatchFormChange(line.id, { businessEvent: event.target.value, accountName: "" })}><option value="expense">Expense</option><option value="inventory_purchase">Inventory</option><option value="asset_purchase">Asset</option><option value="marketing_expense">Marketing</option><option value="operating_cost">Pre-paid operating cost</option><option value="other_income">Other income</option><option value="payment_processor_paid">Cash / transfer</option><option value="internal_transfer">Internal transfer / pair</option><option value="ignore">Ignore</option></select></td>
            <td><select value={form.accountName || options[0] || ""} disabled={line.matchStatus !== "unmatched" || form.businessEvent === "ignore"} onChange={(event) => onBankStatementMatchFormChange(line.id, { accountName: event.target.value })}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></td>
            <td><input value={form.notes} disabled={line.matchStatus !== "unmatched"} onChange={(event) => onBankStatementMatchFormChange(line.id, { notes: event.target.value })} placeholder="Optional note" /></td>
            <td><button className="view-button" disabled={saving || line.matchStatus !== "unmatched"} onClick={() => onMatchBankStatementLine(line)}>{form.businessEvent === "internal_transfer" ? "Pair" : "Create entry"}</button><button className="view-button" disabled={saving || line.matchStatus !== "unmatched"} onClick={() => onIgnoreBankStatementLine(line)}>Ignore</button><button className="view-button danger-text" disabled={saving} onClick={() => onDeleteBankStatementLine(line)}>Remove</button></td>
          </tr>;
        })}</tbody></table>{!bankStatementLines.length && <div className="empty"><strong>No bank statement imported yet</strong><p>Drop a PDF or CSV statement to start matching transactions from your bank.</p></div>}</div>
      </section>
    </section>
    <section className="card bank-statement-reference bank-statement-reference-print">
      <div className="bank-reference-heading">
        <div><p>BANK STATEMENT REFERENCE</p><h3>Monthly statement view</h3><span>Saved imported rows in the original statement format for checking and PDF reference.</span></div>
        <div className="bank-reference-actions no-print">
          <label>Month<select value={selectedBankStatementMonth} onChange={(event) => setSelectedBankStatementMonth(event.target.value)}><option value="all">All months</option>{bankStatementMonthOptions.map((month) => <option key={month} value={month}>{formatMonthLabel(`${month}-01`)}</option>)}</select></label>
          <button className="button primary" disabled={!bankStatementLines.length} onClick={() => printView("print-bank-statement")}>Print / Save PDF</button>
        </div>
      </div>
      <div className="bank-reference-print-title">
        <p>Meaningful Plushies</p>
        <h2>Bank Statement Reference</h2>
        <span>{selectedBankStatementMonth === "all" ? "All imported months" : formatMonthLabel(`${selectedBankStatementMonth}-01`)}</span>
      </div>
      <div className="bank-reference-months">
        {shownBankStatementGroups.map((group) => {
          const debitTotal = group.lines.reduce((total, line) => total + line.moneyOut, 0);
          const creditTotal = group.lines.reduce((total, line) => total + line.moneyIn, 0);
          return <section className="bank-reference-month" key={group.month}>
            <div className="bank-month-title"><strong>{formatMonthLabel(`${group.month}-01`)}</strong><span>{group.lines.length} transaction{group.lines.length === 1 ? "" : "s"}</span></div>
            <table className="bank-reference-table">
              <thead><tr><th>Date</th><th>Transaction</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead>
              <tbody>
                {group.lines.map((line) => <tr key={line.id}>
                  <td>{formatStatementDate(line.transactionDate)}</td>
                  <td><strong>{line.description}</strong>{line.reference && <small>{line.reference}</small>}{line.notes && <em>{line.notes}</em>}</td>
                  <td>{line.moneyOut > 0 ? formatStatementNumber(line.moneyOut) : ""}</td>
                  <td>{line.moneyIn > 0 ? formatStatementNumber(line.moneyIn) : ""}</td>
                  <td>{formatStatementNumber(line.balance)}</td>
                </tr>)}
              </tbody>
              <tfoot><tr><td colSpan={2}>Monthly total</td><td>{formatStatementNumber(debitTotal)}</td><td>{formatStatementNumber(creditTotal)}</td><td /></tr></tfoot>
            </table>
          </section>;
        })}
        {!shownBankStatementGroups.length && <div className="empty"><strong>No monthly reference yet</strong><p>Import a bank statement first, then the monthly reference will appear here.</p></div>}
      </div>
    </section>
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
    const isOtherIncome = categoryEvent.value === "other_income";
    const newAccountLabel = isAsset ? "New asset name" : isInventory ? "New inventory account name" : isOtherIncome ? "New income account name" : categoryEvent.value === "marketing_expense" ? "New marketing account name" : "New expense account name";
    const otherIncomeTotal = otherIncomeSaleLines.reduce((total, line) => total + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0);
    const otherIncomeUnits = otherIncomeSaleLines.reduce((total, line) => total + (Number(line.quantity) || 0), 0);
    const calculatedAmount = isOtherIncome ? otherIncomeTotal : Number(transactionForm.amount) || ((Number(transactionForm.quantity) || 0) * (Number(transactionForm.unitCost) || 0));
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
    if (isOtherIncome) return <section className="accounting-workspace">
      <div className="accounting-hero card"><div><p>MONEY IN</p><h2>Other Income</h2><span>Record sales that were not keyed into Shopify. These entries post as income and consume inventory through FIFO like normal sales.</span></div><div className="accounting-status-pill">{formatMoney(otherIncomeTotal)}</div></div>
      <section className="accounting-form-grid">
        <div className="accounting-form card">
          <h3>New other income sale</h3>
          <label>Date<input type="date" value={transactionForm.transactionDate} onChange={(input) => onTransactionFormChange({ transactionDate: input.target.value })} /></label>
          <label>Income account<select value={transactionForm.categoryId} onChange={(input) => onTransactionFormChange({ categoryId: input.target.value, accountName: "" })}><option value="">Choose</option>{accountOptions.map((account) => <option key={account.value} value={account.value}>{account.label}</option>)}</select></label>
          {transactionForm.categoryId === newAssetOptionValue && <label>{newAccountLabel}<input value={transactionForm.accountName} onChange={(input) => onTransactionFormChange({ accountName: input.target.value })} placeholder="Example: Pop-up booth sales, manual sales..." /></label>}
          <label>Description<input value={transactionForm.description} onChange={(input) => onTransactionFormChange({ description: input.target.value })} placeholder="Example: Weekend booth sales" /></label>
          <label>Money received into<select value={transactionForm.paymentMethod} onChange={(input) => onTransactionFormChange({ paymentMethod: input.target.value })}>{paymentAccounts.map((account) => <option key={account} value={account}>{account}</option>)}</select></label>
          <section className="card accounting-table-card">
            <h3>Characters sold</h3>
            <div className="table-scroll"><table className="orders-table"><thead><tr><th>Character</th><th>Quantity sold</th><th>Price each</th><th>Total</th></tr></thead><tbody>{otherIncomeSaleLines.map((line) => {
              const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
              return <tr key={line.character}><td><strong>{line.character}</strong></td><td><input type="number" min="0" step="1" value={line.quantity} onChange={(input) => onOtherIncomeSaleLineChange(line.character, { quantity: input.target.value })} /></td><td><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(input) => onOtherIncomeSaleLineChange(line.character, { unitPrice: input.target.value })} /></td><td><strong>{formatMoney(lineTotal)}</strong></td></tr>;
            })}</tbody></table></div>
          </section>
          <FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.csv,.xlsx,.xls,.doc,.docx" title="Source document" description="Choose or drop receipt, proof, CSV, or image" selectedName={transactionFile?.name} onFile={onTransactionFileChange} />
          <label>Notes<textarea value={transactionForm.notes} onChange={(event) => onTransactionFormChange({ notes: event.target.value })} /></label>
          <section className="posting-preview">
            <h3>Posting preview</h3>
            <div><span>Debit {transactionForm.paymentMethod || "Bank Account"}</span><strong>{formatMoney(otherIncomeTotal)}</strong></div>
            <div><span>Credit {(accountOptions.find((account) => account.value === transactionForm.categoryId)?.label ?? transactionForm.accountName) || "Other income account"}</span><strong>{formatMoney(otherIncomeTotal)}</strong></div>
            <p>{otherIncomeUnits.toLocaleString("en-MY")} unit{otherIncomeUnits === 1 ? "" : "s"} will be counted as sold for FIFO inventory.</p>
          </section>
          <button className="button primary" disabled={saving} onClick={onCreateTransaction}>{saving ? "Saving..." : "Save other income"}</button>
        </div>
        <div>
          {transactionEditPanel}
          <AccountingTransactionsTable transactions={transactions.filter((transaction) => transaction.businessEvent === "other_income")} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
        </div>
      </section>
    </section>;
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
        <div>
          {transactionEditPanel}
          <AccountingTransactionsTable transactions={processorPayouts} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
        </div>
      </section>
    </section>;
    return <section className="accounting-workspace">
      <div className="accounting-hero card"><div><p>{categoryEvent.group.toUpperCase()}</p><h2>{categoryEvent.label}</h2><span>{isInventory ? "Record stock bought by batch. Quantity updates the inventory stock settings after saving." : isMoneyIn ? "Record payout money received from payment processors or sales reports." : "Record a simple bookkeeping transaction with source document proof."}</span></div><div className="accounting-status-pill">{formatMoney(calculatedAmount || 0)}</div></div>
      <section className="accounting-form-grid">
        <div className="accounting-form card">
          <h3>New {categoryEvent.label} record</h3>
          <label>Date<input type="date" value={transactionForm.transactionDate} onChange={(input) => onTransactionFormChange({ transactionDate: input.target.value })} /></label>
          <label>{isInventory ? "Inventory item" : isMoneyIn ? "Money in type" : isAsset ? "Asset" : "Category"}<select value={transactionForm.categoryId} onChange={(input) => onTransactionFormChange({ categoryId: input.target.value, accountName: "" })}><option value="">Choose</option>{accountOptions.map((account) => <option key={account.value} value={account.value}>{account.label}</option>)}</select></label>
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
        {transactionEditPanel}
        <AccountingTransactionsTable transactions={transactions.filter((transaction) => transaction.businessEvent === categoryEvent.value || (categoryEvent.value === "inventory_purchase" && transaction.businessEvent === "inventory_rejected"))} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
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
      {transactionEditPanel}
      <AccountingTransactionsTable transactions={transactions} ledgerEntries={ledgerEntries} documents={transactionDocuments} categoryName={categoryName} onOpenDocument={onOpenDocument} onEdit={onEditTransaction} onDelete={onDeleteTransaction} />
    </section>
  </section>;

  if (view === "accounting_settings") {
    const sectionEntries = Object.entries(bookkeepingSectionConfigs) as [BookkeepingSectionKey, typeof bookkeepingSectionConfigs[BookkeepingSectionKey]][];
    return <section className="accounting-workspace">
      <div className="accounting-hero card"><div><p>BOOK KEEPING SETTINGS</p><h2>Saved accounts</h2><span>Create new accounts directly from Inventory, Expenses, Assets, or Marketing by choosing + New account in the entry form.</span></div><div className="accounting-status-pill">{categories.filter((category) => Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === category.reportSection) || expenseOptionReportSections.includes(category.reportSection)).length} items</div></div>
      <section>
        <section className="accounting-form card">
          <div className="accounting-form-heading"><div><h3>{accountForm.id ? "Edit account" : "Account details"}</h3><p>Change the account name or section used in the Choose account dropdowns.</p></div>{accountForm.id && <button className="view-button" onClick={() => onAccountFormChange({ id: "", name: "", accountType: "expense", reportSection: "Expenses", parentId: "", dataSourceType: "manual", sourceModule: "Manual Transactions", sourceEntity: "", postingTrigger: "Manual Entry", allowSubAccounts: false, active: true })}>Cancel edit</button>}</div>
          <div className="accounting-form-grid compact">
            <label>Name<input value={accountForm.name} onChange={(input) => onAccountFormChange({ name: input.target.value })} placeholder="Example: NFC Cards, Labour, Meta Ads" /></label>
            <label>Type<select value={accountForm.accountType} onChange={(input) => onAccountFormChange({ accountType: input.target.value as AccountingCategory["accountType"] })}><option value="asset">Asset</option><option value="expense">Expense</option><option value="revenue">Revenue</option><option value="cost_of_sales">Cost of sales</option><option value="liability">Liability</option><option value="equity">Equity</option></select></label>
            <label>Section<select value={accountForm.reportSection} onChange={(input) => onAccountFormChange({ reportSection: input.target.value })}>{Object.entries(bookkeepingSectionConfigs).map(([key, config]) => <option key={key} value={config.reportSection}>{config.label}</option>)}<option value="Software Expenses">Software Expenses</option><option value="Admin Fees">Admin Fees</option><option value="Salary">Salary</option><option value="Tax">Tax</option><option value="COGS">COGS</option><option value="Current Assets">Current Assets</option><option value="Revenue">Revenue</option></select></label>
            <label>Active<select value={accountForm.active ? "yes" : "no"} onChange={(input) => onAccountFormChange({ active: input.target.value === "yes" })}><option value="yes">Active</option><option value="no">Inactive</option></select></label>
          </div>
          <button className="button primary" disabled={saving} onClick={onSaveAccount}>{saving ? "Saving..." : accountForm.id ? "Save account changes" : "Add account"}</button>
        </section>
        <section className="card accounting-table-card"><h3>Saved category accounts</h3><div className="table-scroll"><table className="orders-table"><thead><tr><th>Section</th><th>Account item</th><th>Type</th><th>Parent</th><th /></tr></thead><tbody>{sectionEntries.flatMap(([key, config]) => {
          const sectionRows = categories.filter((category) => key === "expense" ? category.accountType === "expense" && expenseOptionReportSections.includes(category.reportSection) : category.reportSection === config.reportSection).filter((category) => key !== "inventory" || Boolean(inventoryAccountKey(category.name))).sort((a, b) => a.name.localeCompare(b.name));
          const rows = key === "inventory"
            ? sectionRows.filter((account, index, accounts) => accounts.findIndex((item) => inventoryAccountKey(item.name) === inventoryAccountKey(account.name)) === index)
            : sectionRows;
          return rows.map((account) => <tr key={account.id}><td>{config.label}</td><td><strong>{key === "inventory" ? inventoryAccountKey(account.name) : account.name}</strong><br /><small>Used by {config.sourceEntity}</small></td><td>{account.accountType}</td><td>{account.parentId ? categoryName(account.parentId) : config.parentAccount}</td><td><button className="view-button" onClick={() => onEditAccount(account)}>Edit</button></td></tr>);
        })}</tbody></table>{!categories.some((category) => Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === category.reportSection) || expenseOptionReportSections.includes(category.reportSection)) && <div className="empty"><strong>No saved category accounts yet</strong><p>Create one from a bookkeeping entry form using + New account.</p></div>}</div></section>
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
        <td>{displayAccountingAccountName(transaction.accountName || categoryName(transaction.categoryId))}</td>
        <td>{entries.length ? entries.map((entry) => <div key={entry.id} className="ledger-line"><span>{entry.entryType === "debit" ? "Debit" : "Credit"} {displayAccountingAccountName(entry.accountName)}</span><strong>{formatMoney(entry.amount)}</strong></div>) : "-"}</td>
        <td><strong>{formatMoney(transaction.amount)}</strong></td>
        <td><button className="view-button document-link" onClick={() => onOpen(document)}>View file</button></td>
      </tr>;
    })}</tbody></table>{!rows.length && <div className="empty"><strong>No linked source documents yet</strong><p>Attach a file when creating a bookkeeping transaction, and it will appear here.</p></div>}</div>
  </section>;
}

function AccountingTransactionsTable({ transactions, ledgerEntries, documents, categoryName, onOpenDocument, onEdit, onDelete }: { transactions: AccountingTransaction[]; ledgerEntries: AccountingLedgerEntry[]; documents: AccountingDocument[]; categoryName: (categoryId: string) => string; onOpenDocument: (document: AccountingDocument) => void; onEdit: (transaction: AccountingTransaction) => void; onDelete: (transaction: AccountingTransaction) => void }) {
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateCompare = dateKey(a.transactionDate).localeCompare(dateKey(b.transactionDate));
    return dateCompare || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
  return <section className="card accounting-table-card"><h3>Transaction ledger</h3><div className="table-scroll"><table className="orders-table"><thead><tr><th>Date</th><th>Description</th><th>Business event</th><th>Account</th><th>Payment</th><th>Ledger posting</th><th>Document</th><th /></tr></thead><tbody>{sortedTransactions.map((transaction) => {
    const entries = ledgerEntries.filter((entry) => entry.transactionId === transaction.id);
    const document = documents.find((item) => item.id === transaction.documentId);
    const paymentLabel = transaction.paymentStatus === "deposit_paid" ? `Deposit ${formatMoney(transaction.depositAmount)}` : transaction.paymentStatus === "on_credit" ? "On Credit" : "Paid In Full";
    const ledgerLines = entries.length ? entries.map((entry, index) => {
      const accountName = displayAccountingAccountName(entry.accountName);
      return <div key={entry.id} className="ledger-line"><span>{index === 0 ? `Record ${accountName}` : accountName.includes("Payable") || accountName.includes("Receivable") ? `Outstanding ${accountName}` : `Payment from ${accountName}`}</span><strong>{formatMoney(entry.amount)}</strong></div>;
    }) : <small>{formatMoney(transaction.amount)}</small>;
    return <tr key={transaction.id} className={document ? "has-source-document" : ""} onClick={(event) => { if (!document || (event.target as HTMLElement).closest("button,a,input")) return; onOpenDocument(document); }}>
      <td>{formatDate(transaction.transactionDate)}</td>
      <td><strong className={document ? "source-document-text" : ""}>{transaction.description}</strong>{document && <span className="source-document-pill">Source document</span>}<br /><small>{transaction.supplier || transaction.source}{transaction.invoiceNumber ? ` - Invoice ${transaction.invoiceNumber}` : ""}</small></td>
      <td>{businessEvents.find((event) => event.value === transaction.businessEvent)?.label ?? (transaction.businessEvent || "-")}</td>
      <td>{displayAccountingAccountName(transaction.accountName || categoryName(transaction.categoryId))}</td>
      <td>{paymentLabel}<br /><small>{transaction.paymentStatus === "on_credit" ? transaction.dueDate || transaction.supplierTerms || "Outstanding" : transaction.paymentMethod || "Bank Account"}</small></td>
      <td>{ledgerLines}</td>
      <td>{document ? <button className="view-button document-link" onClick={() => onOpenDocument(document)}>View file</button> : "-"}</td>
      <td><button className="view-button" onClick={() => onEdit(transaction)}>Edit</button><button className="view-button danger-text" onClick={() => onDelete(transaction)}>Delete</button></td>
    </tr>;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-MY").format(Math.round(value));
}

function formatRatio(value: number) {
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)}x` : "-";
}

function formatPercent(value: number) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "-";
}

function AdsWorkspacePage({
  startDate,
  endDate,
  environment,
  trackingSettings,
  capiEnvironment,
  summary,
  insights,
  configured,
  loading,
  error,
  capiLogs,
  onStartDateChange,
  onEndDateChange,
  onRefresh,
}: {
  startDate: string;
  endDate: string;
  environment: MetaAdsEnvironment;
  trackingSettings: MetaCapiSettings;
  capiEnvironment: { pixelConfigured: boolean; tokenConfigured: boolean; tokenMasked: string; testEventCodeConfigured: boolean };
  summary: MetaAdsSummary;
  insights: MetaAdsInsight[];
  configured: boolean;
  loading: boolean;
  error: string;
  capiLogs: MetaCapiLog[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onRefresh: () => void;
}) {
  const periodStart = startDate ? new Date(`${startDate}T00:00:00`).getTime() : 0;
  const periodEnd = endDate ? new Date(`${endDate}T23:59:59`).getTime() : Date.now();
  const logsInPeriod = capiLogs.filter((log) => {
    const time = new Date(log.createdAt).getTime();
    return Number.isFinite(time) && time >= periodStart && time <= periodEnd;
  });
  const successfulEvents = logsInPeriod.filter((log) => log.status === "success").length;
  const failedEvents = logsInPeriod.filter((log) => log.status === "failed").length;
  const reviewEvents = logsInPeriod.filter((log) => log.status === "needs_review").length;
  const trackingScore = logsInPeriod.length ? successfulEvents / logsInPeriod.length : 0;
  const bestAds = insights.filter((ad) => ad.spend > 0).sort((a, b) => b.roas - a.roas);
  const watchAds = insights.filter((ad) => ad.spend > 0 && ad.purchases <= 0).sort((a, b) => b.spend - a.spend);
  const pixelReady = Boolean(trackingSettings.pixelId.trim()) || capiEnvironment.pixelConfigured;

  return <section className="ads-workspace">
    <div className="accounting-hero card ads-hero"><div><p>META ADS</p><h2>Ads performance and tracking health</h2><span>Pulls ad spend and purchase results from Meta, then compares it with your server-side tracking events so you can see whether the numbers are trustworthy.</span></div><div className={`accounting-status-pill ${configured ? "" : "loss"}`}>{configured ? "Meta connected" : "Setup needed"}</div></div>

    <section className="ads-controls card">
      <div><label>From<input type="date" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} /></label><label>To<input type="date" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} /></label></div>
      <button className="button primary" onClick={onRefresh} disabled={loading}>{loading ? "Refreshing..." : "Refresh Meta data"}</button>
    </section>

    {error && <div className="notice"><span>{error}</span></div>}
    {!configured && <section className="card ads-setup-card">
      <h3>Meta ads connection is not configured yet</h3>
      <p>Add `META_AD_ACCOUNT_ID` and `META_ADS_ACCESS_TOKEN` in Vercel. The token needs Meta Marketing API access with permission to read ads insights.</p>
      <div className="ads-setup-grid"><span>Ad account: <strong>{environment.adAccountConfigured ? "Configured" : "Missing"}</strong></span><span>Token: <strong>{environment.tokenConfigured ? environment.tokenMasked : "Missing"}</strong></span><span>Graph API: <strong>{environment.graphVersion}</strong></span></div>
    </section>}

    <section className="card ads-setup-card">
      <h3>Tracking setup</h3>
      <p>Use Settings workspace &gt; Meta CAPI to save your Pixel ID and tracking notes. The access token stays in Vercel because it is private.</p>
      <div className="ads-setup-grid">
        <span>Meta Pixel ID: <strong>{pixelReady ? trackingSettings.pixelId || "Configured in Vercel" : "Missing"}</strong></span>
        <span>Browser Pixel: <strong>{trackingSettings.browserPixelEnabled ? "Marked installed" : "Not marked yet"}</strong></span>
        <span>Server events: <strong>{trackingSettings.enabled && capiEnvironment.tokenConfigured ? "Ready" : "Not ready"}</strong></span>
      </div>
      {trackingSettings.trackingNotes && <p className="ads-tracking-notes">{trackingSettings.trackingNotes}</p>}
    </section>

    <section className="ads-summary-grid">
      <MoneyStat label="Ad spend" value={summary.spend} tone="fees" />
      <MoneyStat label="Purchase revenue" value={summary.revenue} tone="sales" />
      <article className="money-stat ads-ratio"><span>ROAS</span><strong>{formatRatio(summary.roas)}</strong></article>
      <MoneyStat label="CPA" value={summary.cpa} tone="transfer" />
      <article className="money-stat ads-ratio"><span>Purchases</span><strong>{formatNumber(summary.purchases)}</strong></article>
      <article className="money-stat ads-ratio"><span>Tracking success</span><strong>{logsInPeriod.length ? formatPercent(trackingScore) : "-"}</strong></article>
    </section>

    <section className="ads-insight-grid">
      <article className="card ads-mini-panel"><h3>Doing well</h3>{bestAds.slice(0, 4).map((ad) => <div key={ad.adId || ad.adName}><span>{ad.adName}</span><strong>{formatRatio(ad.roas)}</strong><small>{formatMoney(ad.spend)} spend | {formatNumber(ad.purchases)} purchase{ad.purchases === 1 ? "" : "s"}</small></div>)}{!bestAds.length && <p>No ads with spend yet for this range.</p>}</article>
      <article className="card ads-mini-panel"><h3>Watch closely</h3>{watchAds.slice(0, 4).map((ad) => <div key={ad.adId || ad.adName}><span>{ad.adName}</span><strong>{formatMoney(ad.spend)}</strong><small>No purchases tracked</small></div>)}{!watchAds.length && <p>No high-spend zero-purchase ads in this range.</p>}</article>
      <article className="card ads-mini-panel"><h3>Tracking health</h3><div><span>Successful CAPI events</span><strong>{successfulEvents}</strong></div><div><span>Failed events</span><strong>{failedEvents}</strong></div><div><span>Needs review</span><strong>{reviewEvents}</strong></div><small>These are server-side Meta Purchase events saved in your app logs.</small></article>
    </section>

    <section className="card accounting-table-card ads-table-card">
      <h3>Ad performance</h3>
      <div className="table-scroll"><table className="orders-table"><thead><tr><th>Ad</th><th>Campaign</th><th>Spend</th><th>Revenue</th><th>ROAS</th><th>CPA</th><th>Purchases</th><th>CTR</th><th>Clicks</th><th>Impressions</th></tr></thead><tbody>{insights.map((ad) => <tr key={ad.adId || `${ad.campaignName}-${ad.adName}`}>
        <td><strong>{ad.adName}</strong><br /><small>{ad.adsetName || ad.adId}</small></td>
        <td>{ad.campaignName || "-"}</td>
        <td>{formatMoney(ad.spend)}</td>
        <td>{formatMoney(ad.revenue)}</td>
        <td><strong>{formatRatio(ad.roas)}</strong></td>
        <td>{ad.cpa ? formatMoney(ad.cpa) : "-"}</td>
        <td>{formatNumber(ad.purchases)}</td>
        <td>{formatPercent(ad.ctr)}</td>
        <td>{formatNumber(ad.clicks)}</td>
        <td>{formatNumber(ad.impressions)}</td>
      </tr>)}</tbody></table>{!insights.length && <div className="empty"><strong>No Meta ads data loaded yet</strong><p>{configured ? "Try another date range or refresh Meta data." : "Add the Meta ads environment variables in Vercel, then redeploy."}</p></div>}</div>
    </section>
  </section>;
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

function FormalAccountingWorkspacePage({
  view,
  orders,
  transactions,
  ledgerEntries,
  categories,
  salesRows,
  salesConsumptionMappings,
  salesConsumptionMappingForm,
  saving,
  onSalesConsumptionMappingFormChange,
  onSaveSalesConsumptionRule,
  onRemoveSalesConsumptionRule,
  categoryName,
}: {
  view: View;
  orders: Order[];
  transactions: AccountingTransaction[];
  ledgerEntries: AccountingLedgerEntry[];
  categories: AccountingCategory[];
  salesRows: SalesReportRow[];
  salesConsumptionMappings: SalesConsumptionMapping[];
  salesConsumptionMappingForm: SalesConsumptionMappingForm;
  saving: boolean;
  onSalesConsumptionMappingFormChange: (patch: Partial<SalesConsumptionMappingForm>) => void;
  onSaveSalesConsumptionRule: () => void;
  onRemoveSalesConsumptionRule: (mapping: SalesConsumptionMapping) => void;
  categoryName: (categoryId: string) => string;
}) {
  const [selectedTAccountSection, setSelectedTAccountSection] = useState("Cash");
  const [selectedTAccountName, setSelectedTAccountName] = useState("all");
  const [selectedUnitCostItem, setSelectedUnitCostItem] = useState("all");
  const [selectedFinancialReport, setSelectedFinancialReport] = useState<FinancialReportType>("income_statement");
  const [accountingPeriodMode, setAccountingPeriodMode] = useState<AccountingPeriodMode>("this_month");
  const [accountingStartDate, setAccountingStartDate] = useState(monthStartKey());
  const [accountingEndDate, setAccountingEndDate] = useState(monthEndKey());
  const inventoryItemName = inventoryAccountKey;
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
          const events: { id: string; date: string; itemName: string; quantity: number; type: "sale"; inPeriod: boolean; sku: string }[] = [];
          const itemName = inventoryItemName(mapping.inventoryItem);
          if (itemName && mapping.quantityPerSale > 0) {
            events.push({ id: `sale-${order.id}-${mapping.id}-inventory`, date, itemName, quantity: mapping.quantityPerSale, type: "sale", inPeriod, sku });
          }
          return events;
        });
      }),
    ...sortedTransactions
      .filter((transaction) => transaction.businessEvent === "inventory_rejected" && (!accountingEndDate || dateKey(transaction.transactionDate) <= accountingEndDate))
      .map((transaction) => ({ id: `reject-${transaction.id}`, date: dateKey(transaction.transactionDate), itemName: inventoryItemName(transaction.accountName), quantity: Number(transaction.quantity) || (transaction.unitCost > 0 ? transaction.amount / transaction.unitCost : 0), type: "reject" as const, inPeriod: false, sku: "" })),
    ...sortedTransactions
      .filter((transaction) => transaction.businessEvent === "other_income" && (!accountingEndDate || dateKey(transaction.transactionDate) <= accountingEndDate))
      .flatMap((transaction) => {
        const date = dateKey(transaction.transactionDate);
        const sku = inventoryItemName(transaction.supplier || transaction.description);
        const quantitySold = Number(transaction.quantity) || 0;
        if (!sku || quantitySold <= 0) return [];
        const mappings = activeSalesMappingsBySku[sku] ?? [];
        const consumptionMappings: SalesConsumptionMapping[] = mappings.length ? mappings : [{
          id: `fallback-other-income-${sku}`,
          sku,
          inventoryItem: sku,
          quantityPerSale: 1,
          operatingExpensePerSale: 0,
          active: true,
          createdAt: "",
          updatedAt: "",
        }];
        const inPeriod = (!accountingStartDate || date >= accountingStartDate) && (!accountingEndDate || date <= accountingEndDate);
        return consumptionMappings.map((mapping) => ({ id: `other-income-${transaction.id}-${mapping.id}`, date, itemName: inventoryItemName(mapping.inventoryItem), quantity: quantitySold * mapping.quantityPerSale, type: "sale" as const, inPeriod, sku }));
      }),
  ].filter((event) => event.itemName && event.quantity > 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  consumptionEvents.forEach((event) => {
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
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const formalLedgerEntries = ledgerEntries.map((entry) => {
    const transaction = transactionById.get(entry.transactionId);
    if (isPrepaidOperatingCostAccountName(entry.accountName) && (transaction?.businessEvent === "operating_cost" || entry.entryType === "credit")) {
      return { ...entry, accountId: entry.accountId, accountName: prepaidOperatingCostAccountName, memo: entry.memo || "Pre-paid operating cost recorded" };
    }
    return entry;
  });
  const allLedgerEntries = [...formalLedgerEntries, ...generatedSalesGroups.flatMap((group) => group.entries), ...cogsGroups.flatMap((group) => group.entries)];
  const generatedTransactionDescriptions = new Map([...generatedSalesGroups.map((group) => [group.id, group.description] as const), ...cogsGroups.map((group) => [group.id, group.description] as const)]);
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
    { title: "Inventory", reportSections: [bookkeepingSectionConfigs.inventory.reportSection], names: [], eventValues: ["inventory_purchase"] },
    { title: "Expense", reportSections: [bookkeepingSectionConfigs.expense.reportSection, "COGS", "Admin Fees"], names: [], eventValues: ["expense", "inventory_rejected"] },
    { title: "Assets", reportSections: [bookkeepingSectionConfigs.asset.reportSection], names: [], eventValues: ["asset_purchase"] },
    { title: "Marketing", reportSections: [bookkeepingSectionConfigs.marketing.reportSection], names: [], eventValues: ["marketing_expense"] },
    { title: "Cash", reportSections: [], names: [], eventValues: ["payment_processor_paid"] },
    { title: "Sales", reportSections: ["Revenue"], names: [] },
  ];
  const cashAccountNames = new Set(["Bank Account", "Payment Processors", "Stripe", "Xendit", "TikTok Shop", "Owner Capital", "Owner Drawings"]);
  const automaticTAccountNames = new Set(["Bank Account", "Stripe", "Xendit", "Owner's Equity", "Drawings", "Sales", "Payment Processing Fees", prepaidOperatingCostAccountName, "Operating Expense", "Accounts Payable", ...cogsAccounts]);
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
    const hasLedger = (name: string) => Boolean(accountGroups[name]?.length);
    const savedNames = categories
      .filter((category) => categoryBelongsToSection(category, section))
      .filter((category) => Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === category.reportSection) || hasLedger(category.name))
      .map((category) => category.name);
    const allNames = new Set([...section.names, ...savedNames]);
    transactions.forEach((transaction) => {
      if (!section.eventValues?.includes(transaction.businessEvent)) return;
      const transactionCategory = categories.find((category) => category.id === transaction.categoryId);
      if (transactionCategory && Object.values(bookkeepingSectionConfigs).some((config) => config.reportSection === transactionCategory.reportSection)) allNames.add(transaction.accountName || categoryName(transaction.categoryId));
    });
    allLedgerEntries.forEach((entry) => {
      const category = categories.find((item) => item.id === entry.accountId);
      if (category && categoryBelongsToSection(category, section)) allNames.add(entry.accountName);
      if (automaticTAccountNames.has(entry.accountName)) {
        if (section.title === "Cash" && ["Bank Account", "Stripe", "Xendit", "Owner's Equity", "Drawings"].includes(entry.accountName)) allNames.add(entry.accountName);
        if (section.title === "Sales" && entry.accountName === "Sales") allNames.add(entry.accountName);
        if (section.title === "Expense" && (entry.accountName === "Payment Processing Fees" || entry.accountName === "Operating Expense" || cogsAccounts.includes(entry.accountName as (typeof cogsAccounts)[number]))) allNames.add(entry.accountName);
        if (section.title === "Assets" && entry.accountName === prepaidOperatingCostAccountName) allNames.add(entry.accountName);
      }
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
  const journalRows = [...manualJournalRows, ...generatedJournalRows, ...generatedCogsJournalRows].sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference) || a.lineIndex - b.lineIndex || a.id.localeCompare(b.id));
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
  const inventoryMappingOptions = [...new Set([
    ...stockCharacters,
    ...categories
      .filter((category) => category.active)
      .filter((category) => category.reportSection === bookkeepingSectionConfigs.inventory.reportSection || (category.parentId && categoryName(category.parentId) === "Inventory"))
      .map((category) => inventoryAccountKey(category.name))
      .filter((name) => name && name !== "INVENTORY"),
  ])]
    .sort((a, b) => a.localeCompare(b));
  const nextFifoBatchForItem = (itemName: string) => purchaseBatchStates
    .filter((batch) => inventoryAccountKey(batch.itemName) === inventoryAccountKey(itemName) && batch.quantityLeft > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.batchNumber - b.batchNumber)[0];
  const selectedCogsSku = normalizeAccountingItem(salesConsumptionMappingForm.sku || stockCharacters[0]);
  const selectedSalesConsumptionMappings = salesConsumptionMappings.filter((mapping) => normalizeAccountingItem(mapping.sku) === selectedCogsSku);
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
  const salesRevenueRows = balancesForNames(sectionAccountNames(tAccountSections[5]));
  const salesRevenue = salesRevenueRows.reduce((total, item) => total + Math.abs(item.balance), 0);
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
      <div className="accounting-form-heading">
        <div>
          <h3>COGS settings</h3>
          <p>Map each sold character to the inventory it consumes. COGS follows FIFO: the earliest batch price is used first, then the next batch once it runs out.</p>
        </div>
      </div>
      <div className="range-tabs t-account-tabs">
        {stockCharacters.map((character) => <button key={character} className={selectedCogsSku === character ? "active" : ""} onClick={() => onSalesConsumptionMappingFormChange({ sku: character })}>{character}</button>)}
      </div>
      <div className="cogs-rule-form">
        <label className="cogs-rule-field">Inventory account used<select value={salesConsumptionMappingForm.inventoryItem} onChange={(input) => onSalesConsumptionMappingFormChange({ inventoryItem: input.target.value })}><option value="">Choose inventory account</option>{inventoryMappingOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label className="cogs-rule-field">Units used per sale<input type="number" min="0" step="0.0001" value={salesConsumptionMappingForm.quantityPerSale} onChange={(input) => onSalesConsumptionMappingFormChange({ quantityPerSale: input.target.value })} /></label>
      </div>
      {!inventoryMappingOptions.length && <p className="accounting-file-name">No inventory accounts found yet. Add inventory items in Book Keeping first.</p>}
      <button className="button primary" disabled={saving} onClick={onSaveSalesConsumptionRule}>{saving ? "Saving..." : `Add item for ${selectedCogsSku}`}</button>
      <div className="table-scroll"><table className="orders-table unit-cost-table"><thead><tr><th>Inventory used</th><th>Units per sale</th><th>COGS account</th><th>Next FIFO batch</th><th /></tr></thead><tbody>{selectedSalesConsumptionMappings.map((mapping) => {
        const inventoryUsed = inventoryAccountKey(mapping.inventoryItem);
        const nextBatch = inventoryUsed ? nextFifoBatchForItem(inventoryUsed) : undefined;
        return <tr key={mapping.id}><td>{inventoryUsed || "-"}</td><td>{mapping.quantityPerSale.toLocaleString("en-MY")}</td><td>{inventoryUsed ? cogsAccountForInventoryItem(inventoryUsed) : "-"}</td><td>{nextBatch ? `Batch ${nextBatch.batchNumber} - ${formatMoney(nextBatch.unitCost)} (${nextBatch.quantityLeft.toLocaleString("en-MY")} left)` : inventoryUsed ? "No stock batch left" : "-"}</td><td><button className="view-button danger-text" onClick={() => onRemoveSalesConsumptionRule(mapping)}>Delete</button></td></tr>;
      })}</tbody></table>{!selectedSalesConsumptionMappings.length && <div className="empty"><strong>No COGS mappings for {selectedCogsSku} yet</strong><p>Add inventory items above. Example: Billy uses 1 NFC Card, then FIFO pulls from the oldest NFC Card batch first.</p></div>}</div>
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
        {salesRevenueRows.map((item) => <div className="statement-row" key={item.name}><span>{item.name}</span><strong>{formatMoney(Math.abs(item.balance))}</strong></div>)}
        {!salesRevenueRows.length && <div className="statement-row muted"><span>No revenue recorded</span><strong>{formatMoney(0)}</strong></div>}
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

const creatorTierDefaults: Record<CreatorTier, { label: string; rate: number; requirement: string }> = {
  tier_1: { label: "Tier 1", rate: 10, requirement: "Default creator tier" },
  tier_2: { label: "Tier 2", rate: 15, requirement: "50 lifetime sales and 20 monthly sales" },
  tier_3: { label: "Tier 3", rate: 20, requirement: "100 monthly sales and RM500 upgrade bonus" },
  tier_4: { label: "Tier 4", rate: 25, requirement: "500 monthly sales and RM2,000 monthly retainer" },
};

const creatorFormDefaults = {
  username: "",
  password: "",
  userId: "",
  displayName: "",
  email: "",
  phone: "",
  tiktokUrl: "",
  instagramUrl: "",
  discountCode: "",
  commissionRate: "10",
  currentTier: "tier_1" as CreatorTier,
  status: "active" as CreatorStatus,
  internalNotes: "",
};

function creatorCommissionSummary(commissions: CreatorCommission[]) {
  const monthKey = new Date().toISOString().slice(0, 7);
  return commissions.reduce((summary, commission) => {
    const sameMonth = (commission.orderDate || commission.createdAt).slice(0, 7) === monthKey;
    summary.lifetimeSales += 1;
    summary.lifetimeRevenue += commission.eligibleSubtotal;
    summary.lifetimeCommission += commission.commissionAmount;
    if (sameMonth) {
      summary.monthSales += 1;
      summary.monthRevenue += commission.eligibleSubtotal;
      summary.monthCommission += commission.commissionAmount;
    }
    summary.byStatus[commission.status] = (summary.byStatus[commission.status] ?? 0) + commission.commissionAmount;
    return summary;
  }, {
    lifetimeSales: 0,
    lifetimeRevenue: 0,
    lifetimeCommission: 0,
    monthSales: 0,
    monthRevenue: 0,
    monthCommission: 0,
    byStatus: {} as Record<CommissionStatus, number>,
  });
}

function CreatorProgramWorkspacePage({
  view,
  session,
  accounts,
  creatorProfiles,
  creatorCommissions,
  creatorPayouts,
  orders,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onSaveProfile,
  onUpdateCommission,
  onSavePayoutInfo,
  onSavePayout,
}: {
  view: View;
  session: Session;
  accounts: DashboardAccount[];
  creatorProfiles: CreatorProfile[];
  creatorCommissions: CreatorCommission[];
  creatorPayouts: CreatorPayout[];
  orders: Order[];
  onCreateAccount: (account: Omit<DashboardAccount, "id" | "active">, password: string) => Promise<DashboardAccount[]>;
  onUpdateAccount: (account: DashboardAccount, password?: string) => Promise<void>;
  onDeleteAccount: (accountId: string) => Promise<void>;
  onSaveProfile: (profile: CreatorProfile) => Promise<void>;
  onUpdateCommission: (commission: CreatorCommission) => Promise<void>;
  onSavePayoutInfo: (profile: CreatorProfile) => Promise<void>;
  onSavePayout: (payout: CreatorPayout) => Promise<void>;
}) {
  const admin = session.role === "admin";
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(creatorFormDefaults);
  const [showCreatorPassword, setShowCreatorPassword] = useState(false);
  const [creatorPasswordEdits, setCreatorPasswordEdits] = useState<Record<string, string>>({});
  const [creatorPasswordVisible, setCreatorPasswordVisible] = useState<Record<string, boolean>>({});
  const [payoutInfoForm, setPayoutInfoForm] = useState({ payoutMethod: "", payoutAccountName: "", payoutAccountNumber: "", payoutNotes: "" });
  const [payoutForm, setPayoutForm] = useState({
    creatorId: "",
    payoutMonth: new Date().toISOString().slice(0, 7),
    approvedCommissionAmount: "",
    bonusAmount: "0",
    retainerAmount: "0",
    paymentReference: "",
    proofFileName: "",
    proofFileType: "",
    proofFileDataUrl: "",
  });
  const [freeCreatorSamples, setFreeCreatorSamples] = useState<FreeCreatorSample[]>(() => readJson<FreeCreatorSample[]>(freeCreatorSamplesStorageKey) ?? []);
  const [freeCreatorSampleForm, setFreeCreatorSampleForm] = useState({ creatorName: "", creatorUrl: "", sampleCode: "", notes: "" });
  const visibleProfiles = admin ? creatorProfiles : creatorProfiles.filter((profile) => profile.userId === session.id);
  const currentProfile = visibleProfiles[0];
  const visibleCommissions = admin
    ? creatorCommissions
    : currentProfile ? creatorCommissions.filter((commission) => commission.creatorId === currentProfile.id) : [];
  const summary = creatorCommissionSummary(visibleCommissions);
  const creatorAccounts = accounts.filter((account) => account.role === "creator");
  const attributedOrderCount = orders.filter((order) => order.discountCodes?.some((code) => creatorProfiles.some((profile) => profile.discountCode.toLowerCase() === code.toLowerCase()))).length;
  useEffect(() => {
    if (!currentProfile) return;
    setPayoutInfoForm({
      payoutMethod: currentProfile.payoutMethod,
      payoutAccountName: currentProfile.payoutAccountName,
      payoutAccountNumber: currentProfile.payoutAccountNumber,
      payoutNotes: currentProfile.payoutNotes,
    });
  }, [currentProfile?.id, currentProfile?.payoutMethod, currentProfile?.payoutAccountName, currentProfile?.payoutAccountNumber, currentProfile?.payoutNotes]);
  useEffect(() => {
    writeJson(freeCreatorSamplesStorageKey, freeCreatorSamples);
  }, [freeCreatorSamples]);

  function updateForm(patch: Partial<typeof creatorFormDefaults>) {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.currentTier && !patch.commissionRate) next.commissionRate = String(creatorTierDefaults[patch.currentTier].rate);
      return next;
    });
  }

  function editProfile(profile: CreatorProfile) {
    setForm({
      username: accounts.find((account) => account.id === profile.userId)?.username ?? "",
      password: "",
      userId: profile.userId,
      displayName: profile.displayName,
      email: profile.email,
      phone: profile.phone,
      tiktokUrl: profile.tiktokUrl,
      instagramUrl: profile.instagramUrl,
      discountCode: profile.discountCode,
      commissionRate: String(profile.commissionRate),
      currentTier: profile.currentTier,
      status: profile.status,
      internalNotes: profile.internalNotes,
    });
  }

  async function saveCreator(event: FormEvent) {
    event.preventDefault();
    if (!admin) return;
    if (!form.displayName.trim() || !form.discountCode.trim()) return setMessage("Add a creator name and discount code first.");
    try {
      let userId = form.userId;
      if (!userId) {
        const loginEmail = form.email.trim().toLowerCase();
        if (!loginEmail || !loginEmail.includes("@") || form.password.length < 8) return setMessage("New creator accounts need an email login and password of at least 8 characters.");
        const refreshedAccounts = await onCreateAccount({
          username: loginEmail,
          displayName: form.displayName.trim(),
          role: "creator",
        }, form.password);
        const createdAccount = refreshedAccounts.find((account) => account.username === loginEmail);
        userId = createdAccount?.id ?? "";
        if (!userId) return setMessage("Creator login was created. Reload once, then save the creator profile.");
      }
      const now = new Date().toISOString();
      const existing = creatorProfiles.find((profile) => profile.userId === userId);
      await onSaveProfile({
        id: existing?.id ?? "",
        userId,
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        tiktokUrl: form.tiktokUrl.trim(),
        instagramUrl: form.instagramUrl.trim(),
        discountCode: form.discountCode.trim().toUpperCase(),
        commissionRate: Math.max(0, Number(form.commissionRate || 0)),
        currentTier: form.currentTier,
        status: form.status,
        payoutMethod: existing?.payoutMethod ?? "",
        payoutAccountName: existing?.payoutAccountName ?? "",
        payoutAccountNumber: existing?.payoutAccountNumber ?? "",
        payoutNotes: existing?.payoutNotes ?? "",
        internalNotes: form.internalNotes.trim(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      setForm(creatorFormDefaults);
      setMessage("Creator profile saved.");
    } catch (error) {
      setMessage(readableError(error, "Creator profile could not be saved."));
    }
  }

  async function changeCommissionStatus(commission: CreatorCommission, status: CommissionStatus) {
    try {
      await onUpdateCommission({
        ...commission,
        status,
        paidAt: status === "paid" ? new Date().toISOString() : commission.paidAt,
      });
      setMessage("Commission status updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commission could not be updated.");
    }
  }

  async function updateCreatorAccount(profile: CreatorProfile, patch: Partial<DashboardAccount>, password = "") {
    const account = accounts.find((item) => item.id === profile.userId);
    if (!account) return setMessage("Creator login account was not found.");
    try {
      await onUpdateAccount({ ...account, ...patch }, password);
      if (password) setCreatorPasswordEdits((current) => ({ ...current, [account.id]: "" }));
      setMessage("Creator account updated.");
    } catch (error) {
      setMessage(readableError(error, "Creator account could not be updated."));
    }
  }

  async function deleteCreatorAccount(profile: CreatorProfile) {
    const account = accounts.find((item) => item.id === profile.userId);
    if (!account) return setMessage("Creator login account was not found.");
    if (!confirm(`Delete creator account for ${profile.displayName}? This removes their login and creator profile.`)) return;
    try {
      await onDeleteAccount(account.id);
      if (form.userId === account.id) setForm(creatorFormDefaults);
      setMessage("Creator account deleted.");
    } catch (error) {
      setMessage(readableError(error, "Creator account could not be deleted."));
    }
  }

  function saveFreeCreatorSample(event: FormEvent) {
    event.preventDefault();
    if (!admin) return;
    if (!freeCreatorSampleForm.creatorName.trim() || !freeCreatorSampleForm.sampleCode.trim()) {
      return setMessage("Add the creator name and the code you gave them.");
    }
    const now = new Date().toISOString();
    setFreeCreatorSamples((current) => [{
      id: crypto.randomUUID(),
      creatorName: freeCreatorSampleForm.creatorName.trim(),
      creatorUrl: freeCreatorSampleForm.creatorUrl.trim(),
      sampleCode: freeCreatorSampleForm.sampleCode.trim().toUpperCase(),
      orderNumber: "",
      givenAt: now,
      notes: freeCreatorSampleForm.notes.trim(),
    }, ...current]);
    setFreeCreatorSampleForm({ creatorName: "", creatorUrl: "", sampleCode: "", notes: "" });
    setMessage("Free creator sample logged.");
  }

  function deleteFreeCreatorSample(sampleId: string) {
    setFreeCreatorSamples((current) => current.filter((sample) => sample.id !== sampleId));
    setMessage("Free creator sample removed.");
  }

  function updateFreeCreatorSample(sampleId: string, patch: Partial<FreeCreatorSample>) {
    setFreeCreatorSamples((current) => current.map((sample) => sample.id === sampleId ? { ...sample, ...patch } : sample));
  }

  function freeCreatorSampleClaims(codeValue: string) {
    const code = codeValue.trim().toUpperCase();
    if (!code) return [];
    return orders.filter((order) => {
      const orderCodes = [...(order.discountCodes ?? []), order.discountCodeUsed ?? ""]
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
      return orderCodes.includes(code);
    }).sort((left, right) => {
      const leftTime = new Date(left.orderDate || left.updatedAt || left.importedAt).getTime();
      const rightTime = new Date(right.orderDate || right.updatedAt || right.importedAt).getTime();
      return rightTime - leftTime;
    });
  }

  function freeCreatorSampleOrder(sample: FreeCreatorSample) {
    const number = (sample.orderNumber ?? "").trim().replace(/^#/, "").toLowerCase();
    if (!number) return undefined;
    return orders.find((order) => order.orderNumber.toLowerCase() === number || orderLabel(order).replace(/^#/, "").toLowerCase() === number);
  }

  function freeCreatorSampleMessage(sample: FreeCreatorSample) {
    return `${freeCreatorSampleProductLink}\n\nUse this code at checkout: ${sample.sampleCode.trim().toUpperCase()}`;
  }

  async function copyFreeCreatorSampleMessage(sample: FreeCreatorSample) {
    try {
      await navigator.clipboard.writeText(freeCreatorSampleMessage(sample));
      setMessage(`Message copied for ${sample.creatorName}.`);
    } catch {
      setMessage("Could not copy the message. You can still select and copy it from the message box.");
    }
  }

  const freeCreatorSampleCodeRows = useMemo(() => {
    const rows = new Map<string, { code: string; creatorsGiven: number; pairedCreators: number; ordersUsingCode: number }>();
    for (const sample of freeCreatorSamples) {
      const code = sample.sampleCode.trim().toUpperCase();
      if (!code) continue;
      const row = rows.get(code) ?? { code, creatorsGiven: 0, pairedCreators: 0, ordersUsingCode: freeCreatorSampleClaims(code).length };
      row.creatorsGiven += 1;
      if (freeCreatorSampleOrder(sample)) row.pairedCreators += 1;
      rows.set(code, row);
    }
    return [...rows.values()].sort((left, right) => right.ordersUsingCode - left.ordersUsingCode || left.code.localeCompare(right.code));
  }, [freeCreatorSamples, orders]);

  async function saveOwnPayoutInfo(event: FormEvent) {
    event.preventDefault();
    if (!currentProfile) return;
    try {
      await onSavePayoutInfo({ ...currentProfile, ...payoutInfoForm });
      setMessage("Payout info saved.");
    } catch (error) {
      setMessage(readableError(error, "Payout info could not be saved."));
    }
  }

  function uploadPayoutProof(file: File | null) {
    if (!file) return setPayoutForm((current) => ({ ...current, proofFileName: "", proofFileType: "", proofFileDataUrl: "" }));
    if (file.size > 5_000_000) return setMessage("Please choose a payout proof file smaller than 5 MB.");
    const reader = new FileReader();
    reader.onload = () => setPayoutForm((current) => ({
      ...current,
      proofFileName: file.name,
      proofFileType: file.type || "application/octet-stream",
      proofFileDataUrl: String(reader.result),
    }));
    reader.onerror = () => setMessage("Could not load that payout proof file.");
    reader.readAsDataURL(file);
  }

  async function savePayoutRecord(event: FormEvent) {
    event.preventDefault();
    if (!payoutForm.creatorId) return setMessage("Choose a creator first.");
    const month = payoutForm.payoutMonth.length === 7 ? `${payoutForm.payoutMonth}-01` : payoutForm.payoutMonth;
    const now = new Date().toISOString();
    try {
      await onSavePayout({
        id: "",
        creatorId: payoutForm.creatorId,
        payoutMonth: month,
        approvedCommissionAmount: Math.max(0, Number(payoutForm.approvedCommissionAmount || 0)),
        bonusAmount: Math.max(0, Number(payoutForm.bonusAmount || 0)),
        retainerAmount: Math.max(0, Number(payoutForm.retainerAmount || 0)),
        totalPayoutAmount: Math.max(0, Number(payoutForm.approvedCommissionAmount || 0)) + Math.max(0, Number(payoutForm.bonusAmount || 0)) + Math.max(0, Number(payoutForm.retainerAmount || 0)),
        status: "paid",
        paymentReference: payoutForm.paymentReference.trim(),
        proofFileName: payoutForm.proofFileName,
        proofFileType: payoutForm.proofFileType,
        proofFileDataUrl: payoutForm.proofFileDataUrl,
        paidAt: now,
        createdAt: now,
      });
      setPayoutForm((current) => ({
        ...current,
        approvedCommissionAmount: "",
        bonusAmount: "0",
        retainerAmount: "0",
        paymentReference: "",
        proofFileName: "",
        proofFileType: "",
        proofFileDataUrl: "",
      }));
      setMessage("Creator payout saved.");
    } catch (error) {
      setMessage(readableError(error, "Creator payout could not be saved."));
    }
  }

  async function copyCreatorFreeOrder(profile: CreatorProfile) {
    await navigator.clipboard.writeText(creatorFreeOrderLink(profile));
    setMessage(`Free order link copied for ${profile.displayName}. Make sure Shopify has discount code ${creatorFreeOrderCode(profile)} set to 100% off.`);
  }

  if (!admin && !currentProfile) {
    return <section className="creator-workspace"><div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>Creator profile not ready yet</h2><span>Ask an admin to finish assigning your creator profile and discount code.</span></div></div></section>;
  }

  if (view === "creator_free_samples" && admin) {
    return <section className="creator-workspace">
      <div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>Free Creator Sample</h2><span>Track every creator who received a free sample code, then pair the row to the order once they claim it.</span></div><div className="accounting-status-pill">{freeCreatorSamples.length} creators</div></div>
      {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")}>x</button></div>}
      <section className="creator-sample-ledger-layout">
        <form className="creator-form card creator-sample-entry-form" onSubmit={saveFreeCreatorSample}>
          <div className="accounting-form-heading"><div><h3>New sample record</h3><p>Enter the creator and code you gave them.</p></div></div>
          <div className="creator-sample-form-fields">
            <label>Creator<input value={freeCreatorSampleForm.creatorName} onChange={(event) => setFreeCreatorSampleForm((current) => ({ ...current, creatorName: event.target.value }))} placeholder="Creator name or handle" /></label>
            <label>Discount code<input value={freeCreatorSampleForm.sampleCode} onChange={(event) => setFreeCreatorSampleForm((current) => ({ ...current, sampleCode: event.target.value.toUpperCase() }))} placeholder="FREE-IVAN10" /></label>
            <label>Creator link<input value={freeCreatorSampleForm.creatorUrl} onChange={(event) => setFreeCreatorSampleForm((current) => ({ ...current, creatorUrl: event.target.value }))} placeholder="https://www.tiktok.com/@creator" /></label>
            <label>Notes<textarea value={freeCreatorSampleForm.notes} onChange={(event) => setFreeCreatorSampleForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Sent link, waiting for order, etc." /></label>
            <button className="button primary" type="submit">Add creator</button>
          </div>
        </form>
        <section className="card accounting-table-card creator-sample-ledger-card">
          <div className="accounting-form-heading"><div><h3>Sample code ledger</h3><p>Enter the order number into a row to pull in the customer name, phone number, and address.</p></div></div>
          <div className="creator-code-summary-strip">
            {freeCreatorSampleCodeRows.map((row) => <article key={row.code}><span>{row.code}</span><strong>{row.ordersUsingCode}</strong><small>{row.pairedCreators} paired of {row.creatorsGiven}</small></article>)}
            {!freeCreatorSampleCodeRows.length && <div className="empty compact"><strong>No discount codes yet.</strong><p>Add the first creator sample on the left.</p></div>}
          </div>
          <div className="creator-free-sample-table">
            <table><thead><tr><th>Creator</th><th>Code</th><th>Used</th><th>Message</th><th>Order number</th><th>Paired customer info</th><th>Notes</th><th /></tr></thead><tbody>
              {freeCreatorSamples.map((sample) => {
                const claims = freeCreatorSampleClaims(sample.sampleCode);
                const pairedOrder = freeCreatorSampleOrder(sample);
                const sampleMessage = freeCreatorSampleMessage(sample);
                return <tr key={sample.id}><td>{sample.creatorUrl ? <a href={sample.creatorUrl} target="_blank" rel="noreferrer"><strong>{sample.creatorName}</strong></a> : <strong>{sample.creatorName}</strong>}<small>Added {formatDate(sample.givenAt)}</small></td><td><code>{sample.sampleCode}</code></td><td><div className="creator-sample-claim-cell"><span className={`creator-sample-claim ${claims.length ? "claimed" : "pending"}`}>{claims.length}</span><small>{claims.length === 1 ? "order" : "orders"}</small></div></td><td><div className="creator-sample-message-cell"><textarea readOnly value={sampleMessage} /><button className="button secondary small" type="button" onClick={() => copyFreeCreatorSampleMessage(sample)}>Copy message</button></div></td><td><input className="creator-sample-order-input" value={sample.orderNumber ?? ""} onChange={(event) => updateFreeCreatorSample(sample.id, { orderNumber: event.target.value })} placeholder="Order #" /></td><td>{pairedOrder ? <div className="creator-sample-order-details"><strong>{pairedOrder.customerName || "-"}</strong><span>{pairedOrder.phone || "-"}</span><small>{pairedOrder.address || "-"}</small></div> : <span className="creator-sample-unmatched">{sample.orderNumber ? "No matching order found" : "Enter order number"}</span>}</td><td><input className="creator-sample-notes-input" value={sample.notes} onChange={(event) => updateFreeCreatorSample(sample.id, { notes: event.target.value })} placeholder="Notes" /></td><td><button className="button secondary small" type="button" onClick={() => deleteFreeCreatorSample(sample.id)}>Remove</button></td></tr>;
              })}
              {!freeCreatorSamples.length && <tr><td colSpan={8}>No free creator samples logged yet.</td></tr>}
            </tbody></table>
          </div>
        </section>
      </section>
    </section>;
  }

  if (view === "creator_accounts" && admin) {
    return <section className="creator-workspace">
      <div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>Creator accounts</h2><span>Create creator logins, assign unique discount codes, and control commission rates.</span></div><div className="accounting-status-pill">{creatorProfiles.length} creators</div></div>
      {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")}>x</button></div>}
      <form className="creator-form card" onSubmit={saveCreator}>
        <div className="accounting-form-heading"><div><h3>{form.userId ? "Edit creator" : "New creator"}</h3><p>Discount codes are saved uppercase and must be unique.</p></div><button className="button primary" type="submit">Save creator</button></div>
        <div className="accounting-form-grid">
          <label>Existing creator account<select value={form.userId} onChange={(event) => updateForm({ userId: event.target.value })}><option value="">Create new login</option>{creatorAccounts.map((account) => <option key={account.id} value={account.id}>@{account.username}</option>)}</select></label>
          <label>Creator display name<input value={form.displayName} onChange={(event) => updateForm({ displayName: event.target.value })} placeholder="Creator name" /></label>
          <label>Email / login<input value={form.email} onChange={(event) => updateForm({ email: event.target.value.toLowerCase() })} placeholder="creator@email.com" /></label>
          {!form.userId && <label>Password<div className="password-reveal-field"><input type={showCreatorPassword ? "text" : "password"} value={form.password} onChange={(event) => updateForm({ password: event.target.value })} placeholder="8+ characters" /><button type="button" onClick={() => setShowCreatorPassword((current) => !current)}>{showCreatorPassword ? "Hide" : "Show"}</button></div></label>}
          <label>Phone<input value={form.phone} onChange={(event) => updateForm({ phone: event.target.value })} placeholder="+60..." /></label>
          <label>Discount code<input value={form.discountCode} onChange={(event) => updateForm({ discountCode: event.target.value.toUpperCase() })} placeholder="CREATOR10" /></label>
          <label>Tier<select value={form.currentTier} onChange={(event) => updateForm({ currentTier: event.target.value as CreatorTier, commissionRate: String(creatorTierDefaults[event.target.value as CreatorTier].rate) })}>{Object.entries(creatorTierDefaults).map(([tier, detail]) => <option key={tier} value={tier}>{detail.label} - {detail.rate}%</option>)}</select></label>
          <label>Commission rate %<input type="number" min="0" step="0.01" value={form.commissionRate} onChange={(event) => updateForm({ commissionRate: event.target.value })} /></label>
          <label>Status<select value={form.status} onChange={(event) => updateForm({ status: event.target.value as CreatorStatus })}><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select></label>
          <label className="wide">TikTok URL<input value={form.tiktokUrl} onChange={(event) => updateForm({ tiktokUrl: event.target.value })} /></label>
          <label className="wide">Instagram URL<input value={form.instagramUrl} onChange={(event) => updateForm({ instagramUrl: event.target.value })} /></label>
          <label className="wide">Internal notes<textarea value={form.internalNotes} onChange={(event) => updateForm({ internalNotes: event.target.value })} /></label>
        </div>
      </form>
      <section className="creator-account-grid">
        {creatorProfiles.map((profile) => {
          const creatorRows = creatorCommissions.filter((commission) => commission.creatorId === profile.id);
          const creatorSummary = creatorCommissionSummary(creatorRows);
          const account = accounts.find((item) => item.id === profile.userId);
          const passwordValue = account ? creatorPasswordEdits[account.id] ?? "" : "";
          const passwordVisible = account ? creatorPasswordVisible[account.id] : false;
          return <article className="creator-account-card card" key={profile.id}>
            <div className="creator-account-main">
              <div>
                <span className={`creator-status-dot ${account?.active === false ? "inactive" : profile.status}`}>{account?.active === false ? "Inactive" : profile.status}</span>
                <h3>{profile.displayName}</h3>
                <p>{profile.email || account?.username || "No email login"}</p>
              </div>
              <button className="button secondary small" type="button" onClick={() => editProfile(profile)}>Edit profile</button>
            </div>
            <div className="creator-account-stats">
              <div><span>Code</span><strong>{profile.discountCode}</strong></div>
              <div><span>Free code</span><strong>{creatorFreeOrderCode(profile)}</strong></div>
              <div><span>Tier</span><strong>{creatorTierDefaults[profile.currentTier]?.label ?? profile.currentTier}</strong></div>
              <div><span>Rate</span><strong>{profile.commissionRate}%</strong></div>
              <div><span>Sales</span><strong>{creatorSummary.lifetimeSales}</strong></div>
              <div><span>Commission</span><strong>{formatMoney(creatorSummary.lifetimeCommission)}</strong></div>
            </div>
            <div className="creator-free-order-box">
              <div><span>Influencer free order link</span><strong>{creatorFreeOrderLink(profile)}</strong><small>Use this after creating the matching 100% Shopify discount code.</small></div>
              <button className="button primary small" type="button" onClick={() => copyCreatorFreeOrder(profile)}>Copy link</button>
            </div>
            {account && <div className="creator-account-tools">
              <label>New password<div className="password-reveal-field"><input type={passwordVisible ? "text" : "password"} value={passwordValue} onChange={(event) => setCreatorPasswordEdits((current) => ({ ...current, [account.id]: event.target.value }))} placeholder="8+ characters" /><button type="button" onClick={() => setCreatorPasswordVisible((current) => ({ ...current, [account.id]: !current[account.id] }))}>{passwordVisible ? "Hide" : "Show"}</button></div></label>
              <button className="button primary" type="button" disabled={passwordValue.length < 8} onClick={() => updateCreatorAccount(profile, {}, passwordValue)}>Change password</button>
              <button className="button secondary" type="button" onClick={() => updateCreatorAccount(profile, { active: !account.active })}>{account.active ? "Deactivate" : "Activate"}</button>
              <button className="button danger" type="button" onClick={() => deleteCreatorAccount(profile)}>Delete</button>
            </div>}
          </article>;
        })}
        {!creatorProfiles.length && <div className="empty card"><strong>No creator profiles yet.</strong><p>Create your first creator above.</p></div>}
      </section>
    </section>;
  }

  if (view === "creator_sales" || view === "creator_commissions") {
    return <section className="creator-workspace">
      <div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>{view === "creator_sales" ? "Creator sales" : "Commission management"}</h2><span>Orders attributed to creator discount codes. Creators only see their own rows.</span></div><div className="accounting-status-pill">{visibleCommissions.length} rows</div></div>
      {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")}>x</button></div>}
      <section className="card accounting-table-card creator-table"><table><thead><tr><th>Date</th><th>Creator</th><th>Order</th><th>Code</th><th>Eligible subtotal</th><th>Rate</th><th>Commission</th><th>Status</th><th /></tr></thead><tbody>
        {visibleCommissions.map((commission) => {
          const profile = creatorProfiles.find((item) => item.id === commission.creatorId);
          return <tr key={commission.id}><td>{formatDate(commission.orderDate)}</td><td>{profile?.displayName ?? "Creator"}</td><td>#{commission.orderNumber}</td><td>{commission.discountCodeUsed}</td><td>{formatMoney(commission.eligibleSubtotal)}</td><td>{commission.commissionRateAtSale}%</td><td><strong>{formatMoney(commission.commissionAmount)}</strong></td><td>{commission.status}</td><td>{admin && <select value={commission.status} onChange={(event) => changeCommissionStatus(commission, event.target.value as CommissionStatus)}><option value="pending">Pending</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="cancelled">Cancelled</option></select>}</td></tr>;
        })}
        {!visibleCommissions.length && <tr><td colSpan={9}>No attributed creator sales yet. Shopify orders need a matching discount code.</td></tr>}
      </tbody></table></section>
    </section>;
  }

  if (view === "creator_payouts" && admin) {
    const rows = creatorProfiles.map((profile) => {
      const commissions = creatorCommissions.filter((commission) => commission.creatorId === profile.id);
      const payouts = creatorPayouts.filter((payout) => payout.creatorId === profile.id);
      const made = commissions.filter((commission) => commission.status !== "cancelled").reduce((total, commission) => total + commission.commissionAmount, 0);
      const owed = commissions.filter((commission) => commission.status === "pending" || commission.status === "approved").reduce((total, commission) => total + commission.commissionAmount, 0);
      const paid = payouts.filter((payout) => payout.status === "paid").reduce((total, payout) => total + payout.totalPayoutAmount, 0);
      return { profile, made, owed, paid, payouts };
    }).sort((left, right) => right.owed - left.owed);
    const selectedCreator = rows.find((row) => row.profile.id === payoutForm.creatorId);
    const suggestedAmount = selectedCreator?.owed ?? 0;
    return <section className="creator-workspace">
      <div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>Payouts</h2><span>See how much each creator made, how much is owed, and record paid payouts with proof.</span></div><div className="accounting-status-pill">{formatMoney(rows.reduce((total, row) => total + row.owed, 0))} owed</div></div>
      {message && <div className="notice"><span>{message}</span><button onClick={() => setMessage("")}>x</button></div>}
      <form className="creator-form card" onSubmit={savePayoutRecord}>
        <div className="accounting-form-heading"><div><h3>Record creator payout</h3><p>Saving as paid will mark the creator's pending and approved commissions as paid.</p></div><button className="button primary" type="submit">Save payout</button></div>
        <div className="accounting-form-grid">
          <label>Creator<select value={payoutForm.creatorId} onChange={(event) => {
            const row = rows.find((item) => item.profile.id === event.target.value);
            setPayoutForm((current) => ({ ...current, creatorId: event.target.value, approvedCommissionAmount: row ? String(row.owed.toFixed(2)) : "" }));
          }}><option value="">Choose creator</option>{rows.map((row) => <option key={row.profile.id} value={row.profile.id}>{row.profile.displayName} - owed {formatMoney(row.owed)}</option>)}</select></label>
          <label>Payout month<input type="month" value={payoutForm.payoutMonth} onChange={(event) => setPayoutForm((current) => ({ ...current, payoutMonth: event.target.value }))} /></label>
          <label>Commission to pay<input type="number" min="0" step="0.01" value={payoutForm.approvedCommissionAmount} onChange={(event) => setPayoutForm((current) => ({ ...current, approvedCommissionAmount: event.target.value }))} placeholder={formatMoney(suggestedAmount)} /></label>
          <label>Bonus<input type="number" min="0" step="0.01" value={payoutForm.bonusAmount} onChange={(event) => setPayoutForm((current) => ({ ...current, bonusAmount: event.target.value }))} /></label>
          <label>Retainer<input type="number" min="0" step="0.01" value={payoutForm.retainerAmount} onChange={(event) => setPayoutForm((current) => ({ ...current, retainerAmount: event.target.value }))} /></label>
          <label>Payment reference<input value={payoutForm.paymentReference} onChange={(event) => setPayoutForm((current) => ({ ...current, paymentReference: event.target.value }))} placeholder="Bank transfer ref / note" /></label>
          <div className="wide"><FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.txt,.doc,.docx" title="Upload payment proof" description="Drop receipt or screenshot here" selectedName={payoutForm.proofFileName} onFile={uploadPayoutProof} /></div>
        </div>
      </form>
      <section className="creator-account-grid">
        {rows.map((row) => <article className="creator-account-card card" key={row.profile.id}>
          <div className="creator-account-main"><div><span className="creator-status-dot active">{row.profile.currentTier}</span><h3>{row.profile.displayName}</h3><p>{row.profile.payoutMethod || "No payout method"} {row.profile.payoutAccountNumber ? `| ${row.profile.payoutAccountNumber}` : ""}</p></div><button className="button secondary small" type="button" onClick={() => setPayoutForm((current) => ({ ...current, creatorId: row.profile.id, approvedCommissionAmount: row.owed.toFixed(2) }))}>Pay this creator</button></div>
          <div className="creator-account-stats">
            <div><span>Total made</span><strong>{formatMoney(row.made)}</strong></div>
            <div><span>Owed now</span><strong>{formatMoney(row.owed)}</strong></div>
            <div><span>Paid before</span><strong>{formatMoney(row.paid)}</strong></div>
            <div><span>Account name</span><strong>{row.profile.payoutAccountName || "-"}</strong></div>
            <div><span>Payment ref</span><strong>{row.payouts[0]?.paymentReference || "-"}</strong></div>
          </div>
          <div className="creator-payout-history">{row.payouts.slice(0, 3).map((payout) => <div key={payout.id}><span>{payout.payoutMonth}</span><strong>{formatMoney(payout.totalPayoutAmount)}</strong>{payout.proofFileDataUrl ? <a href={payout.proofFileDataUrl} download={payout.proofFileName || "creator-payout-proof"}>Proof</a> : <em>No proof</em>}</div>)}{!row.payouts.length && <p>No payouts recorded yet.</p>}</div>
        </article>)}
      </section>
    </section>;
  }

  if (view === "creator_analytics" && admin) {
    const topCreators = creatorProfiles.map((profile) => {
      const rows = creatorCommissions.filter((commission) => commission.creatorId === profile.id);
      return { profile, summary: creatorCommissionSummary(rows) };
    }).sort((left, right) => right.summary.lifetimeRevenue - left.summary.lifetimeRevenue);
    return <section className="creator-workspace">
      <div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>Creator analytics</h2><span>A simple ranking of creator sales, revenue, and commission.</span></div><div className="accounting-status-pill">{attributedOrderCount} matched order records</div></div>
      <section className="stats unit-cost-stats"><MoneyStat label="Creator revenue" value={summary.lifetimeRevenue} tone="blue" /><MoneyStat label="Pending commission" value={summary.byStatus.pending ?? 0} tone="fees" /><MoneyStat label="Paid commission" value={summary.byStatus.paid ?? 0} tone="collected" /><Stat label="Creator sales" value={summary.lifetimeSales} color="navy" /></section>
      <section className="card accounting-table-card creator-table"><table><thead><tr><th>Creator</th><th>Sales</th><th>Revenue</th><th>Commission</th><th>Code</th></tr></thead><tbody>{topCreators.map(({ profile, summary: creatorSummary }) => <tr key={profile.id}><td><strong>{profile.displayName}</strong></td><td>{creatorSummary.lifetimeSales}</td><td>{formatMoney(creatorSummary.lifetimeRevenue)}</td><td>{formatMoney(creatorSummary.lifetimeCommission)}</td><td>{profile.discountCode}</td></tr>)}</tbody></table></section>
    </section>;
  }

  const profile = currentProfile;
  const profileSummary = creatorCommissionSummary(visibleCommissions);
  const nextTierTarget = profile?.currentTier === "tier_1" ? 50 : profile?.currentTier === "tier_2" ? 100 : profile?.currentTier === "tier_3" ? 500 : profileSummary.lifetimeSales;
  const payoutsForProfile = admin || !profile ? creatorPayouts : creatorPayouts.filter((payout) => payout.creatorId === profile.id);
  return <section className="creator-workspace">
    <div className="creator-hero card"><div><p>CREATOR PROGRAM</p><h2>{admin ? "Creator overview" : `Welcome, ${profile?.displayName}`}</h2><span>{admin ? "Use the left menu to manage creator accounts, sales, commissions, and analytics." : "Track your creator code, sales, commission, and payout history."}</span></div><div className="creator-code">{profile?.discountCode ?? "NO CODE"}</div></div>
    <section className="sales-stats">
      <MoneyStat label="This month's commission" value={profileSummary.monthCommission} tone="sales" />
      <MoneyStat label="Pending commission" value={profileSummary.byStatus.pending ?? 0} tone="fees" />
      <MoneyStat label="Approved commission" value={profileSummary.byStatus.approved ?? 0} tone="transfer" />
      <MoneyStat label="Paid commission" value={profileSummary.byStatus.paid ?? 0} tone="collected" />
      <article className="money-stat blue"><span>Current tier</span><strong>{profile ? creatorTierDefaults[profile.currentTier].label : "-"}</strong></article>
    </section>
    {profile && <section className="card creator-profile-card"><div><span>Creator code</span><strong>{profile.discountCode}</strong></div><div><span>Free order code</span><strong>{creatorFreeOrderCode(profile)}</strong></div><div><span>Commission rate</span><strong>{profile.commissionRate}%</strong></div><div><span>This month's sales</span><strong>{profileSummary.monthSales}</strong></div><div><span>Lifetime sales</span><strong>{profileSummary.lifetimeSales}</strong></div><div><span>Next tier progress</span><strong>{Math.min(profileSummary.lifetimeSales, nextTierTarget)} / {nextTierTarget}</strong></div></section>}
    {profile && <section className="card creator-free-order-box creator-free-order-wide">
      <div><span>Your free plushie order link</span><strong>{creatorFreeOrderLink(profile)}</strong><small>Use this link after your free creator discount has been activated by the admin.</small></div>
      <button className="button primary" type="button" onClick={() => copyCreatorFreeOrder(profile)}>Copy free order link</button>
    </section>}
    {!admin && profile && <form className="creator-form card" onSubmit={saveOwnPayoutInfo}>
      <div className="accounting-form-heading"><div><h3>Payout info</h3><p>Add the account you want payouts sent to. Only admins can see this for payment processing.</p></div><button className="button primary" type="submit">Save payout info</button></div>
      <div className="accounting-form-grid">
        <label>Payout method<input value={payoutInfoForm.payoutMethod} onChange={(event) => setPayoutInfoForm((current) => ({ ...current, payoutMethod: event.target.value }))} placeholder="Bank / TNG / DuitNow" /></label>
        <label>Account name<input value={payoutInfoForm.payoutAccountName} onChange={(event) => setPayoutInfoForm((current) => ({ ...current, payoutAccountName: event.target.value }))} placeholder="Name on account" /></label>
        <label>Account number / phone<input value={payoutInfoForm.payoutAccountNumber} onChange={(event) => setPayoutInfoForm((current) => ({ ...current, payoutAccountNumber: event.target.value }))} placeholder="Account number or DuitNow phone" /></label>
        <label className="wide">Notes<textarea value={payoutInfoForm.payoutNotes} onChange={(event) => setPayoutInfoForm((current) => ({ ...current, payoutNotes: event.target.value }))} placeholder="Any extra payment instructions" /></label>
      </div>
    </form>}
    <section className="card accounting-table-card creator-table"><div className="accounting-form-heading"><div><h3>Recent attributed orders</h3><p>Creator view hides customer private details.</p></div></div><table><thead><tr><th>Date</th><th>Order</th><th>Order amount</th><th>Commission</th><th>Status</th></tr></thead><tbody>{visibleCommissions.slice(0, 12).map((commission) => <tr key={commission.id}><td>{formatDate(commission.orderDate)}</td><td>#{commission.orderNumber}</td><td>{formatMoney(commission.eligibleSubtotal)}</td><td>{formatMoney(commission.commissionAmount)}</td><td>{commission.status}</td></tr>)}{!visibleCommissions.length && <tr><td colSpan={5}>No attributed creator orders yet.</td></tr>}</tbody></table></section>
    <section className="card accounting-table-card creator-table"><div className="accounting-form-heading"><div><h3>Payout history</h3><p>Approved and paid creator payout records.</p></div></div><table><thead><tr><th>Month</th><th>Commission</th><th>Bonus</th><th>Retainer</th><th>Total</th><th>Status</th></tr></thead><tbody>{payoutsForProfile.map((payout) => <tr key={payout.id}><td>{payout.payoutMonth}</td><td>{formatMoney(payout.approvedCommissionAmount)}</td><td>{formatMoney(payout.bonusAmount)}</td><td>{formatMoney(payout.retainerAmount)}</td><td><strong>{formatMoney(payout.totalPayoutAmount)}</strong></td><td>{payout.status}</td></tr>)}{!payoutsForProfile.length && <tr><td colSpan={6}>No payout history yet.</td></tr>}</tbody></table></section>
  </section>;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [loginInputsReady, setLoginInputsReady] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setLoginInputsReady(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setError("");
    try { onLogin(await loginDashboardAccount(username, password)); }
    catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Sign in failed."); }
    finally { setSigningIn(false); }
  }
  return <main className="login-page"><section className="login-brand"><div className="login-logo">MP</div><p>MEANINGFUL PLUSHIES</p><h1>A calmer way to manage every plushie.</h1><span>Track voice, production, packing and delivery from one simple workspace.</span></section><section className="login-panel"><form onSubmit={submit} autoComplete="off"><input className="hidden-login-field" type="text" name="fake-username" autoComplete="username" tabIndex={-1} aria-hidden="true" /><input className="hidden-login-field" type="password" name="fake-password" autoComplete="current-password" tabIndex={-1} aria-hidden="true" /><p className="eyebrow">STAFF PORTAL</p><h2>Welcome back</h2><span>Sign in with the account created by your administrator.</span>{error && <p className="login-error">{error}</p>}<label>Username<input name="mp-login-identifier" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="off" readOnly={!loginInputsReady} /></label><label>Password<input name="mp-login-secret" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" readOnly={!loginInputsReady} /></label><button className="button primary large" type="submit" disabled={signingIn}>{signingIn ? "Signing in..." : "Sign in"}</button></form></section></main>;
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

function SourceFilterSelect({ value, onChange }: { value: SourceFilter; onChange: (source: SourceFilter) => void }) {
  const labels: Record<SourceFilter, string> = { all: "All", shopify: "Shopify", tiktok: "TikTok" };
  return <select className="source-filter-select" aria-label="Filter by source" value={value} onChange={(event) => onChange(event.target.value as SourceFilter)}>{sourceFilterValues.map((source) => <option key={source} value={source}>{labels[source]}</option>)}</select>;
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
  const messageLink = meaningfulMessageLink(order);
  const messageDownloadName = meaningfulMessageDownloadName(order);

  function uploadPhoto(file?: File) {
    if (!file) return;
    if (file.size > 3_000_000) return alert("Please choose an image smaller than 3 MB.");
    const reader = new FileReader();
    reader.onload = () => onUpdate({ photoDataUrl: String(reader.result), photoName: file.name });
    reader.readAsDataURL(file);
  }

  function uploadTikTokOrderFile(file: File | null) {
    if (!file) return;
    if (file.size > 5_000_000) return alert("Please choose a TikTok order file smaller than 5 MB.");
    const reader = new FileReader();
    reader.onload = () => onUpdate({
      tikTokFileDataUrl: String(reader.result),
      tikTokFileName: file.name,
      tikTokFileType: file.type || "application/octet-stream",
    });
    reader.readAsDataURL(file);
  }

  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="order-drawer"><div className="drawer-header"><div><p>ORDER DETAIL</p><h2>{orderLabel(order)}</h2></div><button onClick={onClose}>x</button></div><div className="drawer-body">
    <section className="detail-summary"><div><span>Current status</span><StatusPill status={order.status} /></div><div><span>Last updated</span><strong>{formatDate(order.updatedAt, true)}</strong></div></section>
    <section className="detail-section"><h3>Quick actions</h3><div className="status-actions">{following && <button className="button primary" onClick={() => onStatus(following)}>Move to {statusLabels[following]}</button>}{admin && <button className="button issue-button" onClick={() => onStatus("issue")}>Mark issue</button>}{admin && order.status === "issue" && <button className="button secondary" onClick={() => onStatus("sent_for_sewing")}>Resolve issue</button>}<a className="button whatsapp" href={whatsappLink(order)} target="_blank">Open WhatsApp</a></div></section>
    <section className="detail-section"><h3>Customer and order</h3><div className="field-grid"><Field label="Order number" value={`#${order.orderNumber}`} /><Field label="Source" value={order.salesChannel === "tiktok" ? "TikTok Shop" : "Shopify"} /><Field label="Order date" value={formatDate(order.orderDate, true)} /><Field label="Payment method" value={order.paymentProcessor || "Unknown"} /><Editable label="Customer name" value={order.customerName} disabled={!admin} onChange={(value) => onUpdate({ customerName: value })} /><Editable label="Phone" value={order.phone} disabled={!admin} onChange={(value) => onUpdate({ phone: value })} /><Editable wide label="Address" value={order.address} disabled={!admin} onChange={(value) => onUpdate({ address: value })} /></div></section>
    {order.salesChannel === "tiktok" && <section className="detail-section"><h3>TikTok order file</h3><div className="field-grid"><div className="field wide"><label>Attached file</label>{order.tikTokFileDataUrl ? <a href={order.tikTokFileDataUrl} download={messageDownloadName} rel="noreferrer">{order.tikTokFileName || "Download TikTok order file"}</a> : <span>No file attached</span>}</div>{admin && <div className="field wide"><FileDropZone accept="application/pdf,image/png,image/jpeg,image/webp,.txt,.doc,.docx" title={order.tikTokFileDataUrl ? "Replace TikTok file" : "Upload TikTok file"} description="Choose or drop the file for this order" selectedName={order.tikTokFileName} onFile={uploadTikTokOrderFile} className="compact-file-drop" /></div>}</div></section>}
    <section className="detail-section"><h3>Plushie details</h3><div className="field-grid"><Editable label="Product name" value={order.product} disabled={!admin} onChange={(value) => onUpdate({ product: value })} /><Editable label="Character" value={order.character} disabled={!admin} onChange={(value) => onUpdate({ character: value })} /><Editable label="Set indicator" value={order.setIndicator ?? ""} disabled={!admin} onChange={(value) => onUpdate({ setIndicator: value })} /><Editable label="ID website link" value={order.idWebsiteLink ?? ""} disabled={!admin} onChange={(value) => onUpdate({ idWebsiteLink: value })} /><Editable label="Voice length" value={String(order.voiceLength || "")} disabled={!admin} onChange={(value) => onUpdate({ voiceLength: Number(value) || 0 })} /><Editable label="Plush name" value={order.plushName} disabled={!admin} onChange={(value) => onUpdate({ plushName: value })} /><Editable wide label="Remark" value={order.remark ?? ""} disabled={!admin} onChange={(value) => onUpdate({ remark: value })} /><Editable wide textarea label="Meaningful note" value={order.meaningfulNote} disabled={!admin} onChange={(value) => onUpdate({ meaningfulNote: value })} /><div className="field wide"><label>Meaningful message</label>{messageLink ? <a href={messageLink} download={messageDownloadName} target={messageDownloadName ? undefined : "_blank"} rel="noreferrer">{messageDownloadName ? "Download customer message" : "Open customer message"}</a> : <span>{order.salesChannel === "tiktok" ? "No TikTok file uploaded" : "Not provided"}</span>}</div><div className="field"><label>Voice upload</label>{admin ? <select value={order.voiceUploadStatus} onChange={(event) => onUpdate({ voiceUploadStatus: event.target.value as Order["voiceUploadStatus"] })}><option value="missing">Missing</option><option value="received">Received</option><option value="checked">Checked</option></select> : <strong>{order.voiceUploadStatus}</strong>}</div></div></section>
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
  return <article className="a6-slip"><header><span>ORDER ID</span><strong>{packingSlipOrderLabel(order)}</strong></header><div className="slip-fields"><div className="primary-slip-field"><label>CHARACTER:</label><p>{order.character || "-"}</p></div><div className="primary-slip-field"><label>PLUSH NAME:</label><p>{order.plushName || "-"}</p></div><div><label>CUSTOMER:</label><p>{order.customerName || "-"}</p></div><div><label>PHONE:</label><p>{order.phone || "-"}</p></div><div className="remark-row"><label>REMARK:</label><p>{order.remark || "-"}</p></div></div><footer>Meaningful Plushies</footer></article>;
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

function EnvelopeSheet({
  slots,
  pageNumber,
  slotOffset,
  settings,
  onManualNameChange,
}: {
  slots: EnvelopeSlot[];
  pageNumber: number;
  slotOffset: number;
  settings: EnvelopePrintSettings;
  onManualNameChange: (slotIndex: number, value: string) => void;
}) {
  const labels = [
    `TOP NAME | X ${settings.topX}, Y ${settings.topY}`,
    `BOTTOM NAME | X ${settings.bottomX}, Y ${settings.bottomY}`,
  ];
  return <article className="envelope-sheet"><span>PAGE {pageNumber}</span>{[0, 1].map((position) => {
    const slot = slots[position] ?? { order: null, manualName: "", name: "" };
    const slotIndex = slotOffset + position;
    return <div key={position}>
      <small>{labels[position]}</small>
      {slot.order
        ? <strong>{(slot.order.plushName || "-").toUpperCase()}</strong>
        : <input className="envelope-manual-name" value={slot.manualName} onChange={(event) => onManualNameChange(slotIndex, event.target.value.toUpperCase())} placeholder="Type name manually" />}
    </div>;
  })}</article>;
}

type IconName = "orders" | "fulfilment" | "packing" | "envelope" | "import" | "shipped" | "logout" | "search" | "history" | "drag" | "settings" | "stock" | "report" | "accounting" | "cash" | "documents" | "ledger" | "tax" | "calendar" | "idea" | "creator";

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
  if (name === "creator") return <svg {...common}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/><path d="m17 4 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/></svg>;
  if (name === "drag") return <svg {...common}><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="17" r="1" fill="currentColor" stroke="none"/></svg>;
  return <svg {...common}><path d="M12 8v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>;
}



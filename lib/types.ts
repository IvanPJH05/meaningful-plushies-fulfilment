export const orderStatuses = [
  "new_order",
  "uploading_audio",
  "sent_for_sewing",
  "packed",
  "shipped",
  "issue",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
export type UserRole = "admin" | "staff" | "creator";
export type CreatorTier = "tier_1" | "tier_2" | "tier_3" | "tier_4";
export type CreatorStatus = "active" | "suspended" | "pending";
export type CommissionStatus = "pending" | "approved" | "paid" | "cancelled";

export type PaymentProcessorSetting = {
  processor: string;
  percentage: number;
  fixedAmount: number;
};

export type SalesFeeSetting = {
  shopifyPercentage: number;
};

export type MetaCapiPurchaseMode = "manual_only" | "all" | "disabled";

export type MetaCapiSettings = {
  enabled: boolean;
  purchaseMode: MetaCapiPurchaseMode;
  testEventCode: string;
  pixelId: string;
  browserPixelEnabled: boolean;
  trackingNotes: string;
};

export type MetaCapiLogStatus = "success" | "failed" | "needs_review" | "skipped";

export type MetaCapiLog = {
  id: string;
  orderId: string;
  orderNumber: string;
  eventName: string;
  eventId: string;
  value: number;
  currency: string;
  status: MetaCapiLogStatus;
  responseId: string;
  error: string;
  requestSummary: Record<string, unknown>;
  responseBody: Record<string, unknown>;
  testEventCode: string;
  createdAt: string;
};

export type MetaAdsInsight = {
  adId: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  ctr: number;
  cpc: number;
  dateStart: string;
  dateStop: string;
};

export type MetaAdsSummary = {
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  cpa: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
};

export type MetaAdsEnvironment = {
  adAccountConfigured: boolean;
  tokenConfigured: boolean;
  tokenMasked: string;
  graphVersion: string;
};

export type EnvelopePrintSettings = {
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

export type DashboardAccount = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
};

export type CreatorProfile = {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string;
  tiktokUrl: string;
  instagramUrl: string;
  discountCode: string;
  commissionRate: number;
  currentTier: CreatorTier;
  status: CreatorStatus;
  payoutMethod: string;
  payoutAccountName: string;
  payoutAccountNumber: string;
  payoutNotes: string;
  internalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatorCommission = {
  id: string;
  creatorId: string;
  shopifyOrderId: string;
  orderNumber: string;
  orderDate: string;
  eligibleSubtotal: number;
  discountCodeUsed: string;
  commissionRateAtSale: number;
  tierAtSale: CreatorTier;
  commissionAmount: number;
  status: CommissionStatus;
  payoutReference: string;
  paidAt: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatorPayout = {
  id: string;
  creatorId: string;
  payoutMonth: string;
  approvedCommissionAmount: number;
  bonusAmount: number;
  retainerAmount: number;
  totalPayoutAmount: number;
  status: CommissionStatus;
  paymentReference: string;
  proofFileName: string;
  proofFileType: string;
  proofFileDataUrl: string;
  paidAt: string;
  createdAt: string;
};

export type StockSetting = {
  itemKey: string;
  initialStock: number;
};

export type SalesConsumptionMapping = {
  id: string;
  sku: string;
  inventoryItem: string;
  quantityPerSale: number;
  operatingExpensePerSale: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AccountingCategory = {
  id: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "revenue" | "income" | "expense" | "cost_of_sales";
  reportSection: string;
  parentId: string;
  dataSourceType: "manual" | "system_generated" | "hybrid";
  sourceModule: string;
  sourceEntity: string;
  postingTrigger: string;
  allowSubAccounts: boolean;
  allowedTransactionTypes: string[];
  active: boolean;
};

export type AccountingDocument = {
  id: string;
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  name: string;
  supplier: string;
  description: string;
  documentDate: string;
  amount: number;
  categoryId: string;
  transactionType: "income" | "expense";
  taxTreatment: string;
  notes: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountingTransaction = {
  id: string;
  source: "manual" | "document" | "order" | "bank_statement";
  sourceId: string;
  documentId: string;
  businessEvent: string;
  transactionDate: string;
  description: string;
  accountName: string;
  categoryId: string;
  transactionType: "income" | "expense" | "transfer";
  paymentStatus: "paid_in_full" | "deposit_paid" | "on_credit" | "paid_now" | "pay_later";
  paymentMethod: string;
  supplier: string;
  quantity: number;
  unitCost: number;
  depositAmount: number;
  invoiceNumber: string;
  dueDate: string;
  supplierTerms: string;
  debit: number;
  credit: number;
  amount: number;
  currency: string;
  taxTreatment: string;
  notes: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AccountingBankStatementLine = {
  id: string;
  importId: string;
  rowNumber: number;
  transactionDate: string;
  description: string;
  reference: string;
  moneyIn: number;
  moneyOut: number;
  balance: number | null;
  rawData: Record<string, unknown>;
  matchedTransactionId: string;
  matchedTransactionIds: string[];
  matchStatus: "unmatched" | "matched" | "ignored";
  suggestedEvent: string;
  suggestedAccount: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type AiAccountantReview = {
  id: string;
  importId: string;
  rowNumber: number;
  importAction: string;
  status: "manual_required" | "possible_duplicate" | "error";
  bankTransactionId: string;
  bankStatementId: string;
  bankDate: string;
  bankDescription: string;
  bankAmount: number;
  bankDirection: "money_in" | "money_out" | "";
  businessEvent: string;
  account: string;
  counterparty: string;
  description: string;
  amount: number;
  duplicateCheckKey: string;
  matchedTransactionId: string;
  aiConfidence: number;
  aiReason: string;
  notes: string;
  rawData: Record<string, string>;
  createdAt: string;
  updatedAt: string;
};

export type AccountingLedgerEntry = {
  id: string;
  transactionId: string;
  accountId: string;
  accountName: string;
  entryType: "debit" | "credit";
  amount: number;
  memo: string;
  createdAt: string;
};

export type ContentPlanItem = {
  id: string;
  title: string;
  plannedDate: string;
  platform: string;
  contentType: string;
  notes: string;
  posted: boolean;
  postedAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ContentIdeaReference = {
  id: string;
  name: string;
  url: string;
};

export type ContentIdeaItem = {
  id: string;
  title: string;
  idea: string;
  references: ContentIdeaReference[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type StatusEvent = {
  id: string;
  status: OrderStatus;
  changedAt: string;
  changedBy: string;
  note?: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  salesChannel?: "shopify" | "tiktok";
  orderDate: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  currency: string;
  subtotalAmount: number;
  shippingAmount: number;
  totalAmount: number;
  discountAmount: number;
  productDiscountAmount: number;
  shippingDiscountAmount: number;
  refundedAmount: number;
  outstandingBalance: number;
  paymentProcessor: string;
  discountCodes?: string[];
  discountCodeUsed?: string;
  creatorId?: string;
  creatorFreeOrder?: boolean;
  shippingMethod?: string;
  product: string;
  character: string;
  setIndicator: string;
  idWebsiteLink: string;
  voiceLength: number;
  plushName: string;
  certificateCode: string;
  meaningfulNote: string;
  meaningfulMessage: string;
  remark: string;
  voiceUploadStatus: "missing" | "received" | "checked";
  courier: string;
  trackingNumber: string;
  status: OrderStatus;
  internalNotes: string;
  metaCapiSentAt?: string;
  metaCapiEventId?: string;
  metaCapiValueSent?: number;
  metaCapiResponseId?: string;
  metaCapiStatus?: MetaCapiLogStatus;
  metaCapiError?: string;
  metaCapiNeedsReview?: boolean;
  photoDataUrl?: string;
  photoName?: string;
  tikTokFileDataUrl?: string;
  tikTokFileName?: string;
  tikTokFileType?: string;
  statusHistory: StatusEvent[];
  importedAt: string;
  updatedAt: string;
};

export type ManualOrderStatus = "active" | "used" | "expired" | "cancelled";

export type ManualOrder = {
  id: string;
  customerName: string;
  phoneOriginal: string;
  phoneNormalized: string;
  phoneLastFour: string;
  productKey: string;
  productDisplayName: string;
  shopifyProductId: string;
  shopifyVariantId: string;
  productPath: string;
  shippingRegion: "WEST" | "EAST";
  productDiscountCode: string;
  productDiscountShopifyId: string;
  shippingDiscountCode: string;
  shippingDiscountShopifyId: string;
  customerLink: string;
  status: ManualOrderStatus;
  shopifyOrderId: string;
  shopifyOrderName: string;
  createdAt: string;
  updatedAt: string;
  usedAt: string;
};

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
};

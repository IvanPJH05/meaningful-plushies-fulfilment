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
  source: "manual" | "document" | "order";
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
  photoDataUrl?: string;
  photoName?: string;
  tikTokFileDataUrl?: string;
  tikTokFileName?: string;
  tikTokFileType?: string;
  statusHistory: StatusEvent[];
  importedAt: string;
  updatedAt: string;
};

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
};

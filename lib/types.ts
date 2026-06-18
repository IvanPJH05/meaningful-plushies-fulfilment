export const orderStatuses = [
  "new_order",
  "uploading_audio",
  "sent_for_sewing",
  "packed",
  "shipped",
  "issue",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
export type UserRole = "admin" | "staff";

export type PaymentProcessorSetting = {
  processor: string;
  percentage: number;
  fixedAmount: number;
};

export type SalesFeeSetting = {
  shopifyPercentage: number;
};

export type DashboardAccount = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
};

export type StockSetting = {
  itemKey: string;
  initialStock: number;
};

export type AccountingCategory = {
  id: string;
  name: string;
  accountType: "asset" | "liability" | "equity" | "income" | "expense" | "cost_of_sales";
  reportSection: string;
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
  transactionDate: string;
  description: string;
  accountName: string;
  categoryId: string;
  transactionType: "income" | "expense" | "transfer";
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

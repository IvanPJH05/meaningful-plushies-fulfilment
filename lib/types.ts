Exit code: 0
Wall time: 0.6 seconds
Output:
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


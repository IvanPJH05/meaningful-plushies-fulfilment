export const orderStatuses = [
  "new_order",
  "awaiting_voice",
  "ready_to_make",
  "making",
  "ready_to_pack",
  "packed",
  "fulfilled",
  "issue",
] as const;

export type OrderStatus = (typeof orderStatuses)[number];
export type UserRole = "admin" | "staff";

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

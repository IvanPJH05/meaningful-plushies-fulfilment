export const tableColumns = {
  orderNumber: ["Order", 220], orderDate: ["Date", 110], customerName: ["Customer", 170],
  phone: ["Phone", 145], address: ["Address", 240], character: ["Character", 130],
  voiceLength: ["Voice", 75], plushName: ["Plush name", 135], status: ["Status", 140],
  trackingNumber: ["Tracking number", 150], updatedAt: ["Last updated", 150],
  meaningfulMessage: ["Meaningful Message", 150], idWebsiteLink: ["Certificate", 155],
  product: ["Product", 220], remark: ["Notes", 220], actions: ["Actions", 150],
  email: ["Email", 210], courier: ["Courier", 120], shippingMethod: ["Shipping method", 150],
  plushGender: ["Gender", 100], plushBirthDate: ["Birth date", 110], plushBirthPlace: ["Birthplace", 140],
  plushFavouritePerson: ["Favourite person", 150], plushBelongsTo: ["Belongs to", 150], meaningfulNote: ["Meaningful Note", 240],
} as const;
export type TableColumn = keyof typeof tableColumns;
export type TableView = "orders" | "fulfilment";
export type ColumnLayout = { key: TableColumn; visible: boolean; width: number };
export type TableLayouts = Record<TableView, ColumnLayout[]>;
const fulfilmentWidths: Partial<Record<TableColumn, number>> = { actions: 75, character: 110, voiceLength: 70, plushName: 120, status: 125, meaningfulMessage: 145 };
export function defaultTableLayout(view: TableView): ColumnLayout[] {
  const visible: TableColumn[] = view === "orders"
    ? ["orderNumber", "orderDate", "customerName", "phone", "status", "trackingNumber", "actions"]
    : ["orderNumber", "plushName", "character", "voiceLength", "meaningfulMessage", "idWebsiteLink", "status", "actions"];
  return [...visible, ...(Object.keys(tableColumns) as TableColumn[]).filter(key => !visible.includes(key))]
    .map(key => ({ key, visible: visible.includes(key), width: view === "fulfilment" ? (fulfilmentWidths[key] ?? tableColumns[key][1]) : tableColumns[key][1] }));
}
export function normalizeTableLayout(value: unknown, view: TableView): ColumnLayout[] {
  const defaults = defaultTableLayout(view);
  if (!Array.isArray(value)) return defaults;
  const result: ColumnLayout[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || !Object.hasOwn(tableColumns, item.key) || result.some(col => col.key === item.key)) continue;
    const key = item.key as TableColumn;
    result.push({ key, visible: key === "orderNumber" || Boolean(item.visible),
      width: typeof item.width === "number" && Number.isFinite(item.width) ? Math.round(Math.max(70, Math.min(600, item.width))) : tableColumns[key][1] });
  }
  return [...result, ...defaults.filter(col => !result.some(item => item.key === col.key))];
}
export function compactOrderLabel(order: { orderNumber: string; setIndicator?: string | null; salesChannel?: string }) {
  const match = order.salesChannel === "tiktok" && order.orderNumber.match(/\b(TT\d+)\b\s+(\d+)/i);
  const number = match ? `${match[1].toUpperCase()} ${match[2].slice(-4)}` : `#${order.orderNumber}`;
  return `${number}${order.setIndicator ? ` ${order.setIndicator}` : ""}`;
}

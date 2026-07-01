import type { ImportResult, Order } from "./types";

function clean(value: string | undefined) {
  return (value ?? "").trim().replace(/^"|"$/g, "");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const orderHeaders = [
  "Name", "Email", "Financial Status", "Paid at", "Fulfillment Status", "Fulfilled at",
  "Accepts Marketing", "Currency", "Subtotal", "Shipping", "Taxes", "Total", "Discount Code",
  "Discount Amount", "Shipping Method", "Created at", "Lineitem quantity", "Lineitem name",
  "Lineitem price", "Lineitem compare at price", "Lineitem sku", "Lineitem requires shipping",
  "Lineitem taxable", "Lineitem fulfillment status", "Billing Name", "Billing Street",
  "Billing Address1", "Billing Address2", "Billing Company", "Billing City", "Billing Zip",
  "Billing Province", "Billing Country", "Billing Phone", "Shipping Name", "Shipping Street",
  "Shipping Address1", "Shipping Address2", "Shipping Company", "Shipping City", "Shipping Zip",
  "Shipping Province", "Shipping Country", "Shipping Phone", "Notes", "Note Attributes",
  "Cancelled at", "Payment Method", "Payment Reference", "Refunded Amount", "Vendor",
  "Outstanding Balance", "Employee", "Location", "Device ID", "Id", "Tags", "Risk Level",
  "Source", "Lineitem discount", "Tax 1 Name", "Tax 1 Value", "Tax 2 Name", "Tax 2 Value",
  "Tax 3 Name", "Tax 3 Value", "Tax 4 Name", "Tax 4 Value", "Tax 5 Name", "Tax 5 Value",
  "Phone", "Receipt Number", "Duties", "Billing Province Name", "Shipping Province Name",
  "Payment ID", "Payment Terms Name", "Next Payment Due At", "Payment References",
];

const metafieldHeaders = [
  "Order GID", "Order name", "Order email", "Metafield namespace", "Metafield key",
  "Metafield type", "Metafield value",
];

export type CsvKind = "orders" | "metafields" | "unknown";
export type TikTokDetails = {
  username: string;
  fileDataUrl: string;
  fileName: string;
  fileType: string;
  plushName: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  favouritePerson: string;
  belongsTo: string;
  meaningfulNote: string;
};
export type TikTokDetailEntry = {
  identifier: string;
  details: string;
  parsed?: Partial<TikTokDetails>;
  fileDataUrl?: string;
  fileName?: string;
  fileType?: string;
};

const emptyTikTokDetails: TikTokDetails = {
  username: "",
  fileDataUrl: "",
  fileName: "",
  fileType: "",
  plushName: "",
  gender: "",
  birthDate: "",
  birthPlace: "",
  favouritePerson: "",
  belongsTo: "",
  meaningfulNote: "",
};

export function detectCsvKind(text: string): CsvKind {
  const header = parseCsv(text)[0]?.map((cell) => clean(cell).toLowerCase()) ?? [];
  const has = (name: string) => header.includes(name.toLowerCase());
  if (has("order gid") || has("metafield value") || has("metafield key")) return "metafields";
  if (has("name") && (has("lineitem name") || has("shipping method") || has("payment method"))) return "orders";
  return "unknown";
}

function records(text: string, kind: "orders" | "metafields") {
  const parsed = parseCsv(text);
  const expectedFirstHeader = kind === "orders" ? "Name" : "Order GID";
  const hasHeader = clean(parsed[0]?.[0]).toLowerCase() === expectedFirstHeader.toLowerCase();
  const header = hasHeader ? parsed[0] : kind === "orders" ? orderHeaders : metafieldHeaders;
  const rows = hasHeader ? parsed.slice(1) : parsed;
  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [clean(name), clean(row[index])])),
  );
}

function detectDelimiter(line: string) {
  const tabCount = (line.match(/\t/g) ?? []).length;
  const commaCount = (line.match(/,/g) ?? []).length;
  return tabCount > commaCount ? "\t" : ",";
}

function parseDelimitedLine(line: string, delimiter: "," | "\t") {
  const cells: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      cells.push(field);
      field = "";
    } else field += char;
  }
  cells.push(field);
  return cells;
}

function tikTokRecords(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const header = parseDelimitedLine(lines[0], detectDelimiter(lines[0])).map(clean);
  return lines.slice(1).map((line) => {
    const row = parseDelimitedLine(line, detectDelimiter(line));
    return Object.fromEntries(header.map((name, index) => [name, clean(row[index])]));
  });
}

function orderNumber(value = "") {
  return value.replace(/[^0-9]/g, "");
}

function money(value = "") {
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function importedMoney(row: Record<string, string>, key: string, current = 0) {
  return row[key] === undefined || row[key] === "" ? current : money(row[key]);
}

function metafield(raw: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.match(new RegExp(`${escaped}:\\s*([^\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
}

type ShopifyPersonalization = {
  product: string;
  certificateCode: string;
  plushName: string;
  meaningfulNote: string;
  meaningfulMessage: string;
};

function personalizationBlocks(raw: string) {
  const blocks = raw.split(/(?=\bProduct:\s*)/i).filter((block) => /^Product:\s*/i.test(block.trim()));
  return blocks.map((block): ShopifyPersonalization => ({
    product: metafield(block, "Product"),
    certificateCode: metafield(block, "Certificate Code"),
    plushName: metafield(block, "Name"),
    meaningfulNote: metafield(block, "Meaningful Note"),
    meaningfulMessage: metafield(block, "Meaningful Message"),
  }));
}

function shopifyLineAttributeEntries(lineItem: unknown) {
  const record = objectValue(lineItem);
  const sources = [
    record.customAttributes,
    record.custom_attributes,
    record.properties,
  ];
  const entries: { key: string; value: string }[] = [];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const item of source) {
      const attribute = objectValue(item);
      const key = textValue(attribute.key) || textValue(attribute.name);
      const value = textValue(attribute.value);
      if (key) entries.push({ key, value });
    }
  }
  return entries;
}

function shopifyLineAttributeValue(lineItem: unknown, labels: string[]) {
  const entries = shopifyLineAttributeEntries(lineItem);
  const normalizeLabel = (label: string) => label
    .trim()
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9 ]/gi, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  const normalizedLabels = labels.map(normalizeLabel);
  for (const entry of entries) {
    const key = normalizeLabel(entry.key);
    if (normalizedLabels.includes(key)) return entry.value.trim();
  }
  return "";
}

function shopifyLinePersonalization(lineItem: unknown): ShopifyPersonalization {
  return {
    product: shopifyLineAttributeValue(lineItem, ["Product"]),
    certificateCode: shopifyLineAttributeValue(lineItem, ["Certificate Code", "Certificate", "certificate_code"]),
    plushName: shopifyLineAttributeValue(lineItem, ["Name", "Plushie's Name", "Plushie Name"]),
    meaningfulNote: shopifyLineAttributeValue(lineItem, ["Meaningful Note", "Note"]),
    meaningfulMessage: shopifyLineAttributeValue(lineItem, ["Meaningful Message", "Message", "Voice Message"]),
  };
}

function hasShopifyPersonalization(personalization: ShopifyPersonalization) {
  return Boolean(personalization.product || personalization.certificateCode || personalization.plushName || personalization.meaningfulNote || personalization.meaningfulMessage);
}

function productName(lineName: string, fallback: string) {
  const title = lineName.split(/\s+-\s+(?=[^/]+\s+\(RM)/i)[0]?.trim();
  return title || fallback;
}

function certificateLink(code: string) {
  return code ? `https://meaningfulplushies.com/pages/certificate/${code.trim()}` : "";
}

function fallbackShopifyCertificateCode(orderNumber: string, phone: string) {
  const orderDigits = orderNumber.replace(/\D/g, "");
  const phoneDigits = phone.replace(/\D/g, "");
  if (!orderDigits || phoneDigits.length < 7) return "";
  return `${orderDigits}${phoneDigits.slice(-7)}`;
}

function shopifyMoney(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return money(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.amount !== undefined) return shopifyMoney(record.amount);
    if (record.shop_money !== undefined) return shopifyMoney(record.shop_money);
    if (record.shopMoney !== undefined) return shopifyMoney(record.shopMoney);
  }
  return 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(objectValue) : [];
}

function textValue(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function shopifyAddressText(address: unknown) {
  if (!address || typeof address !== "object") return "";
  const record = address as Record<string, unknown>;
  return [
    record.address1,
    record.address2,
    record.city,
    record.province,
    record.zip,
    record.country,
  ].map((item) => String(item ?? "").trim()).filter(Boolean).join(", ");
}

function shopifyAddressName(address: unknown) {
  if (!address || typeof address !== "object") return "";
  const record = address as Record<string, unknown>;
  return String(record.name ?? [record.first_name, record.last_name].filter(Boolean).join(" ") ?? "").trim();
}

function shopifyLineName(lineItem: unknown) {
  if (!lineItem || typeof lineItem !== "object") return "";
  const record = lineItem as Record<string, unknown>;
  return String(record.name ?? record.title ?? "").trim();
}

function shopifyLineQuantity(lineItem: unknown) {
  if (!lineItem || typeof lineItem !== "object") return 1;
  const record = lineItem as Record<string, unknown>;
  const quantity = Number(record.quantity);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
}

function shopifyLineDiscount(lineItem: unknown) {
  if (!lineItem || typeof lineItem !== "object") return 0;
  const record = lineItem as Record<string, unknown>;
  if (record.total_discount !== undefined) return shopifyMoney(record.total_discount);
  if (record.totalDiscountSet !== undefined) return shopifyMoney(record.totalDiscountSet);
  return 0;
}

function shopifyLinePrice(lineItem: unknown) {
  if (!lineItem || typeof lineItem !== "object") return 0;
  const record = lineItem as Record<string, unknown>;
  return shopifyMoney(record.price ?? record.originalUnitPriceSet ?? record.discountedUnitPriceSet);
}

function shopifyLineCharacter(lineName: string) {
  return lineName.match(/-\s*([^/]+?)(?:\s*\(RM\d+(?:\.\d+)?\))?\s*\//i)?.[1]?.trim()
    ?? lineName.match(/\b(BILLY|TOOTSIE|HUNNIE|DRAGON WARRIOR)\b/i)?.[1]?.trim()
    ?? "";
}

function shopifyLineVoice(lineName: string) {
  return Number(lineName.match(/(5|10|20)\s*(?:seconds?|S)\b/i)?.[1] ?? 0);
}

function shopifyPaymentProcessor(order: Record<string, unknown>, isZeroCashOrder: boolean) {
  const gateways = Array.isArray(order.payment_gateway_names)
    ? order.payment_gateway_names
    : Array.isArray(order.paymentGatewayNames)
      ? order.paymentGatewayNames
      : [];
  const gateway = gateways.map((item) => String(item ?? "")).find(Boolean)
    ?? String(order.gateway ?? "").trim();
  return normalizePaymentProcessor(gateway, isZeroCashOrder);
}

function cleanDiscountCodes(codes: string[]) {
  return [...new Set(codes.map((code) => code.trim()).filter(Boolean))];
}

function shopifyDiscountCodes(order: Record<string, unknown>) {
  const directCodes = arrayValue(order.discount_codes).map((item) => String(item.code ?? "").trim());
  const applications = order.discountApplications ?? order.discount_applications;
  const nodes = objectValue(applications).nodes;
  const edges = objectValue(applications).edges;
  const rows = Array.isArray(nodes)
    ? nodes
    : Array.isArray(edges)
      ? edges.map((edge) => objectValue(edge).node)
      : arrayValue(applications);
  return cleanDiscountCodes([
    ...directCodes,
    ...rows.map((item) => String(objectValue(item).code ?? objectValue(item).title ?? "").trim()),
  ]);
}

function shopifyTags(order: Record<string, unknown>) {
  const tags = order.tags;
  if (Array.isArray(tags)) return tags.map((tag) => textValue(tag)).filter(Boolean);
  return textValue(tags).split(",").map((tag) => tag.trim()).filter(Boolean);
}

function shopifyTrackingFromTags(order: Record<string, unknown>) {
  for (const tag of shopifyTags(order)) {
    const match = tag.match(/^\s*([^:]+?)\s*:\s*([A-Z0-9][A-Z0-9 -]{5,})\s*$/i);
    if (!match) continue;
    return {
      courier: match[1].trim(),
      trackingNumber: match[2].replace(/\s+/g, "").trim(),
    };
  }
  return { courier: "", trackingNumber: "" };
}

function firstMetafieldValue(order: Record<string, unknown>, key: string) {
  const metafields = order.metafields;
  if (!Array.isArray(metafields)) return "";
  const match = metafields.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return String(record.key ?? "").toLowerCase() === key.toLowerCase();
  }) as Record<string, unknown> | undefined;
  return String(match?.value ?? "").trim();
}

export function shopifyOrderToFulfilmentOrders(
  shopifyOrder: Record<string, unknown>,
  uploadLiftFormData = "",
  existing: Order[] = [],
  actor = "Shopify webhook",
) {
  const number = orderNumber(String(shopifyOrder.name ?? shopifyOrder.order_number ?? shopifyOrder.orderNumber ?? ""));
  if (!number) return [];
  const timestamp = new Date().toISOString();
  const rawPersonalization = uploadLiftFormData || firstMetafieldValue(shopifyOrder, "upload_lift_form_data");
  const lineItemNodes = objectValue(shopifyOrder.lineItems).nodes;
  const rawLineItems = Array.isArray(shopifyOrder.line_items)
    ? shopifyOrder.line_items
    : Array.isArray(shopifyOrder.lineItems)
      ? shopifyOrder.lineItems
      : Array.isArray(lineItemNodes)
        ? lineItemNodes
        : [];
  const lineItems = rawLineItems.length ? rawLineItems : [{}];
  const metafieldPersonalizations = personalizationBlocks(rawPersonalization);
  const lineItemPersonalizations = lineItems.map(shopifyLinePersonalization);
  const personalizations = metafieldPersonalizations.length
    ? metafieldPersonalizations
    : lineItemPersonalizations.some(hasShopifyPersonalization)
      ? lineItemPersonalizations
      : [];
  const total = Math.max(lineItems.length, personalizations.length, 1);
  const shippingAddress = shopifyOrder.shipping_address ?? shopifyOrder.shippingAddress ?? {};
  const billingAddress = shopifyOrder.billing_address ?? shopifyOrder.billingAddress ?? {};
  const shippingLine = objectValue(shopifyOrder.shippingLine);
  const shippingLines = arrayValue(shopifyOrder.shipping_lines);
  const customer = objectValue(shopifyOrder.customer);
  const subtotalAmount = shopifyMoney(shopifyOrder.subtotal_price ?? shopifyOrder.current_subtotal_price ?? shopifyOrder.currentSubtotalPriceSet);
  const shippingAmount = shopifyMoney(shopifyOrder.total_shipping_price_set ?? shopifyOrder.totalShippingPriceSet ?? shippingLine.price ?? shippingLines[0]?.price);
  const totalAmount = shopifyMoney(shopifyOrder.total_price ?? shopifyOrder.current_total_price ?? shopifyOrder.currentTotalPriceSet);
  const discountAmount = shopifyMoney(shopifyOrder.total_discounts ?? shopifyOrder.current_total_discounts ?? shopifyOrder.currentTotalDiscountsSet);
  const refundedAmount = shopifyMoney(shopifyOrder.total_refunded ?? shopifyOrder.totalRefundedSet);
  const outstandingBalance = shopifyMoney(shopifyOrder.total_outstanding ?? shopifyOrder.totalOutstandingSet);
  const isZeroCashOrder = totalAmount === 0;
  const productDiscountAmount = isZeroCashOrder ? 0 : lineItems.reduce((sum, lineItem) => sum + shopifyLineDiscount(lineItem), 0);
  const shippingDiscountAmount = isZeroCashOrder ? shippingAmount : Math.max(0, discountAmount - productDiscountAmount);
  const customerName = shopifyAddressName(shippingAddress)
    || shopifyAddressName(billingAddress)
    || [customer.firstName ?? customer.first_name, customer.lastName ?? customer.last_name].map(textValue).filter(Boolean).join(" ");
  const phone = String((shippingAddress as Record<string, unknown>).phone ?? shopifyOrder.phone ?? "").trim();
  const email = String(shopifyOrder.email ?? "").trim();
  const address = shopifyAddressText(shippingAddress) || shopifyAddressText(billingAddress);
  const createdAt = String(shopifyOrder.created_at ?? shopifyOrder.createdAt ?? timestamp);
  const paidAt = String(shopifyOrder.processed_at ?? shopifyOrder.processedAt ?? createdAt);
  const tagTracking = shopifyTrackingFromTags(shopifyOrder);
  const discountCodes = shopifyDiscountCodes(shopifyOrder);
  const existingById = new Map(existing.map((order) => [order.id, order]));
  const orders: Order[] = [];

  for (let index = 0; index < total; index += 1) {
    const lineItem = lineItems[index] ?? lineItems[0] ?? {};
    const personalization = personalizations[index] ?? personalizations[0] ?? {
      product: "", certificateCode: "", plushName: "", meaningfulNote: "", meaningfulMessage: "",
    };
    const lineName = shopifyLineName(lineItem);
    const id = total === 1 ? number : `${number}-${index + 1}`;
    const current = existingById.get(id) ?? (index === 0 ? existing.find((order) => order.orderNumber === number && !order.setIndicator) : undefined);
    const initialStatus = current?.status ?? "new_order";
    const certificateCode = personalization.certificateCode || current?.certificateCode || fallbackShopifyCertificateCode(number, phone);
    orders.push({
      id,
      orderNumber: number,
      salesChannel: "shopify",
      orderDate: createdAt || paidAt || current?.orderDate || timestamp,
      customerName: customerName || current?.customerName || "",
      phone: phone || current?.phone || "",
      email: email || current?.email || "",
      address: address || current?.address || "",
      currency: String(shopifyOrder.currency ?? shopifyOrder.currencyCode ?? current?.currency ?? "MYR"),
      subtotalAmount: isZeroCashOrder && subtotalAmount <= 0
        ? lineItems.reduce((sum, item) => sum + shopifyLinePrice(item) * shopifyLineQuantity(item), 0)
        : subtotalAmount || current?.subtotalAmount || 0,
      shippingAmount: shippingAmount || current?.shippingAmount || 0,
      totalAmount: totalAmount || current?.totalAmount || 0,
      discountAmount: isZeroCashOrder ? shippingDiscountAmount : discountAmount || current?.discountAmount || 0,
      productDiscountAmount,
      shippingDiscountAmount,
      refundedAmount: refundedAmount || current?.refundedAmount || 0,
      outstandingBalance: outstandingBalance || current?.outstandingBalance || 0,
      paymentProcessor: shopifyPaymentProcessor(shopifyOrder, isZeroCashOrder) || current?.paymentProcessor || "",
      discountCodes,
      discountCodeUsed: discountCodes[0] ?? current?.discountCodeUsed ?? "",
      shippingMethod: String(shippingLines[0]?.title ?? shippingLine.title ?? current?.shippingMethod ?? ""),
      product: productName(lineName, personalization.product || current?.product || ""),
      character: shopifyLineCharacter(lineName) || current?.character || "",
      setIndicator: total > 1 ? `(${index + 1},${total})` : "",
      idWebsiteLink: certificateLink(certificateCode) || current?.idWebsiteLink || "",
      voiceLength: shopifyLineVoice(lineName) || current?.voiceLength || 0,
      plushName: personalization.plushName || current?.plushName || "",
      certificateCode,
      meaningfulNote: personalization.meaningfulNote || current?.meaningfulNote || "",
      meaningfulMessage: personalization.meaningfulMessage || current?.meaningfulMessage || "",
      remark: String(shopifyOrder.note ?? current?.remark ?? ""),
      voiceUploadStatus: current?.voiceUploadStatus ?? (personalization.meaningfulMessage ? "received" : "missing"),
      courier: tagTracking.courier || current?.courier || "",
      trackingNumber: tagTracking.trackingNumber || current?.trackingNumber || "",
      status: initialStatus,
      internalNotes: current?.internalNotes || "",
      photoDataUrl: current?.photoDataUrl,
      photoName: current?.photoName,
      statusHistory: current?.statusHistory ?? [
        { id: `${id}-${timestamp}`, status: initialStatus, changedAt: timestamp, changedBy: actor, note: "Imported from Shopify webhook" },
      ],
      importedAt: current?.importedAt ?? timestamp,
      updatedAt: timestamp,
    });
  }
  return orders;
}

function normalizeTikTokPaymentMethod(value: string) {
  if (/bank|internet banking|duitnow|transfer/i.test(value)) return "Bank Transfer";
  if (/stripe/i.test(value)) return "Stripe";
  if (/xendit/i.test(value)) return "Xendit";
  return value || "TikTok Shop";
}

function parseTikTokDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return value;
  const [, day, month, year, hour = "0", minute = "0", second = "0"] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).toISOString();
}

function titleCase(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function tikTokDetailValue(raw: string, labels: string[]) {
  const normalizedRaw = raw.replace(/\u2026/g, "...").replace(/[：]/g, ":").replace(/[–—]/g, "-");
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = normalizedRaw.match(new RegExp(`(?:^|[\\r\\n])[^\\S\\r\\n]*${escaped}[^\\S\\r\\n]*(?:[-:]|\\.\\.\\.)[^\\S\\r\\n]*([^\\r\\n]*)`, "i"));
    if (match) return match[1]?.trim() ?? "";
  }
  return "";
}

export function parseTikTokDetailsBlock(raw: string): TikTokDetails {
  return {
    username: tikTokDetailValue(raw, ["Buyer Username", "Username", "TikTok Username", "Customer Username", "Nama Pengguna", "Nama Akaun"]),
    fileDataUrl: "",
    fileName: "",
    fileType: "",
    plushName: tikTokDetailValue(raw, ["Plushie's Name", "Plushie Name", "Name", "Nama Plushie", "Nama Mainan", "Nama"]),
    gender: titleCase(tikTokDetailValue(raw, ["Plushie's Gender", "Plushie Gender", "Gender", "Jantina Plushie", "Jantina"])),
    birthDate: tikTokDetailValue(raw, ["Plushie's Birth Date", "Plushie Birth Date", "Birth Date", "Tarikh Lahir Plushie", "Tarikh Lahir"]),
    birthPlace: tikTokDetailValue(raw, ["Plushie's Birth Place", "Plushie Birth Place", "Birth Place", "Tempat Lahir Plushie", "Tempat Lahir"]),
    favouritePerson: titleCase(tikTokDetailValue(raw, ["Plushie's Favourite Person", "Plushie Favourite Person", "Favourite Person", "Favorite Person", "Orang Kegemaran Plushie", "Orang Kegemaran"])),
    belongsTo: titleCase(tikTokDetailValue(raw, ["Plushie Belongs to", "Belongs To", "Belongs to", "Mainan lembut itu milik", "Milik", "Kepunyaan"])),
    meaningfulNote: tikTokDetailValue(raw, ["Meaningful Note", "Nota bermakna", "Nota Bermakna", "Nota"]),
  };
}

export function tikTokDetailsToText(details: Partial<TikTokDetails>) {
  return [
    details.username ? `Username- ${details.username}` : "",
    details.plushName ? `Plushie's Name- ${details.plushName}` : "",
    details.gender ? `Plushie's Gender- ${details.gender}` : "",
    details.birthDate ? `Plushie's Birth Date- ${details.birthDate}` : "",
    details.birthPlace ? `Plushie's Birth Place- ${details.birthPlace}` : "",
    details.favouritePerson ? `Plushie's Favourite Person- ${details.favouritePerson}` : "",
    details.belongsTo ? `Plushie Belongs to- ${details.belongsTo}` : "",
    details.meaningfulNote ? `Meaningful Note- ${details.meaningfulNote}` : "",
  ].filter(Boolean).join("\n");
}

function mergeTikTokDetailObject(parsed: Partial<TikTokDetails> | undefined, raw: string) {
  return mergeTikTokDetails(
    parseTikTokDetailsBlock(raw),
    {
      ...emptyTikTokDetails,
      ...parsed,
      username: parsed?.username ?? "",
      fileDataUrl: parsed?.fileDataUrl ?? "",
      fileName: parsed?.fileName ?? "",
      fileType: parsed?.fileType ?? "",
      plushName: parsed?.plushName ?? "",
      gender: parsed?.gender ?? "",
      birthDate: parsed?.birthDate ?? "",
      birthPlace: parsed?.birthPlace ?? "",
      favouritePerson: parsed?.favouritePerson ?? "",
      belongsTo: parsed?.belongsTo ?? "",
      meaningfulNote: parsed?.meaningfulNote ?? "",
    },
  );
}

function parseTikTokDetails(input: string | TikTokDetailEntry[]) {
  const text = typeof input === "string" ? input : "";
  const entries = Array.isArray(input) ? input : [];
  const fallback = parseTikTokDetailsBlock(text);
  const byOrder = new Map<string, TikTokDetails>();
  const byUsername = new Map<string, TikTokDetails>();
  for (const entry of entries) {
    const identifier = entry.identifier.trim();
    const details = {
      ...mergeTikTokDetailObject(entry.parsed, entry.details),
      fileDataUrl: entry.fileDataUrl ?? "",
      fileName: entry.fileName ?? "",
      fileType: entry.fileType ?? "",
    };
    if (!identifier) continue;
    if (/^\d+$/.test(identifier.replace(/\s+/g, ""))) byOrder.set(identifier.replace(/\D/g, ""), details);
    else byUsername.set(identifier.toLowerCase(), details);
  }
  const blocks = text.split(/(?=\b(?:Order\s*(?:ID|Number)|Buyer\s*Username|Username)\s*[-:])/i).map((block) => block.trim()).filter(Boolean);
  for (const block of blocks) {
    const details = parseTikTokDetailsBlock(block);
    const orderId = tikTokDetailValue(block, ["Order ID", "Order Number", "Order"]);
    const username = tikTokDetailValue(block, ["Buyer Username", "Username"]);
    if (orderId) byOrder.set(orderId.replace(/\D/g, ""), details);
    if (username) byUsername.set(username.toLowerCase(), details);
  }
  return { fallback, byOrder, byUsername };
}

function mergeTikTokDetails(...items: TikTokDetails[]) {
  return items.reduce((merged, item) => ({
    username: item.username || merged.username,
    fileDataUrl: item.fileDataUrl || merged.fileDataUrl,
    fileName: item.fileName || merged.fileName,
    fileType: item.fileType || merged.fileType,
    plushName: item.plushName || merged.plushName,
    gender: item.gender || merged.gender,
    birthDate: item.birthDate || merged.birthDate,
    birthPlace: item.birthPlace || merged.birthPlace,
    favouritePerson: item.favouritePerson || merged.favouritePerson,
    belongsTo: item.belongsTo || merged.belongsTo,
    meaningfulNote: item.meaningfulNote || merged.meaningfulNote,
  }), { ...emptyTikTokDetails });
}

function nextTikTokOrderNumber(existing: Order[], offset: number) {
  const max = existing.reduce((highest, order) => {
    const match = order.orderNumber.match(/\bTT(\d{4,})\b/i);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 1026);
  return `TT${max + offset + 1}`;
}

function tikTokCertificateCode(ttNumber: string, orderId: string) {
  const sequence = ttNumber.replace(/\D/g, "").slice(-4).padStart(4, "0");
  const lastFour = orderId.replace(/\D/g, "").slice(-4).padStart(4, "0");
  return `${sequence}${lastFour}106`;
}

function tikTokVariation(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  const character = parts[0] ?? "";
  const voiceLength = Number(value.match(/(5|10|20)\s*(?:seconds?|s)\b/i)?.[1] ?? 0);
  return { character, voiceLength };
}

export function normalizePaymentProcessor(value: string, isBankTransfer = false) {
  if (isBankTransfer) return "Bank Transfer";
  const normalized = value.trim();
  if (/xendit/i.test(normalized)) return "Xendit";
  if (/stripe|shopify payments/i.test(normalized)) return "Stripe";
  return normalized;
}

export function importShopifyData(
  orderCsv: string,
  metafieldCsv: string,
  existing: Order[],
  actor = "Admin",
): { orders: Order[]; result: ImportResult } {
  const warnings: string[] = [];
  const firstKind = detectCsvKind(orderCsv);
  const secondKind = detectCsvKind(metafieldCsv);
  let detectedOrderCsv = orderCsv;
  let detectedMetafieldCsv = metafieldCsv;
  if (firstKind === "metafields" && secondKind === "orders") {
    detectedOrderCsv = metafieldCsv;
    detectedMetafieldCsv = orderCsv;
  } else if (!orderCsv.trim() && secondKind === "orders") {
    detectedOrderCsv = metafieldCsv;
    detectedMetafieldCsv = "";
  } else if (firstKind === "orders" && secondKind === "orders") {
    warnings.push("Two Shopify order CSV files were detected. The first one was imported; the second one was ignored.");
    detectedMetafieldCsv = "";
  } else if (firstKind === "metafields" && secondKind !== "orders") {
    warnings.push("The Shopify orders CSV was not detected. Upload the orders export as either CSV file.");
    detectedOrderCsv = "";
    detectedMetafieldCsv = orderCsv;
  }
  const orderRows = detectedOrderCsv.trim() ? records(detectedOrderCsv, "orders") : [];
  const metaRows = detectedMetafieldCsv.trim() ? records(detectedMetafieldCsv, "metafields") : [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const metaByOrder = new Map<string, string>();
  for (const row of metaRows) {
    const number = orderNumber(row["Order name"]);
    const value = row["Metafield value"] ?? "";
    if (number && value.trim()) metaByOrder.set(number, value);
  }
  const rowsByOrder = new Map<string, Record<string, string>[]>();
  for (const row of orderRows) {
    const number = orderNumber(row.Name);
    if (!number) {
      skipped += 1;
      continue;
    }
    rowsByOrder.set(number, [...(rowsByOrder.get(number) ?? []), row]);
  }
  const existingById = new Map(existing.map((order) => [order.id, order]));
  const next = new Map(existing.map((order) => [order.id, order]));

  for (const [number, rows] of rowsByOrder) {
    const raw = metaByOrder.get(number) ?? "";
    if (metaRows.length && !raw) warnings.push(`#${number}: no matching metafield row`);
    const personalizations = personalizationBlocks(raw);
    const total = Math.max(rows.length, personalizations.length, 1);
    const shared = rows.find((row) => row["Shipping Name"] || row["Billing Name"] || row.Email) ?? rows[0] ?? {};
    const lineItemSubtotal = rows.reduce((sum, row) => (
      sum + money(row["Lineitem price"]) * Math.max(1, money(row["Lineitem quantity"]))
    ), 0);
    const importedTotalAmount = money(shared.Total);
    const isZeroCashOrder = shared.Total !== undefined && shared.Total !== "" && importedTotalAmount === 0;
    const importedProductDiscountAmount = rows.reduce((sum, row) => sum + money(row["Lineitem discount"]), 0);
    const importedDiscountAmount = money(shared["Discount Amount"]);
    const importedShippingAmount = money(shared.Shipping);
    const productDiscountAmount = isZeroCashOrder ? 0 : importedProductDiscountAmount;
    const shippingDiscountAmount = isZeroCashOrder
      ? importedShippingAmount
      : Math.max(0, importedDiscountAmount - importedProductDiscountAmount);
    const discountAmount = isZeroCashOrder ? shippingDiscountAmount : importedDiscountAmount;
    const discountCodes = cleanDiscountCodes((shared["Discount Code"] || "").split(/[,\s]+/));

    for (let index = 0; index < total; index += 1) {
      const row = rows[index] ?? rows[0] ?? {};
      const personalization = personalizations[index] ?? personalizations[0] ?? {
        product: "", certificateCode: "", plushName: "", meaningfulNote: "", meaningfulMessage: "",
      };
      const lineName = row["Lineitem name"] ?? "";
      const voice = Number(lineName.match(/(5|10|20)\s*(?:seconds?|S)/i)?.[1] ?? 0);
      const character = lineName.match(/-\s*([^/]+?)(?:\s*\(RM\d+\))?\s*\//i)?.[1]?.trim() ?? "";
      const id = total === 1 ? number : `${number}-${index + 1}`;
      const legacyCurrent = index === 0 ? existing.find((order) => order.orderNumber === number && !order.setIndicator) : undefined;
      const current = existingById.get(id) ?? legacyCurrent;
      const timestamp = new Date().toISOString();
      const initialStatus = current?.status ?? "new_order";
      const certificateCode = personalization.certificateCode || current?.certificateCode || "";

      const value: Order = {
        id,
        orderNumber: number,
        orderDate: shared["Created at"] || shared["Paid at"] || current?.orderDate || timestamp,
        customerName: shared["Shipping Name"] || shared["Billing Name"] || current?.customerName || "",
        phone: shared["Shipping Phone"] || shared.Phone || current?.phone || "",
        email: shared.Email || current?.email || "",
        address: shared["Shipping Street"] || shared["Shipping Address1"] || current?.address || "",
        currency: shared.Currency || current?.currency || "MYR",
        subtotalAmount: isZeroCashOrder && lineItemSubtotal > 0
          ? lineItemSubtotal
          : importedMoney(shared, "Subtotal", current?.subtotalAmount),
        shippingAmount: importedMoney(shared, "Shipping", current?.shippingAmount),
        totalAmount: importedMoney(shared, "Total", current?.totalAmount),
        discountAmount: shared["Discount Amount"] === undefined || shared["Discount Amount"] === "" ? current?.discountAmount ?? 0 : discountAmount,
        productDiscountAmount,
        shippingDiscountAmount,
        refundedAmount: importedMoney(shared, "Refunded Amount", current?.refundedAmount),
        outstandingBalance: importedMoney(shared, "Outstanding Balance", current?.outstandingBalance),
        paymentProcessor: normalizePaymentProcessor(
          shared["Payment Method"] || current?.paymentProcessor || "",
          isZeroCashOrder,
        ),
        discountCodes,
        discountCodeUsed: discountCodes[0] ?? current?.discountCodeUsed ?? "",
        shippingMethod: shared["Shipping Method"] || current?.shippingMethod || "",
        product: productName(lineName, personalization.product || current?.product || ""),
        character: character || current?.character || "",
        setIndicator: total > 1 ? `(${index + 1},${total})` : "",
        idWebsiteLink: certificateLink(certificateCode) || current?.idWebsiteLink || "",
        voiceLength: voice || current?.voiceLength || 0,
        plushName: personalization.plushName || current?.plushName || "",
        certificateCode,
        meaningfulNote: personalization.meaningfulNote || current?.meaningfulNote || "",
        meaningfulMessage: personalization.meaningfulMessage || current?.meaningfulMessage || "",
        remark: shared.Remark || shared.Notes || current?.remark || "",
        voiceUploadStatus: current?.voiceUploadStatus ?? (personalization.meaningfulMessage ? "received" : "missing"),
        courier: current?.courier || "",
        trackingNumber: current?.trackingNumber || "",
        status: initialStatus,
        internalNotes: current?.internalNotes || "",
        photoDataUrl: current?.photoDataUrl,
        photoName: current?.photoName,
        statusHistory: current?.statusHistory ?? [
          { id: `${id}-${timestamp}`, status: initialStatus, changedAt: timestamp, changedBy: actor, note: "Imported from Shopify CSV" },
        ],
        importedAt: current?.importedAt ?? timestamp,
        updatedAt: timestamp,
      };

      if (legacyCurrent && legacyCurrent.id !== id) next.delete(legacyCurrent.id);
      next.set(id, value);
      if (current) updated += 1;
      else imported += 1;
    }
  }

  return { orders: [...next.values()], result: { imported, updated, skipped, warnings } };
}

export function importTikTokShopData(
  tikTokCsv: string,
  detailsText: string | TikTokDetailEntry[],
  existing: Order[],
  actor = "Admin",
): { orders: Order[]; result: ImportResult; importedOrders: Order[] } {
  const warnings: string[] = [];
  const rows = tikTokRecords(tikTokCsv);
  const { fallback, byOrder, byUsername } = parseTikTokDetails(detailsText);
  const existingById = new Map(existing.map((order) => [order.id, order]));
  const next = new Map(existing.map((order) => [order.id, order]));
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  const importedOrders: Order[] = [];

  for (const row of rows) {
    const tikTokOrderId = orderNumber(row["Order ID"]);
    if (!tikTokOrderId) {
      skipped += 1;
      continue;
    }
    const id = `tiktok-${tikTokOrderId}`;
    const current = existingById.get(id);
    const username = row["Buyer Username"] || "";
    const details = mergeTikTokDetails(
      fallback,
      byUsername.get(username.toLowerCase()) ?? emptyTikTokDetails,
      byOrder.get(tikTokOrderId) ?? emptyTikTokDetails,
      parseTikTokDetailsBlock(row["Buyer Message"] || row["Seller Note"] || ""),
    );
    const assignedNumber = current?.orderNumber.match(/\bTT\d{4,}\b/i)?.[0] ?? nextTikTokOrderNumber(existing, importedOrders.length);
    const displayOrderNumber = `${assignedNumber} ${tikTokOrderId}`;
    const code = current?.certificateCode || tikTokCertificateCode(assignedNumber, tikTokOrderId);
    const { character, voiceLength } = tikTokVariation(row.Variation || row["Product Name"] || "");
    const totalAmount = money(row["Order Amount"] || row["SKU Subtotal After Discount"]);
    const originalPrice = money(row["SKU Subtotal Before Discount"] || row["SKU Unit Original Price"]);
    const sellerDiscount = money(row["SKU Seller Discount"]);
    const platformDiscount = money(row["SKU Platform Discount"]) + money(row["Payment platform discount"]);
    const shippingAmount = money(row["Shipping Fee After Discount"] || row["Original Shipping Fee"]);
    const timestamp = new Date().toISOString();
    const initialStatus = current?.status ?? "new_order";
    const value: Order = {
      id,
      orderNumber: displayOrderNumber,
      salesChannel: "tiktok",
      orderDate: parseTikTokDate(row["Created Time"] || row["Paid Time"] || current?.orderDate || timestamp),
      customerName: details.username || username || row.Recipient || current?.customerName || "",
      phone: row["Phone #"] || current?.phone || "",
      email: current?.email || "",
      address: [row["Detail Address"], row["Additional address information"], row["Post Town"], row.State, row.Country].filter(Boolean).join(", "),
      currency: current?.currency || "MYR",
      subtotalAmount: originalPrice || totalAmount,
      shippingAmount,
      totalAmount,
      discountAmount: sellerDiscount + platformDiscount,
      productDiscountAmount: sellerDiscount + platformDiscount,
      shippingDiscountAmount: Math.max(0, money(row["Original Shipping Fee"]) - shippingAmount),
      refundedAmount: money(row["Order Refund Amount"]),
      outstandingBalance: current?.outstandingBalance ?? 0,
      paymentProcessor: normalizeTikTokPaymentMethod(row["Payment Method"]),
      shippingMethod: row["Delivery Option"] || current?.shippingMethod || "",
      product: row["Product Name"] || current?.product || "TikTok Shop Order",
      character: character || current?.character || "",
      setIndicator: current?.setIndicator || "",
      idWebsiteLink: certificateLink(code),
      voiceLength: voiceLength || current?.voiceLength || 0,
      plushName: details.plushName || current?.plushName || "",
      certificateCode: code,
      meaningfulNote: details.meaningfulNote || current?.meaningfulNote || "",
      meaningfulMessage: [
        details.gender ? `Gender: ${details.gender}` : "",
        details.birthDate ? `Birth Date: ${details.birthDate}` : "",
        details.birthPlace ? `Birth Place: ${details.birthPlace}` : "",
        details.favouritePerson ? `Favourite Person: ${details.favouritePerson}` : "",
        details.belongsTo ? `Belongs To: ${details.belongsTo}` : "",
      ].filter(Boolean).join("\n"),
      remark: username ? `TikTok Shop username: ${username}` : current?.remark || "",
      voiceUploadStatus: current?.voiceUploadStatus ?? "missing",
      courier: row["Shipping Provider Name"] || current?.courier || "",
      trackingNumber: row["Tracking ID"] || current?.trackingNumber || "",
      status: initialStatus,
      internalNotes: current?.internalNotes || "",
      photoDataUrl: current?.photoDataUrl,
      photoName: current?.photoName,
      tikTokFileDataUrl: details.fileDataUrl || current?.tikTokFileDataUrl,
      tikTokFileName: details.fileName || current?.tikTokFileName,
      tikTokFileType: details.fileType || current?.tikTokFileType,
      statusHistory: current?.statusHistory ?? [
        { id: `${id}-${timestamp}`, status: initialStatus, changedAt: timestamp, changedBy: actor, note: "Imported from TikTok Shop CSV" },
      ],
      importedAt: current?.importedAt ?? timestamp,
      updatedAt: timestamp,
    };
    next.set(id, value);
    importedOrders.push(value);
    if (current) updated += 1;
    else imported += 1;
    if (!details.plushName) warnings.push(`${displayOrderNumber}: no plushie name was found in the TikTok details.`);
  }

  return { orders: [...next.values()], result: { imported, updated, skipped, warnings }, importedOrders };
}

export function applyTikTokDetailEntries(
  detailEntries: TikTokDetailEntry[],
  existing: Order[],
  actor = "Admin",
): { orders: Order[]; result: ImportResult; importedOrders: Order[] } {
  const next = new Map(existing.map((order) => [order.id, order]));
  const importedOrders: Order[] = [];
  const warnings: string[] = [];
  let updated = 0;
  let skipped = 0;
  for (const entry of detailEntries) {
    const identifier = entry.identifier.trim();
    const rawOrderId = identifier.replace(/\D/g, "");
    const current = rawOrderId
      ? existing.find((order) => order.id === `tiktok-${rawOrderId}` || order.orderNumber.includes(rawOrderId))
      : undefined;
    if (!current) {
      skipped += 1;
      warnings.push(identifier ? `${identifier}: no existing TikTok order found. Sync/import the order first.` : "Entry skipped: no TikTok order ID.");
      continue;
    }
    const details = mergeTikTokDetailObject(entry.parsed, entry.details);
    const timestamp = new Date().toISOString();
    const meaningfulMessage = [
      details.gender ? `Gender: ${details.gender}` : "",
      details.birthDate ? `Birth Date: ${details.birthDate}` : "",
      details.birthPlace ? `Birth Place: ${details.birthPlace}` : "",
      details.favouritePerson ? `Favourite Person: ${details.favouritePerson}` : "",
      details.belongsTo ? `Belongs To: ${details.belongsTo}` : "",
    ].filter(Boolean).join("\n");
    const updatedOrder: Order = {
      ...current,
      customerName: details.username || current.customerName,
      plushName: details.plushName || current.plushName,
      meaningfulNote: details.meaningfulNote || current.meaningfulNote,
      meaningfulMessage: meaningfulMessage || current.meaningfulMessage,
      tikTokFileDataUrl: entry.fileDataUrl || current.tikTokFileDataUrl,
      tikTokFileName: entry.fileName || current.tikTokFileName,
      tikTokFileType: entry.fileType || current.tikTokFileType,
      voiceUploadStatus: current.voiceUploadStatus === "checked" ? current.voiceUploadStatus : (entry.fileDataUrl || current.tikTokFileDataUrl ? "received" : current.voiceUploadStatus),
      updatedAt: timestamp,
      statusHistory: current.statusHistory.length ? current.statusHistory : [
        { id: `${current.id}-${timestamp}`, status: current.status, changedAt: timestamp, changedBy: actor, note: "TikTok plushie details added manually" },
      ],
    };
    next.set(current.id, updatedOrder);
    importedOrders.push(updatedOrder);
    updated += 1;
  }
  return { orders: [...next.values()], result: { imported: 0, updated, skipped, warnings }, importedOrders };
}

export function tikTokCertificateJson(order: Order) {
  const details = parseTikTokDetailsBlock(order.meaningfulMessage);
  return {
    Code: order.certificateCode,
    "Order Number": order.orderNumber,
    "Plush Details": `${order.character}${order.voiceLength ? ` ${order.voiceLength}S` : ""}`.trim(),
    "Id Picture": order.character,
    Name: order.plushName.toUpperCase(),
    Gender: details.gender,
    "Birth Date": details.birthDate,
    "Birth Place": details.birthPlace,
    "Favourite Person": details.favouritePerson,
    "Belongs To": details.belongsTo,
    "Meaningful Note": order.meaningfulNote,
  };
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function fulfilledOrdersCsv(orders: Order[]) {
  const headers = [
    "Order number", "Order date", "Customer name", "Phone", "Product", "Character",
    "Set indicator", "ID website link", "Voice length", "Plush name", "Remark", "Courier", "Tracking number", "Status", "Last updated",
  ];
  const rows = orders.filter((order) => order.status === "shipped").map((order) => [
    order.orderNumber, order.orderDate, order.customerName, order.phone, order.product,
    order.character, order.setIndicator, order.idWebsiteLink, order.voiceLength, order.plushName, order.remark, order.courier,
    order.trackingNumber, order.status, order.updatedAt,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

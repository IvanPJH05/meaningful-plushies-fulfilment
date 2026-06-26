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
type TikTokDetails = {
  plushName: string;
  gender: string;
  birthDate: string;
  birthPlace: string;
  favouritePerson: string;
  belongsTo: string;
  meaningfulNote: string;
};

const emptyTikTokDetails: TikTokDetails = {
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

function personalizationBlocks(raw: string) {
  const blocks = raw.split(/(?=\bProduct:\s*)/i).filter((block) => /^Product:\s*/i.test(block.trim()));
  return blocks.map((block) => ({
    product: metafield(block, "Product"),
    certificateCode: metafield(block, "Certificate Code"),
    plushName: metafield(block, "Name"),
    meaningfulNote: metafield(block, "Meaningful Note"),
    meaningfulMessage: metafield(block, "Meaningful Message"),
  }));
}

function productName(lineName: string, fallback: string) {
  const title = lineName.split(/\s+-\s+(?=[^/]+\s+\(RM)/i)[0]?.trim();
  return title || fallback;
}

function certificateLink(code: string) {
  return code ? `https://meaningfulplushies.com/pages/certificate/${code.trim()}` : "";
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
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(new RegExp(`${escaped}\\s*[-:]\\s*([^\\r\\n]*)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function parseTikTokDetailsBlock(raw: string): TikTokDetails {
  return {
    plushName: tikTokDetailValue(raw, ["Plushie's Name", "Plushie Name", "Name"]),
    gender: titleCase(tikTokDetailValue(raw, ["Plushie's Gender", "Plushie Gender", "Gender"])),
    birthDate: tikTokDetailValue(raw, ["Plushie's Birth Date", "Plushie Birth Date", "Birth Date"]),
    birthPlace: tikTokDetailValue(raw, ["Plushie's Birth Place", "Plushie Birth Place", "Birth Place"]),
    favouritePerson: titleCase(tikTokDetailValue(raw, ["Plushie's Favourite Person", "Plushie Favourite Person", "Favourite Person", "Favorite Person"])),
    belongsTo: titleCase(tikTokDetailValue(raw, ["Plushie Belongs to", "Belongs To", "Belongs to"])),
    meaningfulNote: tikTokDetailValue(raw, ["Meaningful Note"]),
  };
}

function parseTikTokDetails(text: string) {
  const fallback = parseTikTokDetailsBlock(text);
  const byOrder = new Map<string, TikTokDetails>();
  const byUsername = new Map<string, TikTokDetails>();
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
  detailsText: string,
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
      customerName: row.Recipient || username || current?.customerName || "",
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

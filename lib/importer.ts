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

export function importShopifyData(
  orderCsv: string,
  metafieldCsv: string,
  existing: Order[],
  actor = "Admin",
): { orders: Order[]; result: ImportResult } {
  const orderRows = records(orderCsv, "orders");
  const metaRows = metafieldCsv.trim() ? records(metafieldCsv, "metafields") : [];
  const warnings: string[] = [];
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


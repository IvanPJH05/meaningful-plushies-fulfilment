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

function records(text: string) {
  const [header = [], ...rows] = parseCsv(text);
  return rows.map((row) =>
    Object.fromEntries(header.map((name, index) => [clean(name), clean(row[index])])),
  );
}

function orderNumber(value = "") {
  return value.replace(/[^0-9]/g, "");
}

function metafield(raw: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.match(new RegExp(`${escaped}:\\s*([^\\r\\n]*)`, "i"))?.[1]?.trim() ?? "";
}

function productName(lineName: string, fallback: string) {
  const title = lineName.split(/\s+-\s+(?=[^/]+\s+\(RM)/i)[0]?.trim();
  return title || fallback;
}

export function importShopifyData(
  orderCsv: string,
  metafieldCsv: string,
  existing: Order[],
  actor = "Admin",
): { orders: Order[]; result: ImportResult } {
  const orderRows = records(orderCsv);
  const metaRows = metafieldCsv.trim() ? records(metafieldCsv) : [];
  const metaByOrder = new Map(
    metaRows.map((row) => [orderNumber(row["Order name"]), row["Metafield value"] ?? ""]),
  );
  const next = new Map(existing.map((order) => [order.orderNumber, order]));
  const warnings: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of orderRows) {
    const number = orderNumber(row.Name);
    if (!number) {
      skipped += 1;
      continue;
    }

    const raw = metaByOrder.get(number) ?? "";
    if (metaRows.length && !raw) warnings.push(`#${number}: no matching metafield row`);
    const lineName = row["Lineitem name"] ?? "";
    const voice = Number(lineName.match(/(5|10|20)\s*(?:seconds?|S)/i)?.[1] ?? 0);
    const character = lineName.match(/-\s*([^/]+?)\s*\(RM/i)?.[1]?.trim() ?? "";
    const current = next.get(number);
    const timestamp = new Date().toISOString();
    const initialStatus = current?.status ?? "new_order";

    const value: Order = {
      id: current?.id ?? number,
      orderNumber: number,
      orderDate: row["Created at"] || row["Paid at"] || current?.orderDate || timestamp,
      customerName: row["Shipping Name"] || row["Billing Name"] || current?.customerName || "",
      phone: row["Shipping Phone"] || row.Phone || current?.phone || "",
      email: row.Email || current?.email || "",
      address: row["Shipping Street"] || row["Shipping Address1"] || current?.address || "",
      product: productName(lineName, metafield(raw, "Product") || current?.product || ""),
      character: character || current?.character || "",
      setIndicator: metafield(raw, "Set Indicator") || current?.setIndicator || "",
      idWebsiteLink: metafield(raw, "ID Website Link") || metafield(raw, "Id Website Link") || current?.idWebsiteLink || "",
      voiceLength: voice || current?.voiceLength || 0,
      plushName: metafield(raw, "Name") || current?.plushName || "",
      certificateCode: metafield(raw, "Certificate Code") || current?.certificateCode || "",
      meaningfulNote: metafield(raw, "Meaningful Note") || current?.meaningfulNote || "",
      meaningfulMessage: metafield(raw, "Meaningful Message") || current?.meaningfulMessage || "",
      remark: row.Remark || row.Notes || current?.remark || "",
      voiceUploadStatus: current?.voiceUploadStatus ?? (metafield(raw, "Meaningful Message") ? "received" : "missing"),
      courier: current?.courier || "",
      trackingNumber: current?.trackingNumber || "",
      status: initialStatus,
      internalNotes: current?.internalNotes || "",
      photoDataUrl: current?.photoDataUrl,
      photoName: current?.photoName,
      statusHistory: current?.statusHistory ?? [
        { id: `${number}-${timestamp}`, status: initialStatus, changedAt: timestamp, changedBy: actor, note: "Imported from Shopify CSV" },
      ],
      importedAt: current?.importedAt ?? timestamp,
      updatedAt: timestamp,
    };

    next.set(number, value);
    if (current) updated += 1;
    else imported += 1;
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
  const rows = orders.filter((order) => order.status === "fulfilled").map((order) => [
    order.orderNumber, order.orderDate, order.customerName, order.phone, order.product,
    order.character, order.setIndicator, order.idWebsiteLink, order.voiceLength, order.plushName, order.remark, order.courier,
    order.trackingNumber, order.status, order.updatedAt,
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

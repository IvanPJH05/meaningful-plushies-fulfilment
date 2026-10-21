type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
export const creatorSheetSampleHeaders = ["Creator", "Profile link", "Product collection", "Sample codes", "Linked orders", "Given on", "Record IDs"];
export const creatorSheetProfileHeaders = ["Creator", "Email", "Phone", "TikTok", "Instagram", "Discount code", "Commission rate", "Tier", "Status", "Created", "Updated", "Record ID"];
export function creatorSampleSheetRows(samples: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const sample of samples) {
    const code = text(sample.sample_code).toUpperCase();
    const collection = text(sample.product_collection) || "classics";
    const base = collection === "plush_charms_v1" ? code.replace(/-(?:1|2)$/, "") : code;
    const key = `${collection}|${text(sample.creator_name).toLowerCase()}|${base}`;
    groups.set(key, [...(groups.get(key) ?? []), sample]);
  }
  return [...groups.values()].sort((a, b) => text(a[0].creator_name).localeCompare(text(b[0].creator_name))).map(group => {
    group.sort((a, b) => text(a.sample_code).localeCompare(text(b.sample_code), undefined, { numeric: true }));
    const sample = group[0];
    return [text(sample.creator_name), text(sample.creator_url), sample.product_collection === "plush_charms_v1" ? "Plush charms" : "Classics", group.map(row => text(row.sample_code)).join(" / "), [...new Set(group.map(row => text(row.order_number)).filter(Boolean))].join(" / "), text(sample.given_at).slice(0, 10), group.map(row => text(row.id)).join(" / ")];
  });
}
export function creatorProfileSheetRows(profiles: Row[]) {
  return [...profiles].sort((a, b) => text(a.display_name).localeCompare(text(b.display_name))).map(row => {
    const phone = text(row.phone);
    const local = phone.replace(/\D/g, "").replace(/^(?:0060|60)/, "0");
    return [text(row.display_name), text(row.email), /^01\d{8,9}$/.test(local) ? `${local.slice(0, 3)}-${local.slice(3)}` : phone, text(row.tiktok_url), text(row.instagram_url), text(row.discount_code), Number(row.commission_rate ?? 0) / 100, text(row.current_tier), text(row.status), text(row.created_at).slice(0, 10), text(row.updated_at).slice(0, 10), text(row.id)];
  });
}
export function creatorSheetCsv(rows: (string | number)[][]) {
  return rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
}

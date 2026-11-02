export function certificateCardCode(value: string): string {
  const trimmed = value.trim();
  if (/^\d{6}$/.test(trimmed)) return trimmed;
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error("Scan a valid six-digit certificate link."); }
  if (url.protocol !== "https:" || !["meaningfulplushies.com", "www.meaningfulplushies.com"].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash) throw new Error("This is not a Meaningful Plushies certificate link.");
  const match = url.pathname.match(/^\/(?:pages\/certificate|apps\/closer\/certificate)\/(\d{6})\/?$/);
  if (!match) throw new Error("This card does not use the new six-digit certificate link.");
  return match[1];
}

export function physicalCardUid(value: string): string {
  const uid = value.replace(/[:-]/g, "").toLowerCase();
  if (!/^(?:[0-9a-f]{8}|[0-9a-f]{14}|[0-9a-f]{20})$/.test(uid)) throw new Error("The reader did not provide a valid physical NFC card ID.");
  return uid;
}

export function validateSecondCard(first: { code: string; uid: string }, second: { code: string; uid: string }) {
  if (first.code !== second.code) throw new Error("The second card has a different certificate link. Use the matching card.");
  if (first.uid === second.uid) throw new Error("This is the same physical card. Remove it and scan the second card.");
}

export function characterKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (/tootsie/.test(key)) return "tootsie";
  if (/hunn?ie|hunny/.test(key)) return "hunnie";
  if (/dragon/.test(key)) return "dragon-warrior";
  if (/billy/.test(key)) return "billy";
  throw new Error("Select one of the four supported certificate characters.");
}

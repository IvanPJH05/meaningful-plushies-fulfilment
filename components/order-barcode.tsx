"use client";

import type { Order } from "../lib/types";

// Code 39 is deliberately used here because it is widely supported by inexpensive
// USB barcode scanners and the label can be produced entirely in the browser.
const code39: Record<string, string> = {
  "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn", "4": "nnnwwnnnw",
  "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw", "8": "wnnwnnwnn", "9": "nnwwnnwnn",
  A: "wnnnnwnnw", B: "nnwnnwnnw", C: "wnwnnwnnn", D: "nnnnwwnnw", E: "wnnnwwnnn", F: "nnwnwwnnn",
  G: "nnnnnwwnw", H: "wnnnnwwnn", I: "nnwnnwwnn", J: "nnnnwwwnn", K: "wnnnnnnww", L: "nnwnnnnww",
  M: "wnwnnnnwn", N: "nnnnwnnww", O: "wnnnwnnwn", P: "nnwnwnnwn", Q: "nnnnnnwww", R: "wnnnnnwwn",
  S: "nnwnnnwwn", T: "nnnnwnwwn", U: "wwnnnnnnw", V: "nwwnnnnnw", W: "wwwnnnnnn", X: "nwnnwnnnw",
  Y: "wwnnwnnnn", Z: "nwwnwnnnn", "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn",
  "$": "nwnwnwnnn", "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn",
};

export function orderBarcodeValue(order: Order) {
  const safeOrderNumber = order.orderNumber.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  return `MP-${safeOrderNumber || order.id.slice(0, 8).toUpperCase()}`;
}

export function normaliseBarcodeValue(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function OrderBarcode({ value, compact = false }: { value: string; compact?: boolean }) {
  const encoded = `*${value.toUpperCase().replace(/[^A-Z0-9 .\-$/+%]/g, "")}*`;
  const modules: Array<{ x: number; width: number }> = [];
  let x = 8;
  for (const character of encoded) {
    const pattern = code39[character] ?? code39["-"];
    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === "w" ? 3 : 1;
      if (index % 2 === 0) modules.push({ x, width });
      x += width;
    }
    x += 1;
  }
  const height = compact ? 30 : 54;
  return <div className={compact ? "order-barcode compact" : "order-barcode"} aria-label={`Barcode ${value}`}>
    <svg viewBox={`0 0 ${x + 8} ${height}`} role="img" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#fff" />
      {modules.map((bar, index) => <rect key={index} x={bar.x} y="0" width={bar.width} height={height} fill="#111" />)}
    </svg>
    <span>{value}</span>
  </div>;
}

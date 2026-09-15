"use client";

export { normaliseBarcodeValue, orderBarcodeValue } from "../lib/order-barcode";
import { code128Modules, code128UnitCount } from "../lib/code128";

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
void code39;

export function OrderBarcode({ value, compact = false }: { value: string; compact?: boolean }) {
  const modules = code128Modules(value);
  const quietZone = 10;
  const totalWidth = code128UnitCount(value) + quietZone * 2;
  let x = quietZone;
  const height = compact ? 30 : 54;
  return <div className={compact ? "order-barcode compact" : "order-barcode"} aria-label={`Barcode ${value}`}>
    <svg viewBox={`0 0 ${totalWidth} ${height}`} role="img" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#fff" />
      {modules.map((segment, index) => { const currentX = x; x += segment.width; return segment.black ? <rect key={index} x={currentX} y="0" width={segment.width} height={height} fill="#111" /> : null; })}
    </svg>
    <span>{value}</span>
  </div>;
}

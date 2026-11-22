export const warehouseMaxDurationMs = 180_000;

export function trackingCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{6,40}$/.test(code) ? code : "";
}

/** A parcel must match the complete tracking number, never a suffix or order ID. */
export function matchingTrackingCodes(values: string[], expected: string): boolean {
  const code = trackingCode(expected);
  return Boolean(code) && values.some(value => trackingCode(value) === code);
}

export function createTrackingConfirmation() {
  let previous = "";
  return {
    reset() { previous = ""; },
    observe(values: string[], expected: string) {
      const code = trackingCode(expected);
      const matched = matchingTrackingCodes(values, code);
      const confirmed = matched && previous === code;
      previous = matched ? code : "";
      return confirmed;
    },
  };
}

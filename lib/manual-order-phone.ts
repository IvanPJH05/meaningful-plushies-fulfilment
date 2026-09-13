export function normalizeManualOrderPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  let normalized = digits;
  if (digits.startsWith("0")) normalized = `6${digits}`;
  if (digits.startsWith("60")) normalized = digits;
  if (digits.startsWith("1") && digits.length >= 9) normalized = `60${digits}`;
  if (!/^60\d{8,11}$/.test(normalized)) {
    throw new Error("Enter a valid Malaysia phone number, for example 0123456789 or 60123456789.");
  }
  return {
    normalized,
    lastFour: normalized.slice(-4),
  };
}

// Shopify requires phone values in international E.164 form. Keep the
// original customer entry for display, but use this value for Shopify
// customers and delivery addresses.
export function shopifyManualOrderPhone(phone: string) {
  return `+${normalizeManualOrderPhone(phone).normalized}`;
}

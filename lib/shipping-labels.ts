export type ShippingLabelSource = "jnt" | "tiktok";

export function identifyShippingLabel(text: string): { source: ShippingLabelSource; reference: string } | null {
  const compact = text.replace(/\s+/g, " ").trim();
  const tikTokOrder = compact.match(/order\s*id\s*:?\s*(\d{8,})/i);
  if (tikTokOrder) return { source: "tiktok", reference: tikTokOrder[1] };

  // J&T puts the Shopify order reference in its Remark field. Different J&T
  // templates put the word before or after the value, and some omit the space
  // between them, so accept each of those forms.
  const jntRemark = compact.match(/(?:#\s*(\d{3,})\s*(?:remark|remarks?|\u5907\u6ce8))|(?:(?:remark|remarks?|\u5907\u6ce8)\s*[:\uFF1A-]?\s*#?\s*(\d{3,}))/i);
  const reference = jntRemark?.[1] || jntRemark?.[2];
  return reference ? { source: "jnt", reference } : null;
}

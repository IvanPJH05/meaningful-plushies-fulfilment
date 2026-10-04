const EAST_MALAYSIA_DELIVERY_FEE = 20;
const manualOrderPricesBySpeakerSeconds: Record<number, number> = { 5: 115, 10: 125, 20: 135 };

export function manualOrderIntakeQuote(input: { productKey: string; productDisplayName: string; shippingRegion: "WEST" | "EAST" }, configuredSpeakerSeconds: number, storeVariantPrice?: number) {
  const savedLabel = `${input.productKey} ${input.productDisplayName}`;
  const speakerSeconds = configuredSpeakerSeconds || Number(savedLabel.match(/\b(5|10|20)\s*(?:s|sec(?:onds?)?)?\b/i)?.[1] || 0);
  const basePrice = Number.isFinite(storeVariantPrice) && Number(storeVariantPrice) > 0
    ? Number(storeVariantPrice)
    : manualOrderPricesBySpeakerSeconds[speakerSeconds];
  const shippingFee = input.shippingRegion === "EAST" ? EAST_MALAYSIA_DELIVERY_FEE : 0;
  return { speakerSeconds, shippingFee, amountToCollect: basePrice === undefined ? null : basePrice + shippingFee };
}

const classicProductId = "1735465064423589268";
const charmProductId = "1737907973421958548";

const certificate = [
  "Certificate INCLUDE: ",
  "Plushie's Name-",
  "Plushie's Gender-",
  "Plushie's Birth Date-",
  "Plushie's Birth Place-",
  "Plushie's Favourite Person-",
  "Plushie Belongs to-",
  "Meaningful Note-",
].join("\n");

export function tutorialInstructions(lineItems: unknown): string {
  if (!Array.isArray(lineItems) || !lineItems.length) {
    throw new Error("Review the purchased TikTok SKUs before sending customisation instructions.");
  }

  let hasClassic = false;
  const instructions = lineItems.map((item, index) => {
    const classic = item?.product_id === classicProductId;
    const charm = item?.product_id === charmProductId;
    const variant = typeof item?.sku_name === "string" ? item.sku_name.trim() : "";
    const seconds = variant.match(/\b(5|10|20)\s*(?:seconds?|s)\b/i)?.[1];
    if ((!classic && !charm) || !seconds) {
      throw new Error("Unrecognised TikTok product or speaker option. Review the purchased SKU before sending.");
    }

    hasClassic ||= classic;
    const product = classic ? "Classic Plushie" : "Plush Charm";
    const quantity = Number(item.quantity ?? 1);
    const label = `Item ${index + 1} · ${product} (${variant})${quantity > 1 ? ` × ${quantity}` : ""}`;
    const details = classic ? "Complete one birth certificate per plushie." : "Send the recording for your charm.";
    return `${label}\nRecording limit: ${seconds} seconds, including silence. ${details}`;
  });

  const sections = [
    "Thank you for ordering from Meaningful Plushies! 💗 Watch the tutorial, then reply here in Shop Chat with your voice video.",
    ...instructions,
    "Please label your recording and any certificate with the item number. If you ordered more than one of an item, tell us which plushie or charm each recording is for.",
  ];
  if (hasClassic) sections.push("Copy and fill in this template for each Classic Plushie:\n\n" + certificate);
  return sections.join("\n\n");
}

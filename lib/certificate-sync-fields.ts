import type { Order } from "./types";
import { parseTikTokDetailsBlock } from "./importer.ts";

export const certificateEditFields = ["plushName", "plushGender", "plushBirthDate", "plushBirthPlace", "plushFavouritePerson", "plushBelongsTo", "meaningfulNote", "product", "character"] as const;

/** Absent legacy fields stay absent; an explicitly cleared field is sent empty. */
export function certificateDetails(order: Partial<Order>) {
  const legacy = order.salesChannel === "tiktok" ? parseTikTokDetailsBlock(order.meaningfulMessage || "") : undefined;
  return {
    idName: order.plushName?.toUpperCase(), gender: order.plushGender ?? (legacy?.gender || undefined), bornOn: order.plushBirthDate ?? (legacy?.birthDate || undefined),
    birthplace: order.plushBirthPlace ?? (legacy?.birthPlace || undefined), favouritePerson: order.plushFavouritePerson ?? (legacy?.favouritePerson || undefined),
    belongsTo: order.plushBelongsTo ?? (legacy?.belongsTo || undefined), meaningfulNote: order.meaningfulNote,
  };
}

export function retryDelaySeconds(attempts: number) {
  return Math.min(3600, 30 * 2 ** Math.min(Math.max(attempts - 1, 0), 7));
}

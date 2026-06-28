import type { Order, StockSetting } from "./types";

export const stockCharacters = ["BILLY", "TOOTSIE", "HUNNIE", "DRAGON WARRIOR"] as const;
export const voiceLengths = [5, 10, 20] as const;

export function summarizeStock(orders: Order[], settings: StockSetting[], extraCharacterSales: Partial<Record<(typeof stockCharacters)[number], number>> = {}) {
  const initial = new Map(settings.map((setting) => [setting.itemKey, setting.initialStock]));
  const characterSold = Object.fromEntries(stockCharacters.map((character) => [character, 0])) as Record<(typeof stockCharacters)[number], number>;
  const voiceSold = Object.fromEntries(voiceLengths.map((length) => [length, 0])) as Record<(typeof voiceLengths)[number], number>;

  for (const order of orders) {
    const character = order.character.trim().toUpperCase() as (typeof stockCharacters)[number];
    if (stockCharacters.includes(character)) characterSold[character] += 1;
    const voice = order.voiceLength as (typeof voiceLengths)[number];
    if (voiceLengths.includes(voice)) voiceSold[voice] += 1;
  }
  for (const character of stockCharacters) {
    characterSold[character] += extraCharacterSales[character] ?? 0;
  }

  const totalVoiceSold = voiceLengths.reduce((sum, length) => sum + voiceSold[length], 0);
  return {
    characters: stockCharacters.map((character) => ({
      name: character,
      initial: initial.get(character) ?? 0,
      sold: characterSold[character],
      remaining: Math.max(0, (initial.get(character) ?? 0) - characterSold[character]),
    })),
    voices: voiceLengths.map((length) => ({ length, sold: voiceSold[length] })),
    voiceInitial: initial.get("VOICE") ?? 0,
    voiceSold: totalVoiceSold,
    voiceRemaining: Math.max(0, (initial.get("VOICE") ?? 0) - totalVoiceSold),
  };
}

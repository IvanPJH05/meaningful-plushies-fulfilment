type ManualOrderProductLike = {
  key: string;
  displayName: string;
};

export const manualOrderCharacters = ["Billy", "Tootsie", "Hunnie", "Dragon Warrior"] as const;

const manualOrderProductHandlesByCharacterAndSeconds: Record<string, Record<string, string>> = {
  billy: {
    "5": "build-your-meaningful-plushie-wa-b-5s",
    "10": "build-your-meaningful-plushie-wa-b-10s",
    "20": "build-your-meaningful-plushie-wa-b-20s",
  },
  hunnie: {
    "5": "build-your-meaningful-plushie-wa-h-5s",
    "10": "build-your-meaningful-plushie-wa-h-10s",
    "20": "hunnie-wa-order",
  },
  tootsie: {
    "5": "build-your-meaningful-plushie-wa-t-5s",
    "10": "build-your-meaningful-plushie-wa-t-10s",
    "20": "tootsie-wa-order",
  },
  "dragon warrior": {
    "5": "build-your-meaningful-plushie-wa-d-5s",
    "10": "build-your-meaningful-plushie-wa-d-10s",
    "20": "dragon-warrior-wa-order",
  },
};

export function normalizeManualOrderCharacter(value?: string) {
  const normalized = (value ?? "").trim().toLowerCase();
  return manualOrderCharacters.find((character) => character.toLowerCase() === normalized) ?? "";
}

export function manualOrderSpeakerSeconds(product: ManualOrderProductLike) {
  const match = `${product.key} ${product.displayName}`.match(/(\d+)\s*s(?:econds?)?/i);
  return match?.[1] ?? "";
}

export function manualOrderProductPathForSelection(characterValue?: string, product?: ManualOrderProductLike) {
  if (!product) return "";
  const character = normalizeManualOrderCharacter(characterValue).toLowerCase();
  const seconds = manualOrderSpeakerSeconds(product);
  const handle = character && seconds ? manualOrderProductHandlesByCharacterAndSeconds[character]?.[seconds] ?? "" : "";
  return handle ? `products/${handle}` : "";
}

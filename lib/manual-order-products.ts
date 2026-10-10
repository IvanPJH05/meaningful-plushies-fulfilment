export type ManualOrderProductConfig = {
  key: string;
  displayName: string;
  productPath: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
  /** Display-only grouping used by the internal Manual Orders workspace. */
  family?: "classic_plushie" | "plush_charm";
  /** A fixed character for single-character charm entries. */
  character?: string;
};

const fallbackProducts: ManualOrderProductConfig[] = [
  {
    key: "plushie_5s",
    displayName: "Meaningful Plushie - 5 seconds",
    productPath: "products/meaningful-plushie",
    shopifyProductId: "7407587360839",
  },
  {
    key: "plushie_10s",
    displayName: "Meaningful Plushie - 10 seconds",
    productPath: "products/meaningful-plushie",
    shopifyProductId: "7407587360839",
  },
  {
    key: "plushie_20s",
    displayName: "Meaningful Plushie - 20 seconds",
    productPath: "products/meaningful-plushie",
    shopifyProductId: "7407587360839",
  },
  {
    key: "plush_charm_penny",
    displayName: "Meaningful Plush Charm - Penny - 5 seconds",
    productPath: "products/meaningful-plush-charm",
    family: "plush_charm",
    character: "Penny",
  },
  {
    key: "plush_charm_renny",
    displayName: "Meaningful Plush Charm - Renny - 5 seconds",
    productPath: "products/meaningful-plush-charm",
    family: "plush_charm",
    character: "Renny",
  },
  {
    key: "plush_charm_benny",
    displayName: "Meaningful Plush Charm - Benny - 5 seconds",
    productPath: "products/meaningful-plush-charm",
    family: "plush_charm",
    character: "Benny",
  },
];

function readConfiguredProducts() {
  const raw = process.env.MANUAL_ORDER_PRODUCTS_JSON || process.env.NEXT_PUBLIC_MANUAL_ORDER_PRODUCTS_JSON;
  if (!raw) return fallbackProducts;
  try {
    const parsed = JSON.parse(raw) as ManualOrderProductConfig[];
    if (!Array.isArray(parsed) || !parsed.length) return fallbackProducts;
    // Keep the built-in Charm entries when the existing environment setting
    // only lists Classics. A configured entry with the same key takes priority.
    const configuredByKey = new Map(parsed.filter((product) => product?.key).map((product) => [product.key, product]));
    return [
      ...fallbackProducts.map((product) => ({ ...product, ...configuredByKey.get(product.key) })),
      ...parsed.filter((product) => !fallbackProducts.some((fallback) => fallback.key === product.key)),
    ];
  } catch {
    return fallbackProducts;
  }
}

export const manualOrderProducts = readConfiguredProducts().map((product) => ({
  ...product,
  productPath: product.productPath.replace(/^https?:\/\/[^/]+\//, "").replace(/^\/+/, ""),
}));

export function manualOrderProductByKey(key: string) {
  return manualOrderProducts.find((product) => product.key === key) ?? null;
}

export function manualOrderProductFamily(product: Pick<ManualOrderProductConfig, "family" | "key" | "displayName" | "productPath">) {
  if (product.family) return product.family;
  return /plush[\s-]*charm/i.test(`${product.key} ${product.displayName} ${product.productPath}`)
    ? "plush_charm"
    : "classic_plushie";
}

export function manualOrderCharactersForProduct(product: Pick<ManualOrderProductConfig, "family" | "key" | "displayName" | "productPath" | "character">) {
  if (manualOrderProductFamily(product) === "plush_charm") return ["Penny", "Renny", "Benny"] as const;
  return ["Billy", "Tootsie", "Hunnie", "Dragon Warrior"] as const;
}

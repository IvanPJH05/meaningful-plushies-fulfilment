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
  // These are Shopify's live handles. A few use historical handle names, so
  // keep this explicit rather than deriving paths from the character/duration.
  { key: "plush_charm_penny_5s", displayName: "Meaningful Plush Charm - Penny - 5 seconds", productPath: "products/p-5-meaningful-plush-charm", family: "plush_charm", character: "Penny" },
  { key: "plush_charm_penny_10s", displayName: "Meaningful Plush Charm - Penny - 10 seconds", productPath: "products/p-10s-meaningful-plush-charm-copy", family: "plush_charm", character: "Penny" },
  { key: "plush_charm_penny_20s", displayName: "Meaningful Plush Charm - Penny - 20 seconds", productPath: "products/p-20s-meaningful-plush-charm", family: "plush_charm", character: "Penny" },
  { key: "plush_charm_renny_5s", displayName: "Meaningful Plush Charm - Renny - 5 seconds", productPath: "products/r-5s-meaningful-plush-charm", family: "plush_charm", character: "Renny" },
  { key: "plush_charm_renny_10s", displayName: "Meaningful Plush Charm - Renny - 10 seconds", productPath: "products/r-10s-meaningful-plush-charm", family: "plush_charm", character: "Renny" },
  { key: "plush_charm_renny_20s", displayName: "Meaningful Plush Charm - Renny - 20 seconds", productPath: "products/r-20s-meaningful-plush-charm", family: "plush_charm", character: "Renny" },
  { key: "plush_charm_benny_5s", displayName: "Meaningful Plush Charm - Benny - 5 seconds", productPath: "products/b-20s-meaningful-plush-charm", family: "plush_charm", character: "Benny" },
  { key: "plush_charm_benny_10s", displayName: "Meaningful Plush Charm - Benny - 10 seconds", productPath: "products/b-10s-meaningful-plush-charm", family: "plush_charm", character: "Benny" },
  { key: "plush_charm_benny_20s", displayName: "Meaningful Plush Charm - Benny - 20 seconds", productPath: "products/b-20s-meaningful-plush-charm-1", family: "plush_charm", character: "Benny" },
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

export type ManualOrderProductConfig = {
  key: string;
  displayName: string;
  productPath: string;
  shopifyProductId?: string;
  shopifyVariantId?: string;
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
];

function readConfiguredProducts() {
  const raw = process.env.MANUAL_ORDER_PRODUCTS_JSON || process.env.NEXT_PUBLIC_MANUAL_ORDER_PRODUCTS_JSON;
  if (!raw) return fallbackProducts;
  try {
    const parsed = JSON.parse(raw) as ManualOrderProductConfig[];
    return Array.isArray(parsed) && parsed.length ? parsed : fallbackProducts;
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

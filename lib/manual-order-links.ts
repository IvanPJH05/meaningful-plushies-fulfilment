export function buildManualOrderCustomerLink(productCode: string, productPath: string) {
  const store = (process.env.SHOPIFY_STOREFRONT_URL || process.env.NEXT_PUBLIC_SHOPIFY_STOREFRONT_URL || "https://meaningfulplushies.com").replace(/\/+$/, "");
  const cleanPath = productPath.replace(/^\/+/, "");
  return `${store}/discount/${encodeURIComponent(productCode)}?redirect=/${cleanPath}`;
}

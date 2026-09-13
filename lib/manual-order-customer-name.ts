export type ShopifyCustomerName = {
  firstName: string;
  lastName: string;
};

// Shopify requires a surname for the saved shipping address used by these
// manual orders. Keep the customer's name intact by placing it in that field.
export function shopifyManualOrderCustomerName(value: string): ShopifyCustomerName {
  const fullName = value.trim().replace(/\s+/g, " ");
  if (!fullName) throw new Error("Enter the customer's full name before creating the Shopify order.");
  return { firstName: "", lastName: fullName };
}

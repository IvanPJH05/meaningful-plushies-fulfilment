export type ShopifyCustomerName = {
  firstName: string;
  lastName: string;
};

// Preserve the full name while never sending an empty first name to Shopify.
export function shopifyManualOrderCustomerName(value: string): ShopifyCustomerName {
  const fullName = value.trim().replace(/\s+/g, " ");
  if (!fullName) throw new Error("Enter the customer's full name before creating the Shopify order.");
  const [firstName, ...rest] = fullName.split(" ");
  return { firstName, lastName: rest.join(" ") };
}

// Shopify's delivery-address validation requires a last name. A single-word
// name belongs in that field; repeating it would change the recipient's name.
export function shopifyManualOrderShippingName(value: string): ShopifyCustomerName {
  const name = shopifyManualOrderCustomerName(value);
  return name.lastName ? name : { firstName: "", lastName: name.firstName };
}

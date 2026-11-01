/** Shopify creation is durable before any optional follow-up repair. */
export async function completeManualOrderCreation<T>(persistCreated: () => Promise<T>, repairShipping: () => Promise<boolean>) {
  const created = await persistCreated();
  let shippingWarning = "";
  try {
    if (!await repairShipping()) throw new Error("Shipping address was not confirmed.");
  } catch {
    shippingWarning = "The Shopify order was created, but its delivery address still needs checking. Use CHECK / FIX SHIPPING in Paid orders.";
  }
  return { ...created, shippingWarning };
}

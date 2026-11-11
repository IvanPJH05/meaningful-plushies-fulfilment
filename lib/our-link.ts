import type { Order } from "./types";
import { isPlushCharmOrder } from "./plush-charm";
import { createCloserOrderLink, isFormattedPlushCharmLink, reservePlushCharmSequence } from "@/src/modules/closer/service";

/**
 * Adds the private Our Link address for Charm orders without ever delaying the
 * order import. Each number is reserved atomically, rather than by reading all
 * fulfilment rows, so this remains reliable during busy Shopify webhook bursts.
 */
export async function addMissingOurLinks(orders: Order[], context: string) {
  const linked: Order[] = [];

  for (const order of orders) {
    if (!isPlushCharmOrder(order) || isFormattedPlushCharmLink(order.idWebsiteLink)) {
      linked.push(order);
      continue;
    }

    try {
      const sequence = await reservePlushCharmSequence();
      linked.push({ ...order, idWebsiteLink: await createCloserOrderLink(order, sequence) });
    } catch (error) {
      // A fulfilment order is still more important than its optional customer
      // link. Keep it visible and let a later refresh/recovery attempt retry.
      console.error(`Could not create an Our Link for Plush Charm order #${order.orderNumber} during ${context}`, error);
      linked.push(order);
    }
  }

  return linked;
}

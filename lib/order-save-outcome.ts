export type OrderSaveOutcome = { saved: true; accountingWarning: string | null };

export async function writeOrdersThenSyncAccounting(
  write: () => Promise<void>,
  sync: () => Promise<void>,
): Promise<OrderSaveOutcome> {
  // A failed primary write remains a failed save. A later accounting failure
  // cannot undo that write and must not be presented as an order-save failure.
  await write();
  try {
    await sync();
    return { saved: true, accountingWarning: null };
  } catch {
    return { saved: true, accountingWarning: "Orders saved. Monthly Journal sync failed and needs a retry." };
  }
}

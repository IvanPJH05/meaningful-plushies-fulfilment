export type DeliveryRegion = "west" | "east" | "";
export type DeliveryScheduleFields = { deliveryNeededBy?: string; deliveryRegion?: DeliveryRegion };
export function malaysiaScheduleDay(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10); }
export function validDeliveryDay(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < "2000-01-01" || day > "9999-12-31") return false;
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10) === day;
}
export function orderDeliverySchedule(order: DeliveryScheduleFields, now = new Date()) {
  const neededBy = order.deliveryNeededBy || "";
  if (!neededBy) return null;
  if (!validDeliveryDay(neededBy) || !["west","east"].includes(order.deliveryRegion || "")) throw new Error("Choose a valid customer needed-by date and delivery region.");
  const leadDays = order.deliveryRegion === "west" ? 4 : 7;
  const minus = (days: number) => new Date(Date.parse(`${neededBy}T00:00:00Z`) - days * 86400000).toISOString().slice(0,10);
  const unlockDate = minus(leadDays), shipByDate = minus(leadDays - 2), today = malaysiaScheduleDay(now);
  return { neededBy, region: order.deliveryRegion!, leadDays, unlockDate, shipByDate, held: today < unlockDate, overdue: today > shipByDate };
}
export function deliveryHold(order: DeliveryScheduleFields, now = new Date()) {
  try { return orderDeliverySchedule(order,now)?.held || false; } catch { return Boolean(order.deliveryNeededBy); }
}
export function formatDeliveryDay(day: string) {
  return new Intl.DateTimeFormat("en-MY",{day:"numeric",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${day}T00:00:00Z`));
}
export function deliveryScheduleCanEdit(status: string) { return ["awaiting_customisation","new_order"].includes(status); }

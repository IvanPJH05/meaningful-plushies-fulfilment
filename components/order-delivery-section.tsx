"use client";
import { useId } from "react";
import type { Order } from "../lib/types";
import { deliveryScheduleCanEdit, formatDeliveryDay, malaysiaScheduleDay, orderDeliverySchedule } from "../lib/order-delivery-schedule";
import { useLanguage } from "./dashboard-language";
import styles from "./order-delivery-section.module.css";
type DeliveryOrder = Pick<Order,"status"|"shippingMethod"|"courier"|"trackingNumber"|"deliveryNeededBy"|"deliveryRegion">;
export function OrderDeliverySection({order,editable,busy=false,onChange}:{order:DeliveryOrder;editable:boolean;busy?:boolean;onChange:(patch:Partial<Order>)=>void}) {
  const { t } = useLanguage(), id = useId();
  const scheduleDisabled = !editable || busy || !deliveryScheduleCanEdit(order.status);
  let plan: ReturnType<typeof orderDeliverySchedule> = null, error = "";
  try { plan = orderDeliverySchedule(order); } catch (e) { error = e instanceof Error ? e.message : "Check the delivery schedule."; }
  return <section className="detail-section"><h3>{t("Delivery")}</h3><div className="field-grid">
    <div className="field"><label>{t("Shipping method")}</label><strong>{order.shippingMethod || t("Not imported")}</strong></div>
    <div className="field"><label htmlFor={`${id}-courier`}>{t("Courier")}</label><input id={`${id}-courier`} value={order.courier} disabled={!editable||busy} placeholder={t("J&T Express")} onChange={event=>onChange({courier:event.target.value})}/></div>
    <div className="field"><label htmlFor={`${id}-tracking`}>{t("Tracking number")}</label><input id={`${id}-tracking`} value={order.trackingNumber} disabled={!editable||busy} placeholder={t("Enter tracking number")} onChange={event=>onChange({trackingNumber:event.target.value})}/></div>
    <div className="field"><label htmlFor={`${id}-needed`}>{t("Customer needs product by")}</label><input id={`${id}-needed`} type="date" value={order.deliveryNeededBy||""} min={malaysiaScheduleDay()} disabled={scheduleDisabled} onChange={event=>onChange({deliveryNeededBy:event.target.value,...(!event.target.value?{deliveryRegion:"" as const}:!order.deliveryRegion?{deliveryRegion:"west" as const}:{})})}/><small className={styles.hint}>{t("Leave blank for normal fulfilment.")}</small></div>
    <div className="field"><label htmlFor={`${id}-region`}>{t("Delivery region")}</label><select id={`${id}-region`} value={order.deliveryRegion||""} disabled={scheduleDisabled||!order.deliveryNeededBy} onChange={event=>onChange({deliveryRegion:event.target.value as Order["deliveryRegion"]})}><option value="">{t("Choose region")}</option><option value="west">{t("West Malaysia — start 4 days before")}</option><option value="east">{t("East Malaysia — start 7 days before")}</option></select></div>
    {plan&&<div className={`field wide ${styles.plan}`} role="status"><div><span>{t("Start fulfilment")}</span><strong>{formatDeliveryDay(plan.unlockDate)}</strong></div><div><span>{t("Ship by")}</span><strong>{formatDeliveryDay(plan.shipByDate)}</strong></div><p>{plan.held?`${t("Scheduled — start fulfilment on")} ${formatDeliveryDay(plan.unlockDate)}.`:plan.overdue?t("Ship-by date has passed. Review this order before promising delivery."):t("Fulfilment window is open.")} {t("Malaysia time · calendar days · 2 days for production.")}</p></div>}
    {error&&<p role="alert" className={styles.error}>{t(error)}</p>}
    {!deliveryScheduleCanEdit(order.status)&&<p className={`field wide ${styles.hint}`}>{t("Production has already started. Delivery scheduling is read-only.")}</p>}
  </div></section>;
}

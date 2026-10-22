"use client";
import { useState } from "react";
import { batchCodOrders, codDetails } from "../lib/batch-cod";
import type { Order } from "../lib/types";
import { useLanguage } from "./dashboard-language";

export function BatchCodDetails({ orders }: { orders: Order[] }) {
  const { t } = useLanguage();
  const [copied, setCopied] = useState("");
  const [failed, setFailed] = useState("");
  const codOrders = batchCodOrders(orders);
  if (!codOrders.length) return null;
  return <section className="card batch-cod"><h3>{t("COD shipping details")}</h3>
    <p>{t("Copy the name, phone number and full address into your courier form. Set the COD amount separately.")}</p>
    <div className="batch-cod-grid">{codOrders.map(order => {
      const details = codDetails(order);
      return <article key={order.id}><strong>#{order.orderNumber}</strong>
        <textarea aria-label={`${t("COD shipping details")} #${order.orderNumber}`} readOnly rows={5} value={details.text} onFocus={event => event.currentTarget.select()} />
        <p className="batch-cod-amount">{t("Set COD to")}: <strong>{details.amount === null ? t("Amount unavailable") : `${details.currency === "MYR" ? "RM" : details.currency} ${details.amount.toFixed(2)}`}</strong></p>
        <small>{t(details.usesBalance ? "Recorded outstanding balance" : "Recorded order total")}</small>
        {!details.complete && <p role="alert">{t("Customer details are incomplete. Open the order to check before creating a label.")}</p>}
        <button className="button secondary" disabled={!details.complete} onClick={async () => {
          try { await navigator.clipboard.writeText(details.text); setCopied(order.id); setFailed(""); }
          catch { setFailed(order.id); setCopied(""); }
        }}>{t(copied === order.id ? "Copied" : "Copy shipping details")}</button>
        {failed === order.id && <p role="status">{t("Select the text above and copy it manually.")}</p>}
        {copied === order.id && <span className="sr-only" role="status">{t("Copied")}</span>}
      </article>;
    })}</div>
  </section>;
}

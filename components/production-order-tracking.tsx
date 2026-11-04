"use client";

import { useEffect, useState } from "react";
import type { Order } from "@/lib/types";
import { productionBatchCreatedAt, stageLabels, type ProductionStage } from "@/lib/production-tracking";

type TrackingOrder = Order & { production: { stage: ProductionStage; disposition: string } | null };
type Filter = "not_done" | "done";

function parcelStatus(order: TrackingOrder) {
  if (order.production?.stage === "delivered") return "Delivered";
  if (order.orderDate && order.status === "shipped") return "Shipped";
  if (order.status === "packed") return "Packed · awaiting courier pickup";
  if (order.production && order.production.disposition === "active") return stageLabels[order.production.stage];
  return order.status.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}

export function ProductionOrderTracking({ token, onOpenOrder }: { token: string; onOpenOrder: (order: Order) => Promise<void> }) {
  const [orders, setOrders] = useState<TrackingOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<Filter>("not_done");
  const [page, setPage] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ status: filter, page: String(page) });
    fetch("/api/production-tracking/orders?" + params, {
      headers: { Authorization: "Bearer " + token }, cache: "no-store", signal: controller.signal,
    }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load orders.");
      if (controller.signal.aborted) return;
      setOrders(data.orders);
      setTotal(data.total);
      if (page > 0 && data.orders.length === 0) setPage(Math.max(0, Math.ceil(data.total / 50) - 1));
    }).catch(error => {
      if (!controller.signal.aborted) setError(error.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [token, page, filter, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  function choose(next: Filter) {
    if (next === filter) return;
    setOrders([]);
    setTotal(0);
    setLoading(true);
    setPage(0);
    setFilter(next);
  }

  return <section className="card orders-card">
    <div className="toolbar">
      <button className="button secondary" aria-pressed={filter === "not_done"} onClick={() => choose("not_done")}>Not done</button>
      <button className="button secondary" aria-pressed={filter === "done"} onClick={() => choose("done")}>Done</button>
      <button className="button secondary" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
    </div>
    {error && <p role="alert" className="inline-notice">{error}</p>}
    <div className="table-scroll"><table className="orders-table">
      <thead><tr><th>Order number</th><th>Parcel status</th><th>Created (Malaysia time)</th></tr></thead>
      <tbody>
        {orders.map(order => <tr key={order.id}>
          <td><button className="view-button" onClick={() => void onOpenOrder(order).catch(error => setError(error.message))}>#{order.orderNumber}</button></td>
          <td>{parcelStatus(order)}</td>
          <td>{order.orderDate ? productionBatchCreatedAt(order.orderDate) : "—"}</td>
        </tr>)}
        {!orders.length && <tr><td colSpan={3}>{loading ? "Loading orders…" : "No orders in this view."}</td></tr>}
      </tbody>
    </table></div>
    <div className="toolbar">
      <span>{total} orders</span>
      <button className="button secondary" disabled={loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous</button>
      <button className="button secondary" disabled={loading || (page + 1) * 50 >= total} onClick={() => setPage(value => value + 1)}>Next</button>
    </div>
  </section>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { matchesProductionBarcode, productionBatchLabel, stageLabels, type ProductionItem, type ProductionStage } from "@/lib/production-tracking";
import type { Order } from "@/lib/types";
import { ProductionPairScanner } from "./production-pair-scanner";
import { PackingCameraStation, type PackingStationHandle } from "./packing-camera-station";
import styles from "./production-tracking.module.css";

type QueueItem = {
  id: string;
  order_id: string;
  stage: ProductionStage;
  issue: string;
  production_batches: { batch_number: number } | null;
  fulfilment_orders: { order_number: string; plush_name: string } | null;
};

export function ProductionScannerWorkspace({ token, orders, audioSourceFor }: {
  token: string;
  orders: Order[];
  audioSourceFor: (order: Order) => string;
}) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [proofEnabled,setProofEnabled]=useState(false),[recording,setRecording]=useState(false);
  const camera=useRef<PackingStationHandle>(null);

  const request = useCallback(async (path: string, body?: object) => {
    const response = await fetch("/api/production-tracking" + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load production.");
    return data;
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setQueue((await request("?scannerQueue=1")).queue); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function findOrder(barcode: string): Promise<ProductionItem | null> {
    const matches = orders.filter(order => matchesProductionBarcode(order, barcode));
    if (matches.length > 1) throw new Error("This barcode matches multiple items. Scan the individual packing slip barcode.");
    const path = matches[0] ? "?scanOrder=" + encodeURIComponent(matches[0].id)
      : "?scanBarcode=" + encodeURIComponent(barcode);
    const item = (await request(path)).item;
    if (!item) return null;
    await request("", { action: "scanner_pack", orderId: item.order_id, orderBarcode: barcode });
    const packed = (await request("?scanOrder=" + encodeURIComponent(item.order_id))).item;
    void refresh();
    return packed;
  }

  async function save(item: ProductionItem, action: string, barcode: string, card: string, note: string) {
    await request("", { action: action === "packed" ? "scanner_pair" : action, orderId: item.order_id, itemId: item.id, version: item.version, orderBarcode: barcode, cardCode: card, note });
    await refresh();
    return [];
  }

  return <div className={styles.page}>
    <PackingCameraStation ref={camera} token={token} onState={(enabled,active)=>{setProofEnabled(enabled);setRecording(active);}} />
    <div className={styles.panel}>
      <ProductionPairScanner findOrder={findOrder} audioSourceFor={audioSourceFor}
        checkCard={(code,orderId) => request("?nfc=" + encodeURIComponent(code) + (proofEnabled ? "&packingProof=1" + (orderId ? "&orderId=" + encodeURIComponent(orderId) : "") : ""))} save={save} onBusy={() => {}}
        proofEnabled={proofEnabled} recording={recording} preparePackingProof={(item,barcode,card,at)=>camera.current?.prepare(item,barcode,card,at)||null} />
    </div>
    <section className={styles.panel}>
      <h2>Sent to sewing · still in progress</h2>
      <button disabled={loading} onClick={() => void refresh()}>Refresh orders</button>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!queue.length && !error && <p>{loading ? "Loading orders…" : "No unfinished sewing orders."}</p>}
      {queue.length > 0 && <div className="table-scroll"><table className="orders-table">
        <thead><tr><th>Order</th><th>Plushie</th><th>Batch</th><th>Stage</th></tr></thead>
        <tbody>{queue.map(item => <tr key={item.id}>
          <td>#{item.fulfilment_orders?.order_number || item.order_id}</td>
          <td>{item.fulfilment_orders?.plush_name || "—"}</td>
          <td>{productionBatchLabel(item.production_batches?.batch_number)}</td>
          <td>{stageLabels[item.stage]}{item.issue && " · Issue: " + item.issue}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}

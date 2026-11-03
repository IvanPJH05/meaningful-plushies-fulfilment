"use client";
import { useRef, useState } from "react";
import type { Handover } from "@/lib/tiktok-shipping-policy";
import type { ShippingReview } from "@/lib/tiktok-shipping";
import type { Order } from "@/lib/types";
import styles from "./tiktok-shipping-panel.module.css";

export function TikTokShippingPanel({ orders, token, onChanged, onPrint }: { orders: Order[]; token: string; onChanged: () => Promise<unknown>; onPrint: (orders: Order[]) => Promise<unknown> }) {
  const selected = orders.filter(order => order.salesChannel === "tiktok");
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reviews, setReviews] = useState<ShippingReview[]>([]), [choices, setChoices] = useState<Record<string, string>>({}), [checked, setChecked] = useState<string[]>([]);
  const [notice, setNotice] = useState(""); const lock = useRef(false);
  const [confirmArrange, setConfirmArrange] = useState(false);
  async function request(body: object) {
    const response = await fetch("/api/tiktok/shipping", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "TikTok shipping request failed.");
    return result;
  }
  async function inspect() {
    if (lock.current) return; lock.current = true; setOpen(true); setBusy(true); setConfirmArrange(false); setError(""); setNotice(""); setReviews([]); setChecked([]); setChoices({});
    try {
      const all: ShippingReview[] = [];
      for (let offset = 0; offset < selected.length; offset += 20) {
        setNotice(`Checking shipments ${offset + 1}–${Math.min(offset + 20, selected.length)} of ${selected.length}…`);
        const result = await request({ action: "inspect", orderIds: selected.slice(offset, offset + 20).map(order => order.id) });
        all.push(...result.reviews); setReviews([...all]);
      }
      setNotice("");
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  function handover(review: ShippingReview): Handover | undefined {
    const choice = choices[review.orderId];
    if (choice === "SHOP_DEFAULT") return { method: "SHOP_DEFAULT" };
    if (choice === "DROP_OFF") return { method: "DROP_OFF" };
    const slot = review.options?.pickup_slots?.find(s => `${s.start_time}:${s.end_time}` === choice);
    return slot ? { method: "PICKUP", start: slot.start_time, end: slot.end_time } : undefined;
  }
  async function perform(action: "arrange" | "label") {
    if (lock.current) return;
    const targets = reviews.filter(r => checked.includes(r.orderId) && !r.error && (action === "arrange" ? r.packageStatus === "TO_FULFILL" : r.packageStatus === "PROCESSING"));
    if (!targets.length) return;
    setConfirmArrange(false);
    lock.current = true; setBusy(true); setError(""); setNotice(""); let passed = 0;
    try {
      for (const review of targets) {
        try {
          const result = await request({ action, orderIds: [review.orderId], packageId: review.packageId, handover: handover(review) });
          setReviews(old => old.map(r => r.orderId === review.orderId ? result.review : r)); passed++;
        } catch (e) { setReviews(old => old.map(r => r.orderId === review.orderId ? { ...r, error: (e as Error).message } : r)); }
      }
      setNotice(`${passed} of ${targets.length} labels ready. Refresh shipment details for any order that needs another attempt.`);
      await onChanged();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  const printable = reviews.filter(r => checked.includes(r.orderId) && r.labelUrl);
  const arrange = reviews.filter(r => checked.includes(r.orderId) && !r.error && r.packageStatus === "TO_FULFILL");
  const retrieve = reviews.filter(r => checked.includes(r.orderId) && !r.error && r.packageStatus === "PROCESSING");
  async function print() {
    if (lock.current) return; lock.current = true; setBusy(true); setError("");
    try { const result = await onPrint(printable.map(r => ({ ...orders.find(o => o.id === r.orderId)!, shippingLabelUrl: r.labelUrl, trackingNumber: r.trackingNumber || "", courier: r.courier || "" }))); if (result === false) throw Error("The print PDF could not be prepared. Please retry."); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <button className="button secondary" disabled={!selected.length || selected.length > 200 || busy} onClick={() => void inspect()}>TikTok shipping · {selected.length}</button>
    {open && <div className={styles.backdrop}><section role="dialog" aria-modal="true" aria-labelledby="tiktok-shipping-title" className={styles.dialog}>
      <div className="section-heading"><div><h2 id="tiktok-shipping-title">TikTok shipments & shipping labels</h2><p>Review packages, arrange shipment, then print their official A6 labels with your packing slips.</p></div><button className="button secondary" disabled={busy} onClick={() => setOpen(false)}>Close</button></div>
      <p>Shipment booking does not complete production or mark a parcel collected. Split or combined packages must be handled in TikTok Seller Center.</p>
      <p>For Malaysia, TikTok uses your warehouse’s saved collection method. Change pickup or drop-off in Seller Center → Orders → Fulfillment settings → Collection method settings.</p>
      <p><a href="/tiktok-connect" target="_blank" rel="noreferrer">Reconnect TikTok Shop to update shipping permissions</a></p>
      {busy && <p role="status">Processing TikTok shipments… Please keep this window open.</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {confirmArrange && <div role="alert"><strong>Arrange {arrange.length} TikTok shipment(s)?</strong><p>This updates TikTok using the handover options shown and may book carrier collection. TikTok’s normal shipping charges and rules apply.</p><button className="button primary" disabled={busy || !arrange.length || arrange.some(r => !handover(r))} onClick={() => void perform("arrange")}>Confirm shipment arrangement</button><button className="button secondary" disabled={busy} onClick={() => setConfirmArrange(false)}>Go back</button></div>}
      <div className="toolbar-row"><button className="button secondary" disabled={busy} onClick={() => setChecked(reviews.filter(r => !r.error || r.labelUrl).map(r => r.orderId))}>Select all available</button><button className="button secondary" disabled={busy} onClick={() => setChecked([])}>Clear selection</button><button className="button secondary" disabled={busy} onClick={() => setChoices(old => ({ ...old, ...Object.fromEntries(reviews.filter(r => r.options?.uses_shop_settings).map(r => [r.orderId, "SHOP_DEFAULT"])) }))}>Use warehouse settings for all</button></div>
      <div className={styles.list}>{reviews.map(r => <article key={r.orderId}>
        <label><input type="checkbox" disabled={busy || Boolean(r.error && !r.labelUrl)} checked={checked.includes(r.orderId)} onChange={e => setChecked(old => e.target.checked ? [...old, r.orderId] : old.filter(id => id !== r.orderId))} /> <strong>#{r.orderNumber}</strong></label>
        <p>{r.packageStatus === "TO_FULFILL" ? "Awaiting shipment arrangement" : r.packageStatus === "PROCESSING" ? "Shipment arranged · awaiting collection" : r.packageStatus || "Unavailable"}{r.trackingNumber ? ` · ${r.trackingNumber}` : ""}{r.courier ? ` · ${r.courier}` : ""}</p>
        {r.labelUrl && <p>Shipping label saved and ready to print.</p>}{r.error && <p role="alert">{r.error}</p>}
        {r.packageStatus === "TO_FULFILL" && !r.error && <label>Handover option<select disabled={busy} value={choices[r.orderId] || ""} onChange={e => setChoices(old => ({ ...old, [r.orderId]: e.target.value }))}><option value="">Confirm shipping arrangement</option>{r.options?.uses_shop_settings && <option value="SHOP_DEFAULT">Use TikTok warehouse collection settings</option>}{r.options?.can_drop_off && <option value="DROP_OFF">Drop off at carrier</option>}{r.options?.can_pickup && r.options.pickup_slots?.filter(s => s.avaliable === true || s.available === true).map(s => <option key={s.start_time + ":" + s.end_time} value={s.start_time + ":" + s.end_time}>Pickup · {new Date(s.start_time * 1000).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })} – {new Date(s.end_time * 1000).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</option>)}</select></label>}
      </article>)}</div>
      <div className="toolbar-row"><button className="button secondary" disabled={busy} onClick={() => void inspect()}>Refresh shipment details</button><button className="button primary" disabled={busy || !arrange.length || arrange.some(r => !handover(r))} onClick={() => setConfirmArrange(true)}>Arrange {arrange.length} shipment(s) & get labels</button><button className="button secondary" disabled={busy || !retrieve.length} onClick={() => void perform("label")}>Retrieve {retrieve.length} label(s)</button><button className="button primary" disabled={busy || !printable.length} onClick={() => void print()}>Print {printable.length} label(s) + packing slips</button></div>
    </section></div>}
  </>;
}

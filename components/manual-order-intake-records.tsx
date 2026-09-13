"use client";

import { useCallback, useEffect, useState } from "react";

import type { ManualOrderIntake } from "@/lib/manual-order-intakes";

function manualOrderIntakeReference(id: string) {
  return `MP-${id.toUpperCase()}`;
}

export function ManualOrderIntakeRecords({ sessionToken }: { sessionToken: string }) {
  const [intakes, setIntakes] = useState<ManualOrderIntake[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [draggingReceiptFor, setDraggingReceiptFor] = useState("");

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const response = await fetch("/api/manual-order-intakes", { method: body ? "POST" : "GET", cache: "no-store", headers: { "Content-Type": "application/json", "x-dashboard-session": sessionToken }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json() as { ok?: boolean; intakes?: ManualOrderIntake[]; intake?: ManualOrderIntake; order?: { shopifyOrderName?: string }; error?: string };
    if (!response.ok || !data.ok) throw new Error(data.error || "The Manual Order Collection could not be updated.");
    return data;
  }, [sessionToken]);

  const load = useCallback(async () => { try { const data = await request(); setIntakes(data.intakes || []); } catch (error) { setNotice(error instanceof Error ? error.message : "Could not load collection submissions."); } }, [request]);
  useEffect(() => { void load(); }, [load]);

  async function uploadAndCreate(intake: ManualOrderIntake, files: File[]) {
    if (!files.length) return setNotice("Drag in the payment receipt first.");
    setBusy(intake.id);
    try {
      const receipts: { fileName: string; url: string }[] = [];
      for (const file of files) {
        const form = new FormData(); form.append("file", file);
        const response = await fetch("/api/media-assets", { method: "POST", body: form });
        const data = await response.json() as { ok?: boolean; asset?: { originalUrl?: string }; error?: string };
        if (!response.ok || !data.ok || !data.asset?.originalUrl) throw new Error(data.error || `Could not upload ${file.name}.`);
        receipts.push({ fileName: file.name, url: data.asset.originalUrl });
      }
      await request({ action: "attach_receipt", id: intake.id, paymentReceipts: receipts });
      const created = await request({ action: "create_shopify_order", id: intake.id });
      setNotice(`${intake.customerName}'s Shopify order ${created.order?.shopifyOrderName || "was created"}.`);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The Shopify order could not be created."); }
    finally { setBusy(""); }
  }

  async function approveCodAndCreate(intake: ManualOrderIntake) {
    setBusy(intake.id);
    try {
      await request({ action: "approve_cod", id: intake.id });
      const created = await request({ action: "create_shopify_order", id: intake.id });
      setNotice(`${intake.customerName}'s COD Shopify order ${created.order?.shopifyOrderName || "was created"}.`);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The COD Shopify order could not be created."); }
    finally { setBusy(""); }
  }

  async function finishCreatingOrder(intake: ManualOrderIntake) {
    setBusy(intake.id);
    try {
      const created = await request({ action: "create_shopify_order", id: intake.id });
      setIntakes((current) => current.map((item) => item.id === intake.id ? { ...item, status: "created", shopifyOrderName: created.order?.shopifyOrderName || item.shopifyOrderName } : item));
      setNotice(`${intake.customerName}'s Shopify order ${created.order?.shopifyOrderName || "was created"}.`);
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The Shopify order could not be created."); }
    finally { setBusy(""); }
  }

  async function repairShipping(intake: ManualOrderIntake) {
    setBusy(intake.id);
    try {
      const repaired = await request({ action: "repair_shipping", id: intake.id });
      setNotice(`${intake.customerName}'s shipping address was saved to Shopify order ${repaired.order?.shopifyOrderName || ""}.`.trim());
      await load();
    } catch (error) { setNotice(error instanceof Error ? error.message : "The Shopify shipping address could not be saved."); }
    finally { setBusy(""); }
  }

  async function deleteManualOrder(intake: ManualOrderIntake) {
    if (!window.confirm(`Delete ${manualOrderIntakeReference(intake.id)} from Manual Orders? This will not delete its Shopify order.`)) return;
    setBusy(intake.id);
    try {
      await request({ action: "delete", id: intake.id });
      setIntakes((current) => current.filter((item) => item.id !== intake.id));
      setNotice(`${manualOrderIntakeReference(intake.id)} was removed from Manual Orders. Shopify was not changed.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The Manual Order could not be deleted."); }
    finally { setBusy(""); }
  }

  function submissionRows(rows: ManualOrderIntake[], emptyText: string) {
    if (!rows.length) return <tr><td colSpan={7}>{emptyText}</td></tr>;
    return rows.map((intake) => <tr key={intake.id}><td><strong>{manualOrderIntakeReference(intake.id)}</strong></td><td>{new Date(intake.createdAt).toLocaleString()}</td><td><strong>{intake.customerName}</strong><small>{intake.phoneOriginal}{intake.customerEmail ? ` · ${intake.customerEmail}` : ""}</small></td><td>{intake.character} · {intake.productDisplayName.match(/(\d+) seconds/i)?.[1] || ""}s</td><td>{intake.shippingAddress.address1}, {intake.shippingAddress.city}, {intake.shippingAddress.province} {intake.shippingAddress.zip}</td><td><span className={`manual-order-status ${intake.status === "created" ? "used" : "active"}`}>{intake.status === "created" ? (intake.isCod ? "COD" : "Paid") : intake.status === "ready_to_create" ? (intake.isCod ? "COD approved" : "Receipt attached") : "Awaiting payment"}</span></td><td><div className="manual-order-approval-actions">{intake.status === "created" ? <><strong>{intake.shopifyOrderName || "Created"}</strong><button className="manual-order-receipt-drop" type="button" disabled={busy === intake.id} onClick={() => void repairShipping(intake)}>{busy === intake.id ? "SAVING SHIPPING..." : "CHECK / FIX SHIPPING"}</button></> : <>{intake.status === "awaiting_payment" && <button className="manual-order-cod-button" type="button" disabled={busy === intake.id} onClick={() => void approveCodAndCreate(intake)}>{busy === intake.id ? "CREATING ORDER..." : "APPROVE COD"}</button>}{intake.status === "ready_to_create" ? <button className="manual-order-receipt-drop" type="button" disabled={busy === intake.id} onClick={() => void finishCreatingOrder(intake)}>{busy === intake.id ? "CREATING ORDER..." : "FINISH CREATING ORDER"}</button> : <label className={`manual-order-receipt-drop${draggingReceiptFor === intake.id ? " is-dragging" : ""}${busy === intake.id ? " is-busy" : ""}`} onDragOver={(event) => { event.preventDefault(); if (busy !== intake.id) setDraggingReceiptFor(intake.id); }} onDragLeave={() => setDraggingReceiptFor("")} onDrop={(event) => { event.preventDefault(); setDraggingReceiptFor(""); if (busy !== intake.id) void uploadAndCreate(intake, Array.from(event.dataTransfer.files || [])); }}><input hidden type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy === intake.id} onChange={(event) => { void uploadAndCreate(intake, Array.from(event.target.files || [])); event.target.value = ""; }} /><strong>{busy === intake.id ? "CREATING ORDER..." : "DROP RECEIPT OR OPEN FILES"}</strong></label>}</>}<button className="button danger small" type="button" disabled={busy === intake.id} onClick={() => void deleteManualOrder(intake)}>{busy === intake.id ? "REMOVING..." : "DELETE"}</button></div></td></tr>);
  }

  const awaitingApproval = intakes.filter((intake) => intake.status !== "created");
  const paidOrders = intakes.filter((intake) => intake.status === "created");
  const tableHead = <thead><tr><th>Reference</th><th>Submitted</th><th>Customer</th><th>Plushie</th><th>Address</th><th>Status</th><th>Receipt & order</th></tr></thead>;

  return <section className="card accounting-table-card manual-order-table-card">
    <div className="manual-order-table-toolbar"><div><h3>Customer collection submissions</h3><p>Approve a payment by dropping in its verified receipt. The order is then created in Shopify and moved to Paid orders.</p></div><button className="button secondary" type="button" onClick={() => void load()}>Refresh</button></div>
    {notice && <p className="inline-notice">{notice}</p>}
    <section className="manual-order-list-section"><div className="manual-order-list-heading"><h4>Awaiting approval</h4><span>{awaitingApproval.length}</span></div><div className="table-scroll"><table className="orders-table manual-orders-records-table">{tableHead}<tbody>{submissionRows(awaitingApproval, "No orders are waiting for payment approval.")}</tbody></table></div></section>
    <section className="manual-order-list-section"><div className="manual-order-list-heading"><h4>Paid orders</h4><span>{paidOrders.length}</span></div><div className="table-scroll"><table className="orders-table manual-orders-records-table">{tableHead}<tbody>{submissionRows(paidOrders, "No paid collection orders yet.")}</tbody></table></div></section>
  </section>;
}

"use client";

import { useCallback, useEffect, useState } from "react";

import type { ManualOrderIntake } from "@/lib/manual-order-intakes";

function manualOrderIntakeReference(id: string) {
  return `MP-${id.toUpperCase()}`;
}

function receiptUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function ManualOrderIntakeRecords({ sessionToken }: { sessionToken: string }) {
  const [intakes, setIntakes] = useState<ManualOrderIntake[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [draggingReceiptFor, setDraggingReceiptFor] = useState("");
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; fileName: string } | null>(null);
  const [historySort, setHistorySort] = useState<"approval_desc" | "approval_asc">("approval_desc");

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
      setNotice(`${intake.customerName}'s Shopify order ${created.order?.shopifyOrderName || "was created"}. The receipt was attached.`);
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

  function receiptLinks(intake: ManualOrderIntake) {
    if (intake.isCod) return null;
    const receipts = intake.paymentReceipts
      .map((receipt) => ({ ...receipt, url: receiptUrl(receipt.url) }))
      .filter((receipt) => Boolean(receipt.url));
    return receipts.map((receipt, index) => <button className="manual-order-receipt-view" type="button" onClick={() => setReceiptPreview({ url: receipt.url, fileName: receipt.fileName })} key={`${receipt.url}-${index}`}>{receipts.length === 1 ? "VIEW RECEIPT" : `VIEW RECEIPT ${index + 1}`}</button>);
  }

  function receiptPreviews(intake: ManualOrderIntake) {
    if (intake.isCod) return <span className="transaction-receipt-empty">Cash on delivery - no bank receipt.</span>;
    const receipts = intake.paymentReceipts
      .map((receipt) => ({ ...receipt, url: receiptUrl(receipt.url) }))
      .filter((receipt) => Boolean(receipt.url));
    if (!receipts.length) return <span className="transaction-receipt-empty">No receipt was uploaded.</span>;
    return <div className="transaction-receipt-previews">
      {receipts.map((receipt, index) => <figure className="transaction-receipt-preview" key={`${receipt.url}-${index}`}>
        <figcaption>{receipt.fileName || `Receipt ${index + 1}`}</figcaption>
        {/\.pdf(?:$|\?)/i.test(receipt.fileName || receipt.url)
          ? <iframe loading="lazy" src={`${receipt.url}#view=FitH`} title={`Payment receipt ${index + 1} for ${intake.customerName}`} />
          : <img loading="lazy" src={receipt.url} alt={`Payment receipt ${index + 1} for ${intake.customerName}`} />}
      </figure>)}
    </div>;
  }

  function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not read" : new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }).format(date);
  }

  function submissionRows(rows: ManualOrderIntake[], emptyText: string) {
    if (!rows.length) return <tr><td colSpan={7}>{emptyText}</td></tr>;
    return rows.map((intake) => <tr key={intake.id}><td><strong>{manualOrderIntakeReference(intake.id)}</strong></td><td>{new Date(intake.createdAt).toLocaleString()}</td><td><strong>{intake.customerName}</strong><small>{intake.phoneOriginal}{intake.customerEmail ? ` · ${intake.customerEmail}` : ""}</small></td><td>{intake.character} · {intake.productDisplayName.match(/(\d+) seconds/i)?.[1] || ""}s</td><td>{intake.shippingAddress.address1}, {intake.shippingAddress.city}, {intake.shippingAddress.province} {intake.shippingAddress.zip}</td><td><span className={`manual-order-status ${intake.status === "created" ? "used" : "active"}`}>{intake.status === "created" ? (intake.isCod ? "COD" : "Paid") : intake.status === "ready_to_create" ? (intake.isCod ? "COD approved" : "Receipt attached") : "Awaiting payment"}</span></td><td><div className="manual-order-approval-actions">{receiptLinks(intake)}{intake.status === "created" ? <><strong>{intake.shopifyOrderName || "Created"}</strong><button className="manual-order-receipt-drop" type="button" disabled={busy === intake.id} onClick={() => void repairShipping(intake)}>{busy === intake.id ? "SAVING SHIPPING..." : "CHECK / FIX SHIPPING"}</button></> : <>{intake.status === "awaiting_payment" && <button className="manual-order-cod-button" type="button" disabled={busy === intake.id} onClick={() => void approveCodAndCreate(intake)}>{busy === intake.id ? "CREATING ORDER..." : "APPROVE COD"}</button>}{intake.status === "ready_to_create" ? <button className="manual-order-receipt-drop" type="button" disabled={busy === intake.id} onClick={() => void finishCreatingOrder(intake)}>{busy === intake.id ? "CREATING ORDER..." : "FINISH CREATING ORDER"}</button> : <label className={`manual-order-receipt-drop${draggingReceiptFor === intake.id ? " is-dragging" : ""}${busy === intake.id ? " is-busy" : ""}`} onDragOver={(event) => { event.preventDefault(); if (busy !== intake.id) setDraggingReceiptFor(intake.id); }} onDragLeave={() => setDraggingReceiptFor("")} onDrop={(event) => { event.preventDefault(); setDraggingReceiptFor(""); if (busy !== intake.id) void uploadAndCreate(intake, Array.from(event.dataTransfer.files || [])); }}><input hidden type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy === intake.id} onChange={(event) => { void uploadAndCreate(intake, Array.from(event.target.files || [])); event.target.value = ""; }} /><strong>{busy === intake.id ? "CREATING ORDER..." : "DROP RECEIPT OR OPEN FILES"}</strong></label>}</>}<button className="button danger small" type="button" disabled={busy === intake.id} onClick={() => void deleteManualOrder(intake)}>{busy === intake.id ? "REMOVING..." : "DELETE"}</button></div></td></tr>);
  }

  function transactionRows(rows: ManualOrderIntake[]) {
    if (!rows.length) return <tr><td colSpan={6}>No paid collection orders yet.</td></tr>;
    return rows.map((intake) => <tr key={intake.id}>
      <td><strong>{manualOrderIntakeReference(intake.id)}</strong><small>{intake.shopifyOrderName || "Shopify order pending"}</small></td>
      <td>{formatDateTime(intake.paymentApprovedAt)}</td>
      <td><strong>{intake.customerName}</strong><small>{intake.phoneOriginal}</small></td>
      <td><span className={`manual-order-status ${intake.isCod ? "active" : "used"}`}>{intake.isCod ? "COD" : "Paid"}</span></td>
      <td>{receiptPreviews(intake)}</td>
      <td><div className="manual-order-approval-actions"><button className="manual-order-receipt-drop" type="button" disabled={busy === intake.id} onClick={() => void repairShipping(intake)}>{busy === intake.id ? "SAVING SHIPPING..." : "CHECK / FIX SHIPPING"}</button><button className="button danger small" type="button" disabled={busy === intake.id} onClick={() => void deleteManualOrder(intake)}>{busy === intake.id ? "REMOVING..." : "DELETE"}</button></div></td>
    </tr>);
  }

  const awaitingApproval = intakes.filter((intake) => intake.status !== "created");
  const paidOrders = intakes.filter((intake) => intake.status === "created");
  const sortedTransactions = [...paidOrders].sort((left, right) => {
    const direction = historySort.endsWith("asc") ? 1 : -1;
    const leftValue = Date.parse(left.paymentApprovedAt) || 0;
    const rightValue = Date.parse(right.paymentApprovedAt) || 0;
    return (leftValue - rightValue) * direction;
  });
  const tableHead = <thead><tr><th>Reference</th><th>Submitted</th><th>Customer</th><th>Plushie</th><th>Address</th><th>Status</th><th>Receipt & order</th></tr></thead>;

  return <section className="card accounting-table-card manual-order-table-card">
    <div className="manual-order-table-toolbar"><div><h3>Customer collection submissions</h3><p>Approve a payment by attaching its verified receipt. Receipts are stored for your own review.</p></div><div className="manual-order-search-actions"><button className="button secondary" type="button" onClick={() => void load()}>Refresh</button></div></div>
    {notice && <p className="inline-notice">{notice}</p>}
    <section className="manual-order-list-section"><div className="manual-order-list-heading"><h4>Awaiting approval</h4><span>{awaitingApproval.length}</span></div><div className="table-scroll"><table className="orders-table manual-orders-records-table">{tableHead}<tbody>{submissionRows(awaitingApproval, "No orders are waiting for payment approval.")}</tbody></table></div></section>
    <section className="manual-order-list-section"><div className="manual-order-list-heading"><div><h4>Transaction history</h4><small>Review the attached receipt alongside the approval time.</small></div><div className="manual-order-search-actions"><select aria-label="Sort transaction history" value={historySort} onChange={(event) => setHistorySort(event.target.value as typeof historySort)}><option value="approval_desc">Approved: newest</option><option value="approval_asc">Approved: oldest</option></select><span>{paidOrders.length}</span></div></div><div className="table-scroll"><table className="orders-table manual-orders-records-table"><thead><tr><th>Reference</th><th>Approved</th><th>Customer</th><th>Status</th><th>Receipt</th><th>Order actions</th></tr></thead><tbody>{transactionRows(sortedTransactions)}</tbody></table></div></section>
    {receiptPreview && <div className="document-preview-backdrop" role="dialog" aria-modal="true" aria-label="Payment receipt" onClick={() => setReceiptPreview(null)}><section className="document-preview-modal" onClick={(event) => event.stopPropagation()}><header><div><p>PAYMENT RECEIPT</p><h2>{receiptPreview.fileName || "Receipt"}</h2></div><button className="button secondary" type="button" onClick={() => setReceiptPreview(null)}>Close</button></header>{/\.pdf(?:$|\?)/i.test(receiptPreview.fileName || receiptPreview.url) ? <iframe className="document-preview-frame" src={receiptPreview.url} title={receiptPreview.fileName || "Payment receipt"} /> : <img className="document-preview-image" src={receiptPreview.url} alt={receiptPreview.fileName || "Payment receipt"} />}</section></div>}
  </section>;
}

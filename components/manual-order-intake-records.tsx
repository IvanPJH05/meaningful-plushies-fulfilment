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

  const request = useCallback(async (body?: Record<string, unknown>) => {
    const response = await fetch("/api/manual-order-intakes", { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-dashboard-session": sessionToken }, body: body ? JSON.stringify(body) : undefined });
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

  return <section className="card accounting-table-card manual-order-table-card">
    <div className="manual-order-table-toolbar"><div><h3>Customer collection submissions</h3><p>These details came from the Shopify collection page. Attach the verified receipt and the Shopify order is created with the customer, address, plush details, and voice linked.</p></div><button className="button secondary" type="button" onClick={() => void load()}>Refresh</button></div>
    {notice && <p className="inline-notice">{notice}</p>}
    <div className="table-scroll"><table className="orders-table manual-orders-records-table"><thead><tr><th>Reference</th><th>Submitted</th><th>Customer</th><th>Plushie</th><th>Address</th><th>Status</th><th>Receipt & order</th></tr></thead><tbody>
      {intakes.map((intake) => <tr key={intake.id}><td><strong>{manualOrderIntakeReference(intake.id)}</strong></td><td>{new Date(intake.createdAt).toLocaleString()}</td><td><strong>{intake.customerName}</strong><small>{intake.phoneOriginal}{intake.customerEmail ? ` · ${intake.customerEmail}` : ""}</small></td><td>{intake.character} · {intake.productDisplayName.match(/(\d+) seconds/i)?.[1] || ""}s</td><td>{intake.shippingAddress.address1}, {intake.shippingAddress.city}, {intake.shippingAddress.province} {intake.shippingAddress.zip}</td><td><span className={`manual-order-status ${intake.status === "created" ? "used" : "active"}`}>{intake.status === "created" ? "Created" : intake.status === "ready_to_create" ? "Receipt attached" : "Awaiting payment"}</span></td><td>{intake.status === "created" ? <strong>{intake.shopifyOrderName || "Created"}</strong> : <label className="button secondary small" style={{ display: "inline-flex", cursor: "pointer" }}><input hidden type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" disabled={busy === intake.id} onChange={(event) => void uploadAndCreate(intake, Array.from(event.target.files || []))} />{busy === intake.id ? "Creating..." : "Attach receipt & create Shopify order"}</label>}</td></tr>)}
      {!intakes.length && <tr><td colSpan={7}>No customer collection submissions yet.</td></tr>}
    </tbody></table></div>
  </section>;
}

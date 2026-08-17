"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = { purchaseDate: string; description: string; amount: number; reference: string };

export function MonthlyJournalShopeeImport({ onImported }: { onImported: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function importFile(file?: File) {
    if (!file || !supabase || busy) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setMessage("Please choose a Shopee PDF.");
    setBusy(true); setMessage("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await fetch("/api/monthly-journal/parse-shopee", { method: "POST", body });
      const result = await response.json() as { error?: string; rows?: Row[] };
      if (!response.ok || !result.rows?.length) throw new Error(result.error || "No Shopee purchases found.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const receiptPath = `shopee-imports/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("monthly-journal-receipts").upload(receiptPath, file, { upsert: false });
      if (uploadError) throw uploadError;
      let added = 0; let skipped = 0;
      for (const row of result.rows) {
        const sourceReference = `shopee:${row.reference}`;
        const { data: existing, error: lookupError } = await supabase.from("monthly_journal_shopee_purchases").select("id").eq("source_reference", sourceReference).maybeSingle();
        if (lookupError) throw lookupError;
        if (existing) { skipped++; continue; }
        const { error } = await supabase.from("monthly_journal_shopee_purchases").insert({ purchase_date: row.purchaseDate, description: row.description, amount: row.amount, source_reference: sourceReference, receipt_path: receiptPath });
        if (error?.code === "23505") skipped++; else if (error) throw error; else added++;
      }
      setMessage(`${added} Shopee purchase${added === 1 ? "" : "s"} ready to classify; ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped.`);
      await onImported();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this Shopee PDF."); }
    finally { setBusy(false); }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) { void importFile(event.target.files?.[0]); event.target.value = ""; }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); void importFile(event.dataTransfer.files?.[0]); }

  return <section className="mj-shopee-import"><p>Upload Shopee order receipts. Purchases are imported for review and are never posted until you classify them.</p><div className={`mj-import-drop${dragging ? " is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}><strong>{busy ? "Reading Shopee receipts…" : "Drop Shopee order receipt PDF here"}</strong><span>or click to choose a PDF file</span><input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={choose} /></div>{message && <p className="notice">{message}</p>}</section>;
}

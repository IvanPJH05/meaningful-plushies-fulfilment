"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Row = { purchaseDate: string; description: string; amount: number; reference: string };

export function MonthlyJournalShopeeImport({ onImported }: { onImported: () => Promise<void> }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function importFiles(files: File[]) {
    if (!files.length || !supabase || busy) return;
    setBusy(true); setMessage("");
    try {
      let added = 0; let attached = 0;
      for (const file of files) {
        if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) continue;
        const body = new FormData(); body.append("file", file);
        const response = await fetch("/api/monthly-journal/parse-shopee", { method: "POST", body });
        const result = await response.json() as { error?: string; rows?: Row[] };
        if (!response.ok || !result.rows?.length) throw new Error(`${file.name}: ${result.error || "No Shopee purchases found."}`);
        for (const row of result.rows) {
          const sourceReference = `shopee:${row.reference}`;
          const receiptPath = `shopee-imports/${row.reference}.pdf`;
          const { error: uploadError } = await supabase.storage.from("monthly-journal-receipts").upload(receiptPath, file, { upsert: true });
          if (uploadError) throw uploadError;
          const { data: existing, error: lookupError } = await supabase.from("monthly_journal_shopee_purchases").select("id").eq("source_reference", sourceReference).maybeSingle();
          if (lookupError) throw lookupError;
          if (existing) {
            const { error } = await supabase.from("monthly_journal_shopee_purchases").update({ receipt_path: receiptPath }).eq("id", existing.id);
            if (error) throw error;
            attached++;
          } else {
            const { error } = await supabase.from("monthly_journal_shopee_purchases").insert({ purchase_date: row.purchaseDate, description: row.description, amount: row.amount, source_reference: sourceReference, receipt_path: receiptPath });
            if (error) throw error;
            added++;
          }
        }
      }
      setMessage(`${added} Shopee purchase${added === 1 ? "" : "s"} ready to classify; ${attached} existing purchase${attached === 1 ? "" : "s"} updated with its receipt.`);
      await onImported();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not import this Shopee PDF."); }
    finally { setBusy(false); }
  }

  function choose(event: ChangeEvent<HTMLInputElement>) { void importFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }
  function drop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); void importFiles(Array.from(event.dataTransfer.files)); }

  return <section className="mj-shopee-import"><p>Upload one or many Shopee order receipts. Each receipt is attached automatically; purchases are never posted until you classify them.</p><div className={`mj-import-drop${dragging ? " is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => inputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={drop}><strong>{busy ? "Reading Shopee receipts…" : "Drop Shopee order receipt PDFs here"}</strong><span>or click to choose PDF files</span><input ref={inputRef} type="file" multiple accept="application/pdf,.pdf" onChange={choose} /></div>{message && <p className="notice">{message}</p>}</section>;
}

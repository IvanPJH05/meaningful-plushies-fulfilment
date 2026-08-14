"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

const fingerprint = (row: { bank: string; paidDate: string; description: string; moneyIn: number; moneyOut: number }) =>
  `${row.bank}|${row.paidDate}|${row.description.toLowerCase().replace(/\s+/g, " ")}|${row.moneyIn}|${row.moneyOut}`;

export function MonthlyJournalImport() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file?: File) {
    if (!file || !supabase) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Please drop a PDF bank statement.");
      return;
    }
    setBusy(true);
    setMessage("");
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/monthly-journal/parse-statement", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Could not read this statement.");
      setBusy(false);
      return;
    }
    let added = 0;
    let skipped = 0;
    for (const row of result.rows) {
      const { error } = await supabase.from("monthly_journal_bank_rows").insert({
        fingerprint: fingerprint({ bank: result.bank, paidDate: row.paidDate, description: row.description, moneyIn: row.moneyIn, moneyOut: row.moneyOut }),
        bank: result.bank,
        paid_date: row.paidDate,
        accounting_date: row.paidDate,
        description: row.description,
        money_in: row.moneyIn,
        money_out: row.moneyOut,
        balance: row.balance,
      });
      if (error?.code === "23505") skipped++;
      else if (!error) added++;
    }
    setMessage(`${added} transactions imported; ${skipped} duplicate transactions skipped.`);
    setBusy(false);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    void uploadFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFile(event.dataTransfer.files?.[0]);
  }

  return <section>
    <p>Upload a Maybank or Public Bank statement. New transactions appear in Bank Statement Inbox for review before they are posted.</p>
    <div
      className={`mj-import-drop${dragging ? " is-dragging" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={dropFile}
    >
      <strong>{busy ? "Reading your statement…" : "Drop your PDF bank statement here"}</strong>
      <span>or click to choose a PDF file</span>
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" onChange={chooseFile} />
    </div>
    {message && <p className="notice">{message}</p>}
  </section>;
}

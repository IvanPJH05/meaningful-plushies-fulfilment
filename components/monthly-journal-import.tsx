"use client";
import { NotificationMessage } from "./notification-bar";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { MonthlyJournalStatements } from "./monthly-journal-statements";

const fingerprint = (row: { bank: string; paidDate: string; description: string; moneyIn: number; moneyOut: number; balance: number | null }, occurrence = 1) => {
  const base = `${row.bank}|${row.paidDate}|${row.description.toLowerCase().replace(/\s+/g, " ")}|${row.moneyIn}|${row.moneyOut}|${row.balance ?? ""}`;
  // A statement can legitimately contain the exact same row more than once.
  // Keep each occurrence, while still making re-importing that statement safe.
  return occurrence === 1 ? base : `${base}|${occurrence}`;
};

export function MonthlyJournalImport() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file?: File) {
    if (!file || !supabase || busy) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("Please drop a PDF bank statement.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/monthly-journal/parse-statement", { method: "POST", body: form });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Could not read this statement.");
      setBusy(false);
      return;
    }
    const { data: existingRows, error: existingError } = await supabase.from("monthly_journal_bank_rows").select("id,bank,paid_date,description,money_in,money_out,balance").eq("bank", result.bank);
    if (existingError) {
      setMessage(existingError.message);
      setBusy(false);
      return;
    }
    const storagePath = `bank-statements/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await supabase.storage.from("monthly-journal-receipts").upload(storagePath, file, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`Original PDF could not be saved: ${uploadError.message}`);
    const dates = result.rows.map((row: { paidDate: string }) => row.paidDate).sort();
    const { error: statementError } = await supabase.from("monthly_journal_statements").insert({ bank: result.bank, filename: file.name, storage_path: storagePath, first_transaction_date: dates[0], last_transaction_date: dates[dates.length - 1], transaction_count: result.rows.length });
    if (statementError) {
      await supabase.storage.from("monthly-journal-receipts").remove([storagePath]);
      throw new Error(`Statement history could not be saved: ${statementError.message}`);
    }
    window.dispatchEvent(new Event("monthly-journal-statement-uploaded"));
    let added = 0;
    let upgraded = 0;
    let skipped = 0;
    let failed = 0;
    const usedExisting = new Set<string>();
    const seenFingerprints = new Map<string, number>();
    for (const row of result.rows) {
      const fingerprintRow = { bank: result.bank, paidDate: row.paidDate, description: row.description, moneyIn: row.moneyIn, moneyOut: row.moneyOut, balance: row.balance };
      const baseFingerprint = fingerprint(fingerprintRow);
      const occurrence = (seenFingerprints.get(baseFingerprint) ?? 0) + 1;
      seenFingerprints.set(baseFingerprint, occurrence);
      const fullFingerprint = fingerprint(fingerprintRow, occurrence);
      const compactDescription = (row.compactDescription || row.description).trim().toLowerCase();
      const matchingRows = (existingRows ?? []).filter((saved) => !usedExisting.has(saved.id) && saved.paid_date === row.paidDate && Number(saved.money_in) === row.moneyIn && Number(saved.money_out) === row.moneyOut && saved.description.trim().toLowerCase() === compactDescription);
      const savedWithSameBalance = matchingRows.find((saved) => Number(saved.balance) === Number(row.balance));
      const existing = savedWithSameBalance ?? (matchingRows.length === 1 && row.description.trim().length > matchingRows[0].description.trim().length ? matchingRows[0] : undefined);
      if (existing) {
        const needsUpgrade = row.description.trim().length > existing.description.trim().length;
        const { error } = needsUpgrade ? await supabase.from("monthly_journal_bank_rows").update({ fingerprint: fullFingerprint, description: row.description, balance: row.balance, updated_at: new Date().toISOString() }).eq("id", existing.id) : { error: null };
        if (!error) { usedExisting.add(existing.id); if (needsUpgrade) upgraded++; else skipped++; continue; }
      }
      const { error } = await supabase.from("monthly_journal_bank_rows").insert({
        fingerprint: fullFingerprint,
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
      else failed++;
    }
    setMessage(`Original PDF saved. ${added} transactions imported; ${upgraded} short descriptions upgraded; ${skipped} duplicate transactions skipped.${failed ? ` ${failed} transactions could not be imported. Upload this PDF again to retry.` : ""}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not import this statement. Please try again.");
    } finally { setBusy(false); }
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
    <MonthlyJournalStatements />
    <p>Upload a Maybank, Public Bank, or Touch 'n Go eWallet statement. New transactions appear in Bank Statement Inbox for review before they are posted.</p>
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
    {message && <NotificationMessage><p className="notice">{message}</p></NotificationMessage>}
  </section>;
}

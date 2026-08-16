"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Account = { id: string; name: string; classification: string };
type Entry = { id: string; paid_date: string; accounting_date: string; bank: string; journal_note: string; description: string; amount: number; debit_account_id: string | null; credit_account_id: string | null; receipt_path: string | null };

const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;

export function MonthlyJournalSourceDocuments() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState<Entry | null>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState({ document: "missing", side: "", month: "", bank: "", account: "", excludeName: "", search: "" });
  const fileInput = useRef<HTMLInputElement>(null);

  async function load() {
    if (!supabase) return;
    const entries: Entry[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const response = await supabase.from("monthly_journal_entries").select("id,paid_date,accounting_date,bank,journal_note,description,amount,debit_account_id,credit_account_id,receipt_path").order("accounting_date", { ascending: false }).order("created_at", { ascending: false }).range(from, from + pageSize - 1);
      if (response.error) { setMessage(response.error.message); break; }
      entries.push(...(response.data ?? []) as Entry[]);
      if (!response.data || response.data.length < pageSize) break;
    }
    const accountRows = await supabase.from("monthly_journal_accounts").select("id,name,classification").eq("active", true).order("name");
    if (accountRows.error) setMessage(accountRows.error.message);
    setEntries(entries.map((entry) => ({ ...entry, amount: Number(entry.amount) })));
    setAccounts((accountRows.data ?? []) as Account[]);
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => { setSourceFile(null); }, [active?.id]);

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account.name])), [accounts]);
  const months = useMemo(() => [...new Set(entries.map((entry) => entry.accounting_date.slice(0, 7)))].sort().reverse(), [entries]);
  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const searchText = `${entry.description} ${entry.journal_note}`.toLowerCase();
    const matchesDocument = filter.document === "all" || (filter.document === "missing" ? !entry.receipt_path : Boolean(entry.receipt_path));
    const matchesSide = !filter.side || (filter.side === "debit" ? entry.debit_account_id === filter.account || !filter.account : entry.credit_account_id === filter.account || !filter.account);
    return matchesDocument && matchesSide && (!filter.month || entry.accounting_date.startsWith(filter.month)) && (!filter.bank || entry.bank === filter.bank) && (!filter.account || entry.debit_account_id === filter.account || entry.credit_account_id === filter.account) && (!filter.excludeName || !searchText.includes(filter.excludeName.toLowerCase())) && (!filter.search || searchText.includes(filter.search.toLowerCase()));
  }), [entries, filter]);

  function chooseFile(file?: File) { if (file) setSourceFile(file); }
  function dropFile(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files?.[0]); }

  async function attach() {
    if (!supabase || !active || !sourceFile || saving) return;
    setSaving(true);
    try {
      const safeName = sourceFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${active.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("monthly-journal-receipts").upload(path, sourceFile, { upsert: false });
      if (uploadError) throw uploadError;
      const { error: entryError } = await supabase.from("monthly_journal_entries").update({ receipt_path: path, updated_at: new Date().toISOString() }).eq("id", active.id);
      if (entryError) throw entryError;
      const { error: rowError } = await supabase.from("monthly_journal_bank_rows").update({ receipt_path: path, updated_at: new Date().toISOString() }).eq("journal_entry_id", active.id);
      if (rowError) throw rowError;
      setMessage("Source document attached. This transaction is now hidden from Needs source document.");
      setActive(null); setSourceFile(null); await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not attach the source document.");
    } finally { setSaving(false); }
  }

  return <section className="monthly-source-documents">
    {message && <p className="notice">{message}</p>}
    <section className="source-document-intro"><div><p>UPLOAD DOCUMENTS</p><h2>Add Source Document</h2><span>Attach a receipt, invoice, or payment proof to completed transactions. Attached transactions stay in Accounts and General Journal, but are hidden here by default.</span></div><strong>{visibleEntries.length} shown</strong></section>
    <div className="mj-filters"><label>Document visibility<select value={filter.document} onChange={(event) => setFilter({ ...filter, document: event.target.value })}><option value="missing">Needs source document</option><option value="attached">Attached documents</option><option value="all">All transactions</option></select></label><label>Transaction side<select value={filter.side} onChange={(event) => setFilter({ ...filter, side: event.target.value })}><option value="">All sides</option><option value="debit">Debit</option><option value="credit">Credit</option></select></label><label>Accounting month<select value={filter.month} onChange={(event) => setFilter({ ...filter, month: event.target.value })}><option value="">All months</option>{months.map((month) => <option key={month} value={month}>{month}</option>)}</select></label><label>Bank account<select value={filter.bank} onChange={(event) => setFilter({ ...filter, bank: event.target.value })}><option value="">All accounts</option>{[...new Set(entries.map((entry) => entry.bank).filter(Boolean))].sort().map((bank) => <option key={bank}>{bank}</option>)}</select></label><label>Journal account<select value={filter.account} onChange={(event) => setFilter({ ...filter, account: event.target.value })}><option value="">All accounts</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Exclude name<input placeholder="Hide matching name" value={filter.excludeName} onChange={(event) => setFilter({ ...filter, excludeName: event.target.value })} /></label><label>Search name<input placeholder="Merchant or description" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} /></label></div>
    <div className="source-document-grid"><div className="source-document-table"><table><thead><tr><th>Accounting date</th><th>Paid date</th><th>Debit</th><th>Credit</th><th>Description</th><th>Amount</th></tr></thead><tbody>{visibleEntries.length ? visibleEntries.map((entry) => <tr key={entry.id} className={active?.id === entry.id ? "active" : ""} onClick={() => setActive(entry)}><td>{entry.accounting_date}</td><td>{entry.paid_date}</td><td>{accountById.get(entry.debit_account_id ?? "") ?? "Deleted account"}</td><td>{accountById.get(entry.credit_account_id ?? "") ?? "Deleted account"}</td><td><strong>{entry.description || entry.journal_note || "—"}</strong>{entry.bank && <small>{entry.bank}</small>}{entry.receipt_path && <small className="source-document-attached">Source document attached</small>}</td><td>{money(entry.amount)}</td></tr>) : <tr><td colSpan={6}>{filter.document === "missing" ? "Every matching transaction already has a source document." : "No matching transactions."}</td></tr>}</tbody></table></div>
      <aside className="source-document-panel">{active ? <><p>TRANSACTION</p><h2>{active.description || active.journal_note || "Journal entry"}</h2><div className="source-document-details"><span>Accounting date <b>{active.accounting_date}</b></span><span>Paid date <b>{active.paid_date}</b></span><span>Debit <b>{accountById.get(active.debit_account_id ?? "") ?? "Deleted account"}</b></span><span>Credit <b>{accountById.get(active.credit_account_id ?? "") ?? "Deleted account"}</b></span><span>Amount <b>{money(active.amount)}</b></span></div><div className={`mj-source${dragging ? " is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => fileInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInput.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={dropFile}><strong>{sourceFile ? sourceFile.name : "Drop source document here"}</strong><span>{sourceFile ? "Click to replace it" : "or click to select a receipt, invoice, PDF, or image"}</span><input ref={fileInput} type="file" accept="application/pdf,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></div>{active.receipt_path && <p className="source-document-current">A source document is already attached. Uploading a new file will replace the linked document.</p>}<button className="button primary" type="button" disabled={!sourceFile || saving} onClick={() => void attach()}>{saving ? "Attaching…" : "Attach source document"}</button></> : <p>Choose a transaction to attach its source document.</p>}</aside></div>
  </section>;
}

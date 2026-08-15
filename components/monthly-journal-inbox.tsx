"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Account = { id: string; name: string; classification: string };
type Row = { id: string; bank: string; paid_date: string; accounting_date: string; description: string; money_in: number; money_out: number; status: string; note: string; receipt_path: string | null };
type Shortcut = { id: string; name: string; transaction_direction: "money_in" | "money_out"; target_account_id: string | null; accounting_date_rule: "same_day" | "previous_month_end"; journal_note_template: string; description_template: string };
const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
const monthEnd = (date: string) => { const day = new Date(`${date}T00:00:00`); return new Date(day.getFullYear(), day.getMonth(), 0).toISOString().slice(0, 10); };

export function MonthlyJournalInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customShortcuts, setCustomShortcuts] = useState<Shortcut[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Row | null>(null);
  const [filter, setFilter] = useState({ month: "", status: "unposted", bank: "", search: "" });
  const [form, setForm] = useState({ account: "", classification: "income", note: "", description: "" });
  const [notice, setNotice] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [draggingSource, setDraggingSource] = useState(false);
  const sourceInput = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!supabase) return;
    const [bankRows, accountRows, shortcutRows] = await Promise.all([
      supabase.from("monthly_journal_bank_rows").select("id,bank,paid_date,accounting_date,description,money_in,money_out,status,note,receipt_path").order("paid_date", { ascending: false }),
      supabase.from("monthly_journal_accounts").select("id,name,classification").eq("active", true).order("name"),
      supabase.from("monthly_journal_shortcuts").select("id,name,transaction_direction,target_account_id,accounting_date_rule,journal_note_template,description_template").eq("active", true).order("created_at"),
    ]);
    setRows((bankRows.data ?? []).map((row) => ({ ...row, money_in: Number(row.money_in), money_out: Number(row.money_out) })) as Row[]);
    setAccounts((accountRows.data ?? []) as Account[]);
    setCustomShortcuts((shortcutRows.data ?? []) as Shortcut[]);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!active) return;
    const classification = active.money_in > 0 ? "income" : "operating expense";
    const account = accounts.find((item) => item.classification === classification);
    setForm({ account: account?.id ?? "", classification, note: active.note ?? "", description: active.description });
    setSourceFile(null);
  }, [active?.id, accounts.length]);

  const shown = useMemo(() => rows.filter((row) =>
    (!filter.month || row.paid_date.startsWith(filter.month)) &&
    (!filter.status || row.status === filter.status) &&
    (!filter.bank || row.bank === filter.bank) &&
    (!filter.search || row.description.toLowerCase().includes(filter.search.toLowerCase()))), [rows, filter]);
  const choices = accounts.filter((account) => account.classification === form.classification.replaceAll(" ", "_"));
  const bankAccount = (bank: string) => accounts.find((account) => account.name === `Bank - ${bank}`)?.id ?? "";

  function setDocument(file?: File) {
    if (!file) return;
    setSourceFile(file);
  }
  function sourceDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggingSource(false);
    setDocument(event.dataTransfer.files?.[0]);
  }

  async function uploadSource(row: Row) {
    if (!sourceFile || !supabase) return row.receipt_path;
    const safeName = sourceFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${row.id}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("monthly-journal-receipts").upload(path, sourceFile, { upsert: false });
    if (error) throw error;
    return path;
  }

  async function post(row = active, details = form) {
    if (!row || !supabase || !details.account) return setNotice("Choose a classification and account.");
    const amount = row.money_in || row.money_out;
    const bankId = bankAccount(row.bank);
    const debit = row.money_in ? bankId : details.account;
    const credit = row.money_in ? details.account : bankId;
    if (!debit || !credit) return setNotice(`Create Bank - ${row.bank} in Chart of Accounts first.`);
    let receiptPath: string | null = row.receipt_path;
    try { receiptPath = await uploadSource(row); } catch { return setNotice("Could not upload the source document."); }
    const { data, error } = await supabase.from("monthly_journal_entries").insert({
      paid_date: row.paid_date, accounting_date: row.accounting_date, bank: row.bank, bank_reference: "", journal_note: details.note,
      description: details.description, debit_account_id: debit, credit_account_id: credit, amount, source: "bank_statement", status: "posted",
      bank_row_id: row.id, receipt_path: receiptPath, entry_lines: [{ account_id: debit, debit: amount, credit: 0 }, { account_id: credit, debit: 0, credit: amount }],
    }).select("id").single();
    if (error) return setNotice(error.message);
    await supabase.from("monthly_journal_bank_rows").update({ status: "posted", journal_entry_id: data.id, note: details.note, accounting_date: row.accounting_date, receipt_path: receiptPath, updated_at: new Date().toISOString() }).eq("id", row.id);
    setNotice("Posted to General Journal.");
    setSelected([]); setActive(null); setSourceFile(null); await load();
  }

  async function applyCustomShortcut(shortcut: Shortcut) {
    const selectedRows = rows.filter((row) => selected.includes(row.id) && row.status === "unposted" && (shortcut.transaction_direction === "money_in" ? row.money_in > 0 : row.money_out > 0));
    const account = accounts.find((item) => item.id === shortcut.target_account_id);
    if (!selectedRows.length) return setNotice(`Select ${shortcut.transaction_direction === "money_in" ? "money-in" : "money-out"} rows for this shortcut.`);
    if (!account) return setNotice("This shortcut's account no longer exists.");
    for (const row of selectedRows) {
      const accountingDate = shortcut.accounting_date_rule === "previous_month_end" ? monthEnd(row.paid_date) : row.paid_date;
      const replace = (template: string) => template.replaceAll("{month}", accountingDate.slice(0, 7)).replaceAll("{paid_date}", row.paid_date);
      await post({ ...row, accounting_date: accountingDate }, { account: account.id, classification: account.classification, note: replace(shortcut.journal_note_template), description: replace(shortcut.description_template) || row.description });
    }
    setNotice(`${selectedRows.length} row(s) posted with ${shortcut.name}.`);
  }

  return <div className="monthly-inbox">
    {notice && <p className="notice">{notice}</p>}
    <div className="mj-filters"><select value={filter.month} onChange={(event) => setFilter({ ...filter, month: event.target.value })}><option value="">All months</option>{[...new Set(rows.map((row) => row.paid_date.slice(0, 7)))].map((month) => <option key={month}>{month}</option>)}</select><select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All</option><option value="unposted">Unposted</option><option value="posted">Posted</option></select><select value={filter.bank} onChange={(event) => setFilter({ ...filter, bank: event.target.value })}><option value="">Both banks</option><option>Maybank</option><option>Public Bank</option></select><input placeholder="Merchant or reference" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} /></div>
    <div className="mj-shortcuts"><b>{selected.length} selected unposted row(s)</b>{customShortcuts.map((shortcut) => <button key={shortcut.id} onClick={() => void applyCustomShortcut(shortcut)}>{shortcut.name}</button>)}<button onClick={() => setSelected([])}>Clear selection</button></div>
    <div className="mj-grid"><div className="mj-table"><table><thead><tr><th><input type="checkbox" onChange={(event) => setSelected(event.target.checked ? shown.filter((row) => row.status === "unposted").map((row) => row.id) : [])} /></th><th>Paid date</th><th>Bank row</th><th>Money in</th><th>Money out</th><th>Status</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id} className={active?.id === row.id ? "active" : ""} onClick={() => setActive(row)}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" disabled={row.status === "posted"} checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td><td>{row.paid_date}</td><td><strong>{row.description}</strong><small>{row.bank}</small></td><td>{row.money_in ? money(row.money_in) : "-"}</td><td>{row.money_out ? money(row.money_out) : "-"}</td><td>{row.status}</td></tr>)}</tbody></table></div>
      <aside className="mj-panel">{active ? <><h2>Create General Journal entry</h2><div className="mj-read"><b>{active.description}</b><br />{active.bank} · {money(active.money_in || active.money_out)}</div><div className="mj-form-grid"><label>Paid date<input type="date" value={active.paid_date} onChange={(event) => setActive({ ...active, paid_date: event.target.value })} /></label><label>Accounting date<input type="date" value={active.accounting_date} onChange={(event) => setActive({ ...active, accounting_date: event.target.value })} /></label><label>Classification<select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value, account: "" })}>{["asset", "liability", "equity", "income", "cost_of_sales", "operating_expense"].map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Debit / credit account<select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })}><option value="">Choose account</option>{choices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="mj-wide">Journal note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><label className="mj-wide">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className={`mj-source mj-wide${draggingSource ? " is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => sourceInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") sourceInput.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDraggingSource(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingSource(false)} onDrop={sourceDrop}><strong>{sourceFile ? sourceFile.name : "Drop source document here"}</strong><span>{sourceFile ? "Click to replace it" : "or click to select a receipt, PDF, or image"}</span><input ref={sourceInput} type="file" accept="application/pdf,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { setDocument(event.target.files?.[0]); event.target.value = ""; }} /></div></div><div className="mj-preview">Debit {active.money_in ? `Bank - ${active.bank}` : accounts.find((account) => account.id === form.account)?.name} <b>{money(active.money_in || active.money_out)}</b><br />Credit {active.money_in ? accounts.find((account) => account.id === form.account)?.name : `Bank - ${active.bank}`} <b>{money(active.money_in || active.money_out)}</b></div><button className="button primary" onClick={() => void post()}>Post to General Journal</button></> : <p>Choose a bank row to begin.</p>}</aside></div>
  </div>;
}

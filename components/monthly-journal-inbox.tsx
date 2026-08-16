"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Account = { id: string; name: string; classification: string };
type Row = { id: string; bank: string; paid_date: string; accounting_date: string; description: string; money_in: number; money_out: number; status: string; note: string; receipt_path: string | null };
type Shortcut = { id: string; name: string; transaction_direction: "money_in" | "money_out"; bank_filter: "any" | "Maybank" | "Public Bank" | "Touch 'n Go eWallet"; accounting_date_rule: "same_day" | "previous_month_end"; journal_note_template: string; description_template: string; debit_source: "statement_bank" | "account"; debit_account_id: string | null; credit_source: "statement_bank" | "account"; credit_account_id: string | null };
type PostingDetails = { account: string; classification: string; note: string; description: string; debitAccountId?: string; creditAccountId?: string };
const money = (value: number) => `RM ${value.toLocaleString("en-MY", { minimumFractionDigits: 2 })}`;
const monthEnd = (date: string) => { const day = new Date(`${date}T00:00:00`); return new Date(day.getFullYear(), day.getMonth(), 0).toISOString().slice(0, 10); };

export function MonthlyJournalInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [customShortcuts, setCustomShortcuts] = useState<Shortcut[]>([]);
  const [selectedShortcutId, setSelectedShortcutId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Row | null>(null);
  const [filter, setFilter] = useState({ side: "", month: "", status: "unposted", bank: "", excludeName: "", search: "" });
  const [form, setForm] = useState({ account: "", classification: "income", note: "", description: "" });
  const [notice, setNotice] = useState("");
  const [postingShortcut, setPostingShortcut] = useState(false);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [draggingSource, setDraggingSource] = useState(false);
  const sourceInput = useRef<HTMLInputElement>(null);

  const loadAllBankRows = async () => {
    if (!supabase) return { data: [], error: null };
    const data: Row[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const response = await supabase
        .from("monthly_journal_bank_rows")
        .select("id,bank,paid_date,accounting_date,description,money_in,money_out,status,note,receipt_path")
        .order("paid_date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (response.error || !response.data?.length) return { data, error: response.error };
      data.push(...response.data as Row[]);
      if (response.data.length < pageSize) return { data, error: null };
    }
  };

  const load = async () => {
    if (!supabase) return;
    const [bankRows, accountRows, shortcutRows] = await Promise.all([
      loadAllBankRows(),
      supabase.from("monthly_journal_accounts").select("id,name,classification").eq("active", true).order("name"),
      supabase.from("monthly_journal_shortcuts").select("id,name,transaction_direction,bank_filter,accounting_date_rule,journal_note_template,description_template,debit_source,debit_account_id,credit_source,credit_account_id").eq("active", true).order("created_at"),
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
    (!filter.side || (filter.side === "debit" ? row.money_in > 0 : row.money_out > 0)) &&
    (!filter.month || row.paid_date.startsWith(filter.month)) &&
    (!filter.status || row.status === filter.status) &&
    (!filter.bank || row.bank === filter.bank) &&
    (!filter.excludeName || !row.description.toLowerCase().includes(filter.excludeName.toLowerCase())) &&
    (!filter.search || row.description.toLowerCase().includes(filter.search.toLowerCase()))), [rows, filter]);
  const choices = accounts.filter((account) => account.classification === form.classification.replaceAll(" ", "_"));
  const bankAccount = (bank: string) => accounts.find((account) => account.name === `Bank - ${bank}`)?.id ?? (bank === "Touch 'n Go eWallet" ? accounts.find((account) => account.name === "Touch 'n Go eWallet")?.id ?? "" : "");
  const statementAccountName = (bank: string) => bank === "Touch 'n Go eWallet" ? bank : `Bank - ${bank}`;
  const statementBankForAccount = (accountId: string) => {
    const name = accounts.find((account) => account.id === accountId)?.name ?? "";
    if (name.startsWith("Bank - ")) return name.slice("Bank - ".length);
    return name === "Touch 'n Go eWallet" ? name : "";
  };
  const dateDistance = (left: string, right: string) => Math.abs(new Date(`${left}T00:00:00`).getTime() - new Date(`${right}T00:00:00`).getTime()) / 86_400_000;
  const findTransferCounterpart = (row: Row, debitAccountId: string, creditAccountId: string, amount: number) => {
    const sourceAccountId = bankAccount(row.bank);
    const otherAccountId = debitAccountId === sourceAccountId ? creditAccountId : creditAccountId === sourceAccountId ? debitAccountId : "";
    const otherBank = statementBankForAccount(otherAccountId);
    if (!otherBank || otherBank === row.bank) return null;
    const candidates = rows.filter((candidate) => candidate.status === "unposted" && candidate.bank === otherBank && candidate.id !== row.id && Math.abs((candidate.money_in || candidate.money_out) - amount) < 0.005 && (row.money_in > 0 ? candidate.money_out > 0 : candidate.money_in > 0) && dateDistance(candidate.paid_date, row.paid_date) <= 3).sort((left, right) => dateDistance(left.paid_date, row.paid_date) - dateDistance(right.paid_date, row.paid_date));
    const exactDate = candidates.filter((candidate) => candidate.paid_date === row.paid_date);
    return exactDate.length === 1 ? exactDate[0] : candidates.length === 1 ? candidates[0] : null;
  };

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

  async function post(row = active, details: PostingDetails = form, reloadAfter = true): Promise<string | null> {
    if (!row || !supabase || !details.account) { setNotice("Choose a classification and account."); return null; }
    const amount = row.money_in || row.money_out;
    const bankId = bankAccount(row.bank);
    const debit = details.debitAccountId ?? (row.money_in ? bankId : details.account);
    const credit = details.creditAccountId ?? (row.money_in ? details.account : bankId);
    if (!debit || !credit) { setNotice(`Create Bank - ${row.bank} in Chart of Accounts first.`); return null; }
    let receiptPath: string | null = row.receipt_path;
    try { receiptPath = await uploadSource(row); } catch { setNotice("Could not upload the source document."); return null; }
    const { data, error } = await supabase.from("monthly_journal_entries").insert({
      paid_date: row.paid_date, accounting_date: row.accounting_date, bank: row.bank, bank_reference: "", journal_note: details.note,
      description: details.description, debit_account_id: debit, credit_account_id: credit, amount, source: "bank_statement", status: "posted",
      bank_row_id: row.id, receipt_path: receiptPath, entry_lines: [{ account_id: debit, debit: amount, credit: 0 }, { account_id: credit, debit: 0, credit: amount }],
    }).select("id").single();
    if (error) { setNotice(error.message); return null; }
    await supabase.from("monthly_journal_bank_rows").update({ status: "posted", journal_entry_id: data.id, note: details.note, accounting_date: row.accounting_date, receipt_path: receiptPath, updated_at: new Date().toISOString() }).eq("id", row.id);
    const counterpart = findTransferCounterpart(row, debit, credit, amount);
    if (counterpart) await supabase.from("monthly_journal_bank_rows").update({ status: "posted", journal_entry_id: data.id, note: details.note, accounting_date: row.accounting_date, updated_at: new Date().toISOString() }).eq("id", counterpart.id);
    if (reloadAfter) {
      setNotice(counterpart ? "Posted to General Journal and matched the other bank row." : "Posted to General Journal.");
      setSelected([]); setActive(null); setSourceFile(null); await load();
    }
    return counterpart?.id ?? "";
  }

  async function applyCustomShortcut(shortcut: Shortcut) {
    if (postingShortcut) return;
    const selectedRows = rows.filter((row) => selected.includes(row.id) && row.status === "unposted" && (shortcut.transaction_direction === "money_in" ? row.money_in > 0 : row.money_out > 0) && (shortcut.bank_filter === "any" || row.bank === shortcut.bank_filter));
    if (!selectedRows.length) return setNotice(`Select ${shortcut.transaction_direction === "money_in" ? "money-in" : "money-out"} rows for this shortcut.`);
    setPostingShortcut(true);
    const handled = new Set<string>();
    let posted = 0;
    let matched = 0;
    let unmatched = 0;
    try {
      for (const row of selectedRows) {
        if (handled.has(row.id)) continue;
        const accountingDate = shortcut.accounting_date_rule === "previous_month_end" ? monthEnd(row.paid_date) : row.paid_date;
        const replace = (template: string) => template.replaceAll("{month}", accountingDate.slice(0, 7)).replaceAll("{paid_date}", row.paid_date);
        const statementBankId = bankAccount(row.bank);
        const debitAccountId = shortcut.debit_source === "statement_bank" ? statementBankId : shortcut.debit_account_id ?? "";
        const creditAccountId = shortcut.credit_source === "statement_bank" ? statementBankId : shortcut.credit_account_id ?? "";
        if (!debitAccountId || !creditAccountId || debitAccountId === creditAccountId) { setNotice("This shortcut needs two different valid accounts."); return; }

        const debitBank = statementBankForAccount(debitAccountId);
        const creditBank = statementBankForAccount(creditAccountId);
        const isInternalTransfer = Boolean(debitBank && creditBank && debitBank !== creditBank);
        if (isInternalTransfer) {
          const counterpart = findTransferCounterpart(row, debitAccountId, creditAccountId, row.money_in || row.money_out);
          if (!counterpart) { unmatched++; continue; }
          const matchedRowId = await post({ ...row, accounting_date: accountingDate }, { account: debitAccountId, classification: "", note: replace(shortcut.journal_note_template), description: replace(shortcut.description_template) || row.description, debitAccountId, creditAccountId }, false);
          if (matchedRowId === null) return;
          handled.add(row.id); handled.add(matchedRowId); matched++; posted++;
          continue;
        }

        const matchedRowId = await post({ ...row, accounting_date: accountingDate }, { account: debitAccountId, classification: "", note: replace(shortcut.journal_note_template), description: replace(shortcut.description_template) || row.description, debitAccountId, creditAccountId }, false);
        if (matchedRowId === null) return;
        handled.add(row.id);
        if (matchedRowId) { handled.add(matchedRowId); matched++; }
        posted++;
      }
      setSelected([]); setActive(null); setSourceFile(null); await load();
      setNotice(unmatched ? `${posted} reconciled transfer pair(s) posted to the ledger. ${unmatched} unmatched row(s) remain unposted for review.` : `${posted} row(s) posted with ${shortcut.name}${matched ? `; ${matched} matching bank row(s) reconciled.` : ""}`);
    } finally {
      setPostingShortcut(false);
    }
  }

  return <div className="monthly-inbox">
    {notice && <p className="notice">{notice}</p>}
    <div className="mj-filters"><label>Transaction side<select value={filter.side} onChange={(event) => setFilter({ ...filter, side: event.target.value })}><option value="">All transactions</option><option value="debit">Debit — money in</option><option value="credit">Credit — money out</option></select></label><label>Accounting month<select value={filter.month} onChange={(event) => setFilter({ ...filter, month: event.target.value })}><option value="">All months</option>{[...new Set(rows.map((row) => row.paid_date.slice(0, 7)))].map((month) => <option key={month}>{month}</option>)}</select></label><label>Posting status<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All</option><option value="unposted">Unposted</option><option value="reconciled">Reconciled</option><option value="posted">Posted</option></select></label><label>Bank account<select value={filter.bank} onChange={(event) => setFilter({ ...filter, bank: event.target.value })}><option value="">All accounts</option><option>Maybank</option><option>Public Bank</option><option>Touch 'n Go eWallet</option></select></label><label>Exclude name<input placeholder="Hide matching name" value={filter.excludeName} onChange={(event) => setFilter({ ...filter, excludeName: event.target.value })} /></label><label>Search name<input placeholder="Merchant or reference" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} /></label></div>
    <div className="mj-shortcuts"><b>{selected.length} selected unposted row(s)</b><label>Posting shortcut<select value={selectedShortcutId} disabled={postingShortcut} onChange={(event) => setSelectedShortcutId(event.target.value)}><option value="">Choose a shortcut</option>{customShortcuts.map((shortcut) => <option key={shortcut.id} value={shortcut.id}>{shortcut.name}</option>)}</select></label><button disabled={postingShortcut || !selectedShortcutId} onClick={() => { const shortcut = customShortcuts.find((item) => item.id === selectedShortcutId); if (shortcut) void applyCustomShortcut(shortcut); }}>Apply shortcut</button><button onClick={() => setSelected([])}>Clear selection</button></div>
    <div className="mj-grid"><div className="mj-table"><table><thead><tr><th><input type="checkbox" onChange={(event) => setSelected(event.target.checked ? shown.filter((row) => row.status === "unposted").map((row) => row.id) : [])} /></th><th>Paid date</th><th>Bank row</th><th>Money in</th><th>Money out</th><th>Status</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id} className={active?.id === row.id ? "active" : ""} onClick={() => setActive(row)}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" disabled={row.status !== "unposted"} checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td><td>{row.paid_date}</td><td><strong>{row.description}</strong><small>{row.bank}</small></td><td>{row.money_in ? money(row.money_in) : "-"}</td><td>{row.money_out ? money(row.money_out) : "-"}</td><td>{row.status}</td></tr>)}</tbody></table></div>
      <aside className="mj-panel">{active ? <><h2>Create General Journal entry</h2><div className="mj-read"><b>{active.description}</b><br />{active.bank} · {money(active.money_in || active.money_out)}</div><div className="mj-form-grid"><label>Paid date<input type="date" value={active.paid_date} onChange={(event) => setActive({ ...active, paid_date: event.target.value })} /></label><label>Accounting date<input type="date" value={active.accounting_date} onChange={(event) => setActive({ ...active, accounting_date: event.target.value })} /></label><label>Classification<select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value, account: "" })}>{["asset", "liability", "equity", "income", "cost_of_sales", "operating_expense"].map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Debit / credit account<select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })}><option value="">Choose account</option>{choices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="mj-wide">Journal note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><label className="mj-wide">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className={`mj-source mj-wide${draggingSource ? " is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => sourceInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") sourceInput.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDraggingSource(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingSource(false)} onDrop={sourceDrop}><strong>{sourceFile ? sourceFile.name : "Drop source document here"}</strong><span>{sourceFile ? "Click to replace it" : "or click to select a receipt, PDF, or image"}</span><input ref={sourceInput} type="file" accept="application/pdf,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { setDocument(event.target.files?.[0]); event.target.value = ""; }} /></div></div><div className="mj-preview">Debit {active.money_in ? statementAccountName(active.bank) : accounts.find((account) => account.id === form.account)?.name} <b>{money(active.money_in || active.money_out)}</b><br />Credit {active.money_in ? accounts.find((account) => account.id === form.account)?.name : statementAccountName(active.bank)} <b>{money(active.money_in || active.money_out)}</b></div><button className="button primary" onClick={() => void post()}>Post to General Journal</button></> : <p>Choose a bank row to begin.</p>}</aside></div>
  </div>;
}

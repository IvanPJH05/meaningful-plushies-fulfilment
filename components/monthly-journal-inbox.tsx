"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

type Account = { id: string; name: string; classification: string };
type Row = { id: string; bank: string; paid_date: string; accounting_date: string; description: string; money_in: number; money_out: number; status: string; note: string; receipt_path: string | null; journal_entry_id: string | null };
type Shortcut = { id: string; name: string; transaction_direction: "money_in" | "money_out"; bank_filter: "any" | "Maybank" | "Public Bank" | "Touch 'n Go eWallet"; accounting_date_rule: "same_day" | "previous_month_end"; journal_note_template: string; description_template: string; debit_source: "statement_bank" | "account"; debit_account_id: string | null; credit_source: "statement_bank" | "account"; credit_account_id: string | null };
type PostingDetails = { account: string; classification: string; note: string; description: string; debitAccountId?: string; creditAccountId?: string; shortcutId?: string };
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
  const [removingRows, setRemovingRows] = useState(false);
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
        .select("id,bank,paid_date,accounting_date,description,money_in,money_out,status,note,receipt_path,journal_entry_id")
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
    const reload = () => { void load(); };
    window.addEventListener("monthly-journal-entry-undone", reload);
    return () => window.removeEventListener("monthly-journal-entry-undone", reload);
  }, []);
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
  const postingShortcuts = customShortcuts;

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
      bank_row_id: row.id, shortcut_id: details.shortcutId ?? null, receipt_path: receiptPath, entry_lines: [{ account_id: debit, debit: amount, credit: 0 }, { account_id: credit, debit: 0, credit: amount }],
    }).select("id").single();
    if (error) { setNotice(error.message); return null; }
    await supabase.from("monthly_journal_bank_rows").update({ status: "posted", journal_entry_id: data.id, note: details.note, accounting_date: row.accounting_date, receipt_path: receiptPath, updated_at: new Date().toISOString() }).eq("id", row.id);
    if (reloadAfter) {
      setNotice("Posted to General Journal.");
      setSelected([]); setActive(null); setSourceFile(null); await load();
    }
    return "";
  }

  async function applyCustomShortcut(shortcut: Shortcut) {
    if (postingShortcut) return;
    const selectedRows = rows.filter((row) => selected.includes(row.id) && row.status === "unposted" && (shortcut.transaction_direction === "money_in" ? row.money_in > 0 : row.money_out > 0) && (shortcut.bank_filter === "any" || row.bank === shortcut.bank_filter));
    if (!selectedRows.length) return setNotice(`Select ${shortcut.transaction_direction === "money_in" ? "money-in" : "money-out"} rows for this shortcut.`);
    setPostingShortcut(true);
    const handled = new Set<string>();
    let posted = 0;
    try {
      for (const row of selectedRows) {
        if (handled.has(row.id)) continue;
        const accountingDate = shortcut.accounting_date_rule === "previous_month_end" ? monthEnd(row.paid_date) : row.paid_date;
        const replace = (template: string) => template
          .replaceAll("{month}", accountingDate.slice(0, 7))
          .replaceAll("{paid_date}", row.paid_date)
          .replaceAll("{previous_month_end}", monthEnd(row.paid_date));
        const statementBankId = bankAccount(row.bank);
        const debitAccountId = shortcut.debit_source === "statement_bank" ? statementBankId : shortcut.debit_account_id ?? "";
        const creditAccountId = shortcut.credit_source === "statement_bank" ? statementBankId : shortcut.credit_account_id ?? "";
        if (!debitAccountId || !creditAccountId || debitAccountId === creditAccountId) { setNotice("This shortcut needs two different valid accounts."); return; }

        const result = await post({ ...row, accounting_date: accountingDate }, { account: debitAccountId, classification: "", note: replace(shortcut.journal_note_template), description: replace(shortcut.description_template), debitAccountId, creditAccountId, shortcutId: shortcut.id }, false);
        if (result === null) return;
        handled.add(row.id);
        posted++;
      }
      setSelected([]); setActive(null); setSourceFile(null); await load();
      setNotice(`${posted} row(s) posted with ${shortcut.name}.`);
    } finally {
      setPostingShortcut(false);
    }
  }

  async function postContra() {
    if (!supabase || postingShortcut) return;
    const selectedRows = rows.filter((row) => selected.includes(row.id) && row.status === "unposted");
    if (selectedRows.length !== 2) return setNotice("Contra needs exactly two unposted bank rows.");
    const [first, second] = selectedRows;
    const firstAmount = first.money_in || first.money_out;
    const secondAmount = second.money_in || second.money_out;
    if (first.paid_date !== second.paid_date) return setNotice("Contra rows must have the same paid date.");
    if (Math.abs(firstAmount - secondAmount) >= 0.005) return setNotice("Contra rows must have the same amount.");
    const moneyIn = first.money_in > 0 ? first : second.money_in > 0 ? second : null;
    const moneyOut = first.money_out > 0 ? first : second.money_out > 0 ? second : null;
    if (!moneyIn || !moneyOut) return setNotice("Select one money-in row and one money-out row for Contra.");
    if (moneyIn.bank === moneyOut.bank) return setNotice("Contra must move between two different accounts.");
    const debitAccountId = bankAccount(moneyIn.bank);
    const creditAccountId = bankAccount(moneyOut.bank);
    if (!debitAccountId || !creditAccountId) return setNotice("Create both bank accounts in Chart of Accounts before posting Contra.");
    const description = `Internal transfer from ${moneyOut.bank} to ${moneyIn.bank}`;
    setPostingShortcut(true);
    try {
      const { data, error } = await supabase.from("monthly_journal_entries").insert({
        paid_date: moneyIn.paid_date,
        accounting_date: moneyIn.paid_date,
        bank: `${moneyOut.bank} → ${moneyIn.bank}`,
        bank_reference: `${moneyOut.id},${moneyIn.id}`,
        journal_note: `${description} on ${moneyIn.paid_date}`,
        description,
        debit_account_id: debitAccountId,
        credit_account_id: creditAccountId,
        amount: firstAmount,
        source: "bank_statement",
        status: "posted",
        bank_row_id: moneyIn.id,
        receipt_path: null,
        entry_lines: [{ account_id: debitAccountId, debit: firstAmount, credit: 0 }, { account_id: creditAccountId, debit: 0, credit: firstAmount }],
      }).select("id").single();
      if (error || !data) return setNotice(error?.message || "Could not post Contra.");
      const { error: updateError } = await supabase.from("monthly_journal_bank_rows").update({ status: "posted", journal_entry_id: data.id, note: `${description} on ${moneyIn.paid_date}`, accounting_date: moneyIn.paid_date, updated_at: new Date().toISOString() }).in("id", [moneyIn.id, moneyOut.id]);
      if (updateError) return setNotice(updateError.message);
      setSelected([]); setActive(null); setSourceFile(null); await load();
      setNotice("Contra posted. Both bank rows now point to the same journal entry.");
    } finally {
      setPostingShortcut(false);
    }
  }

  async function removeSelectedRows() {
    if (!supabase || removingRows) return;
    const selectedRows = rows.filter((row) => selected.includes(row.id));
    if (!selectedRows.length) return setNotice("Select the unposted bank rows you want to remove.");
    if (selectedRows.some((row) => row.status !== "unposted")) return setNotice("Only unposted bank rows can be removed. Posted rows remain as part of the accounting record.");
    setRemovingRows(true);
    try {
      const receiptPaths = selectedRows.map((row) => row.receipt_path).filter((path): path is string => Boolean(path));
      if (receiptPaths.length) {
        const { error: receiptError } = await supabase.storage.from("monthly-journal-receipts").remove(receiptPaths);
        if (receiptError) return setNotice(receiptError.message);
      }
      const { error } = await supabase.from("monthly_journal_bank_rows").delete().in("id", selectedRows.map((row) => row.id));
      if (error) return setNotice(error.message);
      setSelected([]); setActive(null); setSourceFile(null); await load();
      setNotice(`${selectedRows.length} out-of-scope bank row${selectedRows.length === 1 ? "" : "s"} removed.`);
    } finally {
      setRemovingRows(false);
    }
  }

  async function undoSelectedPostings() {
    if (!supabase || postingShortcut || removingRows) return;
    const postedRows = rows.filter((row) => selected.includes(row.id) && row.status === "posted" && row.journal_entry_id);
    const entryIds = [...new Set(postedRows.map((row) => row.journal_entry_id).filter((id): id is string => Boolean(id)))];
    if (!entryIds.length) return setNotice("Select one or more posted bank rows to undo.");
    if (!window.confirm(`Undo ${entryIds.length} posting${entryIds.length === 1 ? "" : "s"}? The linked bank rows will return to Unposted.`)) return;
    setPostingShortcut(true);
    try {
      for (const entryId of entryIds) {
        const { data: linkedRows, error: lookupError } = await supabase.from("monthly_journal_bank_rows").select("id").eq("journal_entry_id", entryId);
        if (lookupError) return setNotice(lookupError.message);
        const linkedRowIds = (linkedRows ?? []).map((row) => row.id);
        if (!linkedRowIds.length) return setNotice("Could not find the bank row linked to this posting.");
        const { error: restoreError } = await supabase.from("monthly_journal_bank_rows").update({ status: "unposted", journal_entry_id: null, note: "", updated_at: new Date().toISOString() }).in("id", linkedRowIds);
        if (restoreError) return setNotice(restoreError.message);
        const { error: deleteError } = await supabase.from("monthly_journal_entries").delete().eq("id", entryId);
        if (deleteError) {
          await supabase.from("monthly_journal_bank_rows").update({ status: "posted", journal_entry_id: entryId, updated_at: new Date().toISOString() }).in("id", linkedRowIds);
          return setNotice(deleteError.message);
        }
      }
      setSelected([]); setActive(null); setSourceFile(null); window.dispatchEvent(new Event("monthly-journal-entry-undone")); await load();
      setNotice(`${entryIds.length} posting${entryIds.length === 1 ? "" : "s"} undone. The linked bank row${entryIds.length === 1 ? " is" : "s are"} Unposted again.`);
    } finally {
      setPostingShortcut(false);
    }
  }

  return <div className="monthly-inbox">
    {notice && <p className="notice">{notice}</p>}
    {selected.some((id) => rows.find((row) => row.id === id)?.status === "posted") && <div className="mj-undo-posted"><span>Selected posted row(s) can be returned to the inbox for correction.</span><button type="button" disabled={postingShortcut || removingRows} onClick={() => void undoSelectedPostings()}>Undo selected posting</button></div>}
    <div className="mj-filters"><label>Transaction side<select value={filter.side} onChange={(event) => setFilter({ ...filter, side: event.target.value })}><option value="">All transactions</option><option value="debit">Debit — money in</option><option value="credit">Credit — money out</option></select></label><label>Accounting month<select value={filter.month} onChange={(event) => setFilter({ ...filter, month: event.target.value })}><option value="">All months</option>{[...new Set(rows.map((row) => row.paid_date.slice(0, 7)))].map((month) => <option key={month}>{month}</option>)}</select></label><label>Posting status<select value={filter.status} onChange={(event) => setFilter({ ...filter, status: event.target.value })}><option value="">All</option><option value="unposted">Unposted</option><option value="reconciled">Reconciled</option><option value="posted">Posted</option></select></label><label>Bank account<select value={filter.bank} onChange={(event) => setFilter({ ...filter, bank: event.target.value })}><option value="">All accounts</option><option>Maybank</option><option>Public Bank</option><option>Touch 'n Go eWallet</option></select></label><label>Exclude name<input placeholder="Hide matching name" value={filter.excludeName} onChange={(event) => setFilter({ ...filter, excludeName: event.target.value })} /></label><label>Search name<input placeholder="Merchant or reference" value={filter.search} onChange={(event) => setFilter({ ...filter, search: event.target.value })} /></label></div>
    <div className="mj-shortcuts"><b>{selected.length} selected unposted row(s)</b><label>Posting shortcut<select value={selectedShortcutId} disabled={postingShortcut || removingRows} onChange={(event) => setSelectedShortcutId(event.target.value)}><option value="">Choose a shortcut</option>{postingShortcuts.map((shortcut) => <option key={shortcut.id} value={shortcut.id}>{shortcut.name}</option>)}</select></label><button disabled={postingShortcut || removingRows || !selectedShortcutId} onClick={() => { const shortcut = customShortcuts.find((item) => item.id === selectedShortcutId); if (shortcut) void applyCustomShortcut(shortcut); }}>Apply shortcut</button><button disabled={postingShortcut || removingRows || selected.length !== 2} title="Select exactly one matching money-in row and one matching money-out row" onClick={() => void postContra()}>Contra selected rows</button><button className="mj-remove" disabled={postingShortcut || removingRows || !selected.length} title="Only unposted rows can be removed" onClick={() => void removeSelectedRows()}>{removingRows ? "Removing…" : "Remove selected rows"}</button><button disabled={removingRows} onClick={() => setSelected([])}>Clear selection</button></div>
    <div className="mj-grid"><div className="mj-table"><table><thead><tr><th><input type="checkbox" onChange={(event) => setSelected(event.target.checked ? shown.filter((row) => row.status === "unposted").map((row) => row.id) : [])} /></th><th>Paid date</th><th>Bank row</th><th>Money in</th><th>Money out</th><th>Status</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id} className={active?.id === row.id ? "active" : ""} onClick={() => setActive(row)}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /></td><td>{row.paid_date}</td><td><strong>{row.description}</strong><small>{row.bank}</small></td><td>{row.money_in ? money(row.money_in) : "-"}</td><td>{row.money_out ? money(row.money_out) : "-"}</td><td>{row.status}</td></tr>)}</tbody></table></div>
      <aside className="mj-panel">{active ? <><h2>Create General Journal entry</h2><div className="mj-read"><b>{active.description}</b><br />{active.bank} · {money(active.money_in || active.money_out)}</div><div className="mj-form-grid"><label>Paid date<input type="date" value={active.paid_date} onChange={(event) => setActive({ ...active, paid_date: event.target.value })} /></label><label>Accounting date<input type="date" value={active.accounting_date} onChange={(event) => setActive({ ...active, accounting_date: event.target.value })} /></label><label>Classification<select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value, account: "" })}>{["asset", "liability", "equity", "income", "cost_of_sales", "operating_expense"].map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Debit / credit account<select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })}><option value="">Choose account</option>{choices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label className="mj-wide">Journal note<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><label className="mj-wide">Description<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><div className={`mj-source mj-wide${draggingSource ? " is-dragging" : ""}`} role="button" tabIndex={0} onClick={() => sourceInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") sourceInput.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setDraggingSource(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDraggingSource(false)} onDrop={sourceDrop}><strong>{sourceFile ? sourceFile.name : "Drop source document here"}</strong><span>{sourceFile ? "Click to replace it" : "or click to select a receipt, PDF, or image"}</span><input ref={sourceInput} type="file" accept="application/pdf,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { setDocument(event.target.files?.[0]); event.target.value = ""; }} /></div></div><div className="mj-preview">Debit {active.money_in ? statementAccountName(active.bank) : accounts.find((account) => account.id === form.account)?.name} <b>{money(active.money_in || active.money_out)}</b><br />Credit {active.money_in ? accounts.find((account) => account.id === form.account)?.name : statementAccountName(active.bank)} <b>{money(active.money_in || active.money_out)}</b></div><button className="button primary" onClick={() => void post()}>Post to General Journal</button></> : <p>Choose a bank row to begin.</p>}</aside></div>
  </div>;
}

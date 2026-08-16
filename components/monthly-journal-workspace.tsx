"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { MonthlyJournalInbox } from "./monthly-journal-inbox";
import { MonthlyJournalImport } from "./monthly-journal-import";
import { MonthlyJournalShortcuts } from "./monthly-journal-shortcuts";
import { MonthlyJournalSourceDocuments } from "./monthly-journal-source-documents";
import styles from "./monthly-journal-workspace.module.css";

type JournalView = "accounts" | "account_activity" | "general_journal" | "inbox" | "import" | "shortcuts" | "source_documents" | "shopee";
type Classification = "asset" | "liability" | "equity" | "income" | "cost_of_sales" | "operating_expense";
type Account = { id: string; name: string; classification: Classification; account_code: string; active: boolean };
type Entry = { id: string; paid_date: string; accounting_date: string; bank: string; bank_reference: string; journal_note: string; description: string; amount: number; debit_account_id: string | null; credit_account_id: string | null; receipt_path: string | null; shortcut_id: string | null; created_at: string };
type ShortcutDisplay = { id: string; debit_source: "statement_bank" | "account"; credit_source: "statement_bank" | "account" };

const labels: Record<Classification, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", cost_of_sales: "Cost of Sales", operating_expense: "Operating Expenses",
};

const today = () => new Date().toISOString().slice(0, 10);

export function MonthlyJournalWorkspace({ initialView = "accounts" }: { initialView?: JournalView }) {
  const [view, setView] = useState<JournalView>(initialView);
  const [visitedViews, setVisitedViews] = useState<JournalView[]>([initialView]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutDisplay[]>([]);
  const [journalMonth, setJournalMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [classification, setClassification] = useState<Classification>("asset");
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState("");
  const [focused, setFocused] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; name: string } | null>(null);
  const [journalForm, setJournalForm] = useState({ paidDate: today(), accountingDate: today(), bank: "", note: "", description: "", debit: "", credit: "", amount: "" });

  const loadAllEntries = async () => {
    if (!supabase) return { data: [], error: null };
    const data: Entry[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const response = await supabase
        .from("monthly_journal_entries")
        .select("id,paid_date,accounting_date,bank,bank_reference,journal_note,description,amount,debit_account_id,credit_account_id,receipt_path,shortcut_id,created_at")
        .order("accounting_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (response.error || !response.data?.length) return { data, error: response.error };
      data.push(...response.data as Entry[]);
      if (response.data.length < pageSize) return { data, error: null };
    }
  };

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    const [accountsResult, entriesResult, shortcutsResult] = await Promise.all([
      supabase.from("monthly_journal_accounts").select("id,name,classification,account_code,active").eq("active", true).order("classification").order("name"),
      loadAllEntries(),
      supabase.from("monthly_journal_shortcuts").select("id,debit_source,credit_source"),
    ]);
    if (accountsResult.error || entriesResult.error || shortcutsResult.error) setMessage(accountsResult.error?.message || entriesResult.error?.message || shortcutsResult.error?.message || "Could not load Monthly Journal data.");
    else {
      setAccounts((accountsResult.data ?? []) as Account[]);
      setEntries((entriesResult.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount) })) as Entry[]);
      setShortcuts((shortcutsResult.data ?? []) as ShortcutDisplay[]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);
  useEffect(() => {
    setView(initialView);
    setVisitedViews((current) => current.includes(initialView) ? current : [...current, initialView]);
  }, [initialView]);
  useEffect(() => () => {
    document.querySelector<HTMLElement>(".side-nav")?.style.removeProperty("display");
    document.querySelector<HTMLElement>(".topbar")?.style.removeProperty("display");
    document.querySelector<HTMLElement>(".app-shell")?.style.removeProperty("grid-template-columns");
  }, []);

  function toggleFocus() {
    const next = !focused;
    setFocused(next);
    const sidebar = document.querySelector<HTMLElement>(".side-nav");
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (sidebar) sidebar.style.display = next ? "none" : "";
    if (topbar) topbar.style.display = next ? "none" : "";
    if (shell) shell.style.gridTemplateColumns = next ? "minmax(0, 1fr)" : "";
  }

  const accountById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const shortcutById = useMemo(() => new Map(shortcuts.map((shortcut) => [shortcut.id, shortcut])), [shortcuts]);
  const journalMonths = useMemo(() => [...new Set(entries.map((entry) => entry.accounting_date.slice(0, 7)))].sort().reverse(), [entries]);
  const visibleJournalEntries = useMemo(() => entries.filter((entry) => !journalMonth || entry.accounting_date.startsWith(journalMonth)), [entries, journalMonth]);
  const accountsByType = useMemo(() => Object.keys(labels).map((type) => ({ type: type as Classification, accounts: accounts.filter((account) => account.classification === type) })), [accounts]);
  const selectedLedgerAccount = accountById.get(selectedLedgerAccountId) ?? accounts[0];
  const ledgerEntries = useMemo(() => selectedLedgerAccount ? entries.filter((entry) => entry.debit_account_id === selectedLedgerAccount.id || entry.credit_account_id === selectedLedgerAccount.id) : [], [entries, selectedLedgerAccount]);
  const ledgerTotals = useMemo(() => ledgerEntries.reduce((totals, entry) => ({ debit: totals.debit + (entry.debit_account_id === selectedLedgerAccount?.id ? entry.amount : 0), credit: totals.credit + (entry.credit_account_id === selectedLedgerAccount?.id ? entry.amount : 0) }), { debit: 0, credit: 0 }), [ledgerEntries, selectedLedgerAccount]);
  const accountLine = (entry: Entry, side: "debit" | "credit") => {
    const accountId = side === "debit" ? entry.debit_account_id : entry.credit_account_id;
    const account = accountById.get(accountId ?? "")?.name ?? "Deleted account";
    const shortcut = entry.shortcut_id ? shortcutById.get(entry.shortcut_id) : undefined;
    const isDetailLine = shortcut && (side === "debit" ? shortcut.debit_source === "account" : shortcut.credit_source === "account");
    return <>{account}{isDetailLine && entry.description ? <span className={styles.accountDescription}> ({entry.description})</span> : null}</>;
  };

  async function addAccount(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !accountName.trim()) return;
    const { error } = await supabase.from("monthly_journal_accounts").insert({ name: accountName.trim(), account_code: accountCode.trim(), classification });
    if (error) return setMessage(error.code === "23505" ? "That account already exists in Monthly Journal." : error.message);
    setAccountName(""); setAccountCode(""); setMessage("Account saved to Monthly Journal.");
    await loadData();
  }

  async function removeAccount(account: Account) {
    if (!supabase) return;
    const { error } = await supabase.from("monthly_journal_accounts").update({ active: false, updated_at: new Date().toISOString() }).eq("id", account.id);
    if (error) return setMessage(error.message);
    setMessage(`${account.name} hidden from Monthly Journal.`); await loadData();
  }

  async function openReceipt(entry: Entry) {
    if (!supabase || !entry.receipt_path) return;
    const { data, error } = await supabase.storage.from("monthly-journal-receipts").createSignedUrl(entry.receipt_path, 600);
    if (error || !data?.signedUrl) return setMessage(error?.message || "Could not open this receipt.");
    setReceiptPreview({ url: data.signedUrl, name: entry.receipt_path.split("/").pop() || "Source document" });
  }

  async function postJournal(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const amount = Number(journalForm.amount);
    if (!journalForm.debit || !journalForm.credit || journalForm.debit === journalForm.credit || !Number.isFinite(amount) || amount <= 0) return setMessage("Choose two different accounts and enter an amount.");
    const { error } = await supabase.from("monthly_journal_entries").insert({
      paid_date: journalForm.paidDate, accounting_date: journalForm.accountingDate, bank: journalForm.bank.trim(), bank_reference: "", journal_note: journalForm.note.trim(), description: journalForm.description.trim(), debit_account_id: journalForm.debit, credit_account_id: journalForm.credit, amount,
    });
    if (error) return setMessage(error.message);
    setJournalForm({ paidDate: today(), accountingDate: today(), bank: "", note: "", description: "", debit: "", credit: "", amount: "" });
    setMessage("Posted to the separate Monthly Journal."); await loadData();
  }

  if (!supabaseConfigured) return <section className={styles.empty}><h1>Monthly Journal</h1><p>Connect Supabase before using this workspace.</p></section>;

  return <section className={styles.workspace}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>SEPARATE ACCOUNTING WORKSPACE</p><h1>Monthly Journal</h1><p>Your new accounting workspace. It does not change Book Keeping or Accounting.</p></div>
      <div className={styles.headerActions}><button className={styles.refresh} type="button" onClick={toggleFocus}>{focused ? "Exit focus" : "Focus full screen"}</button><button className={styles.refresh} type="button" onClick={() => void loadData()}>{loading ? "Loading…" : "Refresh"}</button></div>
    </header>
    {message && <p className={styles.message}>{message}</p>}

    {view === "accounts" && <div className={styles.twoColumn}>
      <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>START HERE</p><h2>Chart of Accounts</h2><p>Create the accounts you want to use in the new Monthly Journal only.</p></div><strong>{accounts.length} accounts</strong></div>
        {accountsByType.map(({ type, accounts: grouped }) => <div className={styles.accountGroup} key={type}><h3>{labels[type]}</h3>{grouped.length ? grouped.map((account) => <div className={styles.accountRow} key={account.id}><span>{account.account_code && <small>{account.account_code}</small>}{account.name}</span><button type="button" onClick={() => void removeAccount(account)}>Hide</button></div>) : <p className={styles.muted}>No accounts yet.</p>}</div>)}
      </section>
      <form className={styles.card} onSubmit={addAccount}><p className={styles.eyebrow}>NEW ACCOUNT</p><h2>Add an account</h2><label>Classification<select value={classification} onChange={(event) => setClassification(event.target.value as Classification)}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Account name<input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Example: Software" required /></label><label>Account code <span className={styles.optional}>(optional)</span><input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} placeholder="Example: 6100" /></label><button className={styles.primary} type="submit">Save account</button></form>
    </div>}

    {view === "general_journal" && <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>ACCOUNTING DATE DRIVES REPORTS</p><h2>General Journal</h2><p>Descriptions appear beside their account in brackets; the journal note is shown below each entry.</p></div><div className={styles.journalControls}><label>Accounting month<select value={journalMonth} onChange={(event) => setJournalMonth(event.target.value)}><option value="">All months</option>{journalMonths.map((month) => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}</option>)}</select></label><strong>{visibleJournalEntries.length} posted entries</strong></div></div><div className={styles.journalList}>{visibleJournalEntries.length ? visibleJournalEntries.map((entry) => <article className={`${styles.journalEntry}${entry.receipt_path ? ` ${styles.receiptRow}` : ""}`} key={entry.id} onClick={() => void openReceipt(entry)}><div className={styles.entryDate}><b>{entry.accounting_date}</b><span>Paid {entry.paid_date}</span>{entry.receipt_path && <small>Receipt attached</small>}</div><div><p><span>Debit {accountLine(entry, "debit")}</span><strong>RM {entry.amount.toFixed(2)}</strong></p><p className={styles.credit}><span>Credit {accountLine(entry, "credit")}</span><strong>RM {entry.amount.toFixed(2)}</strong></p>{entry.journal_note && <p className={styles.description}>{entry.journal_note}</p>}{!entry.shortcut_id && entry.description && <p className={styles.description}>{entry.description}</p>}</div></article>) : <p className={styles.muted}>No posted entries for this accounting month.</p>}</div></section>}

    {view === "account_activity" && <section className={styles.accountActivity}><aside className={styles.accountSelector}><p className={styles.eyebrow}>ACCOUNTS</p><h2>Select an account</h2><p className={styles.muted}>Choose an account to see every Monthly Journal transaction that affects it.</p><div className={styles.accountPicker}>{accounts.map((account) => <button className={selectedLedgerAccount?.id === account.id ? styles.selectedAccount : ""} type="button" key={account.id} onClick={() => setSelectedLedgerAccountId(account.id)}><span>{account.name}</span><small>{labels[account.classification]}</small></button>)}</div></aside><section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>ACCOUNT ACTIVITY</p><h2>{selectedLedgerAccount?.name ?? "Choose an account"}</h2><p>{selectedLedgerAccount ? `${labels[selectedLedgerAccount.classification]} · ${ledgerEntries.length} transaction${ledgerEntries.length === 1 ? "" : "s"}` : "No account selected."}</p></div></div>{selectedLedgerAccount && <><div className={styles.ledgerTotals}><span>Total debits <b>RM {ledgerTotals.debit.toFixed(2)}</b></span><span>Total credits <b>RM {ledgerTotals.credit.toFixed(2)}</b></span></div><div className={styles.ledgerTable}><table><thead><tr><th>Accounting date</th><th>Paid date</th><th>Other account</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{ledgerEntries.length ? ledgerEntries.map((entry) => { const isDebit = entry.debit_account_id === selectedLedgerAccount.id; const otherAccount = accountById.get(isDebit ? entry.credit_account_id ?? "" : entry.debit_account_id ?? "")?.name ?? "Deleted account"; return <tr className={entry.receipt_path ? styles.receiptRow : ""} key={entry.id} onClick={() => void openReceipt(entry)}><td>{entry.accounting_date}</td><td>{entry.paid_date}</td><td>{otherAccount}</td><td>{entry.description || "—"}{entry.journal_note && <small>{entry.journal_note}</small>}{entry.receipt_path && <small className={styles.receiptAttached}>Receipt attached</small>}</td><td>{isDebit ? `RM ${entry.amount.toFixed(2)}` : "—"}</td><td>{isDebit ? "—" : `RM ${entry.amount.toFixed(2)}`}</td></tr>; }) : <tr><td colSpan={6}>No posted transactions for this account yet.</td></tr>}</tbody></table></div></>}</section></section>}

    {view === "general_journal" && false && <div className={styles.twoColumn}>
      <form className={styles.card} onSubmit={postJournal}><p className={styles.eyebrow}>MANUAL ENTRY</p><h2>Create General Journal entry</h2><div className={styles.dates}><label>Paid date<input type="date" value={journalForm.paidDate} onChange={(event) => setJournalForm({ ...journalForm, paidDate: event.target.value })} /></label><label>Accounting date<input type="date" value={journalForm.accountingDate} onChange={(event) => setJournalForm({ ...journalForm, accountingDate: event.target.value })} /></label></div><label>Debit account<select value={journalForm.debit} onChange={(event) => setJournalForm({ ...journalForm, debit: event.target.value })}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label><label>Credit account<select value={journalForm.credit} onChange={(event) => setJournalForm({ ...journalForm, credit: event.target.value })}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label><label>Amount (RM)<input type="number" min="0.01" step="0.01" value={journalForm.amount} onChange={(event) => setJournalForm({ ...journalForm, amount: event.target.value })} required /></label><label>Journal note<input value={journalForm.note} onChange={(event) => setJournalForm({ ...journalForm, note: event.target.value })} placeholder="Example: Shopify subscription - March 2026" /></label><label>Description <span className={styles.optional}>(shown under the credit line)</span><textarea value={journalForm.description} onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })} placeholder="What this entry is for" /></label><button className={styles.primary} type="submit">Post to Monthly Journal</button></form>
      <section className={styles.card}><p className={styles.eyebrow}>POSTED ENTRIES</p><h2>General Journal</h2><p className={styles.muted}>Accounting date drives reports. Paid date remains available for cash-flow tracking.</p><div className={styles.journalList}>{entries.length ? entries.map((entry) => <article className={styles.journalEntry} key={entry.id}><div className={styles.entryDate}><b>{entry.accounting_date}</b><span>Paid {entry.paid_date}</span></div><div><p>Debit {accountById.get(entry.debit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p><p className={styles.credit}>Credit {accountById.get(entry.credit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p>{entry.description && <p className={styles.description}>{entry.description}</p>}{entry.journal_note && <small>{entry.journal_note}</small>}</div></article>) : <p className={styles.muted}>No Monthly Journal entries yet.</p>}</div></section>
    </div>}

    {visitedViews.includes("inbox") && <div hidden={view !== "inbox"}><MonthlyJournalInbox /></div>}
    {visitedViews.includes("import") && <div hidden={view !== "import"}><section className={styles.card}><p className={styles.eyebrow}>IMPORT PDF STATEMENT</p><h2>Import a bank statement</h2><MonthlyJournalImport /></section></div>}
    {visitedViews.includes("shortcuts") && <div hidden={view !== "shortcuts"}><MonthlyJournalShortcuts accounts={accounts} /></div>}
    {visitedViews.includes("source_documents") && <div hidden={view !== "source_documents"}><MonthlyJournalSourceDocuments /></div>}
    {view === "shopee" && <section className={styles.card}><p className={styles.eyebrow}>SHOPEE PAYLATER</p><h2>Shopee PayLater</h2><p>Use the existing Shopee PayLater account from your new Chart of Accounts for purchases and payments.</p></section>}
    {receiptPreview && <div className={styles.receiptBackdrop} role="dialog" aria-modal="true" aria-label="Source document" onClick={() => setReceiptPreview(null)}><section className={styles.receiptModal} onClick={(event) => event.stopPropagation()}><header><div><p className={styles.eyebrow}>SOURCE DOCUMENT</p><h2>{receiptPreview.name}</h2></div><button className={styles.refresh} type="button" onClick={() => setReceiptPreview(null)}>Close</button></header>{/\.pdf(?:$|\?)/i.test(receiptPreview.name) ? <iframe src={receiptPreview.url} title={receiptPreview.name} /> : <img src={receiptPreview.url} alt={receiptPreview.name} />}<a className={styles.refresh} href={receiptPreview.url} target="_blank" rel="noreferrer">Open in new tab</a></section></div>}
  </section>;
}

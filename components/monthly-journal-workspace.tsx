"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { MonthlyJournalInbox } from "./monthly-journal-inbox";
import { MonthlyJournalImport } from "./monthly-journal-import";
import { MonthlyJournalShortcuts } from "./monthly-journal-shortcuts";
import styles from "./monthly-journal-workspace.module.css";

type JournalView = "accounts" | "general_journal" | "inbox" | "import" | "shortcuts" | "shopee";
type Classification = "asset" | "liability" | "equity" | "income" | "cost_of_sales" | "operating_expense";
type Account = { id: string; name: string; classification: Classification; account_code: string; active: boolean };
type Entry = { id: string; paid_date: string; accounting_date: string; bank: string; bank_reference: string; journal_note: string; description: string; amount: number; debit_account_id: string | null; credit_account_id: string | null; created_at: string };

const labels: Record<Classification, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", cost_of_sales: "Cost of Sales", operating_expense: "Operating Expenses",
};

const today = () => new Date().toISOString().slice(0, 10);

export function MonthlyJournalWorkspace({ initialView = "accounts" }: { initialView?: JournalView }) {
  const [view, setView] = useState<JournalView>(initialView);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [classification, setClassification] = useState<Classification>("asset");
  const [focused, setFocused] = useState(false);
  const [journalForm, setJournalForm] = useState({ paidDate: today(), accountingDate: today(), bank: "", note: "", description: "", debit: "", credit: "", amount: "" });

  async function loadData() {
    if (!supabase) return;
    setLoading(true);
    const [accountsResult, entriesResult] = await Promise.all([
      supabase.from("monthly_journal_accounts").select("id,name,classification,account_code,active").eq("active", true).order("classification").order("name"),
      supabase.from("monthly_journal_entries").select("id,paid_date,accounting_date,bank,bank_reference,journal_note,description,amount,debit_account_id,credit_account_id,created_at").order("accounting_date", { ascending: false }).order("created_at", { ascending: false }).limit(100),
    ]);
    if (accountsResult.error || entriesResult.error) setMessage(accountsResult.error?.message || entriesResult.error?.message || "Could not load Monthly Journal data.");
    else {
      setAccounts((accountsResult.data ?? []) as Account[]);
      setEntries((entriesResult.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount) })) as Entry[]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);
  useEffect(() => { setView(initialView); }, [initialView]);
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
  const accountsByType = useMemo(() => Object.keys(labels).map((type) => ({ type: type as Classification, accounts: accounts.filter((account) => account.classification === type) })), [accounts]);

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

    {view === "general_journal" && <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>ACCOUNTING DATE DRIVES REPORTS</p><h2>General Journal</h2><p>Debits and credits always show their actual accounts; the description is shown below.</p></div><strong>{entries.length} posted entries</strong></div><div className={styles.journalList}>{entries.length ? entries.map((entry) => <article className={styles.journalEntry} key={entry.id}><div className={styles.entryDate}><b>{entry.accounting_date}</b><span>Paid {entry.paid_date}</span></div><div><p>Debit {accountById.get(entry.debit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p><p className={styles.credit}>Credit {accountById.get(entry.credit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p>{entry.description && <p className={styles.description}>{entry.description}</p>}</div></article>) : <p className={styles.muted}>Nothing posted yet. Start from the Bank Statement Inbox.</p>}</div></section>}

    {view === "general_journal" && false && <div className={styles.twoColumn}>
      <form className={styles.card} onSubmit={postJournal}><p className={styles.eyebrow}>MANUAL ENTRY</p><h2>Create General Journal entry</h2><div className={styles.dates}><label>Paid date<input type="date" value={journalForm.paidDate} onChange={(event) => setJournalForm({ ...journalForm, paidDate: event.target.value })} /></label><label>Accounting date<input type="date" value={journalForm.accountingDate} onChange={(event) => setJournalForm({ ...journalForm, accountingDate: event.target.value })} /></label></div><label>Debit account<select value={journalForm.debit} onChange={(event) => setJournalForm({ ...journalForm, debit: event.target.value })}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label><label>Credit account<select value={journalForm.credit} onChange={(event) => setJournalForm({ ...journalForm, credit: event.target.value })}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label><label>Amount (RM)<input type="number" min="0.01" step="0.01" value={journalForm.amount} onChange={(event) => setJournalForm({ ...journalForm, amount: event.target.value })} required /></label><label>Journal note<input value={journalForm.note} onChange={(event) => setJournalForm({ ...journalForm, note: event.target.value })} placeholder="Example: Shopify subscription - March 2026" /></label><label>Description <span className={styles.optional}>(shown under the credit line)</span><textarea value={journalForm.description} onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })} placeholder="What this entry is for" /></label><button className={styles.primary} type="submit">Post to Monthly Journal</button></form>
      <section className={styles.card}><p className={styles.eyebrow}>POSTED ENTRIES</p><h2>General Journal</h2><p className={styles.muted}>Accounting date drives reports. Paid date remains available for cash-flow tracking.</p><div className={styles.journalList}>{entries.length ? entries.map((entry) => <article className={styles.journalEntry} key={entry.id}><div className={styles.entryDate}><b>{entry.accounting_date}</b><span>Paid {entry.paid_date}</span></div><div><p>Debit {accountById.get(entry.debit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p><p className={styles.credit}>Credit {accountById.get(entry.credit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p>{entry.description && <p className={styles.description}>{entry.description}</p>}{entry.journal_note && <small>{entry.journal_note}</small>}</div></article>) : <p className={styles.muted}>No Monthly Journal entries yet.</p>}</div></section>
    </div>}

    {view === "inbox" && <MonthlyJournalInbox />}
    {view === "import" && <section className={styles.card}><p className={styles.eyebrow}>IMPORT PDF STATEMENT</p><h2>Import a bank statement</h2><MonthlyJournalImport /></section>}
    {view === "shortcuts" && <MonthlyJournalShortcuts accounts={accounts} />}
    {view === "shopee" && <section className={styles.card}><p className={styles.eyebrow}>SHOPEE PAYLATER</p><h2>Shopee PayLater</h2><p>Use the existing Shopee PayLater account from your new Chart of Accounts for purchases and payments.</p></section>}
  </section>;
}

"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { MonthlyJournalInbox } from "./monthly-journal-inbox";
import { MonthlyJournalImport } from "./monthly-journal-import";
import { MonthlyJournalShortcuts } from "./monthly-journal-shortcuts";
import { MonthlyJournalSourceDocuments } from "./monthly-journal-source-documents";
import { MonthlyJournalShopeeImport } from "./monthly-journal-shopee-import";
import styles from "./monthly-journal-workspace.module.css";

type JournalView = "accounts" | "account_activity" | "general_journal" | "inbox" | "import" | "reports" | "shortcuts" | "source_documents" | "shopee";
type Classification = "asset" | "liability" | "equity" | "income" | "cost_of_sales" | "operating_expense";
type Account = { id: string; name: string; classification: Classification; account_code: string; active: boolean };
type Entry = { id: string; paid_date: string; accounting_date: string; bank: string; bank_reference: string; journal_note: string; description: string; amount: number; debit_account_id: string | null; credit_account_id: string | null; receipt_path: string | null; shortcut_id: string | null; source: string; created_at: string };
type ShortcutDisplay = { id: string; debit_source: "statement_bank" | "account"; credit_source: "statement_bank" | "account" };
type ShopeePurchase = { id: string; purchase_date: string; description: string; debit_account_id: string | null; amount: number; journal_entry_id: string | null; receipt_path: string; source_reference: string };

const labels: Record<Classification, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", cost_of_sales: "Cost of Sales", operating_expense: "Operating Expenses",
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (amount: number) => `RM ${amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const endOfMonth = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
};

export function MonthlyJournalWorkspace({ initialView = "accounts" }: { initialView?: JournalView }) {
  const [view, setView] = useState<JournalView>(initialView);
  const [visitedViews, setVisitedViews] = useState<JournalView[]>([initialView]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [shortcuts, setShortcuts] = useState<ShortcutDisplay[]>([]);
  const [shopeePurchases, setShopeePurchases] = useState<ShopeePurchase[]>([]);
  const [journalMonth, setJournalMonth] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [classification, setClassification] = useState<Classification>("asset");
  const [openingForm, setOpeningForm] = useState<{ date: string; account: string; side: "debit" | "credit"; amount: string; description: string }>({ date: today(), account: "", side: "debit", amount: "", description: "" });
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState("");
  const [focused, setFocused] = useState(false);
  const [receiptPreview, setReceiptPreview] = useState<{ url: string; name: string } | null>(null);
  const [journalForm, setJournalForm] = useState({ paidDate: today(), accountingDate: today(), bank: "", note: "", description: "", debit: "", credit: "", amount: "" });
  const [shopeeForm, setShopeeForm] = useState({ purchaseDate: today(), classification: "asset" as Classification, account: "", description: "", amount: "" });
  const [shopeeFile, setShopeeFile] = useState<File | null>(null);
  const [shopeeDragging, setShopeeDragging] = useState(false);
  const [savingShopee, setSavingShopee] = useState(false);
  const [selectedShopeePurchaseId, setSelectedShopeePurchaseId] = useState("");
  const shopeeFileInput = useRef<HTMLInputElement>(null);

  const loadAllEntries = async () => {
    if (!supabase) return { data: [], error: null };
    const data: Entry[] = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const response = await supabase
        .from("monthly_journal_entries")
        .select("id,paid_date,accounting_date,bank,bank_reference,journal_note,description,amount,debit_account_id,credit_account_id,receipt_path,shortcut_id,source,created_at")
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
    const [accountsResult, entriesResult, shortcutsResult, shopeeResult] = await Promise.all([
      supabase.from("monthly_journal_accounts").select("id,name,classification,account_code,active").eq("active", true).order("classification").order("name"),
      loadAllEntries(),
      supabase.from("monthly_journal_shortcuts").select("id,debit_source,credit_source"),
      supabase.from("monthly_journal_shopee_purchases").select("id,purchase_date,description,debit_account_id,amount,journal_entry_id,receipt_path,source_reference").order("purchase_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (accountsResult.error || entriesResult.error || shortcutsResult.error || shopeeResult.error) setMessage(accountsResult.error?.message || entriesResult.error?.message || shortcutsResult.error?.message || shopeeResult.error?.message || "Could not load Monthly Journal data.");
    else {
      setAccounts((accountsResult.data ?? []) as Account[]);
      setEntries((entriesResult.data ?? []).map((entry) => ({ ...entry, amount: Number(entry.amount) })) as Entry[]);
      setShortcuts((shortcutsResult.data ?? []) as ShortcutDisplay[]);
      setShopeePurchases((shopeeResult.data ?? []).map((purchase) => ({ ...purchase, amount: Number(purchase.amount) })) as ShopeePurchase[]);
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
  const openingBalanceAccounts = useMemo(() => accounts.filter((account) => ["asset", "liability", "equity"].includes(account.classification) && account.name.trim().toLowerCase() !== "opening balance equity"), [accounts]);
  const selectedLedgerAccount = accountById.get(selectedLedgerAccountId) ?? accounts[0];
  const ledgerEntries = useMemo(() => selectedLedgerAccount ? entries.filter((entry) => entry.debit_account_id === selectedLedgerAccount.id || entry.credit_account_id === selectedLedgerAccount.id) : [], [entries, selectedLedgerAccount]);
  const ledgerTotals = useMemo(() => ledgerEntries.reduce((totals, entry) => ({ debit: totals.debit + (entry.debit_account_id === selectedLedgerAccount?.id ? entry.amount : 0), credit: totals.credit + (entry.credit_account_id === selectedLedgerAccount?.id ? entry.amount : 0) }), { debit: 0, credit: 0 }), [ledgerEntries, selectedLedgerAccount]);
  const reportEndDate = useMemo(() => reportMonth ? endOfMonth(reportMonth) : entries.reduce((latest, entry) => entry.accounting_date > latest ? entry.accounting_date : latest, ""), [entries, reportMonth]);
  const reportPeriodEntries = useMemo(() => entries.filter((entry) => !reportMonth || entry.accounting_date.startsWith(reportMonth)), [entries, reportMonth]);
  const reportPositionEntries = useMemo(() => entries.filter((entry) => !reportEndDate || entry.accounting_date <= reportEndDate), [entries, reportEndDate]);
  const reportAccounts = useMemo(() => accounts.map((account) => {
    const sum = (rows: Entry[]) => rows.reduce((totals, entry) => ({ debit: totals.debit + (entry.debit_account_id === account.id ? entry.amount : 0), credit: totals.credit + (entry.credit_account_id === account.id ? entry.amount : 0) }), { debit: 0, credit: 0 });
    return { account, period: sum(reportPeriodEntries), position: sum(reportPositionEntries) };
  }), [accounts, reportPeriodEntries, reportPositionEntries]);
  const trialBalance = useMemo(() => reportAccounts.map((row) => ({ ...row, debit: Math.max(0, row.position.debit - row.position.credit), credit: Math.max(0, row.position.credit - row.position.debit) })).filter((row) => row.debit || row.credit), [reportAccounts]);
  const profitAndLoss = useMemo(() => {
    const total = (classification: Classification, normal: "debit" | "credit") => reportAccounts.filter((row) => row.account.classification === classification).reduce((sum, row) => sum + (normal === "credit" ? row.period.credit - row.period.debit : row.period.debit - row.period.credit), 0);
    const income = total("income", "credit"); const costOfSales = total("cost_of_sales", "debit"); const operatingExpenses = total("operating_expense", "debit");
    return { income, costOfSales, operatingExpenses, netProfit: income - costOfSales - operatingExpenses };
  }, [reportAccounts]);
  const balanceSheet = useMemo(() => {
    const total = (classification: Classification, normal: "debit" | "credit") => reportAccounts.filter((row) => row.account.classification === classification).reduce((sum, row) => sum + (normal === "credit" ? row.position.credit - row.position.debit : row.position.debit - row.position.credit), 0);
    const assets = total("asset", "debit"); const liabilities = total("liability", "credit"); const equity = total("equity", "credit");
    const retainedEarnings = total("income", "credit") - total("cost_of_sales", "debit") - total("operating_expense", "debit");
    return { assets, liabilities, equity, retainedEarnings, liabilitiesAndEquity: liabilities + equity + retainedEarnings };
  }, [reportAccounts]);
  const reportPeriodLabel = reportMonth ? new Date(`${reportMonth}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" }) : "All posted periods";
  const reportAsAtLabel = reportEndDate ? `As at ${reportEndDate}` : "No posted entries yet";
  const balanceSheetDifference = balanceSheet.assets - balanceSheet.liabilitiesAndEquity;
  const trialBalanceTotals = useMemo(() => trialBalance.reduce((totals, row) => ({ debit: totals.debit + row.debit, credit: totals.credit + row.credit }), { debit: 0, credit: 0 }), [trialBalance]);
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

  async function postOpeningBalance(event: FormEvent) {
    event.preventDefault();
    if (!supabase || savingOpeningBalance) return;
    const account = accountById.get(openingForm.account);
    const amount = Number(openingForm.amount);
    if (!account || !Number.isFinite(amount) || amount <= 0) return setMessage("Choose an account and enter a positive opening balance.");
    setSavingOpeningBalance(true);
    try {
      let openingEquity = accounts.find((item) => item.name.trim().toLowerCase() === "opening balance equity");
      if (!openingEquity) {
        const { data, error } = await supabase.from("monthly_journal_accounts").insert({ name: "Opening Balance Equity", account_code: "", classification: "equity" }).select("id,name,classification,account_code,active").single();
        if (error || !data) return setMessage(error?.message || "Could not create Opening Balance Equity.");
        openingEquity = data as Account;
      }
      const debitAccountId = openingForm.side === "debit" ? account.id : openingEquity.id;
      const creditAccountId = openingForm.side === "credit" ? account.id : openingEquity.id;
      const description = openingForm.description.trim() || `Opening balance for ${account.name}`;
      const { error } = await supabase.from("monthly_journal_entries").insert({
        paid_date: openingForm.date,
        accounting_date: openingForm.date,
        bank: "",
        bank_reference: "",
        journal_note: `Opening balance at ${openingForm.date}`,
        description,
        debit_account_id: debitAccountId,
        credit_account_id: creditAccountId,
        amount,
        source: "manual",
        source_reference: `opening-balance:${account.id}:${openingForm.date}`,
        status: "posted",
        entry_lines: [{ account_id: debitAccountId, debit: amount, credit: 0 }, { account_id: creditAccountId, debit: 0, credit: amount }],
      });
      if (error) return setMessage(error.code === "23505" ? `An opening balance for ${account.name} already exists on ${openingForm.date}.` : error.message);
      setOpeningForm({ date: today(), account: "", side: "debit", amount: "", description: "" });
      setMessage(`Opening balance posted for ${account.name}.`);
      await loadData();
    } finally {
      setSavingOpeningBalance(false);
    }
  }

  async function deleteUnusedAccount(account: Account) {
    if (!supabase) return;
    const { count: transactionCount, error: transactionError } = await supabase.from("monthly_journal_entries").select("id", { count: "exact", head: true }).or(`debit_account_id.eq.${account.id},credit_account_id.eq.${account.id}`);
    if (transactionError) return setMessage(transactionError.message);
    if (transactionCount) return setMessage(`${account.name} cannot be deleted because it has ${transactionCount} Monthly Journal transaction${transactionCount === 1 ? "" : "s"}.`);
    const { count: shortcutCount, error: shortcutError } = await supabase.from("monthly_journal_shortcuts").select("id", { count: "exact", head: true }).or(`debit_account_id.eq.${account.id},credit_account_id.eq.${account.id}`);
    if (shortcutError) return setMessage(shortcutError.message);
    if (shortcutCount) return setMessage(`${account.name} is used by ${shortcutCount} shortcut${shortcutCount === 1 ? "" : "s"}. Remove or edit that shortcut before deleting the account.`);
    const { error } = await supabase.from("monthly_journal_accounts").delete().eq("id", account.id);
    if (error) return setMessage(error.message);
    if (selectedLedgerAccountId === account.id) setSelectedLedgerAccountId("");
    setMessage(`${account.name} was permanently deleted.`); await loadData();
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

  const shopeePayLater = useMemo(() => accounts.find((account) => account.name.trim().toLowerCase() === "shopee paylater payable"), [accounts]);
  const shopeeAccountChoices = useMemo(() => accounts.filter((account) => account.classification === shopeeForm.classification && account.id !== shopeePayLater?.id), [accounts, shopeeForm.classification, shopeePayLater?.id]);
  const selectedShopeePurchase = shopeePurchases.find((purchase) => purchase.id === selectedShopeePurchaseId);
  const shopeePayLaterBalance = useMemo(() => !shopeePayLater ? 0 : entries.reduce((balance, entry) => balance + (entry.credit_account_id === shopeePayLater.id ? entry.amount : 0) - (entry.debit_account_id === shopeePayLater.id ? entry.amount : 0), 0), [entries, shopeePayLater]);

  function chooseShopeeFile(file?: File) { if (file) setShopeeFile(file); }
  function dropShopeeFile(event: DragEvent<HTMLDivElement>) { event.preventDefault(); setShopeeDragging(false); chooseShopeeFile(event.dataTransfer.files?.[0]); }

  async function addShopeePurchase(event: FormEvent) {
    event.preventDefault();
    if (!supabase || savingShopee) return;
    if (!shopeePayLater) return setMessage("Add an active 'Shopee PayLater Payable' liability account before recording purchases.");
    const amount = Number(selectedShopeePurchase?.amount ?? shopeeForm.amount);
    const description = selectedShopeePurchase?.description ?? shopeeForm.description.trim();
    const purchaseDate = selectedShopeePurchase?.purchase_date ?? shopeeForm.purchaseDate;
    if (!shopeeForm.account || !description || !Number.isFinite(amount) || amount <= 0) return setMessage("Choose the purchase account, add a description, and enter an amount.");
    setSavingShopee(true);
    try {
      const entryId = crypto.randomUUID();
      let receiptPath = selectedShopeePurchase?.receipt_path ?? "";
      if (shopeeFile) {
        const safeName = shopeeFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
        receiptPath = `${entryId}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from("monthly-journal-receipts").upload(receiptPath, shopeeFile, { upsert: false });
        if (uploadError) throw uploadError;
      }
      const { error } = await supabase.from("monthly_journal_entries").insert({
        id: entryId,
        paid_date: purchaseDate,
        accounting_date: purchaseDate,
        bank: "Shopee PayLater",
        bank_reference: "",
        journal_note: `Shopee PayLater purchase on ${purchaseDate}`,
        description,
        debit_account_id: shopeeForm.account,
        credit_account_id: shopeePayLater.id,
        amount,
        receipt_path: receiptPath,
        source: "shopee_paylater",
        status: "posted",
        entry_lines: [{ account_id: shopeeForm.account, debit: amount, credit: 0 }, { account_id: shopeePayLater.id, debit: 0, credit: amount }],
      });
      if (error) throw error;
      if (selectedShopeePurchase) {
        const { error: purchaseError } = await supabase.from("monthly_journal_shopee_purchases").update({ debit_account_id: shopeeForm.account, journal_entry_id: entryId, receipt_path: receiptPath }).eq("id", selectedShopeePurchase.id);
        if (purchaseError) throw purchaseError;
      } else {
        const { error: purchaseError } = await supabase.from("monthly_journal_shopee_purchases").insert({ purchase_date: purchaseDate, description, debit_account_id: shopeeForm.account, amount, journal_entry_id: entryId, receipt_path: receiptPath });
        if (purchaseError) throw purchaseError;
      }
      setShopeeForm({ purchaseDate: today(), classification: "asset", account: "", description: "", amount: "" });
      setShopeeFile(null);
      setSelectedShopeePurchaseId("");
      setMessage("Shopee purchase recorded. It increases Shopee PayLater Payable; no bank cash movement was recorded.");
      await loadData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record the Shopee purchase.");
    } finally { setSavingShopee(false); }
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
        {accountsByType.map(({ type, accounts: grouped }) => <div className={styles.accountGroup} key={type}><h3>{labels[type]}</h3>{grouped.length ? grouped.map((account) => { const transactionCount = entries.filter((entry) => entry.debit_account_id === account.id || entry.credit_account_id === account.id).length; return <div className={styles.accountRow} key={account.id}><span>{account.account_code && <small>{account.account_code}</small>}{account.name}</span><div className={styles.accountActions}><button type="button" onClick={() => void removeAccount(account)}>Hide</button><button className={styles.deleteAccount} type="button" disabled={transactionCount > 0} title={transactionCount ? `Cannot delete: ${transactionCount} transaction${transactionCount === 1 ? "" : "s"}` : "Permanently delete this unused account"} onClick={() => void deleteUnusedAccount(account)}>{transactionCount ? "Has transactions" : "Delete"}</button></div></div>; }) : <p className={styles.muted}>No accounts yet.</p>}</div>)}
      </section>
      <div className={styles.accountForms}>
        <form className={styles.card} onSubmit={addAccount}><p className={styles.eyebrow}>NEW ACCOUNT</p><h2>Add an account</h2><label>Classification<select value={classification} onChange={(event) => setClassification(event.target.value as Classification)}>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Account name<input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="Example: Software" required /></label><label>Account code <span className={styles.optional}>(optional)</span><input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} placeholder="Example: 6100" /></label><button className={styles.primary} type="submit">Save account</button></form>
        <form className={styles.card} onSubmit={postOpeningBalance}>
          <p className={styles.eyebrow}>OPENING BALANCE</p><h2>Set a starting balance</h2><p>Use the balance on the day Monthly Journal starts. It posts against Opening Balance Equity, not sales or expenses.</p>
          <label>Opening date<input type="date" value={openingForm.date} onChange={(event) => setOpeningForm({ ...openingForm, date: event.target.value })} required /></label>
          <label>Account<select value={openingForm.account} onChange={(event) => { const selectedAccount = openingBalanceAccounts.find((account) => account.id === event.target.value); setOpeningForm({ ...openingForm, account: event.target.value, side: selectedAccount?.classification === "asset" ? "debit" : "credit" }); }} required><option value="">Choose a balance-sheet account</option>{openingBalanceAccounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label>
          <label>Balance side<select value={openingForm.side} onChange={(event) => setOpeningForm({ ...openingForm, side: event.target.value as "debit" | "credit" })}><option value="debit">Debit — asset balance</option><option value="credit">Credit — liability or equity balance</option></select></label>
          <label>Amount (RM)<input type="number" min="0.01" step="0.01" value={openingForm.amount} onChange={(event) => setOpeningForm({ ...openingForm, amount: event.target.value })} placeholder="0.00" required /></label>
          <label>Description <span className={styles.optional}>(optional)</span><input value={openingForm.description} onChange={(event) => setOpeningForm({ ...openingForm, description: event.target.value })} placeholder="Example: Maybank balance at business start" /></label>
          <button className={styles.primary} type="submit" disabled={savingOpeningBalance}>{savingOpeningBalance ? "Posting…" : "Post opening balance"}</button>
        </form>
      </div>
    </div>}

    {view === "general_journal" && <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>ACCOUNTING DATE DRIVES REPORTS</p><h2>General Journal</h2><p>Descriptions appear beside their account in brackets; the journal note is shown below each entry.</p></div><div className={styles.journalControls}><label>Accounting month<select value={journalMonth} onChange={(event) => setJournalMonth(event.target.value)}><option value="">All months</option>{journalMonths.map((month) => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}</option>)}</select></label><strong>{visibleJournalEntries.length} posted entries</strong></div></div><div className={styles.journalList}>{visibleJournalEntries.length ? visibleJournalEntries.map((entry) => <article className={`${styles.journalEntry}${entry.receipt_path ? ` ${styles.receiptRow}` : ""}`} key={entry.id} onClick={() => void openReceipt(entry)}><div className={styles.entryDate}><b>{entry.accounting_date}</b><span>Paid {entry.paid_date}</span>{entry.receipt_path && <small>Receipt attached</small>}</div><div><p><span>Debit {accountLine(entry, "debit")}</span><strong>RM {entry.amount.toFixed(2)}</strong></p><p className={styles.credit}><span>Credit {accountLine(entry, "credit")}</span><strong>RM {entry.amount.toFixed(2)}</strong></p>{entry.journal_note && <p className={styles.description}>{entry.journal_note}</p>}{!entry.shortcut_id && entry.description && <p className={styles.description}>{entry.description}</p>}</div></article>) : <p className={styles.muted}>No posted entries for this accounting month.</p>}</div></section>}

    {view === "reports" && <section className={styles.reports}>
      <section className={styles.card}>
        <div className={styles.reportHeader}>
          <div><p className={styles.eyebrow}>FINANCIAL REPORTING</p><h2>Accounting statements</h2><p>Profit &amp; Loss uses the selected accounting month. Trial Balance and Balance Sheet show balances up to that month-end.</p></div>
          <label>Reporting month<select value={reportMonth} onChange={(event) => setReportMonth(event.target.value)}><option value="">All posted periods</option>{journalMonths.map((month) => <option key={month} value={month}>{new Date(`${month}-01T00:00:00`).toLocaleDateString("en-MY", { month: "long", year: "numeric" })}</option>)}</select></label>
        </div>
      </section>
      <div className={styles.reportSummary}>
        <article><span>Net profit / (loss)</span><strong>{money(profitAndLoss.netProfit)}</strong><small>{reportPeriodLabel}</small></article>
        <article><span>Total assets</span><strong>{money(balanceSheet.assets)}</strong><small>{reportAsAtLabel}</small></article>
        <article className={Math.abs(balanceSheetDifference) < 0.01 ? styles.reportBalanced : styles.reportWarning}><span>Balance Sheet check</span><strong>{money(Math.abs(balanceSheetDifference))}</strong><small>{Math.abs(balanceSheetDifference) < 0.01 ? "Balanced" : "Out of balance"}</small></article>
      </div>
      <div className={styles.reportGrid}>
        <section className={styles.card}>
          <p className={styles.eyebrow}>INCOME STATEMENT</p><h2>Profit &amp; Loss</h2><p className={styles.muted}>For {reportPeriodLabel}</p>
          <div className={styles.reportLines}>
            <p><span>Income</span><strong>{money(profitAndLoss.income)}</strong></p>
            <p><span>Cost of sales</span><strong>({money(profitAndLoss.costOfSales)})</strong></p>
            <p><span>Operating expenses</span><strong>({money(profitAndLoss.operatingExpenses)})</strong></p>
            <p className={styles.reportTotal}><span>Net profit / (loss)</span><strong>{money(profitAndLoss.netProfit)}</strong></p>
          </div>
          <div className={styles.reportAccountLines}>{reportAccounts.filter((row) => ["income", "cost_of_sales", "operating_expense"].includes(row.account.classification) && (row.period.debit || row.period.credit)).map((row) => { const amount = row.account.classification === "income" ? row.period.credit - row.period.debit : row.period.debit - row.period.credit; return <p key={row.account.id}><span>{row.account.name}</span><strong>{money(amount)}</strong></p>; })}</div>
        </section>
        <section className={styles.card}>
          <p className={styles.eyebrow}>FINANCIAL POSITION</p><h2>Balance Sheet</h2><p className={styles.muted}>{reportAsAtLabel}</p>
          <div className={styles.reportLines}>
            <p><span>Assets</span><strong>{money(balanceSheet.assets)}</strong></p>
            <p><span>Liabilities</span><strong>{money(balanceSheet.liabilities)}</strong></p>
            <p><span>Equity</span><strong>{money(balanceSheet.equity)}</strong></p>
            <p><span>Current earnings</span><strong>{money(balanceSheet.retainedEarnings)}</strong></p>
            <p className={styles.reportTotal}><span>Total liabilities &amp; equity</span><strong>{money(balanceSheet.liabilitiesAndEquity)}</strong></p>
          </div>
        </section>
      </div>
      <section className={styles.card}>
        <div className={styles.cardHeading}><div><p className={styles.eyebrow}>ACCOUNT BALANCES</p><h2>Trial Balance</h2><p>{reportAsAtLabel}</p></div><strong>{trialBalance.length} accounts</strong></div>
        <div className={styles.reportTable}><table><thead><tr><th>Account</th><th>Classification</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{trialBalance.length ? trialBalance.map((row) => <tr key={row.account.id}><td>{row.account.name}</td><td>{labels[row.account.classification]}</td><td>{row.debit ? money(row.debit) : "—"}</td><td>{row.credit ? money(row.credit) : "—"}</td></tr>) : <tr><td colSpan={4}>No posted Monthly Journal entries yet.</td></tr>}</tbody><tfoot><tr><th colSpan={2}>Total</th><th>{money(trialBalanceTotals.debit)}</th><th>{money(trialBalanceTotals.credit)}</th></tr></tfoot></table></div>
      </section>
    </section>}

    {view === "account_activity" && <section className={styles.accountActivity}><aside className={styles.accountSelector}><p className={styles.eyebrow}>ACCOUNTS</p><h2>Select an account</h2><p className={styles.muted}>Choose an account to see every Monthly Journal transaction that affects it.</p><div className={styles.accountPicker}>{accounts.map((account) => <button className={selectedLedgerAccount?.id === account.id ? styles.selectedAccount : ""} type="button" key={account.id} onClick={() => setSelectedLedgerAccountId(account.id)}><span>{account.name}</span><small>{labels[account.classification]}</small></button>)}</div></aside><section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>ACCOUNT ACTIVITY</p><h2>{selectedLedgerAccount?.name ?? "Choose an account"}</h2><p>{selectedLedgerAccount ? `${labels[selectedLedgerAccount.classification]} · ${ledgerEntries.length} transaction${ledgerEntries.length === 1 ? "" : "s"}` : "No account selected."}</p></div></div>{selectedLedgerAccount && <><div className={styles.ledgerTotals}><span>Total debits <b>RM {ledgerTotals.debit.toFixed(2)}</b></span><span>Total credits <b>RM {ledgerTotals.credit.toFixed(2)}</b></span></div><div className={styles.ledgerTable}><table><thead><tr><th>Accounting date</th><th>Paid date</th><th>Other account</th><th>Description</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{ledgerEntries.length ? ledgerEntries.map((entry) => { const isDebit = entry.debit_account_id === selectedLedgerAccount.id; const otherAccount = accountById.get(isDebit ? entry.credit_account_id ?? "" : entry.debit_account_id ?? "")?.name ?? "Deleted account"; return <tr className={entry.receipt_path ? styles.receiptRow : ""} key={entry.id} onClick={() => void openReceipt(entry)}><td>{entry.accounting_date}</td><td>{entry.paid_date}</td><td>{otherAccount}</td><td><span className={styles.ledgerDescription}>{entry.description || "—"}</span>{entry.journal_note && <small className={styles.ledgerJournalNote}>{entry.journal_note}</small>}{entry.receipt_path && <small className={styles.receiptAttached}>Receipt attached</small>}</td><td>{isDebit ? `RM ${entry.amount.toFixed(2)}` : "—"}</td><td>{isDebit ? "—" : `RM ${entry.amount.toFixed(2)}`}</td></tr>; }) : <tr><td colSpan={6}>No posted transactions for this account yet.</td></tr>}</tbody></table></div></>}</section></section>}

    {view === "general_journal" && false && <div className={styles.twoColumn}>
      <form className={styles.card} onSubmit={postJournal}><p className={styles.eyebrow}>MANUAL ENTRY</p><h2>Create General Journal entry</h2><div className={styles.dates}><label>Paid date<input type="date" value={journalForm.paidDate} onChange={(event) => setJournalForm({ ...journalForm, paidDate: event.target.value })} /></label><label>Accounting date<input type="date" value={journalForm.accountingDate} onChange={(event) => setJournalForm({ ...journalForm, accountingDate: event.target.value })} /></label></div><label>Debit account<select value={journalForm.debit} onChange={(event) => setJournalForm({ ...journalForm, debit: event.target.value })}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label><label>Credit account<select value={journalForm.credit} onChange={(event) => setJournalForm({ ...journalForm, credit: event.target.value })}><option value="">Choose an account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{labels[account.classification]} — {account.name}</option>)}</select></label><label>Amount (RM)<input type="number" min="0.01" step="0.01" value={journalForm.amount} onChange={(event) => setJournalForm({ ...journalForm, amount: event.target.value })} required /></label><label>Journal note<input value={journalForm.note} onChange={(event) => setJournalForm({ ...journalForm, note: event.target.value })} placeholder="Example: Shopify subscription - March 2026" /></label><label>Description <span className={styles.optional}>(shown under the credit line)</span><textarea value={journalForm.description} onChange={(event) => setJournalForm({ ...journalForm, description: event.target.value })} placeholder="What this entry is for" /></label><button className={styles.primary} type="submit">Post to Monthly Journal</button></form>
      <section className={styles.card}><p className={styles.eyebrow}>POSTED ENTRIES</p><h2>General Journal</h2><p className={styles.muted}>Accounting date drives reports. Paid date remains available for cash-flow tracking.</p><div className={styles.journalList}>{entries.length ? entries.map((entry) => <article className={styles.journalEntry} key={entry.id}><div className={styles.entryDate}><b>{entry.accounting_date}</b><span>Paid {entry.paid_date}</span></div><div><p>Debit {accountById.get(entry.debit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p><p className={styles.credit}>Credit {accountById.get(entry.credit_account_id ?? "")?.name ?? "Deleted account"}<strong>RM {entry.amount.toFixed(2)}</strong></p>{entry.description && <p className={styles.description}>{entry.description}</p>}{entry.journal_note && <small>{entry.journal_note}</small>}</div></article>) : <p className={styles.muted}>No Monthly Journal entries yet.</p>}</div></section>
    </div>}

    {visitedViews.includes("inbox") && <div hidden={view !== "inbox"}><MonthlyJournalInbox /></div>}
    {visitedViews.includes("import") && <div hidden={view !== "import"}><section className={styles.card}><p className={styles.eyebrow}>IMPORT PDF STATEMENT</p><h2>Import a bank statement</h2><MonthlyJournalImport /></section></div>}
    {visitedViews.includes("shortcuts") && <div hidden={view !== "shortcuts"}><MonthlyJournalShortcuts accounts={accounts} /></div>}
    {visitedViews.includes("source_documents") && <div hidden={view !== "source_documents"}><MonthlyJournalSourceDocuments /></div>}
    {view === "shopee" && <div className={styles.shopeeLayout}>
      <section className={styles.card}><div className={styles.cardHeading}><div><p className={styles.eyebrow}>SHOPEE PAYLATER</p><h2>Shopee purchases</h2><p>Import a receipt, then classify it before it posts. Recorded purchases debit the account you chose and credit Shopee PayLater Payable.</p></div><strong>Outstanding RM {shopeePayLaterBalance.toFixed(2)}</strong></div><MonthlyJournalShopeeImport onImported={loadData} />
        <div className={styles.shopeePurchases}>{shopeePurchases.length ? shopeePurchases.map((purchase) => <article key={purchase.id} className={purchase.journal_entry_id ? "" : styles.shopeePending}><div><b>{purchase.purchase_date}</b><span>{purchase.journal_entry_id ? accountById.get(purchase.debit_account_id ?? "")?.name ?? "Deleted account" : "Needs classification"}</span></div><div><strong>{purchase.description}</strong><small>{purchase.journal_entry_id ? "Posted to Shopee PayLater" : "Imported from Shopee receipt"}</small></div><div><b>RM {purchase.amount.toFixed(2)}</b>{!purchase.journal_entry_id && <button type="button" onClick={() => { setSelectedShopeePurchaseId(purchase.id); setShopeeForm({ purchaseDate: purchase.purchase_date, classification: "asset", account: "", description: purchase.description, amount: purchase.amount.toFixed(2) }); }}>Classify</button>}</div></article>) : <p className={styles.muted}>No Shopee PayLater purchases recorded yet.</p>}</div>
      </section>
      <form className={styles.card} onSubmit={addShopeePurchase}><p className={styles.eyebrow}>{selectedShopeePurchase ? "CLASSIFY IMPORTED PURCHASE" : "ADD SHOPEE PURCHASE"}</p><h2>{selectedShopeePurchase ? selectedShopeePurchase.description : "Record a purchase"}</h2><p className={styles.muted}>Choose whether it was Inventory, Cost of Sales, an Operating Expense, or another asset. The credit is always Shopee PayLater Payable.</p>
        <div className={styles.dates}><label>Purchase date<input type="date" value={shopeeForm.purchaseDate} onChange={(event) => setShopeeForm({ ...shopeeForm, purchaseDate: event.target.value })} required /></label><label>Classification<select value={shopeeForm.classification} onChange={(event) => setShopeeForm({ ...shopeeForm, classification: event.target.value as Classification, account: "" })}>{(["asset", "cost_of_sales", "operating_expense"] as Classification[]).map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label></div>
        <label>Debit account<select value={shopeeForm.account} onChange={(event) => setShopeeForm({ ...shopeeForm, account: event.target.value })} required><option value="">Choose an account</option>{shopeeAccountChoices.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
        <label>Description<input value={shopeeForm.description} onChange={(event) => setShopeeForm({ ...shopeeForm, description: event.target.value })} placeholder="Example: Plush toy stock, bubble wrap, or Shopify voucher" required /></label>
        <label>Amount (RM)<input type="number" min="0.01" step="0.01" value={shopeeForm.amount} onChange={(event) => setShopeeForm({ ...shopeeForm, amount: event.target.value })} required /></label>
        <div className={`${styles.shopeeSource}${shopeeDragging ? ` ${styles.shopeeSourceDragging}` : ""}`} role="button" tabIndex={0} onClick={() => shopeeFileInput.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") shopeeFileInput.current?.click(); }} onDragEnter={(event) => { event.preventDefault(); setShopeeDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setShopeeDragging(false)} onDrop={dropShopeeFile}><strong>{shopeeFile ? shopeeFile.name : "Drop source document here"}</strong><span>{shopeeFile ? "Click to replace it" : "or click to select a receipt, invoice, PDF, or image"}</span><input ref={shopeeFileInput} type="file" accept="application/pdf,image/*" onChange={(event: ChangeEvent<HTMLInputElement>) => { chooseShopeeFile(event.target.files?.[0]); event.target.value = ""; }} /></div>
        <div className={styles.shopeePreview}>Debit {accountById.get(shopeeForm.account)?.name ?? "chosen account"}<br />Credit Shopee PayLater Payable</div><button className={styles.primary} type="submit" disabled={savingShopee || !shopeePayLater}>{savingShopee ? "Recording…" : "Add Shopee purchase"}</button>
      </form>
    </div>}
    {receiptPreview && <div className={styles.receiptBackdrop} role="dialog" aria-modal="true" aria-label="Source document" onClick={() => setReceiptPreview(null)}><section className={styles.receiptModal} onClick={(event) => event.stopPropagation()}><header><div><p className={styles.eyebrow}>SOURCE DOCUMENT</p><h2>{receiptPreview.name}</h2></div><button className={styles.refresh} type="button" onClick={() => setReceiptPreview(null)}>Close</button></header>{/\.pdf(?:$|\?)/i.test(receiptPreview.name) ? <iframe src={receiptPreview.url} title={receiptPreview.name} /> : <img src={receiptPreview.url} alt={receiptPreview.name} />}<a className={styles.refresh} href={receiptPreview.url} target="_blank" rel="noreferrer">Open in new tab</a></section></div>}
  </section>;
}

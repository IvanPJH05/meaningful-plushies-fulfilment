"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import styles from "./monthly-journal-workspace.module.css";

type Account = { id: string; name: string; classification: string };
type AccountSource = "statement_bank" | "account";
type Shortcut = { id: string; name: string; transaction_direction: "money_in" | "money_out"; bank_filter: "any" | "Maybank" | "Public Bank" | "Touch 'n Go eWallet"; accounting_date_rule: "same_day" | "previous_month_end"; journal_note_template: string; description_template: string; debit_source: AccountSource; debit_account_id: string | null; credit_source: AccountSource; credit_account_id: string | null; active: boolean };
type Form = { name: string; bankFilter: Shortcut["bank_filter"]; direction: Shortcut["transaction_direction"]; dateRule: Shortcut["accounting_date_rule"]; debit: string; credit: string; note: string; description: string };

const blankForm = (): Form => ({ name: "", bankFilter: "any", direction: "money_out", dateRule: "same_day", debit: "statement_bank", credit: "", note: "", description: "" });
const sourceLabel = (value: string, accounts: Account[]) => value === "statement_bank" ? "Bank account from statement" : accounts.find((account) => account.id === value)?.name ?? "Deleted account";
const previousMonthEnd = (paidDate: string) => {
  const [year, month] = paidDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
};
const renderTemplate = (template: string, paidDate: string, accountingDate: string) => template
  .replaceAll("{month}", accountingDate.slice(0, 7))
  .replaceAll("{paid_date}", paidDate)
  .replaceAll("{previous_month_end}", previousMonthEnd(paidDate));

export function MonthlyJournalShortcuts({ accounts }: { accounts: Account[] }) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blankForm);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("monthly_journal_shortcuts").select("id,name,transaction_direction,bank_filter,accounting_date_rule,journal_note_template,description_template,debit_source,debit_account_id,credit_source,credit_account_id,active").eq("active", true).order("created_at");
    if (error) setMessage(error.message); else setShortcuts((data ?? []) as Shortcut[]);
  }
  useEffect(() => { void load(); }, []);

  async function refreshLinkedWording(shortcutId: string, noteTemplate: string, descriptionTemplate: string) {
    if (!supabase) return 0;
    const rows: { id: string; paid_date: string; accounting_date: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("monthly_journal_entries").select("id,paid_date,accounting_date").eq("shortcut_id", shortcutId).range(from, from + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    for (const row of rows) {
      const { error } = await supabase.from("monthly_journal_entries").update({ journal_note: renderTemplate(noteTemplate, row.paid_date, row.accounting_date), description: renderTemplate(descriptionTemplate, row.paid_date, row.accounting_date), updated_at: new Date().toISOString() }).eq("id", row.id);
      if (error) throw error;
    }
    return rows.length;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !form.name.trim() || !form.debit || !form.credit) return setMessage("Give the shortcut a name and choose both sides of the journal entry.");
    if (form.debit === form.credit) return setMessage("Debit and credit must be different accounts.");
    if (form.debit !== "statement_bank" && form.credit !== "statement_bank") return setMessage("One side must be the bank account from the statement.");
    const values = {
      name: form.name.trim(), bank_filter: form.bankFilter, transaction_direction: form.direction, accounting_date_rule: form.dateRule,
      debit_source: form.debit === "statement_bank" ? "statement_bank" : "account", debit_account_id: form.debit === "statement_bank" ? null : form.debit,
      credit_source: form.credit === "statement_bank" ? "statement_bank" : "account", credit_account_id: form.credit === "statement_bank" ? null : form.credit,
      journal_note_template: form.note.trim(), description_template: form.description.trim(), active: true,
    };
    const { error } = editingId
      ? await supabase.from("monthly_journal_shortcuts").update({ ...values, updated_at: new Date().toISOString() }).eq("id", editingId)
      : await supabase.from("monthly_journal_shortcuts").insert(values);
    if (error) return setMessage(error.message);
    const savedName = form.name.trim();
    let refreshed = 0;
    try { if (editingId) refreshed = await refreshLinkedWording(editingId, values.journal_note_template, values.description_template); }
    catch (refreshError) { return setMessage(refreshError instanceof Error ? refreshError.message : "Shortcut was saved, but its linked entries could not be refreshed."); }
    setForm(blankForm()); setEditingId(null);
    setMessage(editingId ? `${savedName} updated. ${refreshed} linked transaction${refreshed === 1 ? "" : "s"} refreshed.` : "Shortcut saved. It is now available as a button in Bank Statement Inbox.");
    await load();
  }

  function edit(shortcut: Shortcut) {
    setForm({ name: shortcut.name, bankFilter: shortcut.bank_filter, direction: shortcut.transaction_direction, dateRule: shortcut.accounting_date_rule, debit: shortcut.debit_source === "statement_bank" ? "statement_bank" : shortcut.debit_account_id ?? "", credit: shortcut.credit_source === "statement_bank" ? "statement_bank" : shortcut.credit_account_id ?? "", note: shortcut.journal_note_template, description: shortcut.description_template });
    setEditingId(shortcut.id); setMessage("");
  }

  function cancelEdit() { setForm(blankForm()); setEditingId(null); }

  async function copyTemplateCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setMessage(`${command} copied. Paste it into either template.`);
    } catch {
      setMessage(`Copy ${command} and paste it into either template.`);
    }
  }

  async function remove(shortcut: Shortcut) {
    if (!supabase) return;
    const { error } = await supabase.from("monthly_journal_shortcuts").delete().eq("id", shortcut.id);
    if (error) return setMessage(error.message);
    setMessage(`${shortcut.name} was permanently removed.`); await load();
  }

  return <div className={styles.shortcutLayout}>
    <form className={styles.card} onSubmit={save}>
      <p className={styles.eyebrow}>{editingId ? "EDIT SHORTCUT" : "NEW SHORTCUT"}</p><h2>{editingId ? "Edit posting shortcut" : "Create a posting shortcut"}</h2><p className={styles.muted}>A shortcut posts a complete debit and credit entry. The statement bank is always one side of that entry.</p>
      <label>Shortcut name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example: Meta ads" required /></label>
      <div className={styles.dates}><label>Statement bank<select value={form.bankFilter} onChange={(event) => setForm({ ...form, bankFilter: event.target.value as Form["bankFilter"] })}><option value="any">Any bank</option><option value="Maybank">Maybank only</option><option value="Public Bank">Public Bank only</option><option value="Touch 'n Go eWallet">Touch 'n Go eWallet only</option></select></label><label>Statement movement<select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Form["direction"] })}><option value="money_out">Money out</option><option value="money_in">Money in</option></select></label></div>
      <div className={styles.dates}><label>Debit account<select value={form.debit} onChange={(event) => setForm({ ...form, debit: event.target.value })}><option value="">Choose debit account</option><option value="statement_bank">Bank account from statement</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label><label>Credit account<select value={form.credit} onChange={(event) => setForm({ ...form, credit: event.target.value })}><option value="">Choose credit account</option><option value="statement_bank">Bank account from statement</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
      <p className={styles.templateHint}><b>Posting preview:</b> Debit {form.debit === "statement_bank" ? "Bank from statement" : sourceLabel(form.debit, accounts)}; Credit {form.credit === "statement_bank" ? "Bank from statement" : sourceLabel(form.credit, accounts)}.</p>
      <label>Accounting date<select value={form.dateRule} onChange={(event) => setForm({ ...form, dateRule: event.target.value as Form["dateRule"] })}><option value="same_day">Same as paid date</option><option value="previous_month_end">Previous month end</option></select></label>
      <label>Journal note template<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Example: Shopify subscription - {month}" /></label>
      <label>Description template<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Example: Shopify software for {month}" /></label>
      <div className={styles.templateCommands}>
        <p>Copy a command, then paste it into a template.</p>
        <button type="button" onClick={() => void copyTemplateCommand("{paid_date}")}><code>{"{paid_date}"}</code><span>Bank payment date</span></button>
        <button type="button" onClick={() => void copyTemplateCommand("{month}")}><code>{"{month}"}</code><span>Accounting month</span></button>
        <button type="button" onClick={() => void copyTemplateCommand("{previous_month_end}")}><code>{"{previous_month_end}"}</code><span>Last day of the month before the paid date</span></button>
      </div>
      <button className={styles.primary} type="submit">{editingId ? "Save changes" : "Save shortcut"}</button>{editingId && <button className={styles.refresh} type="button" onClick={cancelEdit}>Cancel</button>}
    </form>
    <section className={styles.card}><p className={styles.eyebrow}>SAVED SHORTCUTS</p><h2>Your inbox buttons</h2>{shortcuts.length ? <div className={styles.shortcutList}>{shortcuts.map((shortcut) => <article key={shortcut.id}><div><strong>{shortcut.name}</strong><span>{shortcut.bank_filter === "any" ? "Any bank" : shortcut.bank_filter} · {shortcut.transaction_direction === "money_out" ? "Money out" : "Money in"} · Debit {shortcut.debit_source === "statement_bank" ? "statement bank" : sourceLabel(shortcut.debit_account_id ?? "", accounts)} · Credit {shortcut.credit_source === "statement_bank" ? "statement bank" : sourceLabel(shortcut.credit_account_id ?? "", accounts)}</span></div><div className={styles.shortcutActions}><button type="button" onClick={() => edit(shortcut)}>Edit</button><button type="button" onClick={() => void remove(shortcut)}>Remove</button></div></article>)}</div> : <p className={styles.muted}>No custom shortcuts yet.</p>}</section>
    {message && <p className={styles.message}>{message}</p>}
  </div>;
}

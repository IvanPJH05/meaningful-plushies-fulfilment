"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import styles from "./monthly-journal-workspace.module.css";

type Account = { id: string; name: string; classification: string };
type Shortcut = { id: string; name: string; transaction_direction: "money_in" | "money_out"; target_account_id: string | null; accounting_date_rule: "same_day" | "previous_month_end"; journal_note_template: string; description_template: string; active: boolean };

export function MonthlyJournalShortcuts({ accounts }: { accounts: Account[] }) {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);
  const [message, setMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", direction: "money_out" as Shortcut["transaction_direction"], classification: "operating_expense", account: "", dateRule: "same_day" as Shortcut["accounting_date_rule"], note: "", description: "" });
  const availableAccounts = useMemo(() => accounts.filter((account) => account.classification === form.classification), [accounts, form.classification]);

  async function load() {
    if (!supabase) return;
    const { data, error } = await supabase.from("monthly_journal_shortcuts").select("id,name,transaction_direction,target_account_id,accounting_date_rule,journal_note_template,description_template,active").eq("active", true).order("created_at");
    if (error) setMessage(error.message); else setShortcuts((data ?? []) as Shortcut[]);
  }
  useEffect(() => { void load(); }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !form.name.trim() || !form.account) return setMessage("Give the shortcut a name and choose an account.");
    const values = {
      name: form.name.trim(), transaction_direction: form.direction, target_account_id: form.account, accounting_date_rule: form.dateRule,
      journal_note_template: form.note.trim(), description_template: form.description.trim(), active: true,
    };
    const { error } = editingId
      ? await supabase.from("monthly_journal_shortcuts").update({ ...values, updated_at: new Date().toISOString() }).eq("id", editingId)
      : await supabase.from("monthly_journal_shortcuts").insert(values);
    if (error) return setMessage(error.message);
    const savedName = form.name.trim();
    setForm({ name: "", direction: "money_out", classification: "operating_expense", account: "", dateRule: "same_day", note: "", description: "" });
    setEditingId(null);
    setMessage(editingId ? `${savedName} updated.` : "Shortcut saved. It is now available as a button in Bank Statement Inbox.");
    await load();
  }

  function edit(shortcut: Shortcut) {
    const account = accounts.find((item) => item.id === shortcut.target_account_id);
    setForm({ name: shortcut.name, direction: shortcut.transaction_direction, classification: account?.classification ?? "operating_expense", account: shortcut.target_account_id ?? "", dateRule: shortcut.accounting_date_rule, note: shortcut.journal_note_template, description: shortcut.description_template });
    setEditingId(shortcut.id);
    setMessage("");
  }

  function cancelEdit() {
    setForm({ name: "", direction: "money_out", classification: "operating_expense", account: "", dateRule: "same_day", note: "", description: "" });
    setEditingId(null);
  }

  async function remove(shortcut: Shortcut) {
    if (!supabase) return;
    const { error } = await supabase.from("monthly_journal_shortcuts").delete().eq("id", shortcut.id);
    if (error) return setMessage(error.message);
    setMessage(`${shortcut.name} was permanently removed.`);
    await load();
  }

  return <div className={styles.shortcutLayout}>
    <form className={styles.card} onSubmit={save}>
      <p className={styles.eyebrow}>{editingId ? "EDIT SHORTCUT" : "NEW SHORTCUT"}</p><h2>{editingId ? "Edit posting shortcut" : "Create a posting shortcut"}</h2><p className={styles.muted}>Select rows in Bank Statement Inbox, then press this shortcut button to post them together.</p>
      <label>Shortcut name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Example: Meta ads" required /></label>
      <div className={styles.dates}><label>Applies to<select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as Shortcut["transaction_direction"] })}><option value="money_out">Money out</option><option value="money_in">Money in</option></select></label><label>Accounting date<select value={form.dateRule} onChange={(event) => setForm({ ...form, dateRule: event.target.value as Shortcut["accounting_date_rule"] })}><option value="same_day">Same as paid date</option><option value="previous_month_end">Previous month end</option></select></label></div>
      <div className={styles.dates}><label>Classification<select value={form.classification} onChange={(event) => setForm({ ...form, classification: event.target.value, account: "" })}>{["asset", "liability", "equity", "income", "cost_of_sales", "operating_expense"].map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label><label>Account<select value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })}><option value="">Choose an account</option>{availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label></div>
      <label>Journal note template<input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Example: Shopify subscription - {month}" /></label>
      <label>Description template<textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Example: Shopify software for {month}" /></label>
      <p className={styles.templateHint}>Use <b>{"{month}"}</b> for the accounting month and <b>{"{paid_date}"}</b> for the bank date.</p>
      <button className={styles.primary} type="submit">{editingId ? "Save changes" : "Save shortcut"}</button>{editingId && <button className={styles.refresh} type="button" onClick={cancelEdit}>Cancel</button>}
    </form>
    <section className={styles.card}><p className={styles.eyebrow}>SAVED SHORTCUTS</p><h2>Your inbox buttons</h2>{shortcuts.length ? <div className={styles.shortcutList}>{shortcuts.map((shortcut) => <article key={shortcut.id}><div><strong>{shortcut.name}</strong><span>{shortcut.transaction_direction === "money_out" ? "Money out" : "Money in"} · {accounts.find((account) => account.id === shortcut.target_account_id)?.name ?? "Deleted account"} · {shortcut.accounting_date_rule === "previous_month_end" ? "Previous month end" : "Paid date"}</span></div><div className={styles.shortcutActions}><button type="button" onClick={() => edit(shortcut)}>Edit</button><button type="button" onClick={() => void remove(shortcut)}>Remove</button></div></article>)}</div> : <p className={styles.muted}>No custom shortcuts yet.</p>}</section>
    {message && <p className={styles.message}>{message}</p>}
  </div>;
}

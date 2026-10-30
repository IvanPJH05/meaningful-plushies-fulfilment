"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Statement = { id: string; bank: string; filename: string; storage_path: string; first_transaction_date: string; last_transaction_date: string; transaction_count: number; uploaded_at: string };
const banks = ["Maybank", "Public Bank", "Touch 'n Go eWallet"];

export function MonthlyJournalStatements() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");
  const [latestDates, setLatestDates] = useState<Record<string, string>>({});
  async function load() {
    if (!supabase) return;
    setLoading(true);
    try {
      const latest = await Promise.all(banks.map(async (bank) => {
        const result = await supabase!.from("monthly_journal_bank_rows").select("paid_date").eq("bank", bank).order("paid_date", { ascending: false }).limit(1);
        if (result.error) throw result.error;
        return [bank, result.data[0]?.paid_date ?? ""];
      }));
      setLatestDates(Object.fromEntries(latest));
      const all: Statement[] = [];
      for (let from = 0; ; from += 1000) {
        const result = await supabase.from("monthly_journal_statements").select("*").order("uploaded_at", { ascending: false }).order("id").range(from, from + 999);
        if (result.error) throw result.error;
        all.push(...result.data as Statement[]);
        if (result.data.length < 1000) break;
      }
      setStatements(all);
      setError("");
    } catch { setError("Could not load statement history. Please refresh and try again."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const reload = () => { void load(); };
    window.addEventListener("monthly-journal-statement-uploaded", reload);
    return () => window.removeEventListener("monthly-journal-statement-uploaded", reload);
  }, []);

  async function download(statement: Statement) {
    if (!supabase) return;
    setDownloading(statement.id);
    try {
      const { data, error } = await supabase.storage.from("monthly-journal-receipts").download(statement.storage_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = statement.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setError("");
    } catch { setError("Could not download the original PDF. Please try again."); }
    finally { setDownloading(""); }
  }

  return <section className="mj-panel" style={{ marginBottom: 16 }} aria-label="Bank statement history">
    <h2>Latest uploaded statement by bank</h2>
    <p>Latest means most recently uploaded. Date ranges below show the transactions found in each PDF.</p>
    {loading ? <p>Loading statements…</p> : error ? <p role="alert">{error} <button onClick={() => void load()}>Refresh</button></p> : <div className="mj-table"><table>
      <thead><tr><th>Bank</th><th>Latest statement</th><th>Transaction dates</th><th>Uploaded</th><th>Original PDF</th></tr></thead>
      <tbody>{[...new Set([...banks, ...statements.map((s) => s.bank)])].map((bank) => {
        const latest = statements.find((s) => s.bank === bank);
        return <tr key={bank}><td>{bank}</td><td>{latest?.filename ?? "No original saved yet"}</td><td>{latest ? `${latest.first_transaction_date} – ${latest.last_transaction_date}` : latestDates[bank] ? `Latest saved transaction: ${latestDates[bank]}` : "No transactions imported"}</td><td>{latest ? new Date(latest.uploaded_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" }) : "Upload date not recorded"}</td><td>{latest && <button disabled={!!downloading} onClick={() => void download(latest)}>{downloading === latest.id ? "Downloading…" : "Download original"}</button>}</td></tr>;
      })}</tbody>
    </table></div>}
    <p><small>Older imports saved transactions only. Upload those PDFs again to retain their originals; existing duplicate transactions will be skipped.</small></p>
    {!!statements.length && <details><summary>All uploaded statements ({statements.length})</summary><div className="mj-table"><table><thead><tr><th>Bank / filename</th><th>Transaction dates</th><th>Uploaded</th><th>Original PDF</th></tr></thead><tbody>{statements.map((s) => <tr key={s.id}><td>{s.bank}<br />{s.filename}</td><td>{s.first_transaction_date} – {s.last_transaction_date}<br />{s.transaction_count} transactions</td><td>{new Date(s.uploaded_at).toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" })}</td><td><button disabled={!!downloading} onClick={() => void download(s)}>{downloading === s.id ? "Downloading…" : "Download original"}</button></td></tr>)}</tbody></table></div></details>}
  </section>;
}

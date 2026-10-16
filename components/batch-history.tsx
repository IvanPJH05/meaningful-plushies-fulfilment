"use client";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./dashboard-language";
import { LoadingIndicator } from "./loading-indicator";
type Batch = { id: string; number: number; stage: string; created_at: string; completed_at: string | null };
type Event = { id: number; action: string; actor: string; created_at: string; details: { legacy?: boolean; fromStage?: string; toStage?: string; orderNumbers?: string[] } };
const actions: Record<string,string> = { created: "Batch created", add: "Orders added", labels: "Shipping labels paired", envelope_names: "Envelope names saved", nfc: "NFC card written", completed: "Batch completed", packing_slips_generated: "Packing slips generated", envelopes_generated: "Envelopes generated", audio_zip_download_started: "Audio ZIP download started" };
const stages: Record<string,string> = { labels: "Upload shipping labels", printing: "Packing slips + shipping labels", envelopes: "Generate envelopes", audio: "Download audio ZIP", nfc: "Write NFC cards", complete: "Batch complete" };
function orderLabel(number: string) { const match = number.match(/\b(TT\d+)\b\s+(\d+)/i); return match ? `${match[1]} ${match[2].slice(-4)}` : `#${number}`; }
export function BatchHistory({ token }: { token: string }) {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<Batch[]>([]), [id, setId] = useState(""), [batch, setBatch] = useState<Batch | null>(null), [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [moreBatches, setMoreBatches] = useState(false), [moreEvents, setMoreEvents] = useState(false);
  const generation = useRef(0), controller = useRef<AbortController | null>(null);
  async function request(path: string, signal: AbortSignal) { const response = await fetch(`/api/fulfilment/batches/history${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load batch history."); return result; }
  async function load(selected: string, more = false) {
    controller.current?.abort(); const active = new AbortController(); controller.current = active;
    const version = ++generation.current;
    setLoading(true); setError("");
    try {
      const before = more ? selected ? events.at(-1)?.id : batches.at(-1)?.number : undefined;
      const result = await request(`${selected ? `?id=${selected}` : ""}${before ? `${selected ? "&" : "?"}before=${before}` : ""}`, active.signal);
      if (version !== generation.current) return;
      if (selected) { setBatch(result.batch); setEvents(current => more ? [...current,...result.events] : result.events); setMoreEvents(result.more); }
      else { setBatches(current => more ? [...current,...result.batches] : result.batches); setMoreBatches(result.more); }
    } catch (error) { if (!active.signal.aborted) setError(error instanceof Error ? error.message : "Could not load batch history."); }
    finally { if (version === generation.current) setLoading(false); }
  }
  useEffect(() => { setEvents([]); setBatch(null); void load(id); return () => { controller.current?.abort(); generation.current++; }; /* Loading depends on selection, not pagination state. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token,id]);
  const timestamp = (value: string) => new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return <section className="batch-workspace"><div className="card batch-picker"><label>{t("Choose batch")}<select value={id} disabled={loading} onChange={event => setId(event.target.value)}><option value="">{t("Choose a batch")}</option>{batches.map(item => <option key={item.id} value={item.id}>{t("Batch")} {item.number} · {t(stages[item.stage])}</option>)}</select></label><button className="button secondary" disabled={loading} onClick={() => void load(id)}>{t("Refresh")}</button>{moreBatches && !id && <button className="button secondary" disabled={loading} onClick={() => void load("",true)}>{t("Load older batches")}</button>}</div>
    {loading && <LoadingIndicator>{t("Loading batch history...")}</LoadingIndicator>}{error && <p className="batch-error" role="alert">{t(error)} <button onClick={() => void load(id)}>{t("Retry")}</button></p>}
    {!loading && !id && <div className="card batch-step"><h2>{t("Batch history")}</h2><p>{t("Choose a batch to see its action timestamps.")}</p>{!batches.length && <p>{t("No batches yet.")}</p>}</div>}
    {batch && <div className="card batch-step"><h2>{t("Batch")} {batch.number} · {t(stages[batch.stage])}</h2><p>{t("Timestamps use this computer's local time.")}</p><p className="batch-history-note">{t("For older batches, only previously recorded timestamps are available.")}</p><ol className="batch-history-timeline">{events.map(event => <li key={event.id}><time dateTime={event.created_at}>{timestamp(event.created_at)}</time><div><strong>{event.action === "advance" ? `${t(stages[event.details.fromStage ?? ""] ?? "Batch")} · ${t("Completed")}` : t(actions[event.action] ?? event.action)}</strong>{Boolean(event.details.orderNumbers?.length) && <p>{event.details.orderNumbers?.map(orderLabel).join(", ")}</p>}<small>{event.actor === "Unknown" ? t("Staff member not recorded") : event.actor}</small></div></li>)}</ol>{moreEvents && <button className="button secondary" disabled={loading} onClick={() => void load(id,true)}>{t("Load older actions")}</button>}</div>}
  </section>;
}

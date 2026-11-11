"use client";
import { useEffect, useState } from "react";
import type { ManualOrderIntakeDetails, ManualOrderIntakeEdit } from "../lib/manual-order-intakes";
import { manualOrderCharactersForProduct, manualOrderProductFamily } from "../lib/manual-order-products";
import { useLanguage } from "./dashboard-language";

function draftFor(details: ManualOrderIntakeDetails): ManualOrderIntakeEdit {
  const intake = details.intake;
  return { expectedUpdatedAt: intake.updatedAt, customerName: intake.customerName, customerEmail: intake.customerEmail, phone: intake.phoneOriginal, character: intake.character, productKey: intake.productKey, shippingRegion: intake.shippingRegion, shippingAddress: { ...intake.shippingAddress }, form: { plushName: "", gender: "", birthDate: "", birthPlace: "", favouritePerson: "", belongsTo: "", meaningfulNote: "", ...details.form }, isCod: intake.isCod, paymentReceipts: intake.paymentReceipts.filter(receipt => /^https?:\/\//i.test(receipt.url)) };
}

export function ManualOrderIntakeEditor({ details, sessionToken, onSave, onClose }: {
  details: ManualOrderIntakeDetails;
  sessionToken: string;
  onSave: (changes: ManualOrderIntakeEdit, create: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(() => draftFor(details));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [voiceName, setVoiceName] = useState(details.voiceFileName);
  useEffect(() => { setDraft(draftFor(details)); setVoiceName(details.voiceFileName); }, [details]);
  const product = details.products.find(item => item.key === draft.productKey);
  const charm = Boolean(product && manualOrderProductFamily(product) === "plush_charm");
  const characters = product ? manualOrderCharactersForProduct(product) : [draft.character];
  const locked = saving || Boolean(uploading);
  const field = (label: string, value: string, change: (value: string) => void, required = true, type = "text", maxLength?: number) => <label>{t(label)}<input type={type} value={value} required={required} maxLength={maxLength} disabled={locked} onChange={event => change(event.target.value)} /></label>;
  const addressField = (label: string, key: keyof ManualOrderIntakeEdit["shippingAddress"], required = true) => field(label, draft.shippingAddress[key] || "", value => setDraft(current => ({ ...current, shippingAddress: { ...current.shippingAddress, [key]: value } })), required);
  async function api(body: object) {
    const response = await fetch("/api/manual-order-intakes", { method: "POST", headers: { "Content-Type": "application/json", "x-dashboard-session": sessionToken }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Could not update the submission.");
    return result;
  }
  async function replaceVoice(file: File) {
    setUploading("voice"); setError(""); setMessage("");
    try {
      const result = await api({ action: "edit_voice_upload", id: details.intake.id, fileName: file.name, contentType: file.type, size: file.size });
      const data = new FormData(); data.append("", file);
      const response = await fetch(result.upload.signedUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: data });
      if (!response.ok) throw new Error("Could not upload the replacement voice. The original voice is unchanged.");
      setDraft(current => ({ ...current, voiceStoragePath: result.upload.path })); setVoiceName(file.name);
      setMessage("Replacement voice uploaded. Save changes to use it.");
    } catch (error) { setError(error instanceof Error ? error.message : "Voice upload failed."); }
    finally { setUploading(""); }
  }
  async function addReceipts(files: File[]) {
    setUploading("receipts"); setError("");
    try {
      for (const file of files) {
        const data = new FormData(); data.append("file", file);
        const response = await fetch("/api/media-assets", { method: "POST", body: data });
        const result = await response.json();
        if (!response.ok || !result.ok || !result.asset?.originalUrl) throw new Error(result.error || "Receipt upload failed.");
        setDraft(current => ({ ...current, paymentReceipts: [...current.paymentReceipts, { fileName: file.name, url: result.asset.originalUrl }] }));
      }
    } catch (error) { setError(error instanceof Error ? error.message : "Receipt upload failed."); }
    finally { setUploading(""); }
  }
  async function save(create: boolean) {
    setSaving(true); setError(""); setMessage("");
    try { await onSave(draft, create); setMessage(create ? "Order created." : "Changes saved."); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not save changes."); }
    finally { setSaving(false); }
  }
  return <div className="document-preview-backdrop" role="dialog" aria-modal="true" aria-label={t("Edit manual order submission")}><section className="linked-transaction-modal manual-intake-editor">
    <header><div><p>{t("EDIT MANUAL ORDER")}</p><h2>{details.intake.customerName}</h2><span>{details.intake.reference}</span></div><button className="button secondary" type="button" disabled={locked} onClick={onClose}>{t("Close")}</button></header>
    <form onSubmit={event => { event.preventDefault(); void save(false); }}>
      <div className="linked-transaction-body">
        {error && <p className="batch-error" role="alert">{t(error)}</p>}{message && <p role="status">{t(message)}</p>}
        <h3>{t("Customer details")}</h3><div className="manual-intake-editor-grid">
          {field("Full customer name", draft.customerName, customerName => setDraft(current => ({ ...current, customerName })), true, "text", 120)}
          {field("Phone", draft.phone, phone => setDraft(current => ({ ...current, phone })), true, "tel", 40)}
          {field("Email", draft.customerEmail, customerEmail => setDraft(current => ({ ...current, customerEmail })), true, "email", 254)}
        </div>
        <h3>{t("Product and delivery")}</h3><div className="manual-intake-editor-grid">
          <label>{t("Product and voice length")}<select value={draft.productKey} disabled={locked} onChange={event => { const productKey = event.target.value; const selected = details.products.find(product => product.key === productKey); const allowed = selected ? manualOrderCharactersForProduct(selected) : []; setDraft(current => ({ ...current, productKey, character: allowed.some(value => value === current.character) ? current.character : allowed[0] || "" })); }}>{!product && <option value={draft.productKey}>{details.intake.productDisplayName}</option>}{details.products.map(product => <option key={product.key} value={product.key}>{product.displayName}</option>)}</select></label>
          <label>{t("Character")}<select value={draft.character} disabled={locked} onChange={event => setDraft(current => ({ ...current, character: event.target.value }))}>{characters.map(character => <option key={character} value={character}>{character}</option>)}</select></label>
          <label>{t("Shipping region")}<select value={draft.shippingRegion} disabled={locked} onChange={event => setDraft(current => ({ ...current, shippingRegion: event.target.value as "WEST" | "EAST" }))}><option value="WEST">{t("West Malaysia")}</option><option value="EAST">{t("East Malaysia")}</option></select></label>
          {addressField("Address line 1", "address1")}{addressField("Address line 2", "address2", false)}{addressField("City", "city")}{addressField("State", "province")}{addressField("Postcode", "zip")}{addressField("Country code", "countryCode")}
        </div>
        <h3>{t("Customisation")}</h3><div className="manual-intake-editor-grid">{([ ["Plush name", "plushName"], ["Gender", "gender"], ["Born on", "birthDate"], ["Birthplace", "birthPlace"], ["Favourite person", "favouritePerson"], ["Belongs to", "belongsTo"] ] as const).map(([label, key]) => <div key={key}>{field(label, draft.form[key], value => setDraft(current => ({ ...current, form: { ...current.form, [key]: value } })), !charm, "text", key === "gender" ? 30 : 20)}</div>)}</div>
        <label>{t("Meaningful note")}<textarea value={draft.form.meaningfulNote} required={!charm} rows={5} disabled={locked} onChange={event => setDraft(current => ({ ...current, form: { ...current.form, meaningfulNote: event.target.value } }))} /></label>
        <h3>{t("Voice message")}</h3><p>{voiceName || t("No voice uploaded")}</p>{details.voiceUrl && <a href={details.voiceUrl} target="_blank" rel="noreferrer">{t("Open current voice file")}</a>}
        <label>{t("Replace voice message")}<input type="file" accept="audio/*,video/*,.mp3,.mp4,.m4a,.ogg,.oga,.wav,.webm,.mov" disabled={locked} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void replaceVoice(file); }} /></label>
        <h3>{t("Payment and receipts")}</h3><label className="manual-intake-cod"><input type="checkbox" checked={draft.isCod} disabled={locked} onChange={event => setDraft(current => ({ ...current, isCod: event.target.checked }))} />{t("Cash on delivery")}</label>
        {draft.paymentReceipts.map((receipt, index) => <div className="manual-intake-receipt" key={index}>{field("Receipt filename", receipt.fileName, fileName => setDraft(current => ({ ...current, paymentReceipts: current.paymentReceipts.map((item, i) => i === index ? { ...item, fileName } : item) })), true)}{field("Receipt URL", receipt.url, url => setDraft(current => ({ ...current, paymentReceipts: current.paymentReceipts.map((item, i) => i === index ? { ...item, url } : item) })), true, "url")}<button className="button danger small" type="button" disabled={locked} onClick={() => setDraft(current => ({ ...current, paymentReceipts: current.paymentReceipts.filter((_, i) => i !== index) }))}>{t("Remove receipt")}</button></div>)}
        <label>{t("Add payment receipts")}<input type="file" multiple accept="image/*,.pdf" disabled={locked} onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ""; if (files.length) void addReceipts(files); }} /></label>
        {uploading && <p role="status">{t("Uploading...")}</p>}
      </div>
      <footer className="manual-intake-editor-footer"><button className="button secondary" type="button" disabled={locked} onClick={onClose}>{t("Cancel")}</button><button className="button primary" type="submit" disabled={locked}>{t(saving ? "Saving..." : "Save changes")}</button>{(draft.isCod || draft.paymentReceipts.length > 0) && <button className="button primary" type="button" disabled={locked} onClick={event => { const form = event.currentTarget.form; if (form?.reportValidity()) void save(true); }}>{t("Save and create order")}</button>}</footer>
    </form>
  </section></div>;
}

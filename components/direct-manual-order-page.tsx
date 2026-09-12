"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import styles from "./direct-manual-order-page.module.css";

type ApiReply = {
  ok?: boolean;
  error?: string;
  session?: { token: string };
  upload?: { signedUrl: string; path: string };
};

const states = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang",
  "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu",
];

async function request(body: Record<string, unknown>): Promise<ApiReply> {
  const response = await fetch("/apps/closer/manual-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as ApiReply;
  if (!response.ok || !data.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function DirectManualOrderPage() {
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const voice = data.get("voice");
    if (!(voice instanceof File) || !voice.size) {
      setNotice("Please record or choose a voice message for your plushie.");
      return;
    }
    if (voice.size > 50 * 1024 * 1024) {
      setNotice("Your voice message must be 50 MB or smaller.");
      return;
    }

    setSaving(true);
    setNotice("Saving your details…");
    try {
      const started = await request({ action: "start" });
      if (!started.session?.token) throw new Error("Could not start your order.");
      const upload = await request({
        action: "prepare_voice_upload",
        sessionToken: started.session.token,
        fileName: voice.name || "voice-message.webm",
        contentType: voice.type || "audio/webm",
      });
      if (!upload.upload?.signedUrl || !upload.upload.path) throw new Error("Could not prepare your voice message.");
      const voiceUpload = await fetch(upload.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": voice.type || "application/octet-stream" },
        body: voice,
      });
      if (!voiceUpload.ok) throw new Error("Your voice message could not be uploaded. Please try again.");

      await request({
        action: "submit",
        sessionToken: started.session.token,
        voiceStoragePath: upload.upload.path,
        customerName: data.get("customerName"),
        customerEmail: data.get("customerEmail"),
        phone: data.get("phone"),
        character: data.get("character"),
        productKey: data.get("productKey"),
        shippingRegion: data.get("shippingRegion"),
        shippingAddress: {
          address1: data.get("address1"), address2: data.get("address2"), city: data.get("city"),
          province: data.get("province"), zip: data.get("zip"), countryCode: "MY",
        },
        form: {
          plushName: data.get("plushName"), gender: data.get("gender"), birthDate: data.get("birthDate"),
          birthPlace: data.get("birthPlace"), favouritePerson: data.get("favouritePerson"),
          belongsTo: data.get("belongsTo"), meaningfulNote: data.get("meaningfulNote"),
        },
      });
      form.reset();
      setNotice("Your details are saved. We will confirm payment and create your Shopify order shortly.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>meaningful<br /><span>PLUSHIES</span></Link><p>CREATE YOUR PLUSHIE</p></header>
    <section className={styles.intro}>
      <p className={styles.eyebrow}>A PLUSHIE MADE FOR YOU</p>
      <h1>Tell us your plushie’s story.</h1>
      <p>Complete the birth certificate and delivery details below. Your information is saved directly to our fulfilment team, who will prepare your order after payment is confirmed.</p>
    </section>
    <form className={styles.form} onSubmit={submit}>
      <section className={styles.card}>
        <div className={styles.step}><span>1</span><div><p>YOUR DETAILS</p><h2>Who is this plushie for?</h2></div></div>
        <div className={styles.grid}>
          <label>Full name<input required name="customerName" autoComplete="name" /></label>
          <label>Phone number<input required name="phone" inputMode="tel" autoComplete="tel" placeholder="0123456789" /></label>
          <label className={styles.wide}>Email <small>Optional</small><input name="customerEmail" type="email" autoComplete="email" /></label>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.step}><span>2</span><div><p>BIRTH CERTIFICATE</p><h2>Your plushie’s details</h2></div></div>
        <p className={styles.help}>These details appear on your plushie’s meaningful birth certificate.</p>
        <div className={styles.grid}>
          <label>Character<select required name="character"><option value="Billy">Billy</option><option value="Tootsie">Tootsie</option><option value="Hunnie">Hunnie</option><option value="Dragon Warrior">Dragon Warrior</option></select></label>
          <label>Voice message length<select required name="productKey"><option value="plushie_5s">5 seconds</option><option value="plushie_10s">10 seconds</option><option value="plushie_20s">20 seconds</option></select></label>
          <label>Plushie’s name<input required name="plushName" maxLength={20} /></label>
          <label>Gender<select required name="gender"><option value="Male">Male</option><option value="Female">Female</option></select></label>
          <label>Birth date<input required name="birthDate" type="date" /></label>
          <label>Birth place<input required name="birthPlace" maxLength={50} /></label>
          <label>Favourite person<input required name="favouritePerson" maxLength={50} /></label>
          <label>Plushie belongs to<input required name="belongsTo" maxLength={50} /></label>
          <label className={styles.wide}>Meaningful note<textarea required name="meaningfulNote" rows={4} placeholder="A sweet message for your plushie…" /></label>
          <label className={styles.wide}>Voice message<input required name="voice" type="file" accept="audio/*" capture="user" /><small>Use your phone to record a message, or choose an audio file. Maximum 50 MB.</small></label>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.step}><span>3</span><div><p>SHIPPING INFORMATION</p><h2>Where should we send your plushie?</h2></div></div>
        <div className={styles.grid}>
          <label className={styles.wide}>Address<input required name="address1" autoComplete="address-line1" /></label>
          <label className={styles.wide}>Address line 2 <small>Optional</small><input name="address2" autoComplete="address-line2" /></label>
          <label>City<input required name="city" autoComplete="address-level2" /></label>
          <label>State<select required name="province">{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
          <label>Postcode<input required name="zip" inputMode="numeric" autoComplete="postal-code" /></label>
          <label>Delivery region<select required name="shippingRegion"><option value="WEST">West Malaysia</option><option value="EAST">East Malaysia (+RM20 delivery)</option></select></label>
        </div>
      </section>

      <button className={styles.submit} type="submit" disabled={saving}>{saving ? "Saving your details…" : "Save my plushie’s details"}</button>
      <p className={notice.includes("saved") ? styles.success : styles.notice} aria-live="polite">{notice}</p>
    </form>
  </main>;
}

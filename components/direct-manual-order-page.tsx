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

export type LockedPlushie = {
  character: "Billy" | "Tootsie" | "Dragon Warrior" | "Hunnie";
  productKey: "plushie_5s" | "plushie_10s" | "plushie_20s";
};

const states = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang",
  "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu",
];

async function request(apiUrl: string, body: Record<string, unknown>, collectionCode?: string): Promise<ApiReply> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(collectionCode ? { ...body, collectionCode } : body),
  });
  const data = await response.json().catch(() => ({})) as ApiReply;
  if (!response.ok || !data.ok) throw new Error(data.error || "Please try again.");
  return data;
}

export function DirectManualOrderPage({
  lockedPlushie,
  apiUrl = "/apps/closer/manual-order",
  collectionCode,
}: {
  lockedPlushie?: LockedPlushie;
  apiUrl?: string;
  collectionCode?: string;
}) {
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
      const started = await request(apiUrl, { action: "start" }, collectionCode);
      if (!started.session?.token) throw new Error("Could not start your order.");
      const upload = await request(apiUrl, {
        action: "prepare_voice_upload",
        sessionToken: started.session.token,
        fileName: voice.name || "voice-message.webm",
        contentType: voice.type || "audio/webm",
      }, collectionCode);
      if (!upload.upload?.signedUrl || !upload.upload.path) throw new Error("Could not prepare your voice message.");
      const voiceUpload = await fetch(upload.upload.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": voice.type || "application/octet-stream" },
        body: voice,
      });
      if (!voiceUpload.ok) throw new Error("Your voice message could not be uploaded. Please try again.");

      await request(apiUrl, {
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
      }, collectionCode);
      form.reset();
      setNotice("Your details are saved. We will confirm payment and create your Shopify order shortly.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Your details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>MEANINGFUL PLUSHIES</Link></header>
    <form className={styles.form} onSubmit={submit}>
      <h1>CUSTOMISE YOUR PLUSHIE</h1>
      <h2>YOUR PLUSHIE’S BIRTH CERTIFICATE</h2>
      {lockedPlushie ? <div className={styles.lockedProduct}><span>YOUR PLUSHIE</span><strong>{lockedPlushie.character} · {lockedPlushie.productKey.replace("plushie_", "").replace("s", " seconds voice")}</strong><input type="hidden" name="character" value={lockedPlushie.character} /><input type="hidden" name="productKey" value={lockedPlushie.productKey} /></div> : <><label>Character<select required name="character"><option value="Billy">Billy</option><option value="Tootsie">Tootsie</option><option value="Hunnie">Hunnie</option><option value="Dragon Warrior">Dragon Warrior</option></select></label><label>Voice Length<select required name="productKey"><option value="plushie_5s">5 seconds voice</option><option value="plushie_10s">10 seconds voice</option><option value="plushie_20s">20 seconds voice</option></select></label></>}
      <label>Plushie&apos;s Name<input required name="plushName" maxLength={20} placeholder="Name your plushie" /></label>
      <label>Plushie&apos;s Gender<select required name="gender"><option value="Male">Male</option><option value="Female">Female</option></select></label>
      <label>Plushie&apos;s Birth Date<input required name="birthDate" type="text" placeholder="A meaningful date" /></label>
      <label>Plushie&apos;s Birth Place<input required name="birthPlace" maxLength={50} placeholder="A meaningful place" /></label>
      <label>Plushie&apos;s Favourite Person<input required name="favouritePerson" maxLength={50} placeholder="A meaningful person" /></label>
      <label>Plushie Belongs To<input required name="belongsTo" maxLength={50} placeholder="The plushie&apos;s owner" /></label>
      <label>Meaningful Note<textarea required name="meaningfulNote" rows={4} placeholder="A message for the plushie&apos;s owner" /></label>
      <label>Upload Your Voice Here<span className={styles.uploadButton}>UPLOAD VOICE (MP4/MP3)<input required name="voice" type="file" accept="audio/*" capture="user" /></span><small>Record a message or choose an audio file (maximum 50 MB).</small></label>

      <h2>YOUR SHIPPING INFORMATION</h2>
      <label>Full Name<input required name="customerName" autoComplete="name" placeholder="Your full name" /></label>
      <label>Phone Number<input required name="phone" inputMode="tel" autoComplete="tel" placeholder="0123456789" /></label>
      <label>Email <small>Optional</small><input name="customerEmail" type="email" autoComplete="email" placeholder="Your email address" /></label>
      <label>Address<input required name="address1" autoComplete="address-line1" placeholder="House number, street, area" /></label>
      <label>Address Line 2 <small>Optional</small><input name="address2" autoComplete="address-line2" placeholder="Apartment, unit, etc." /></label>
      <label>City<input required name="city" autoComplete="address-level2" placeholder="Your city" /></label>
      <label>State<select required name="province">{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
      <label>Postcode<input required name="zip" inputMode="numeric" autoComplete="postal-code" placeholder="Your postcode" /></label>
      <label>Delivery Region<select required name="shippingRegion"><option value="WEST">West Malaysia</option><option value="EAST">East Malaysia (+RM20 delivery)</option></select></label>
      <button className={styles.submit} type="submit" disabled={saving}>{saving ? "SAVING YOUR DETAILS…" : "SAVE MY CUSTOMISATION"}</button>
      <p className={notice.includes("saved") ? styles.success : styles.notice} aria-live="polite">{notice}</p>
      <footer><Link href="/policies/terms-of-service">Terms and Policies</Link><span>© 2026 MEANINGFUL PLUSHIES</span></footer>
    </form>
  </main>;
}

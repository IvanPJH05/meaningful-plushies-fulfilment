"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import styles from "./direct-manual-order-page.module.css";

type ApiReply = {
  ok?: boolean;
  error?: string;
  session?: { token: string };
  upload?: { signedUrl: string; path: string };
  reference?: string;
  whatsAppUrl?: string;
};

export type LockedPlushie = {
  character: "Billy" | "Tootsie" | "Dragon Warrior" | "Hunnie";
  productKey: "plushie_5s" | "plushie_10s" | "plushie_20s";
};

const states = [
  "Johor", "Kedah", "Kelantan", "Kuala Lumpur", "Labuan", "Melaka", "Negeri Sembilan", "Pahang",
  "Penang", "Perak", "Perlis", "Putrajaya", "Sabah", "Sarawak", "Selangor", "Terengganu",
];

const translations = {
  en: {
    language: "Bahasa Melayu", title: "CUSTOMISE YOUR PLUSHIE", certificate: "YOUR PLUSHIE'S BIRTH CERTIFICATE", yourPlushie: "YOUR PLUSHIE", character: "Character", voiceLength: "Voice Length", secondsVoice: "seconds voice",
    plushName: "Plushie's Name", plushNamePlaceholder: "Name your plushie", gender: "Plushie's Gender", male: "Male", female: "Female", birthDate: "Plushie's Birth Date", birthDatePlaceholder: "A meaningful date", birthPlace: "Plushie's Birth Place", birthPlacePlaceholder: "A meaningful place",
    favouritePerson: "Plushie's Favourite Person", favouritePersonPlaceholder: "A meaningful person", belongsTo: "Plushie Belongs To", belongsToPlaceholder: "The plushie's owner", meaningfulNote: "Meaningful Note", meaningfulNotePlaceholder: "A message for the plushie's owner",
    uploadVoice: "Upload Your Voice Here", uploadButton: "UPLOAD VOICE (MP4/MP3)", uploadHint: "Record a message or choose an audio file (maximum 50 MB).", shipping: "YOUR SHIPPING INFORMATION", fullName: "Full Name", fullNamePlaceholder: "Your full name", phone: "Phone Number", email: "Email", emailPlaceholder: "Your email address",
    address: "Address", addressPlaceholder: "House number, street, area", addressLine2: "Address Line 2", optional: "Optional", addressLine2Placeholder: "Apartment, unit, etc.", city: "City", cityPlaceholder: "Your city", state: "State", postcode: "Postcode", postcodePlaceholder: "Your postcode", deliveryRegion: "Delivery Region", westMalaysia: "West Malaysia", eastMalaysia: "East Malaysia (+RM20 delivery)",
    saving: "SAVING YOUR DETAILS…", submit: "SAVE MY CUSTOMISATION", terms: "Terms and Policies", missingVoice: "Please record or choose a voice message for your plushie.", voiceTooLarge: "Your voice message must be 50 MB or smaller.", savingDetails: "Saving your details…", saved: "Your details are saved. Your reference is", openingWhatsApp: "Opening WhatsApp now…", sendWhatsApp: "Please send this reference to us on WhatsApp.", saveFailed: "Your details could not be saved.",
  },
  ms: {
    language: "English", title: "SESUAIKAN PLUSHIE ANDA", certificate: "SIJIL KELAHIRAN PLUSHIE ANDA", yourPlushie: "PLUSHIE ANDA", character: "Watak", voiceLength: "Tempoh Suara", secondsVoice: "saat suara",
    plushName: "Nama Plushie", plushNamePlaceholder: "Namakan plushie anda", gender: "Jantina Plushie", male: "Lelaki", female: "Perempuan", birthDate: "Tarikh Lahir Plushie", birthDatePlaceholder: "Tarikh yang bermakna", birthPlace: "Tempat Lahir Plushie", birthPlacePlaceholder: "Tempat yang bermakna",
    favouritePerson: "Orang Kegemaran Plushie", favouritePersonPlaceholder: "Orang yang bermakna", belongsTo: "Plushie Milik", belongsToPlaceholder: "Pemilik plushie", meaningfulNote: "Nota Bermakna", meaningfulNotePlaceholder: "Pesanan untuk pemilik plushie",
    uploadVoice: "Muat Naik Suara Anda", uploadButton: "MUAT NAIK SUARA (MP4/MP3)", uploadHint: "Rakam mesej atau pilih fail audio (maksimum 50 MB).", shipping: "MAKLUMAT PENGHANTARAN ANDA", fullName: "Nama Penuh", fullNamePlaceholder: "Nama penuh anda", phone: "Nombor Telefon", email: "E-mel", emailPlaceholder: "Alamat e-mel anda",
    address: "Alamat", addressPlaceholder: "Nombor rumah, jalan, kawasan", addressLine2: "Alamat Baris 2", optional: "Pilihan", addressLine2Placeholder: "Apartmen, unit dan lain-lain", city: "Bandar", cityPlaceholder: "Bandar anda", state: "Negeri", postcode: "Poskod", postcodePlaceholder: "Poskod anda", deliveryRegion: "Kawasan Penghantaran", westMalaysia: "Semenanjung Malaysia", eastMalaysia: "Malaysia Timur (+RM20 penghantaran)",
    saving: "MENYIMPAN MAKLUMAT ANDA…", submit: "SIMPAN PENYESUAIAN SAYA", terms: "Terma dan Polisi", missingVoice: "Sila rakam atau pilih mesej suara untuk plushie anda.", voiceTooLarge: "Mesej suara anda mestilah 50 MB atau lebih kecil.", savingDetails: "Menyimpan maklumat anda…", saved: "Maklumat anda telah disimpan. Rujukan anda ialah", openingWhatsApp: "Membuka WhatsApp sekarang…", sendWhatsApp: "Sila hantar rujukan ini kepada kami melalui WhatsApp.", saveFailed: "Maklumat anda tidak dapat disimpan.",
  },
} as const;

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
  orderSummaryVideo,
}: {
  lockedPlushie?: LockedPlushie;
  apiUrl?: string;
  collectionCode?: string;
  orderSummaryVideo?: string;
}) {
  const [language, setLanguage] = useState<keyof typeof translations>("en");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const copy = translations[language];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const voice = data.get("voice");
    if (!(voice instanceof File) || !voice.size) {
      setNotice(copy.missingVoice);
      return;
    }
    if (voice.size > 50 * 1024 * 1024) {
      setNotice(copy.voiceTooLarge);
      return;
    }

    setSaving(true);
    setNotice(copy.savingDetails);
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

      const submitted = await request(apiUrl, {
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
      const reference = submitted.reference || "MP-REFERENCE";
      setNotice(submitted.whatsAppUrl ? `${copy.saved} ${reference}. ${copy.openingWhatsApp}` : `${copy.saved} ${reference}. ${copy.sendWhatsApp}`);
      if (submitted.whatsAppUrl) window.location.assign(submitted.whatsAppUrl);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : copy.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link href="/" className={styles.brand}>MEANINGFUL PLUSHIES</Link><button className={styles.languageButton} type="button" onClick={() => setLanguage((current) => current === "en" ? "ms" : "en")}>{copy.language}</button></header>
    <form className={styles.form} onSubmit={submit}>
      <h1>{copy.title}</h1>
      {orderSummaryVideo ? <video className={styles.orderSummaryVideo} autoPlay loop muted playsInline preload="metadata" aria-label="Order summary"><source src={orderSummaryVideo} type="video/mp4" /></video> : null}
      <h2>{copy.certificate}</h2>
      {lockedPlushie ? <div className={styles.lockedProduct}><span>{copy.yourPlushie}</span><strong>{lockedPlushie.character} · {lockedPlushie.productKey.replace("plushie_", "").replace("s", ` ${copy.secondsVoice}`)}</strong><input type="hidden" name="character" value={lockedPlushie.character} /><input type="hidden" name="productKey" value={lockedPlushie.productKey} /></div> : <><label>{copy.character}<select required name="character"><option value="Billy">Billy</option><option value="Tootsie">Tootsie</option><option value="Hunnie">Hunnie</option><option value="Dragon Warrior">Dragon Warrior</option></select></label><label>{copy.voiceLength}<select required name="productKey"><option value="plushie_5s">5 {copy.secondsVoice}</option><option value="plushie_10s">10 {copy.secondsVoice}</option><option value="plushie_20s">20 {copy.secondsVoice}</option></select></label></>}
      <label>{copy.plushName}<input required name="plushName" maxLength={20} placeholder={copy.plushNamePlaceholder} /></label>
      <label>{copy.gender}<select required name="gender"><option value="Male">{copy.male}</option><option value="Female">{copy.female}</option></select></label>
      <label>{copy.birthDate}<input required name="birthDate" type="text" placeholder={copy.birthDatePlaceholder} /></label>
      <label>{copy.birthPlace}<input required name="birthPlace" maxLength={50} placeholder={copy.birthPlacePlaceholder} /></label>
      <label>{copy.favouritePerson}<input required name="favouritePerson" maxLength={50} placeholder={copy.favouritePersonPlaceholder} /></label>
      <label>{copy.belongsTo}<input required name="belongsTo" maxLength={50} placeholder={copy.belongsToPlaceholder} /></label>
      <label>{copy.meaningfulNote}<textarea required name="meaningfulNote" rows={4} placeholder={copy.meaningfulNotePlaceholder} /></label>
      <label>{copy.uploadVoice}<span className={styles.uploadButton}>{copy.uploadButton}<input required name="voice" type="file" accept="audio/*" capture="user" /></span><small>{copy.uploadHint}</small></label>

      <h2>{copy.shipping}</h2>
      <label>{copy.fullName}<input required name="customerName" autoComplete="name" placeholder={copy.fullNamePlaceholder} /></label>
      <label>{copy.phone}<input required name="phone" inputMode="tel" autoComplete="tel" placeholder="0123456789" /></label>
      <label>{copy.email}<input required name="customerEmail" type="email" autoComplete="email" placeholder={copy.emailPlaceholder} /></label>
      <label>{copy.address}<input required name="address1" autoComplete="address-line1" placeholder={copy.addressPlaceholder} /></label>
      <label>{copy.addressLine2} <small>{copy.optional}</small><input name="address2" autoComplete="address-line2" placeholder={copy.addressLine2Placeholder} /></label>
      <label>{copy.city}<input required name="city" autoComplete="address-level2" placeholder={copy.cityPlaceholder} /></label>
      <label>{copy.state}<select required name="province">{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
      <label>{copy.postcode}<input required name="zip" inputMode="numeric" autoComplete="postal-code" placeholder={copy.postcodePlaceholder} /></label>
      <label>{copy.deliveryRegion}<select required name="shippingRegion"><option value="WEST">{copy.westMalaysia}</option><option value="EAST">{copy.eastMalaysia}</option></select></label>
      <button className={styles.submit} type="submit" disabled={saving}>{saving ? copy.saving : copy.submit}</button>
      <p className={notice.includes("saved") ? styles.success : styles.notice} aria-live="polite">{notice}</p>
      <footer><Link href="/policies/terms-of-service">{copy.terms}</Link><span>© 2026 MEANINGFUL PLUSHIES</span></footer>
    </form>
  </main>;
}

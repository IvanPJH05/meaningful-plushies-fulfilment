"use client";

import { createClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import "./customisation.css";

type FormState = Record<"plushName" | "gender" | "birthDate" | "birthPlace" | "favouritePerson" | "belongsTo" | "meaningfulNote", string>;

const blank: FormState = { plushName: "", gender: "", birthDate: "", birthPlace: "", favouritePerson: "", belongsTo: "", meaningfulNote: "" };
const fields: { key: keyof FormState; label: string; placeholder: string; type?: string }[] = [
  { key: "plushName", label: "Plushie's Name", placeholder: "Name your plushie" },
  { key: "birthDate", label: "Plushie's Birth Date", placeholder: "DD/MM/YYYY", type: "text" },
  { key: "birthPlace", label: "Plushie's Birth Place", placeholder: "A meaningful place" },
  { key: "favouritePerson", label: "Plushie's Favourite Person", placeholder: "A meaningful person" },
  { key: "belongsTo", label: "Plushie Belongs To", placeholder: "The plushie's owner" },
  { key: "meaningfulNote", label: "Meaningful Note", placeholder: "A message for the plushie's owner" },
];

export function CustomisationForm({ token }: { token: string }) {
  const [form, setForm] = useState<FormState>(blank);
  const [voice, setVoice] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch(`/api/customisation/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "This link is unavailable.");
        setForm({ ...blank, ...(result.session.form || {}) });
        setSubmitted(Boolean(result.session.submitted));
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "This link is unavailable."))
      .finally(() => setLoading(false));
  }, [token]);

  function change(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!voice) return setNotice("Please upload your voice recording.");
    setSaving(true);
    setNotice("");
    try {
      const uploadResponse = await fetch(`/api/customisation/${encodeURIComponent(token)}/upload`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: voice.name, contentType: voice.type }),
      });
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok) throw new Error(uploadResult.error || "Could not prepare your upload.");
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Upload is not configured yet. Please contact Meaningful Plushies.");
      const storage = createClient(url, key);
      const { error: uploadError } = await storage.storage.from("customisation-audio").uploadToSignedUrl(uploadResult.upload.path, uploadResult.upload.token, voice, { contentType: voice.type });
      if (uploadError) throw new Error(uploadError.message);
      const saveResponse = await fetch(`/api/customisation/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ form, voiceStoragePath: uploadResult.upload.path }),
      });
      const saved = await saveResponse.json();
      if (!saveResponse.ok) throw new Error(saved.error || "Could not save your customisation.");
      setSubmitted(true);
      setNotice("Thank you — your plushie's customisation has been saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save your customisation.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="customise-page"><p>Loading your customisation…</p></main>;
  if (submitted) return <main className="customise-page"><section className="customise-card"><p className="eyebrow">MEANINGFUL PLUSHIES</p><h1>All set!</h1><p>{notice || "Your plushie's birth certificate and voice recording are safely linked to your order."}</p></section></main>;
  if (notice && !form.plushName) return <main className="customise-page"><section className="customise-card"><h1>Link unavailable</h1><p>{notice}</p></section></main>;

  return <main className="customise-page"><form className="customise-card" onSubmit={submit}>
    <p className="eyebrow">MEANINGFUL PLUSHIES</p><h1>Complete your plushie's customisation</h1><p className="intro">Your details will be linked securely to your order.</p>
    <label>Plushie's Gender<select required value={form.gender} onChange={(event) => change("gender", event.target.value)}><option value="">Choose one</option><option>Male</option><option>Female</option><option>Prefer not to say</option></select></label>
    {fields.map((field) => <label key={field.key}>{field.label}<input required type={field.type || "text"} maxLength={field.key === "meaningfulNote" ? undefined : 20} value={form[field.key]} placeholder={field.placeholder} onChange={(event) => change(field.key, event.target.value)} /></label>)}
    <label>Upload Your Voice Here<input required type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/webm,.mp3,.mp4,.m4a,.wav,.webm" onChange={(event) => setVoice(event.target.files?.[0] || null)} /></label>
    {notice && <p className="notice">{notice}</p>}<button disabled={saving}>{saving ? "Saving…" : "Save my customisation"}</button>
  </form></main>;
}

"use client";
import { NotificationMessage } from "./notification-bar";
import { LoadingIndicator } from "./loading-indicator";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { dashboardLanguage, dashboardLanguageStorageKey, translator, type DashboardLanguage, type Translate, type TranslationDictionary } from "../lib/dashboard-language";

// Only immutable copy is shared. Preferences remain local to each provider.
// The dictionary is an optional chunk, outside the initial English bundle.
let dictionaryPromise: Promise<TranslationDictionary> | undefined;
function loadDictionary() {
  return dictionaryPromise ??= import("../lib/dashboard-translations").then(module => module.dashboardTranslations).catch(error => {
    dictionaryPromise = undefined;
    throw error;
  });
}
const warmLanguages = () => { void loadDictionary().catch(() => {}); };
type LanguageState = { language: DashboardLanguage; pending: DashboardLanguage | null; error: boolean; setLanguage: (next: DashboardLanguage) => void; t: Translate };
const LanguageContext = createContext<LanguageState>({ language: "en", pending: null, error: false, setLanguage: () => {}, t: translator("en") });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // Hydration starts in English. Language never becomes a data-loading dependency.
  const [language, updateLanguage] = useState<DashboardLanguage>("en");
  const [dictionary, setDictionary] = useState<TranslationDictionary>({});
  const [pending, setPending] = useState<DashboardLanguage | null>(null);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const activate = useCallback(async (next: DashboardLanguage, persist: boolean) => {
    const valid = dashboardLanguage(next);
    const request = ++generation.current;
    setError(false);
    setPending(valid === "en" ? null : valid);
    try {
      const copy = valid === "en" ? null : await loadDictionary();
      if (!mounted.current || request !== generation.current) return;
      if (copy) setDictionary(copy);
      updateLanguage(valid);
      setPending(null);
      if (persist) try { localStorage.setItem(dashboardLanguageStorageKey, valid); } catch { /* Switching also works with storage disabled. */ }
    } catch {
      if (mounted.current && request === generation.current) { setPending(null); setError(true); }
    }
  }, []);
  const setLanguage = useCallback((next: DashboardLanguage) => { void activate(next, true); }, [activate]);
  useEffect(() => {
    const requests = generation;
    mounted.current = true;
    try { void activate(dashboardLanguage(localStorage.getItem(dashboardLanguageStorageKey)), false); } catch { /* Default to English. */ }
    const changed = (event: StorageEvent) => { if (event.key === dashboardLanguageStorageKey) void activate(dashboardLanguage(event.newValue), false); };
    window.addEventListener("storage", changed);
    let idle: number | undefined;
    const timer = window.setTimeout(() => {
      if ("requestIdleCallback" in window) idle = window.requestIdleCallback(warmLanguages, { timeout: 5000 });
      else warmLanguages();
    }, 1500);
    return () => {
      mounted.current = false;
      requests.current++;
      window.clearTimeout(timer);
      if (idle !== undefined) window.cancelIdleCallback(idle);
      window.removeEventListener("storage", changed);
    };
  }, [activate]);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = language;
    return () => { document.documentElement.lang = previous; };
  }, [language]);
  const value = useMemo(() => ({ language, pending, error, setLanguage, t: translator(language, dictionary) }), [language, pending, error, setLanguage, dictionary]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);

export function LanguageSwitcher() {
  const { language, pending, error, setLanguage, t } = useLanguage();
  return <div className="dashboard-language-control"><label className="dashboard-language-switcher"><span>{t("Language")}</span><select value={pending || language} aria-label={t("Language")} aria-busy={Boolean(pending)} onFocus={warmLanguages} onPointerEnter={warmLanguages} onChange={event => setLanguage(dashboardLanguage(event.target.value))}>
    <option value="en" lang="en">English</option><option value="ms" lang="ms">Bahasa Melayu</option><option value="id" lang="id">Bahasa Indonesia</option>
  </select></label>{pending && <span role="status" className="dashboard-language-status">{pending === "ms" ? "Menyediakan bahasa..." : "Menyiapkan bahasa..."}</span>}{error && <span role="status" className="dashboard-language-status">Could not load the language. Select it again to retry.</span>}</div>;
}

export function WorkspaceLoading() {
  const { t } = useLanguage();
  return <NotificationMessage><LoadingIndicator>{t("Opening workspace...")}</LoadingIndicator></NotificationMessage>;
}

export type DashboardLanguage = "en" | "ms" | "id";
export type TranslationDictionary = Readonly<Record<string, readonly [string, string]>>;
export const dashboardLanguageStorageKey = "meaningful-plushies-dashboard-language";
export function dashboardLanguage(value: unknown): DashboardLanguage {
  return value === "ms" || value === "id" ? value : "en";
}

export type Translate = (text: string | null | undefined, values?: Record<string, string | number>) => string;
export function translator(language: DashboardLanguage, translations: TranslationDictionary = {}): Translate {
  return (text, values) => {
    // Legacy records and optional label maps can have no display text.
    // Every language must handle those just as safely as React's empty children.
    if (typeof text !== "string") return "";
    if (language === "en" && !values) return text;
    const entry = Object.hasOwn(translations, text.trim()) ? translations[text.trim()] : undefined;
    let result = language === "en" || !entry ? text : entry[language === "ms" ? 0 : 1];
    if (values) result = result.replace(/\{([\w]+)\}/g, (match, key) => Object.hasOwn(values, key) ? String(values[key]) : match);
    return result;
  };
}

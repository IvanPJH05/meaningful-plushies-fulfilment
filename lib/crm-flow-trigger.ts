/**
 * Normalise WhatsApp text before matching configured flow phrases. WhatsApp
 * can alter punctuation, Unicode forms, emoji modifiers and invisible
 * characters, so raw string comparison makes valid customer replies fail.
 */
export function normalizeCrmFlowTriggerText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\uFE0E\uFE0F]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Match a saved phrase anywhere in a message, without matching inside words. */
export function crmFlowPhraseMatchesMessage(phrase: string, message: string) {
  const normalizedPhrase = normalizeCrmFlowTriggerText(phrase);
  const normalizedMessage = normalizeCrmFlowTriggerText(message);
  return Boolean(
    normalizedPhrase
    && normalizedMessage
    && ` ${normalizedMessage} `.includes(` ${normalizedPhrase} `),
  );
}

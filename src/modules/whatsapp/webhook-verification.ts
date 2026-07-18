function stripMatchingQuotes(value: string) {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
    return value.slice(1, -1).trim();
  }
  return value;
}

export function normalizeWebhookVerifyToken(value: string | null | undefined) {
  return stripMatchingQuotes((value || "").trim());
}

export function verifyWebhookChallenge(input: {
  mode: string | null;
  token: string | null;
  expectedToken?: string | null;
  challenge: string | null;
}) {
  return input.mode === "subscribe"
    && Boolean(input.challenge)
    && normalizeWebhookVerifyToken(input.token) === normalizeWebhookVerifyToken(input.expectedToken);
}

export function tutorialFaqMessage(data: unknown, now = Date.now()) {
  if (!data || typeof data !== "object") return null;
  const message = data as Record<string, unknown>;
  const sender = message.sender as { role?: string } | undefined;
  const { message_id, conversation_id, create_time, content } = message;
  if (message.type !== "TEXT" || message.is_visible !== true || sender?.role !== "BUYER") return null;
  if (typeof message_id !== "string" || !/^\d{8,25}$/.test(message_id)) return null;
  if (typeof conversation_id !== "string" || !/^\d{8,25}$/.test(conversation_id)) return null;
  if (typeof create_time !== "number" || !Number.isFinite(create_time) || Math.abs(now - create_time * 1000) > 3600000) return null;
  if (typeof content !== "string") return null;
  try {
    const text: unknown = JSON.parse(content)?.content;
    if (typeof text !== "string") return null;
    const question = text.normalize("NFKC").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
    const english = /^(how (do|can|should) i|how to) (send|submit|upload) (my |the |a )?(voice recording|voice message|voice|recording)( for my plushie)?$/;
    const malay = /^(bagaimana (cara )?(saya )?(nak |untuk )?|macam mana (saya )?(nak )?|cara )(hantar|menghantar|muat naik) (rakaman suara|rakaman|video suara)( saya)?$/;
    if (english.test(question) || malay.test(question)) return { message_id, conversation_id };
  } catch {
    return null;
  }
  return null;
}

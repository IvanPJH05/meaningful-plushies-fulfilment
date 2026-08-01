import { z } from "zod";

export const CHAT_EXPORT_CSV_COLUMNS = [
  "conversation_id", "customer_name", "phone_number", "original_phone_number", "first_message_at", "last_message_at", "total_messages", "crm_status", "order_stage", "status_reason", "payment_status", "payment_amount", "deposit_amount", "remaining_balance", "payment_date", "payment_evidence_type", "payment_evidence_attachment", "payment_confidence_score", "character", "speaker_duration", "form_type", "form_sent", "form_sent_at", "form_completed", "form_completed_at", "voice_received", "voice_type", "voice_received_at", "shipping_details_received", "shipping_region", "shipping_type", "ready_for_production", "production_completed", "tracking_sent", "tracking_number", "shipped", "delivered", "potential_score", "follow_up_required", "suggested_next_action",
] as const;

export const chatExportMessageSchema = z.object({
  timestamp: z.string(),
  sender: z.enum(["CUSTOMER", "TEAM", "SYSTEM"]),
  message_type: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER", "LOCATION", "CONTACT", "UNSUPPORTED"]),
  text: z.string(),
  attachment_filename: z.string(),
  attachment_url: z.string(),
  attachment_id: z.string(),
  caption: z.string(),
  status_marker: z.string(),
});

export const chatExportRecordSchema = z.object({
  conversation_id: z.string(),
  customer: z.object({ name: z.string(), phone_number: z.string(), original_phone_number: z.string() }),
  metadata: z.object({ crm_status: z.string(), first_message_at: z.string(), last_message_at: z.string(), total_messages: z.number().int().nonnegative(), exported_at: z.string() }),
  summary: z.object({
    order_stage: z.string(), status_reason: z.string(), payment_status: z.string(), payment_amount: z.number().nullable(), deposit_amount: z.number().nullable(), remaining_balance: z.number().nullable(), payment_date: z.string(),
    payment_evidence_found: z.enum(["YES", "NO", "UNCERTAIN"]), payment_evidence_type: z.string(), payment_evidence_message_timestamp: z.string(), payment_evidence_attachment: z.string(), payment_evidence_text: z.string(), payment_confidence_score: z.number().int().min(0).max(100),
    character: z.string(), speaker_duration: z.string(), form_type: z.string(), form_sent: z.boolean(), form_sent_at: z.string(), form_completed: z.boolean(), form_completed_at: z.string(),
    voice_received: z.enum(["YES", "NO", "UNCERTAIN"]), voice_type: z.string(), voice_received_at: z.string(), voice_attachment_filename: z.string(), shipping_details_received: z.boolean(), shipping_region: z.string(), shipping_type: z.string(), ready_for_production: z.boolean(), production_completed: z.boolean(), tracking_sent: z.boolean(), tracking_number: z.string(), shipped: z.boolean(), delivered: z.boolean(), potential_score: z.number().int().min(0).max(100), follow_up_required: z.boolean(), suggested_next_action: z.string(),
  }),
  messages: z.array(chatExportMessageSchema),
});

export type ChatExportRecord = z.infer<typeof chatExportRecordSchema>;

export type ExportAttachmentInput = { id: string; originalName?: string | null; contentType?: string | null; externalMediaId?: string | null };
export type ExportMessageInput = { body?: string | null; direction: "INBOUND" | "OUTBOUND"; senderType: "CUSTOMER" | "TEAM" | "AI" | "SYSTEM"; messageType: string; status?: string; createdAt: Date; attachments?: ExportAttachmentInput[] };
export type ExportLeadInput = { stage?: string; temperature?: string; paymentStatus?: string; paidAmount?: unknown; paymentConfirmedAt?: Date | null; requestedCharacter?: string | null; requestedVoice?: string | null; notes?: string | null };
export type ExportOrderInput = { paymentStatus?: string; totalAmount?: unknown; placedAt?: Date | null; payments?: Array<{ amount?: unknown; paidAt?: Date | null }> };
export type ExportConversationInput = { id: string; contact: { displayName?: string | null; phone?: string | null; waId?: string | null }; leads?: ExportLeadInput[]; orders?: ExportOrderInput[]; messages: ExportMessageInput[] };

const EMPTY = "";
const yesNo = (value: boolean) => value;
const dateIso = (value?: Date | null) => value ? value.toISOString() : EMPTY;
const numeric = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const clean = (value: string | null | undefined) => value?.replace(/\r\n/g, "\n").trim() || EMPTY;

export function normalizePhoneNumber(value: string | null | undefined) {
  const original = clean(value);
  const digits = original.replace(/[^\d+]/g, "");
  if (!digits) return { phone: EMPTY, original };
  if (digits.startsWith("+")) return { phone: `+${digits.slice(1).replace(/\D/g, "")}`, original };
  const plain = digits.replace(/\D/g, "");
  if (plain.startsWith("60")) return { phone: `+${plain}`, original };
  if (plain.startsWith("0")) return { phone: `+60${plain.slice(1)}`, original };
  return { phone: `+${plain}`, original };
}

function messageType(value: string) {
  const type = value.toUpperCase();
  if (["TEXT", "IMAGE", "VIDEO", "AUDIO", "DOCUMENT"].includes(type)) return type as z.infer<typeof chatExportMessageSchema>["message_type"];
  if (type === "STICKER") return "STICKER";
  if (type === "LOCATION") return "LOCATION";
  if (type === "CONTACT") return "CONTACT";
  return "UNSUPPORTED";
}

function senderFor(message: ExportMessageInput): z.infer<typeof chatExportMessageSchema>["sender"] {
  if (message.direction === "INBOUND" || message.senderType === "CUSTOMER") return "CUSTOMER";
  if (message.senderType === "SYSTEM") return "SYSTEM";
  return "TEAM";
}

function has(text: string, pattern: RegExp) { return pattern.test(text); }
function truthyFormMessage(text: string) { return has(text, /\b(form|customi[sz]ation|customise|customize|google\s*form|shopify.*(?:link|form)|fill\s*(?:in|up)|details)\b/i); }
function characterFrom(text: string) {
  if (/dragon\s*warrior/i.test(text)) return "DRAGON_WARRIOR";
  if (/\bhunnie\b/i.test(text)) return "HUNNIE";
  if (/\btootsie\b/i.test(text)) return "TOOTSIE";
  if (/\bbilly\b/i.test(text)) return "BILLY";
  if (/\bpiggy\b/i.test(text)) return "PIGGY";
  return "NOT_SELECTED";
}
function speakerFrom(text: string) {
  const match = text.match(/\b(5|10|20)\s*(?:seconds?|secs?|s)\b/i);
  return match ? `${match[1]}_SECONDS` : "NOT_SELECTED";
}
function shippingRegion(text: string) {
  if (/east\s*malaysia|sabah|sarawak|labuan/i.test(text)) return "EAST_MALAYSIA";
  if (/west\s*malaysia|peninsular|selangor|kuala\s*lumpur|johor|penang|perak|kedah|kelantan|terengganu|pahang|melaka|negeri\s*sembilan/i.test(text)) return "WEST_MALAYSIA";
  if (/international|singapore|australia|uk|united\s*states/i.test(text)) return "INTERNATIONAL";
  return "UNKNOWN";
}
function csvValue(value: unknown) {
  const string = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function buildChatExportRecord(conversation: ExportConversationInput, exportedAt = new Date()): ChatExportRecord {
  const messages = [...conversation.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const lead = conversation.leads?.[0];
  const allText = messages.map((message) => clean(message.body)).join("\n");
  const inboundText = messages.filter((message) => message.direction === "INBOUND").map((message) => clean(message.body)).join("\n");
  const outgoing = messages.filter((message) => message.direction === "OUTBOUND");
  const phoneSource = conversation.contact.phone || conversation.contact.waId;
  const phone = normalizePhoneNumber(phoneSource);
  const leadPayment = numeric(lead?.paidAmount);
  const verifiedOrder = conversation.orders?.find((order) => order.paymentStatus === "PAID");
  const verifiedOrderAmount = numeric(verifiedOrder?.totalAmount);
  const paymentMessage = messages.find((message) => message.attachments?.length && has(`${message.body || ""} ${message.attachments.map((attachment) => attachment.contentType || attachment.originalName || "").join(" ")}`, /receipt|payment|bank|transfer|slip|screenshot/i));
  const paymentTextMessage = messages.find((message) => has(clean(message.body), /(?:paid|payment|transfer|bank in|deposit).*(?:rm|myr|\d)|(?:rm|myr)\s*\d+.*(?:paid|payment|deposit)/i));
  const paid = lead?.paymentStatus === "PAID" || Boolean(verifiedOrder);
  const partial = lead?.paymentStatus === "PARTIALLY_PAID" || (!paid && Boolean(leadPayment || has(allText, /\bdeposit\b/i)));
  const paymentAmount = paid ? (verifiedOrderAmount ?? leadPayment) : leadPayment;
  const possibleTotal = numeric(conversation.orders?.[0]?.totalAmount);
  const remainingBalance = partial && possibleTotal !== null && paymentAmount !== null ? Math.max(0, possibleTotal - paymentAmount) : null;
  const paymentEvidence = paid || partial ? "YES" : paymentMessage || paymentTextMessage ? "UNCERTAIN" : "NO";
  const paymentEvidenceType = paymentMessage ? (paymentMessage.attachments?.some((attachment) => /pdf|document/i.test(`${attachment.contentType} ${attachment.originalName}`)) ? "PAYMENT_DOCUMENT" : "PAYMENT_SCREENSHOT") : paid ? "TEAM_CONFIRMATION" : partial ? "DEPOSIT" : "NONE";
  const evidenceMessage = paymentMessage || paymentTextMessage;
  const formMessage = outgoing.find((message) => truthyFormMessage(clean(message.body)));
  const formType = formMessage ? (/google\s*form/i.test(clean(formMessage.body)) ? "GOOGLE_FORM" : /shopify/i.test(clean(formMessage.body)) ? "SHOPIFY_LINK" : /form/i.test(clean(formMessage.body)) ? "FORM_TEMPLATE" : "OTHER") : "NONE";
  const inboundAfterForm = formMessage ? messages.find((message) => message.direction === "INBOUND" && message.createdAt >= formMessage.createdAt && (/address|postcode|name\s*:|phone\s*:|customi[sz]|message\s*:/i.test(clean(message.body)) || (message.attachments?.length || 0) > 0)) : undefined;
  const formCompleted = Boolean(inboundAfterForm || verifiedOrder);
  const audioMessage = messages.find((message) => message.direction === "INBOUND" && (message.messageType === "AUDIO" || message.messageType === "VIDEO") && (formMessage ? message.createdAt >= formMessage.createdAt : true));
  const voiceReceived = audioMessage ? (formMessage ? "YES" : "UNCERTAIN") : "NO";
  const shippingDetails = /(?:address|postcode|poskod|street|jalan|taman|delivery|ship to|shipping)/i.test(inboundText);
  const trackingMessage = outgoing.find((message) => /(?:tracking|track your|courier|poslaju|j&t|jnt)/i.test(clean(message.body)));
  const trackingNumber = clean(trackingMessage?.body).match(/\b[A-Z0-9]{8,}\b/i)?.[0] || EMPTY;
  const shipped = Boolean(trackingMessage);
  const delivered = /(?:delivered|received.*order|parcel.*received)/i.test(allText);
  const character = characterFrom(lead?.requestedCharacter || allText);
  const speakerDuration = speakerFrom(lead?.requestedVoice || allText);
  const selectedProduct = character !== "NOT_SELECTED" || speakerDuration !== "NOT_SELECTED";
  const declined = /(?:not interested|don't want|do not want|no thanks|cancel(?:led)?)/i.test(inboundText);
  const priceEnquiry = /(?:price|how much|cost|harga)/i.test(inboundText);
  const interested = /(?:want to buy|i want|interested|order one|purchase)/i.test(inboundText);
  const readyForProduction = (paid || partial) && formCompleted && voiceReceived === "YES" && shippingDetails && selectedProduct;
  const productionCompleted = /(?:production complete|completed.*production|ready.*ship)/i.test(allText);
  let orderStage = "NEW_LEAD";
  if (declined) orderStage = "NOT_INTERESTED";
  else if (delivered) orderStage = "DELIVERED";
  else if (shipped) orderStage = "SHIPPED";
  else if (productionCompleted) orderStage = "COMPLETED";
  else if (readyForProduction) orderStage = "READY_FOR_PRODUCTION";
  else if (paid) orderStage = "FULLY_PAID";
  else if (partial) orderStage = "DEPOSIT_PAID";
  else if (formCompleted) orderStage = "FORM_COMPLETED";
  else if (formMessage) orderStage = "FORM_SENT";
  else if (selectedProduct) orderStage = "PRODUCT_SELECTED";
  else if (interested) orderStage = "INTERESTED";
  else if (priceEnquiry) orderStage = "PRICE_ENQUIRY";
  const potentialScore = paid || partial ? 0 : declined ? 0 : Math.min(100, (priceEnquiry ? 10 : 0) + (interested ? 40 : 0) + (selectedProduct ? (character !== "NOT_SELECTED" ? 15 : 0) + (speakerDuration !== "NOT_SELECTED" ? 15 : 0) : 0) + (shippingDetails ? 30 : 0) + (formCompleted ? 20 : 0) + (voiceReceived === "YES" ? 20 : 0) + (/(?:payday|pay day|end of month|next week)/i.test(inboundText) ? 15 : 0) + (/(?:come back|later)/i.test(inboundText) ? 5 : 0));
  const reason = declined ? "Customer explicitly declined or cancelled in the conversation." : shipped ? "Tracking or courier information was sent in the conversation." : readyForProduction ? "Payment, product choices, customization details, voice recording, and shipping details are present." : formMessage && !formCompleted ? "A customization form or link was sent, but no completion evidence was found." : selectedProduct ? `Customer selected ${character.replaceAll("_", " ")} ${speakerDuration === "NOT_SELECTED" ? "" : `with ${speakerDuration.replaceAll("_", " ")}`.trim()}.` : priceEnquiry ? "Customer asked about price, with no stronger order evidence found." : "No stronger order-stage evidence was found in the conversation.";
  const suggestedNextAction = declined || shipped || delivered ? "No sales follow-up required." : readyForProduction ? "Move to production." : partial && formCompleted ? "Request the remaining balance before production." : formMessage && !formCompleted ? "Follow up for completed customization details." : selectedProduct ? "Send the customization form and payment instructions." : priceEnquiry || interested ? "Answer the enquiry and offer the matching product options." : "Review the latest customer message and follow up if appropriate.";

  const record: ChatExportRecord = {
    conversation_id: conversation.id,
    customer: { name: clean(conversation.contact.displayName) || phone.phone || "Unknown customer", phone_number: phone.phone, original_phone_number: phone.original },
    metadata: { crm_status: lead?.paymentStatus === "PAID" || lead?.stage === "PAID" ? "Paid" : lead?.paymentStatus === "UNPAID" ? "Unpaid" : lead?.temperature === "COLD" || !lead ? "Cold" : "Warm", first_message_at: dateIso(messages[0]?.createdAt), last_message_at: dateIso(messages.at(-1)?.createdAt), total_messages: messages.length, exported_at: exportedAt.toISOString() },
    summary: { order_stage: orderStage, status_reason: reason, payment_status: paid ? "PAID" : partial ? "PARTIALLY_PAID" : "UNPAID", payment_amount: paymentAmount, deposit_amount: partial ? paymentAmount : null, remaining_balance: remainingBalance, payment_date: dateIso(lead?.paymentConfirmedAt || verifiedOrder?.placedAt), payment_evidence_found: paymentEvidence, payment_evidence_type: paymentEvidenceType, payment_evidence_message_timestamp: dateIso(evidenceMessage?.createdAt), payment_evidence_attachment: clean(evidenceMessage?.attachments?.[0]?.originalName) || clean(evidenceMessage?.attachments?.[0]?.id), payment_evidence_text: clean(evidenceMessage?.body), payment_confidence_score: paid ? 95 : partial ? 80 : paymentMessage ? 65 : paymentTextMessage ? 40 : 0, character, speaker_duration: speakerDuration, form_type: formType, form_sent: yesNo(Boolean(formMessage)), form_sent_at: dateIso(formMessage?.createdAt), form_completed: formCompleted, form_completed_at: dateIso(inboundAfterForm?.createdAt || verifiedOrder?.placedAt), voice_received: voiceReceived, voice_type: audioMessage ? audioMessage.messageType === "VIDEO" ? "VIDEO" : "AUDIO" : "NONE", voice_received_at: dateIso(audioMessage?.createdAt), voice_attachment_filename: clean(audioMessage?.attachments?.[0]?.originalName) || clean(audioMessage?.attachments?.[0]?.id), shipping_details_received: shippingDetails, shipping_region: shippingRegion(inboundText), shipping_type: /\bcod\b/i.test(allText) ? "COD" : /express/i.test(allText) ? "EXPRESS" : shippingDetails ? "STANDARD" : "UNKNOWN", ready_for_production: readyForProduction, production_completed: productionCompleted, tracking_sent: Boolean(trackingMessage), tracking_number: trackingNumber, shipped, delivered, potential_score: potentialScore, follow_up_required: !declined && !shipped && !delivered && !readyForProduction, suggested_next_action: suggestedNextAction },
    messages: messages.map((message) => {
      const attachment = message.attachments?.[0];
      return { timestamp: message.createdAt.toISOString(), sender: senderFor(message), message_type: messageType(message.messageType), text: message.body || EMPTY, attachment_filename: clean(attachment?.originalName), attachment_url: attachment ? `/api/crm/inbox/attachments/${attachment.id}/original` : EMPTY, attachment_id: attachment?.id || EMPTY, caption: message.messageType === "TEXT" ? EMPTY : clean(message.body), status_marker: message.status || EMPTY };
    }),
  };
  return chatExportRecordSchema.parse(record);
}

export function recordToCsvRow(record: ChatExportRecord) {
  const s = record.summary;
  return {
    conversation_id: record.conversation_id, customer_name: record.customer.name, phone_number: record.customer.phone_number, original_phone_number: record.customer.original_phone_number, first_message_at: record.metadata.first_message_at, last_message_at: record.metadata.last_message_at, total_messages: record.metadata.total_messages, crm_status: record.metadata.crm_status, order_stage: s.order_stage, status_reason: s.status_reason, payment_status: s.payment_status, payment_amount: s.payment_amount ?? EMPTY, deposit_amount: s.deposit_amount ?? EMPTY, remaining_balance: s.remaining_balance ?? EMPTY, payment_date: s.payment_date, payment_evidence_type: s.payment_evidence_type, payment_evidence_attachment: s.payment_evidence_attachment, payment_confidence_score: s.payment_confidence_score, character: s.character, speaker_duration: s.speaker_duration, form_type: s.form_type, form_sent: s.form_sent, form_sent_at: s.form_sent_at, form_completed: s.form_completed, form_completed_at: s.form_completed_at, voice_received: s.voice_received, voice_type: s.voice_type, voice_received_at: s.voice_received_at, shipping_details_received: s.shipping_details_received, shipping_region: s.shipping_region, shipping_type: s.shipping_type, ready_for_production: s.ready_for_production, production_completed: s.production_completed, tracking_sent: s.tracking_sent, tracking_number: s.tracking_number, shipped: s.shipped, delivered: s.delivered, potential_score: s.potential_score, follow_up_required: s.follow_up_required, suggested_next_action: s.suggested_next_action,
  };
}

export function recordsToCsv(records: ChatExportRecord[]) {
  const header = CHAT_EXPORT_CSV_COLUMNS.join(",");
  const rows = records.map((record) => {
    const row = recordToCsvRow(record);
    return CHAT_EXPORT_CSV_COLUMNS.map((column) => csvValue(row[column])).join(",");
  });
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
}

export function recordToStructuredText(record: ChatExportRecord) {
  const s = record.summary;
  const lines = [
    "CUSTOMER_RECORD_START", "", `Customer Name: ${record.customer.name}`, `Phone Number: ${record.customer.phone_number}`, `Original Phone Number: ${record.customer.original_phone_number}`, `Conversation ID: ${record.conversation_id}`, `CRM Status: ${record.metadata.crm_status}`, `First Message Date: ${record.metadata.first_message_at}`, `Last Message Date: ${record.metadata.last_message_at}`, `Total Messages: ${record.metadata.total_messages}`, `Exported At: ${record.metadata.exported_at}`, "", `Detected Order Status: ${s.order_stage}`, `Status Reason: ${s.status_reason}`, `Payment Status: ${s.payment_status}`, `Payment Amount: ${s.payment_amount ?? EMPTY}`, `Deposit Amount: ${s.deposit_amount ?? EMPTY}`, `Remaining Balance: ${s.remaining_balance ?? EMPTY}`, `Payment Date: ${s.payment_date}`, `Character Selected: ${s.character}`, `Speaker Option: ${s.speaker_duration}`, `Customization Form Sent: ${s.form_sent ? "YES" : "NO"}`, `Customization Form Completed: ${s.form_completed ? "YES" : "NO"}`, `Voice Received: ${s.voice_received}`, `Shipping Details Received: ${s.shipping_details_received ? "YES" : "NO"}`, `Ready for Production: ${s.ready_for_production ? "YES" : "NO"}`, `Production Completed: ${s.production_completed ? "YES" : "NO"}`, `Tracking Sent: ${s.tracking_sent ? "YES" : "NO"}`, `Order Shipped: ${s.shipped ? "YES" : "NO"}`, `Follow-Up Required: ${s.follow_up_required ? "YES" : "NO"}`, `Suggested Next Action: ${s.suggested_next_action}`, "", `Payment Evidence Found: ${s.payment_evidence_found}`, `Payment Evidence Type: ${s.payment_evidence_type}`, `Payment Evidence Message Timestamp: ${s.payment_evidence_message_timestamp}`, `Payment Evidence Attachment Filename: ${s.payment_evidence_attachment}`, `Payment Evidence Text: ${s.payment_evidence_text}`, `Payment Confidence Score: ${s.payment_confidence_score}`, "", `Form Type: ${s.form_type}`, `Form Sent Timestamp: ${s.form_sent_at}`, `Form Completion Evidence: ${s.form_completed ? "CUSTOMER_OR_ORDER_EVIDENCE" : "NONE"}`, `Form Completion Timestamp: ${s.form_completed_at}`, `Voice Type: ${s.voice_type}`, `Voice Timestamp: ${s.voice_received_at}`, `Voice Attachment Filename: ${s.voice_attachment_filename}`, `Shipping Region: ${s.shipping_region}`, `Shipping Type: ${s.shipping_type}`, `Potential Score: ${s.potential_score}`, "", "CUSTOMER_MESSAGES_START", "",
  ];
  for (const message of record.messages) lines.push(`[${message.timestamp.replace("T", " ").replace(".000Z", " UTC")}] [${message.sender}]`, `Message Type: ${message.message_type}`, `Message: ${message.text}`, `Attachment Filename: ${message.attachment_filename}`, `Attachment URL: ${message.attachment_url}`, `Attachment ID: ${message.attachment_id}`, `Caption: ${message.caption}`, `Status Marker: ${message.status_marker}`, "");
  lines.push("CUSTOMER_MESSAGES_END", "CUSTOMER_RECORD_END");
  return lines.join("\n");
}

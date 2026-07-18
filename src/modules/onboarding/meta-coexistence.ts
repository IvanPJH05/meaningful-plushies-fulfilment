export const metaCoexistenceManualSetupSteps = [
  "Create or select a Meta app in Meta for Developers.",
  "Add WhatsApp product access to the app.",
  "Connect the existing Meaningful Plushies WhatsApp Business Account.",
  "Enable WhatsApp Business Platform Coexistence for the phone number in Meta Business Suite.",
  "Add the production webhook callback URL from this app.",
  "Subscribe to messages, history, smb_message_echoes, message_template_status_update, and phone_number_name_update webhook fields.",
  "Generate a permanent system user access token with WhatsApp Business permissions.",
  "Paste the encrypted token into the CRM connection setup page.",
  "Send a test message and verify it appears in the webhook log before enabling AI.",
] as const;

export const metaCoexistenceLimitations = [
  "The CRM must use the official WhatsApp Business Platform only.",
  "WhatsApp Web automation, browser scraping, or unofficial libraries are not allowed.",
  "The user must approve Meta permissions inside Meta. The app cannot bypass Meta review or account checks.",
  "Customer conversations should start in human-control mode until the team approves AI behavior.",
] as const;

export function getMetaCoexistenceReadiness(input: {
  hasMetaAppId: boolean;
  hasMetaAppSecret: boolean;
  hasVerifyToken: boolean;
  hasCredentialKey: boolean;
}) {
  const missing: string[] = [];

  if (!input.hasMetaAppId) missing.push("META_APP_ID");
  if (!input.hasMetaAppSecret) missing.push("META_APP_SECRET");
  if (!input.hasVerifyToken) missing.push("WHATSAPP_VERIFY_TOKEN");
  if (!input.hasCredentialKey) missing.push("CRM_CREDENTIAL_ENCRYPTION_KEY");

  return {
    readyForManualMetaSetup: missing.length === 0,
    missing,
  };
}

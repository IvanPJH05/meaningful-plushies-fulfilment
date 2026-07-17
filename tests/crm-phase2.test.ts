import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  buildManualOrderReadyWhatsAppMessage,
  buildPaidManualOrderCommand,
} from "../src/modules/sales/paid-manual-order-flow.ts";
import { verifyMetaWebhookSignature } from "../src/modules/whatsapp/meta-signature.ts";
import { buildWhatsAppTextPayload, sendWhatsAppTextMessage } from "../src/modules/whatsapp/outbound.ts";
import { normalizeWhatsAppWebhookPayload } from "../src/modules/whatsapp/webhook-normalizer.ts";

test("paid manual order commands are blocked before payment confirmation", () => {
  assert.throws(() => buildPaidManualOrderCommand({
    customerName: "Sarah Lim",
    phone: "0123456789",
    productKey: "plushie_10s",
    character: "Hunnie",
    paymentConfirmed: false,
  }), /Payment must be confirmed/);
});

test("paid manual order commands normalize customer and product details", () => {
  const command = buildPaidManualOrderCommand({
    customerName: " Sarah Lim ",
    phone: "0123456789",
    productKey: "plushie_10s",
    character: "hunnie",
    shippingRegion: "EAST",
    paidAmount: 125,
    paymentReference: " bank transfer ",
    paymentConfirmed: true,
  });

  assert.equal(command.customerName, "Sarah Lim");
  assert.equal(command.character, "Hunnie");
  assert.equal(command.shippingRegion, "EAST");
  assert.equal(command.payment.amount, 125);
  assert.equal(command.payment.reference, "bank transfer");
});

test("manual order WhatsApp message tells the customer payment was received", () => {
  const message = buildManualOrderReadyWhatsAppMessage({
    customerName: "Sarah",
    checkoutUrl: "https://meaningfulplushies.com/discount/1234",
    discountCode: "1234",
  });

  assert.match(message, /payment received/i);
  assert.match(message, /https:\/\/meaningfulplushies\.com\/discount\/1234/);
  assert.match(message, /Discount code: 1234/);
});

test("Meta webhook signature verification accepts valid signed payloads", () => {
  const rawBody = JSON.stringify({ object: "whatsapp_business_account" });
  const secret = "meta-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;

  assert.equal(verifyMetaWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(rawBody, "sha256=bad", secret), false);
});

test("WhatsApp webhooks normalize inbound customer text messages", () => {
  const messages = normalizeWhatsAppWebhookPayload({
    entry: [{
      changes: [{
        value: {
          metadata: { phone_number_id: "12345" },
          contacts: [{ wa_id: "60123456789", profile: { name: "Sarah" } }],
          messages: [{
            id: "wamid.1",
            from: "60123456789",
            timestamp: "1780000000",
            type: "text",
            text: { body: "I already paid" },
          }],
        },
      }],
    }],
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].waId, "60123456789");
  assert.equal(messages[0].displayName, "Sarah");
  assert.equal(messages[0].phoneNumberId, "12345");
  assert.equal(messages[0].text, "I already paid");
});

test("outbound WhatsApp text payload is ready for the official API", () => {
  assert.deepEqual(buildWhatsAppTextPayload({
    to: "+60 12-345 6789",
    body: "Here is your link",
  }), {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "60123456789",
    type: "text",
    text: {
      preview_url: true,
      body: "Here is your link",
    },
  });
});

test("outbound WhatsApp sending returns payload when credentials are missing", async () => {
  const previousToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const previousPhoneNumber = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;

  try {
    const result = await sendWhatsAppTextMessage({
      to: "60123456789",
      body: "Here is your link",
    });

    assert.equal(result.sent, false);
    assert.equal(result.reason, "missing_whatsapp_credentials");
    assert.deepEqual(result.payload.text, {
      preview_url: true,
      body: "Here is your link",
    });
  } finally {
    if (previousToken) process.env.WHATSAPP_ACCESS_TOKEN = previousToken;
    if (previousPhoneNumber) process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneNumber;
  }
});

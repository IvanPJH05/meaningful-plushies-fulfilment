# WhatsApp CRM Phase 2

Phase 2 changes the sales flow to be paid-first:

1. Customer chats with the AI or team on WhatsApp.
2. Customer pays by the agreed manual payment method.
3. Payment is confirmed.
4. The AI sends a command to this app to create the manual order.
5. The app creates the Shopify discount checkout link using the existing manual-order engine.
6. The app returns the WhatsApp message that should be sent to the customer.

The AI must not create a manual order before payment is confirmed.

## New Endpoints

### WhatsApp Webhook

```text
GET  /api/crm/whatsapp/webhook
POST /api/crm/whatsapp/webhook
```

Use this URL in Meta:

```text
https://meaningful-plushies-fulfilment.vercel.app/api/crm/whatsapp/webhook
```

The GET route handles Meta webhook verification.

The POST route accepts incoming WhatsApp messages, verifies the Meta signature when `META_APP_SECRET` or `WHATSAPP_WEBHOOK_SECRET` is configured, normalizes messages, and stores them in the CRM tables.

### Paid Manual Order Command

```text
POST /api/crm/ai/commands/manual-order
```

Example AI command after payment is confirmed:

```json
{
  "customerName": "Sarah Lim",
  "phone": "0123456789",
  "productKey": "plushie_10s",
  "character": "Hunnie",
  "shippingRegion": "WEST",
  "paymentConfirmed": true,
  "paidAmount": 125,
  "paymentReference": "Bank transfer receipt"
}
```

If `paymentConfirmed` is not `true`, the route returns a blocked response and does not create the Shopify link.

Successful response includes:

- The saved manual order record
- The Shopify checkout link
- The discount code
- The ready-to-send WhatsApp message
- The official WhatsApp API delivery result, or the text payload if credentials are not configured yet

## Required Environment Variables

```env
DATABASE_URL=postgresql://...
WHATSAPP_VERIFY_TOKEN=
META_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
SHOPIFY_SHOP_DOMAIN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
```

Recommended:

```env
WHATSAPP_WEBHOOK_SECRET=
MANUAL_ORDER_PRODUCTS_JSON=
```

## AI Tool Rule

The AI should treat `/api/crm/ai/commands/manual-order` as a paid-only tool.

Allowed:

- Customer paid by bank transfer.
- Team confirmed the payment.
- AI calls the command endpoint.
- AI sends the returned WhatsApp message.

Not allowed:

- Customer only says they are interested.
- Customer asks for a link before paying.
- Payment is unclear or partial.
- AI guesses payment confirmation.

## Current Boundary

This phase does not yet enable full autonomous AI replies. It adds the safe command layer and webhook receiver. The next phase can build the conversation inbox and let approved AI actions call this endpoint.

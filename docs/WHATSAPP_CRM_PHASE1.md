# WhatsApp CRM Phase 1

This phase adds the foundations for a future AI-powered WhatsApp sales CRM without changing the current fulfilment, accounting, manual order, or ads workspaces.

## Final Directory Structure

```text
app/crm/                         Base CRM dashboard
app/api/crm/phase1/              Phase 1 health/readiness endpoint
apps/worker/                     Worker entrypoint placeholder for future queues
prisma/schema.prisma             CRM database model
prisma/seed.ts                   Local seed for business/admin user
src/infrastructure/database/     Prisma client singleton
src/infrastructure/encryption/   Credential encryption helpers
src/infrastructure/logging/      Pino logger
src/infrastructure/queue/        BullMQ queue names/factory
src/infrastructure/redis/        Redis client factory
src/modules/auth/                Password and session helpers
src/modules/businesses/          Tenant isolation helpers
src/modules/onboarding/          Meta Coexistence setup checklist
src/modules/whatsapp/            Official-platform-only guardrails
src/shared/constants/            CRM shared values
src/shared/validation/           Environment validation
tests/                           Phase 1 tests
```

## Prisma Schema Summary

The schema creates CRM-owned tables for:

- Businesses and user roles
- User sessions
- WhatsApp and Shopify connections
- Contacts, conversations, and messages
- Leads and lead events
- Products, variants, price rules, and promotions
- Checkout sessions, orders, order lines, and payments
- Follow-ups
- AI configuration, AI runs, and tool executions
- Webhook events
- Audit logs

Every business-owned record includes `businessId`.

## Environment Variables

Required before production:

```env
DATABASE_URL=postgresql://...
CRM_SESSION_SECRET=at-least-32-characters
CRM_CREDENTIAL_ENCRYPTION_KEY=at-least-32-characters-or-32-byte-base64
META_APP_ID=
META_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
```

Recommended for later phases:

```env
REDIS_URL=redis://localhost:6379
WHATSAPP_WEBHOOK_SECRET=
SHOPIFY_SHOP_DOMAIN=
SHOPIFY_ADMIN_ACCESS_TOKEN=
S3_ENDPOINT=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

## Tenant Isolation

- All CRM business data is scoped by `businessId`.
- Helpers in `src/modules/businesses/tenant.ts` prevent accidentally mixing data from different businesses.
- API routes in later phases should always resolve the active business first, then query with `businessWhere(businessId, ...)`.

## Credential Encryption

- Connection tokens are not stored directly.
- `src/infrastructure/encryption/credentials.ts` uses AES-256-GCM.
- Production must set `CRM_CREDENTIAL_ENCRYPTION_KEY`.
- The local fallback key exists only so developers can run tests before provisioning production secrets.

## Meta Coexistence Manual Steps

Meta still requires human approval/setup:

1. Create or select a Meta app in Meta for Developers.
2. Add WhatsApp product access to the app.
3. Connect the existing Meaningful Plushies WhatsApp Business Account.
4. Enable WhatsApp Business Platform Coexistence for the phone number in Meta Business Suite.
5. Add the production webhook callback URL from this app.
6. Subscribe to messages and status webhook fields.
7. Generate a permanent system user access token.
8. Save the token through the CRM setup screen when Phase 2 builds it.
9. Verify test messages before enabling AI.

The app must not use WhatsApp Web automation, QR-login bots, browser sessions, scraping, or unofficial WhatsApp clients.

## Ambiguous Business Rules To Confirm Before Phase 2

- Which team members can enable `AUTO_REPLY` AI mode?
- Should creator sample customers enter the same lead pipeline or a separate one?
- What is the exact handoff rule when AI is unsure?
- How many unanswered WhatsApp follow-ups are allowed before marking a lead lost?
- Which products and discounts should the CRM quote automatically?
- Should TikTok and Shopify conversations share one customer profile when phone numbers match?
- Which message templates are approved by Meta and ready to send?

## Local Setup

```bash
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Then open:

- `/crm`
- `/api/crm/phase1`

## Phase Boundary

Phase 1 does not implement:

- Full conversation inbox
- AI replies
- Unreviewed autonomous AI replies
- Follow-up automation

Phase 2 has started in `docs/WHATSAPP_CRM_PHASE2.md` with a limited paid-first command flow:

- WhatsApp webhook receiver
- AI command log
- Manual order link creation only after payment confirmation

# Customer UGC app block: released Intake project

Publish this block from `shopify-intake/`, not the repository root. The root configuration targets a different installed app.

Verified Shopify app: Meaningful Plushie Intake, client ID 6043167ddb69732554a716e060a35712, organisation 232511034.
Released version: meaningful-plushie-intake-3, active on 30 October 2026 at 00:10 Malaysia time.
Version: https://dev.shopify.com/dashboard/232511034/apps/422613352449/versions/1187057467393

Shopify's release plan confirmed Configuration: No changes. Only customer-ugc-submissions was added. Its extension UID is retained in this project for future updates. No discount Function, existing fulfilment block or other app extension is included here.

Preserved live configuration: application URL https://meaningful-plushies-fulfilment.vercel.app; embedded true; write_app_proxy only; webhook API version 2026-07; proxy /apps/customise-your-plushie targeting /collection-proxy.

Deploy from this directory after authorisation:
`pnpm --package=@shopify/cli@5.0.0 dlx shopify app deploy`
Review the release plan; stop on unexpected configuration changes or removals.

Theme placement: Add block > Apps > Customer UGC submission. Save the appropriate page template. App release does not publish or modify the storefront theme.

The form calls the existing /apps/closer/ugc-submission endpoint. It remains connected to the same Marketing approval queue. No server credentials or proxy mapping are changed by this extension release.

Verification: published settings matched the previous active Intake version; /apps/customise-your-plushie/b10 returned 200; the customisation API and UGC endpoint returned their expected validation responses; the fulfilment app and existing /apps/closer endpoint returned 200. No customer records were created or edited during these checks.

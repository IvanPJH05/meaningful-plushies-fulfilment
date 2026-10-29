Customer UGC submission app block

Copy these three files into the matching paths of the existing Meaningful Fulfilment Shopify app project. Keep its other extension files and app configuration.

Publish from that app project on a computer with access to the organisation:
  pnpm dlx @shopify/cli@5.0.0 app deploy

This uploads and releases the Shopify app extensions, including Customer UGC submission. It does not publish your draft storefront theme.

In Shopify: Online Store > Themes > Customize > your UGC submission page template > Add block > Apps > Customer UGC submission. Save the template, create/choose the customer-facing page and assign the template. Publish the draft theme separately when ready.

Customers submit name, order number, phone, email, one MP4/MOV/WebM video (up to 50 MB), optional notes, and permission to use their content.

Marketing > Customer UGC > Customer submissions is the admin review queue. View the private video, choose the reward collection, then Approve and create reward code or Reject submission. Approved offers appear in the existing ledger. Copy the reward message manually; no email is sent automatically. Every collection, including Plush Charms V1, creates one code for one item with free shipping.

Server notes
- Storefront endpoint: /apps/closer/ugc-submission via the existing app proxy. Requires SHOPIFY_CLIENT_SECRET and SHOPIFY_SHOP_DOMAIN.
- Signed Shopify proxy requests, short-lived hashed session tokens and five session starts per client/hour.
- customer-ugc storage is private. Uploads cannot overwrite an accepted video. Admin video links expire after ten minutes.
- Submissions, review RPCs and reward linkage are service-role only. Repeated approvals return the existing reward.
- Draft sessions expire after 24 hours. Incomplete uploads never appear in the review queue.
- Tests: tests/ugc-submissions.test.mts and tests/ugc-submission-upload.test.mts.

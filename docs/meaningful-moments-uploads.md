# Meaningful Moments original-video submissions

The local customer programme uses POST `/api/customer-ugc`. It accepts only small JSON metadata; video bytes never pass through Vercel. Supported origins are the local preview on port 4176 and the Meaningful Plushies storefront. This is an intentionally public customer intake endpoint; customer data, review actions and original downloads remain admin-only. No service key is returned to the browser.

Flow: `start` returns a 24-hour, high-entropy submission capability; `upload` reserves a client-generated UUID and signs that file's private storage path; the browser sends its original File to `/storage/v1/upload/resumable/sign` using the `x-signature` header and 6 MB chunks; `complete` verifies the storage object's exact byte length and MIME type; `submit` saves contact details and permission and moves the submission to pending review. Completed files are immutable and cannot be replaced. Reservations and final submission serialize on the parent row. Submission retries return the same reference. `remove` is allowed only while the parent remains a draft.

There is no file-count cap. `marketing_ugc_submission_videos` is private with RLS and service-role-only grants. Backend attachment listings paginate in batches of 100; the review UI reads every page. The previous single-video Shopify proxy flow is retained.

Storage bucket: `customer-ugc`, private. Bucket limit is 536870912000 bytes. The project-wide limit was raised from 200 MB to 500 GB in the Supabase dashboard using the existing Pro plan. Provider limits still apply; this is not unlimited storage. Original downloads use short-lived signed URLs with attachment filenames; previews use separate signed URLs. No media transformations are used.

In Marketing > Customer UGC > Customer submissions, open a submission and choose an original from the file selector. Download original video preserves the uploaded bytes. Multi-video Meaningful Moments submissions default to the Plush Charms reward collection. Review, one-time discount creation, rejection and the reward ledger retain the existing behaviour. No code is generated until approval. The saved consent text matches the language shown to the submitter.

Verification: TypeScript check; customer UGC/reward tests; real two-file resumable upload including a 168225439-byte MP4; interrupted offset recovery; idempotent upload/submission retries; private admin listing; attachment downloads with SHA-256 equality to both source files. The local programme remains unpublished to Shopify.

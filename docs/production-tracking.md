# Production tracking — first release

## Restoration — 2 November 2026

Restored Daily Production → Tasks, Batches & history and Order tracking to the current NFC/TikTok branch. Tasks embeds the direct TikTok customisation queue (with an unsaved-edit gate), then the current manual approval screen. CSV import remains available through its existing page. Existing Batch Fulfilment orders are excluded from the daily candidate list and rejected at creation.

Packing accepts the new `MPI-<item id>` order barcode and `NFC-<card number>` sticker, while retaining legacy six-digit certificate support. Split plushies require their individual item barcode. New inventory pairing and the packed status transition run in one transaction. Sewing and packing now use the current atomic fulfilment transition function so the status column, order JSON and history agree. Public customer tracking remains limited to milestones and dates.

Validation: production and NFC unit tests, isolated PostgreSQL tests for status sync, stale updates, failed-pair rollback, atomic pairing/packing and public RPC denial; TypeScript and production build. Physical scanner rehearsal remains necessary. No real order was enrolled or advanced during validation.

## Guided work update — 28 October

Default landing page is now **Today’s work**, listing ready tasks, scheduled-later tasks and issues per batch. **Batches & history** retains the existing batch setup/details and issue-resolution controls.

**Start tasks** opens a full-screen work station. It displays one order and one instruction, with only relevant print/audio/scan controls and a completion button. Saving automatically selects the next ready item, prioritising the earliest unfinished stage across the batch (finish labels, then audio, then stuffing, etc.). Issue reporting removes that item from the guided queue and continues; issues are resolved from the batch details page. Closing/reopening resumes from server-saved progress. No new database schema or existing status rules changed.

Tailor receipt/audio checks are available on the next calendar day, packing opens at 6pm Malaysia time, and collection tasks wait until the planned pickup day. Overdue work stays actionable. The clock updates every 30 seconds. Delivery confirmations remain in the detailed view, not the production task queue. No physical task is marked complete by merely opening the screen.

Tests cover stage-first/numeric ordering, issue exclusion, automatic next-task selection from updated records, schedule gates and courier/completed work exclusion. Existing production schedule/barcode/public-page tests remain passing.

Dashboard workspace: **Daily Production**. The left sidebar has **Tasks** (daily work) and **Batches & history** (setup and records). Existing fulfilment workspaces, statuses and production batches remain unchanged.

An admin reviews eligible classic plushie orders for a production date and closes a batch after its 10pm Malaysia cutoff. The list excludes orders already in this workflow and those after cutoff. Closure is explicit, not a scheduled job. Default pickup is the production date plus two calendar days, with an editable pickup date at closure for weekends/holidays. No existing orders are automatically enrolled.

Each fulfilment row has one production item and one unguessable customer tracking token. Stages: batch closed, labels printed, audio uploaded, speaker attached/stuffed, sent to tailor, returned, audio passed, packed, collected, delivered. Row locking/version checks prevent stale progress updates. Issues pause progress and need a resolution note. Staff identity/time are recorded in each event. Existing label/slip generation and order detail editing are reused.

Packing requires a matching order barcode and verified six-digit certificate card. The certificate is linked and the packed milestone written in the same database transaction. Staff confirm only after boxing is complete. Missing/stale/unwritten/reused card failures leave the production stage unchanged. Birthday details are read from the existing order rather than entered a second time.

Customer links use the existing Shopify proxy at `/apps/closer/tracking/[64-character token]`. A standalone `/tracking/[token]` route is also available on the fulfilment host. Server-rendered, uncached pages expose milestone labels/times and pickup/arrival estimates only. Names, order IDs, addresses, receipts, audio, actor identities and internal issue notes are excluded. Issues and overdue pickups display generic delay messaging. Unknown tokens return 404.

Courier collection and delivery are manually confirmed in this version, with delivery confirmation admin-only. Automatic J&T events, customer notifications, holiday calendars and automatic 10pm enrolment are not enabled. Tracking links can be copied from each production item; the app does not send messages to customers.

Validation: date/rollover/barcode/customer-render tests; TypeScript; production build; database rollback tests for idempotent batch creation, stage order, stale versions, issues and resolutions; full atomic packing/certificate-link transaction. RLS enabled on all three tables, no anon/authenticated direct access, functions executable only by service role. Rollback tests left zero real batches and consumed no card numbers. Physical scanner/card/print rehearsal remains necessary.

## Revised daily queue — 28 October 2026

Packing and certificate scan complete production; courier collection/delivery are not staff tasks. UI wording is Sewing and Sewing Done. All active orders must finish the earliest stage before later work starts. A reason (3–1000 characters) plus Remove from queue or Leave for tomorrow releases an incomplete order. Removal never deletes the underlying order. Deferral preserves stage, tracking token and history; due deferred orders appear preselected in the next reviewed batch and retain the issue badge.

Batch audio ZIP download starts Sewing for included active orders, with version checks across the transaction. Missing audio prevents completion. QC requires matching order scan and human pass; packing requires matching order scan, certificate card and human confirmation. Successful final packing presents completion and return to Tasks for the next cycle. Existing TikTok import, manual approval and shipping-label tools remain available; these changes do not implement a new guided import wizard.

Validation: TypeScript check and 7 production unit tests passed. Database rollback test verified earlier-stage gate, deferred stage preservation, bulk ZIP transition and Sewing Done transition. No real production orders were enrolled by validation.

## Unified Tasks page — 28 October 2026

Daily Production > Tasks now opens DailyProductionAssistant. The existing TikTok import panel is shared through renderTikTokImportPanel; its old Import page still uses the same panel. The assistant embeds ManualOrderIntakeRecords, checks pending approvals, reviews eligible orders inline, creates the production batch, then imports/matches shipping-label PDFs and generates the existing packing-slip PDF. Printing confirmation moves all active received items atomically to labels_printed, then existing task mode provides batch audio ZIP, Sewing, QC and packing. No navigation to other workspaces is needed. History is optional.

Preparation step is stored for the current day in this browser. Unfinished production batches take priority on reload and resume their persisted stage. Label pairing and printing use production_prepare_labels with staff checks, batch lock and item versions. Missing required labels block printing completion. Manual orders left for later remain pending; reasons on that preparation screen apply to the current mounted run. Production issue decisions remain saved in the database.

Deployment dpl_VFnbRf2RBrZ7sc9SuL13dn7zAjSG promoted. TypeScript + 11 workflow/label unit tests passed; rollback query verified pairing/missing-label gate/print completion, and permission query confirmed anon and authenticated cannot call the new RPC. Live signed-in UI verified Step 1 TikTok importer inside Tasks without creating or approving real orders.

Styling correction: removed production .page descendant overrides around shared import/manual forms. TikTok DOM computed font, padding, height, width and background matched the original CSV Import page for labels, inputs, textareas, columns and action button. Label preparation reuses batch-workspace/batch-step/batch-label-drop/button styles. Scan tasks now focus/select the current order/card field on background click and auto-focus the card after an order match. Interactive controls are excluded. TypeScript and 7 workflow tests passed. Deployment dpl_DUjyAGdptSYGMPDtLE464re4N8B9 promoted and live screenshot checked. Physical scanner behavior was not hardware-tested.

Order tracking staff page added under Daily Production (production_orders). Reads existing fulfilment_orders with paginated server search and joins production_items for stage/issue information. No duplicate order storage. Full order action reuses existing drawer and permissions. Staff-only /api/production-tracking/orders; unauthenticated access verified rejected. Build/typecheck passed; deployment dpl_E49HjvaMSbvz6LNTZr1sVveZPGkN promoted.

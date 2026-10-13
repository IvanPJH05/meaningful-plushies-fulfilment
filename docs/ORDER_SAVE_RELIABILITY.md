# Order save reliability: first phase

Order drawer inputs now form a local draft. Save changes sends only edited fields to an authenticated admin endpoint. One SQL transaction checks the exact server timestamp, merges the patch, updates the timestamp and records activity. A conflict returns 409; the browser fetches the latest record while keeping the draft. Discard draft reveals the latest saved fields. Stage actions are disabled while the draft is dirty or saving. Closing warns about unsaved changes.

The endpoint rejects identity, status/history and financial fields. It does not repost sales to accounting. File bytes already stored on the order stay in the database; the response excludes photo and TikTok bytes. Existing status and summary triggers remain active. This phase needs the existing DATABASE_URL used by the dashboard session/manual-order services; it adds no database migration or grants.

Existing imports distinguish committed order writes from failed subsequent Monthly Journal sync. The admin sees a separate retry banner; pending IDs are retained in that browser's local storage and retries fetch current saved order data. TikTok manual sync carries the same warning. TikTok webhook accounting warnings are recorded in its activity event, but there is no automatic server retry worker yet. Meta CAPI metadata saves no longer repost sales.

Validation: TypeScript; production Next build; 61 Node tests; PGlite integration against the endpoint's actual SQL with the existing status trigger, testing valid/inactive/expired sessions, simultaneous edits, exact-version conflicts, field clearing, asset/status/financial preservation, small response and transaction rollback. The actual drawer was also rendered in a local browser fixture to verify zero write callbacks while typing, one Save callback, disabled controls, retained failed/conflicting drafts, and discard behavior.

Release requires identifying the Vercel production branch/commit and a signed-in preview smoke test with its existing DATABASE_URL. Vercel was at the login screen during this task; production commit and credentials were not available. No production records were changed. The change is based on the existing recent fulfilment fixes rather than the older main branch.

Follow-up boundaries: other legacy imports/webhooks still use whole-record writes; full cross-writer protection needs consolidation of those paths. Media migration, lazy workspace loading and a durable server outbox are later phases. This change does not claim measured loading-time improvement or complete backend replacement.

# Status moves and packing-slip printing

The previous endpoint made two database requests per order, transferring complete media-bearing JSON each time. A conflict halfway through stopped the batch after earlier orders had committed. Old full-order writes and late browser reads could also restore an earlier stage.

The replacement performs the whole batch in a single database transaction, changes JSON inside Postgres, and returns compact summaries. A conflict rolls back the entire batch; repeating the same transition is safe. The status protection trigger retains committed status/history when a legacy writer supplies an older snapshot. Deliberate transitions must append to the current history, including customer customisation and issue changes. Browser merges reject older records and retain assets omitted from summaries. Mobile moves use the same function.

Packing-slip preparation advances only New Order to Uploading Audio, across all sales channels. PDF generation completes before the eligible batch is saved. Reprints of later-stage orders do not advance them. The browser cannot detect whether a PDF was physically printed; this workflow records preparation for printing.

## Deployment

This change is based on `codex/targeted-manual-order-recovery` (9cb1a28), which already contains summary loading and the desktop transition endpoint. Apply `supabase/migrations/20261013151356_atomic_fulfilment_transitions.sql` before deploying the application code. The RPC is invoker-security and executable only by service_role; existing server endpoints continue to validate dashboard sessions and staff transitions. There is no fallback to the previous partial-commit endpoint.

No production migration was applied during this task. Do not deploy the endpoint before the migration. Batches are limited to 500 orders. Keep the existing summary-maintenance trigger enabled. Rolling back application code does not require deleting customer data; the additive database protections can remain. If explicitly reverting the database change, drop the protection trigger and these two new functions only.

## Validation

- TypeScript check and targeted ESLint (existing warnings, no errors).
- All 56 library tests, including stale-refresh and asset-retention regressions.
- Local PGlite/Postgres integration checks: multi-order commit, lightweight response, duplicate retry without extra history, conflict rollback, missing/duplicate IDs, stale full-order write, media preservation and denied anonymous RPC execution.

Reproduce database tests without connecting to production:

```sh
npm install --prefix work/status-validation --no-save --ignore-scripts @electric-sql/pglite@0.5.9
node scripts/test-fulfilment-transitions.mjs
```

After deployment, verify a mixed-stage print selection (only New Order advances), reprint, refresh after a saved move, simultaneous edits and a conflicting batch in separate browser sessions. Production timing and signed-in browser behaviour have not been measured in this task.

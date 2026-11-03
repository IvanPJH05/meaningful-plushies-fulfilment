# TikTok shipment arrangement and labels

Administrators select TikTok orders and open **TikTok shipping**, or use that button in Daily Production's label preparation step. Review current package details, select orders and confirm use of the warehouse collection settings, then confirm arrangement. Already-arranged packages offer label retrieval without another booking. Saved A6 PDFs print immediately after their matching packing slips.

This app's OAuth callback accepts Malaysia shops only. For Malaysia/SEA local sellers, Ship Package uses the warehouse collection method configured in Seller Center; handover_method has been ignored since 2024-10-30. The app submits an empty object to Ship Package, without pretending to change pickup/drop-off. It does not call Get Package Handover Time Slots, which requires the broader Package Split And Combine scope. See [TikTok's SEA collection-method change](https://partner.tiktokshop.com/docv2/page/for-sea-market-partner-developer-parameters-handover-method-in-api-ship-package-and-batch-ship-package-will-be-useless).

The shop must authorise `seller.fulfillment.basic`. The existing `/tiktok-connect` flow obtains updated scopes. No credentials are exposed to the browser.

This release handles standard TikTok Shipping orders with one package per order. Combined, split, Seller Shipping, unpaid/on-hold, cancelled and collected packages are not booked through this flow. Previously saved labels remain printable after collection. Review split/combined packages in Seller Center.

The shipment service shares the existing cross-instance TikTok integration lease. It records booking intent before sending Ship Package, treats ambiguous failures as uncertain, and checks the fresh package state before every operation. A label-generation failure is retried with Retrieve labels rather than a second booking. The cache uses the existing media-asset storage; the shipping ledger is server-only with RLS and no anonymous/authenticated grants. The save RPC merges logistics fields only, preserving customisation, money, stage and history.

Printing from the Orders shipping panel does not advance production. Daily Production retains its separate explicit printed/continue action. Printing supplied batches now reads current full order data and cannot transition unrelated selected orders.

Validation: TypeScript, shipping policy tests, mocked server workflow tests (including timeouts, permissions, package mismatch and repeat retrieval), real PDF generation tests, and browser review with test fixtures. Live booking must be initiated deliberately for reviewed customer orders; no real shipment is booked as a test.

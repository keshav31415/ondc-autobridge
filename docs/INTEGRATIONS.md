# Integration contracts and honest readiness

## Cline

Set `CLINE_ENABLED=true`, `CLINE_PROVIDER`, `CLINE_MODEL` and `CLINE_API_KEY` in the server environment only when ready to incur provider charges. Restart the server. The build-engine selector then enables Cline. The implementation uses the installed `@cline/sdk` Agent and `createTool`, not the GitHub CLI or a simulated AI progress bar.

Tools inspect a compact summary, write the exact approved manifest, validate it, and complete the run. Seller contact details, customer orders, freeform instructions, sessions, passwords and signing keys are not included in model-visible tool output. Tools cannot run shell commands, inspect arbitrary files, change accepted prices/rules or deploy. A run has at most 12 iterations, three manifest-write attempts and a bounded timeout. Failure is recorded without storing raw provider errors that may contain credentials.

This is constrained configuration generation around tested service code. The original pitch's open-ended code generation and automatic repair against official ONDC validators remain future work requiring an isolated execution environment and a pinned conformance suite. Actual model calls have not been tested because no key is available.

## Retail / Beckn

`protocol/retail.ts` is a local 1.2.5-shaped profile for the core journey. `/select` quotes, `/init` reserves, `/confirm` confirms the saved quote, `/status` and `/track` expose the saved order, `/cancel` follows its saved cancellation policy, and `/update` permits delivery instructions before dispatch. Item/price/address changes through update are rejected. Buyer identity and transaction ID jointly identify an order. The portal runs against a clone, so protocol tests do not consume actual stock.

The optional lab endpoint is `/protocol/<merchant-id>/<action>` on the API port. Set `PROTOCOL_MODE=sandbox` and a matching `ONDC_MERCHANT_ID`, subscriber identity/URL/key ID, PEM signing private key, trusted-key-file path and HTTPS callback-origin allowlist. The trust file contains an array of `{ "subscriber": "buyer.example", "keyId": "key-1", "publicKey": "<PEM-or-raw-base64-Ed25519-key>", "uri": "https://buyer.example/api" }`. Use lab identities and trusted hosts. The endpoint is disabled when `NODE_ENV=production`, even if sandbox is requested.

Incoming exact bytes are signature-verified before durable ACK. Reused message IDs with changed payloads fail. State mutation and callback persistence commit together. Callbacks are signed afresh, use stable JSON, reject redirects, require an ACK, retry up to five deliveries with backoff, then become dead letters. Authenticated operators can inspect `/api/protocol/messages` and retry `/api/protocol/messages/<id>/retry`. Delivery is at-least-once; receivers deduplicate by message ID. The lab trust file is **not** an implementation of ONDC registry discovery/key rotation.

Before network onboarding, implement and verify the remaining network contract: official domain schemas and taxonomy, mandatory category attributes (including applicable food/packaging declarations), GPS/serviceability tags, full buyer billing/delivery data, provider/item/fulfillment identity validation, quote agreement across the complete journey, registry lookup and rotation, X25519 `on_subscribe` handling, catalog refresh/incremental flows, unsolicited status callbacks, payment reconciliation, return/replacement flows, grievance management and RSF settlement. Verify domain-specific flows with the official validator and partner staging systems. A public-network-ready toggle is intentionally absent.

## Logistics and payments

`logistics.ts` currently supplies two clearly labelled simulated offers. Weight affects price, business preference selects cheapest/fastest, and pincode `999999` is deliberately unserviceable. Booking is idempotent and only simulated orders accept simulated carrier events. No live provider is contacted; naming a carrier in the business plan does not establish API access.

A live ONDC logistics integration still needs the selected provider's current domain/version, participant credentials, verified serviceability discovery, on_search/on_select/on_init/on_confirm correlation, a signed callback receiver and provider-specific booking/cancel/tracking tests. Pin and validate the agreed contract before implementing that adapter. Shiprocket appears in ONDC's published hyperlocal partner list; verify its current offering and access directly. Dunzo availability is not assumed.

Payment records in the local simulator are `simulated_paid`; they are never marked as real settlements. Network payment confirmation, refunds and RSF reconciliation are not connected. Resolving a support ticket neither refunds a buyer nor puts returned goods back into available stock.

## Sources used

- [ONDC official repositories](https://github.com/ONDC-Official) — protocol/domain implementation references.
- [ONDC log validation utility](https://github.com/ONDC-Official/log-validation-utility) — 1.2.5 flows, including instruction updates and return scenarios.
- [Cline SDK tools](https://github.com/cline/cline/blob/main/docs/sdk/tools.mdx) and [Agent runtime](https://docs.cline.bot/cline-sdk/sessions) — restricted tools and runtime integration.
- [ONDC hyperlocal logistics](https://ondc.org/pages/hyperlocal-logistics.html) — published partner context; not a provider credential or serviceability guarantee.

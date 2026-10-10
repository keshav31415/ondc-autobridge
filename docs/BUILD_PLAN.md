# Approved D2C seller platform

Scope approved in chat: spreadsheet inventory, configurable business rules, India-wide delivery subject to serviceability, six setup steps, eight portal sections, Cline SDK, a Beckn/ONDC retail seller service and separate ONDC logistics integration. All work is in this repository.

## Milestones
- [ ] Foundation: Next.js portal, Node API, PostgreSQL persistence, authentication.
- [ ] Commerce: validated XLSX/CSV imports, stock reservations, rule versions, quotes, orders.
- [ ] Seller experience: onboarding, overview, products, orders, deliveries, rules, payments, support, settings.
- [ ] Integrations: signed protocol callbacks, logistics, Cline build/repair, buyer simulator.
- [ ] Delivery: automated checks, browser verification, deployment files and operator documentation.

## Decisions
Use PostgreSQL in production and embedded PGlite locally. A per-business state document is transaction-locked to protect inventory and order transitions; this first implementation targets small catalogues. Split this into normalized tables before scaling to very large sellers. Money is stored in integer paise. Stock is physical stock minus active order reservations and safety stock. Imports are version checked. Existing orders retain a snapshot of their quote and rule version.

The portal uses ordinary forms and previews. Cline executes restricted tools over a merchant build workspace and receives no payment, session or signing secrets. Template mode is visibly separate from an actual Cline run. Network activation, live logistics, settlement and deployment credentials are external dependencies, not statuses inferred from passing local tests.

## Verification
Unit tests cover price boundaries, inventory reservations, import validation, stale uploads, rule versions and allowed transitions. Database/API tests cover authentication and tenant isolation, concurrency, rollback, idempotency and callback handling. Browser tests exercise sign-up, Excel onboarding, configuration, build status and orders. Build, type checks and tests precede milestone commits.

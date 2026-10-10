# Approved D2C seller platform

Scope approved in chat: spreadsheet inventory, configurable business rules, India-wide delivery subject to serviceability, six setup steps, eight portal sections, Cline SDK, a Beckn/ONDC retail seller service and separate ONDC logistics integration. All work is in this repository.

## Milestones
- [x] Foundation: Next.js portal, Node API, PostgreSQL persistence, authentication.
- [x] Commerce: validated XLSX/CSV imports, stock reservations, rule versions, quotes, orders.
- [x] Seller experience: onboarding, overview, products, orders, deliveries, rules, payments, support, settings.
- [x] Local integrations: signed protocol profile and durable callbacks, simulated logistics, restricted Cline configuration workflow, template package builder and buyer simulator.
- [x] Delivery preparation: automated checks, browser verification, container/Vercel/CI files and operator documentation.
- [ ] Live readiness: official protocol conformance, registry onboarding, live logistics, settlements and account-backed cloud deployment.
- [ ] Original pitch extension: isolated arbitrary code generation and repair against the official ONDC validator.

## Decisions
Use PostgreSQL in production and embedded PGlite locally. A per-business state document is transaction-locked to protect inventory and order transitions; this first implementation targets small catalogues. Split this into normalized tables before scaling to very large sellers. Money is stored in integer paise. Stock is physical stock minus active order reservations and safety stock. Imports are version checked. Existing orders retain a snapshot of their quote and rule version.

The portal uses ordinary forms and previews. Cline executes restricted tools over a merchant build workspace and receives no payment, session or signing secrets. Template mode is visibly separate from an actual Cline run. The current Cline path writes and validates an approved configuration around maintained API source; it does not autonomously edit arbitrary endpoint code. Network activation, live logistics and settlement require additional implementation and external onboarding, not just credentials or passing local tests. The user requested local building and testing first.

## Verification
Unit tests cover price boundaries, inventory reservations, import validation, stale uploads, rule versions and allowed transitions. Database/API tests cover authentication and tenant isolation, concurrency, rollback, idempotency and callback handling. Browser tests exercise sign-up, Excel onboarding, configuration, build status and orders. Build, type checks and tests precede milestone commits.

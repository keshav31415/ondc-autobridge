# ONDC AutoBridge

A working local D2C seller workspace: bring an Excel inventory, confirm business rules, test orders and build a runnable seller backend. Built with Next.js, Express, PostgreSQL/PGlite and the Cline SDK.

**Current status:** local implementation, with simulated logistics and payment records. This is not a certified ONDC participant or a production-ready ONDC protocol implementation. No cloud resources are provisioned by this repository.

## Run on this laptop

From this project folder:

```sh
./scripts/run-local.sh
```

Open **http://127.0.0.1:3100**. Choose **Explore demo workspace** for sample products and orders, or create a local account to start the six-step setup. API health: http://127.0.0.1:4100/health. Stop with Ctrl+C. Local data survives restarts in `.data/postgres`; generated packages are in `.data/artifacts`. Never open the same PGlite directory with a second server.

For another machine, install Node.js 22.13+ and pnpm 11.19.0, then `pnpm install --frozen-lockfile` and `pnpm dev`. `.env.example` documents optional settings; the local default needs no keys. Do not use real customer data in demo accounts, whose passwords are intentionally not recoverable.

## What works

1. **Setup:** business and pickup details → Excel/CSV upload → column mapping and row errors → business rules → quote test → service build and portal.
2. **Products:** template/export, preview before importing, duplicate and formula rejection, stock reservations, stale-edit protection, search, pause products and edit prices/stock.
3. **Business rules:** minimum basket, quantity limits, stock kept aside, low-stock threshold, discounts, shipping fee/free-shipping threshold, dispatch working days and cutoff, pincode exclusions, courier preference, return/cancellation windows and accepting-orders switch. Freeform notes are recorded for review; they are not executed as code.
4. **Orders:** create test orders, reserve stock, pack, book a simulated parcel, mark ready, simulate pickup/transit/delivery, cancel within the saved policy. Order prices and rules remain fixed after creation. Physical stock is deducted at pickup; cancellation releases reservations. Ten-minute checkout reservations expire automatically.
5. **Daily portal:** overview, products, orders/detail, deliveries, rules, payments/CSV, returns/support and settings/activity. Returns open support cases; inspection, refunds and network grievance submission are separate.
6. **Local Beckn profile:** search/select/init/confirm/status/track/cancel and delivery-instruction update. Ed25519 signatures over BLAKE-512 digests, signed callback transport, durable ACK/outbox, idempotent messages, retry backoff and failed-message recovery. Portal tests use an isolated copy of inventory.
7. **Builds:** durable jobs, immutable input snapshots, validation logs, source/configuration download, worker failure recovery. A test launches an exported backend and verifies login and its inventory.
8. **Cline:** an actual `@cline/sdk` Agent with restricted inspect/write/validate/complete tools, a timeout and three configuration-write attempts. Requires an explicitly enabled model key. It orchestrates a maintained service template; arbitrary code generation, official-schema self-repair and automatic deployment are **not implemented**. Template mode never calls or impersonates Cline.

## Repository map

| Path | Purpose |
|---|---|
| `apps/web` | Seller portal and onboarding |
| `apps/api/src` | Sessions, inventory, orders, build jobs and worker |
| `apps/api/src/protocol` | Local retail profile, signing and callback outbox |
| `packages/core/src` | Shared validation and deterministic commerce engine |
| `tests` | Domain, XLSX, API, database, protocol and generated-service tests |
| `scripts/service.ts` | First-run bootstrap for a downloaded service |
| `docs/DEPLOYMENT.md` | Local containers and Vercel/AWS deployment procedure |
| `docs/INTEGRATIONS.md` | Integration boundaries and remaining network work |

The historical pitch and seven-hour plan are retained in `reference/` and `IMPLEMENTATION_PLAN.md`. The current implementation follows the later D2C scope in `docs/BUILD_PLAN.md`; historical claims of instant production activation are not implementation status.

## Verification

```sh
pnpm typecheck
pnpm test:coverage
pnpm build
```

Tests start temporary loopback servers and isolated databases. No ONDC, logistics, model-provider or payment API is called. Core coverage has enforced thresholds. See `docs/VERIFICATION.md` for the last observed results and browser checks. CI runs type checks, tests, the frontend build and an API container build.

## Operational boundaries

Accounts are isolated by session and merchant ID. Cookie sessions use hashed tokens and expire after seven days; passwords use salted scrypt. Mutations require an application header and approved origin. Production cookies require HTTPS. The demo endpoint is disabled in production. No signing or provider keys are returned to the portal or packaged in exports.

Small businesses share one transaction-locked JSONB state row each. This keeps inventory changes atomic but is not a design for unlimited catalogue/order volume: normalize high-volume tables and introduce retention/archival before scaling. The same API backs the portal, so saved rules and inventory take effect immediately. A downloaded service is an **independent snapshot**, not a second stock authority automatically synchronized with the portal.

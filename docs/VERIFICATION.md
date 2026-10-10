# Local verification — 10 October 2026

## Automated checks

- TypeScript checks for API/core and web pass.
- Next.js production build passes both from the repository root and from `apps/web` (the Vercel build directory).
- 23 tests across seven files cover commerce rules, stock reservations and transitions, XLSX round trips and formula/duplicate errors, concurrent last-stock purchases, rollback, session authentication, CSRF headers, merchant isolation, signed lab HTTP requests, callback retry/dead-letter behavior and service builds.
- Commerce/core coverage: **96.03% lines, 96.47% statements, 87.83% branches, 91.17% functions**. These numbers cover `packages/core/src`, not the whole frontend or all integrations.
- The generated-package test checks archive contents, launches the exported service on a temporary loopback port, logs into its bootstrapped account and verifies its eight-product catalogue. It reuses installed dependencies through a test symlink; a clean package installation on another machine remains a separate release check.
- Cline workspace tests reject changes to approved business configuration, require validation before completion and enforce the repair bound. Actual model-provider requests are untested without a key.

## Browser checks

Used the local app at `127.0.0.1:3100` with its sample account:

1. Opened the demo workspace and inspected desktop/mobile layouts; no document-level horizontal overflow in the tested desktop layout.
2. Uploaded the generated `.xlsx` through the browser file chooser, reviewed automatic column mapping and all eight products.
3. Changed a selling price to `-1`: validation showed a row-specific error and blocked import. Corrected it to `249`, revalidated and imported successfully.
4. Saved business rules and calculated a ₹298 test quote (₹249 product + ₹49 delivery), showing the updated rule version.
5. Completed setup, placed a simulated order, marked it packed/ready and booked a simulated pickup.
6. Advanced the shipment through picked-up → in-transit → delivered. Verified physical turmeric stock became 41, reserved stock remained 2 for other orders, and available stock became 39.
7. Built a template seller-service package in Settings and observed real checks, checksum and download link.
8. Ran the local Beckn flow: eight action/callback pairs passed, plus Ed25519 signature verification. These are local profile checks, not official schema certification.
9. Browser error log was empty at the end of these checks. The dashboard screenshot is retained locally in ignored `artifacts/seller-dashboard.png`.

## Not verified or not implemented

No real shipments, ONDC staging/production transactions, payment settlements, Cline provider calls or cloud deployment were executed. Docker is unavailable on this machine, so Docker/Compose files are prepared but not runtime-verified locally. CI is configured but has not run remotely because these commits have not been pushed. Vercel account-specific deployment, RDS/EFS permissions, TLS and restoration rehearsals require the target accounts.

See `INTEGRATIONS.md` for remaining implementation work, including official schema/domain conformance, registry/on_subscribe, live logistics/settlement and arbitrary code self-repair. Credentials alone do not complete these features.

# Deployment: local first, Vercel + AWS later

## Current machine

`./scripts/run-local.sh` starts both services. The portal is on 3100 because another project already uses 3000. The API is on 4100; the frontend proxies `/api` to it. Embedded PostgreSQL and an inline worker need no Docker or external credentials.

Back up local data by stopping this project's server and copying `.data/postgres` and `.data/artifacts` together to a safe location. Restore into an empty data directory while stopped. Do not copy an active PGlite database. No test command deletes the user's local database.

## Optional container rehearsal

Install Docker through its official distribution if desired; it is not installed by this project. Supply a URL-safe database password (URL-encode special characters if using a connection URL):

```sh
export POSTGRES_PASSWORD='<your-local-database-password>'
docker compose up --build
```

The stack has web, API, worker and PostgreSQL services plus persistent database/artifact volumes. Only loopback ports 3100/4100 are published. This Compose file uses development cookie behavior for local HTTP; do not expose it as a public deployment. Use `docker compose down` to stop while preserving volumes. Avoid `down -v` unless intentionally deleting that stack's data.

## First hosted architecture

| Component | Host | Reason |
|---|---|---|
| Next.js seller portal | Vercel | Git previews and frontend hosting |
| Express API | AWS ECS Fargate behind HTTPS ALB | Long-lived API and callback receiver |
| Background worker | Separate Fargate service, same API image | Durable builds, callbacks and reservation expiry |
| Database | RDS PostgreSQL in private subnets | Shared transactional state and managed backups |
| Build packages | Shared encrypted EFS mount at `.data/artifacts` | Current file-based package implementation |
| Secrets | AWS Secrets Manager | Database and future integration credentials |
| Logs/alarms | CloudWatch | Worker failures, API availability and callback dead letters |

S3 is the intended scalable artifact store; an S3 upload/download adapter is **not implemented**. Use EFS for the present API/worker filesystem contract, mounted through [ECS task volume configuration](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specify-efs-config.html). Do not put build jobs on Vercel request functions or use task-local ephemeral disk for persistent artifacts.

## Deploy the API and worker

1. Choose an AWS region and domain. Create an ECR repository, a VPC with private application/database subnets and an HTTPS ALB with an ACM certificate. Configure appropriate egress for package builds and future model/provider traffic. No real network participant is activated by this step.
2. Build with `docker build --target api -t autobridge-api:<git-sha> .`, scan the image, tag it for your ECR repository and push using your own AWS account. Pin deployments to an immutable digest.
3. Create RDS PostgreSQL and a database named `autobridge`. Allow port 5432 only from the ECS task security group; use verified TLS and the RDS CA through `NODE_EXTRA_CA_CERTS`. The server creates its initial tables idempotently. Plan explicit versioned migrations before changing persisted schemas.
4. Create encrypted EFS with an access point writable by UID/GID 1000 (the container's `node` user). Mount it at `/app/.data/artifacts` for **both** API and worker. Permit EFS only from the tasks. Add backup/retention appropriate for business data.
5. API task: target the Dockerfile's `api` image; port 4100, `/health` target-group health check, `NODE_ENV=production`, `INLINE_WORKER=false`, `DATABASE_URL` as a secret, `DATABASE_SSL=true`, `ARTIFACT_DIR=/app/.data/artifacts`, `WEB_ORIGIN=https://<portal-domain>`, `TRUST_PROXY_HOPS=1`, `PROTOCOL_MODE=disabled`, `CLINE_ENABLED=false`. Restrict API ingress to the ALB; do not trust forwarded headers on a directly reachable task.
6. Worker task: same image, database, artifact mount and relevant secrets. Override command with `node node_modules/tsx/dist/cli.mjs apps/api/src/worker-entry.ts`. It needs no inbound port or ALB. Start with one API task and one worker; monitor memory, queue age and database locks before scaling.
7. Check API health, signup/login through the eventual portal, state persistence across task restart, a build and authenticated package download. Test that two accounts cannot read each other's data. Configure alarms for health failures, worker exits, queue age and dead callbacks. Cloud deployment is not complete until these checks pass.

## Deploy the portal to Vercel

1. Import the Git repository. Set Root Directory to `apps/web`, enable inclusion of source files outside that directory, use the Next.js framework and Node 22. The package and `vercel.json` provide the build/install commands. This follows [Vercel's monorepo guidance](https://vercel.com/docs/monorepos/monorepo-faq).
2. Set **server/build environment** `API_ORIGIN=https://<api-domain>`; it is read by Next rewrites at build time. Do not use a `NEXT_PUBLIC_` secret. Set the API's `WEB_ORIGIN` to the exact portal origin. Rebuild after changing `API_ORIGIN`.
3. Give previews a separate staging API/database and an explicit allowed origin. Never send preview traffic to production customer data. All browser requests use the portal's `/api` proxy, keeping cookies on the portal origin.
4. Verify HTTPS login/session cookies, spreadsheet imports, builds, downloads, navigation and mobile layout. Verify that demo sign-in is unavailable against a production API. Vercel deployment compatibility and AWS resources still require an actual account-backed rehearsal; the local Next production build alone does not verify cloud deployment.

## Releases and rollback

Run type checks, coverage tests and build before releasing. Release an immutable API/worker image, then the matching frontend. Back up the database before incompatible schema changes; rollbacks must remain compatible with existing data. Test restoring an RDS snapshot into an isolated environment. Retain artifact packages needed by existing build records. There is no automatic destructive cleanup or autonomous production repair job.

## Inputs needed later

AWS account/region/budget, Vercel project, DNS/domain, and a selected ONDC participation route. Live commerce additionally needs verified subscriber onboarding, signing/encryption keys, a contracted logistics integration and settlement arrangements. A Cline model-provider key is optional for the local template workflow. Keep all credentials in environment/secret storage, outside chat and Git.

# D1 operations runbook

The v2 schema is append-only after the baseline migration. The local seed is
disposable; production backups must be kept outside the repository and access
controlled as student data.

## Apply migrations and seed a local database

```bash
npx wrangler d1 migrations apply wsmc-db --local
npm run seed
npm run test:db
```

For a clean Pages preview, build first and bind the configured D1 database:

```bash
npm run build
npx wrangler pages dev .svelte-kit/cloudflare --d1 DB=5c5a8cb8-f2b9-489a-8a2d-b32a87c70cce --local --persist-to /tmp/wsmc-pages-state --port 8790
```

## Configure production email

Set these Pages environment values for the production deployment:

- `ENVIRONMENT=production`
- `APP_ORIGIN=https://<the-public-wsmc-host>`
- `EMAIL_FROM=WSMC <noreply@<verified-domain>>`
- `EMAIL_API_KEY` as an encrypted secret for the Resend API

The local environment intentionally omits `ENVIRONMENT` and uses the
development adapter, which logs disposable links for testing. A production
environment without both email credentials fails closed instead of logging a
sign-in link.

## Backup and restore

Run a remote export from a trusted operator machine before migrations or a live
contest. Use a dated path with restricted permissions; never commit the file.

```bash
umask 077
npx wrangler d1 export wsmc-db --remote --output ./wsmc-db-$(date +%Y%m%d-%H%M%S).sql
```

To restore into a new or disposable local database, apply the migrations and
execute the reviewed SQL export:

```bash
npx wrangler d1 migrations apply wsmc-db --local
npx wrangler d1 execute wsmc-db --local --file ./wsmc-db-YYYYMMDD-HHMMSS.sql
npm run test:db
```

For production recovery, create a new D1 database, restore into it, run the
integration checks, then update the Pages binding only after an operator has
verified counts, coordinator access, and publication state. Do not overwrite
the only production copy during an incident.

## Coordinator recovery

Use [auth-bootstrap.md](auth-bootstrap.md) from a trusted machine to create or
recover the first system coordinator. Revoke temporary system access after a
normal coordinator assignment is confirmed. If an administrator account is
disabled, use the same reviewed SQL procedure to create a new active bootstrap
account; do not reuse a sign-in token or copy one from logs.

## Incident checklist

1. Record the UTC time, affected contest, and last known good backup.
2. Pause contest lifecycle mutations and preserve the audit trail.
3. Export the current D1 before attempting repair.
4. Restore into an isolated database and run `npm run test:db` plus the smoke
   checks in the deployment environment.
5. Verify the coordinator can sign in, published qualification rounds remain
   frozen, and published state results contain no roster/contact fields.
6. Switch the binding during a maintenance window and run the post-deploy
   smoke test.

Do not log sign-in tokens, full student rosters, or unnecessary contact data in
incident tickets.

# Production showcase and isolated 2026 preview

## Evaluation on 2026-11-09

- Git `main` contains the qualification work at `41617bf`.
- The `wsmc` Pages project is **Direct Upload**, without Git integration.
- Its configured production branch label is **`production`**, not `main`.
  A Pages upload labeled `main` currently creates a preview deployment.
- Production currently runs `065e1d3`, eight commits behind local `main`.
- Production DB `wsmc-db` already has the intended synthetic showcase:
  40 schools, 320 fictional students, and regionals in multiple lifecycle states.
- The existing Pages production and preview bindings both point to `wsmc-db`.
  Do not upload historical results through the existing preview configuration.
- A dedicated, empty D1 database has been created for the preview:
  `wsmc-2026-preview`, ID `43e41f18-2e53-4c4a-a00b-498bdc32a66d`.
- The `cloudflare-preview` branch adds a separate `env.preview` DB binding.
  That binding takes effect on deployment; existing deployments are unchanged.

Cloudflare Pages has production and preview environments. The preview settings
are shared across preview branches; Git branches do not each get their own DB
or bindings automatically. Additional independent demos would need a separate
Pages project or another deliberately managed binding configuration.

Sources: [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/),
[preview aliases](https://developers.cloudflare.com/pages/configuration/preview-deployments/),
and [D1 limits](https://developers.cloudflare.com/d1/platform/limits/).

## Update production without resetting the showcase

A reset is unnecessary. Preserve the existing competition data and apply pending
migrations `0004`, `0005`, and `0006`. The last migration rebuilds role assignment
tables, so prepare restoration SQL **before** applying it.

A private export and local rehearsal have already been made under the ignored
`.wrangler/backups/` directory. The rehearsal preserved all 61 accounts, three
session records, sign-in tokens, scorekeeper grants, and competition counts.
It restored four distinct administrator grants, 11 regional grants, and 40
coach grants to the new persistent assignment schema. Two session records were
unexpired and unrevoked at inspection time. Retaining session records and the
same production origin allows otherwise-valid browser sessions to continue;
expiration and revocation still apply normally.

Immediately before rollout, make a fresh export and repeat the rehearsal:

```bash
umask 077
npx wrangler d1 export wsmc-db --remote --env production \
  --output .wrangler/backups/wsmc-production-rollout.sql
python3 scripts/prepare-access-upgrade.py \
  .wrangler/backups/wsmc-production-rollout.sql \
  .wrangler/backups/wsmc-production-restore-access.sql
```

The helper connects only to an in-memory SQLite database. Its output contains
account IDs and must stay in the ignored backup directory.

Then, during rollout, apply the migrations, promptly restore the grants, and
deploy the tested `main` build. Keep the Pages production label explicit:

```bash
git switch main
npx wrangler d1 migrations apply wsmc-db --remote --env production
npx wrangler d1 execute wsmc-db --remote --env production \
  --file .wrangler/backups/wsmc-production-restore-access.sql
npm run build
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name wsmc --branch production
npm run smoke:preview -- https://wsmc.pages.dev
```

Recheck real administrator access and showcase lifecycle counts. Do not use
`seed:showcase`, `reset-v2.sql`, or the historical replay reset on this DB:
those reset users and sessions. Keeping the existing showcase avoids that loss.
Changing the Pages production label to `main` is optional and requires updating
the project setting first; changing the Git branch alone does not do it.

## Prepare the preview

```bash
git switch cloudflare-preview
npx wrangler d1 migrations apply wsmc-2026-preview --remote --env preview
```

Generate the historical SQL locally from the gitignored inputs and upload it
**only to the named preview DB**. Nothing with real student names belongs in Git,
a build artifact, or a public CI artifact. The preview fixture stores editable
cutoff values but no frozen or published qualifications.

```bash
umask 077
node scripts/generate-2026-results.mjs \
  .wrangler/backups/2026-preview.sql .wrangler/backups/2026-preview-report.json
npx wrangler d1 execute wsmc-2026-preview --remote --env preview \
  --file .wrangler/backups/2026-preview.sql
```

Seed SQL replaces the preview's accounts too. Provision the intended real
administrator accounts and persistent statewide grants after importing the
fixture, preferably from the reviewed production account records. Do not rely
on the fixture's `.example` email addresses for real sign-in.

Configure `EMAIL_API_KEY` as a **preview** Pages secret before sending sign-in
emails. Production's encrypted secret is present, but preview currently has no
email secret and it is not inherited automatically. Do not put its value in
Git or shell command arguments. Use the secret input flow or the Cloudflare
dashboard's encrypted-secret field.

The preview uses production-mode authentication: development demo shortcuts
are disabled and email fails closed if credentials are missing. Its trusted
origin is the stable branch alias, not an ephemeral deployment hash:
`https://cloudflare-preview.wsmc.pages.dev`.

```bash
npm run build
npx wrangler pages deploy .svelte-kit/cloudflare \
  --project-name wsmc --branch cloudflare-preview
npm run smoke:preview -- https://cloudflare-preview.wsmc.pages.dev
```

Preview sign-in is separate because cookies are scoped to its hostname.
Before handing it to the user, verify both the deployed DB binding and an
actual administrator sign-in; confirm the qualification draft remains editable
and unauthenticated requests cannot retrieve rosters. Pages previews are
publicly reachable URLs by default, so the preview must retain the app's
normal authentication. Cloudflare Access can provide an additional gate if
wanted; a branch alias alone is not an access restriction.

## Rollout completed on 2026-11-09

- Both Git branches have been pushed.
- Production now runs `41617bf` at <https://wsmc.pages.dev>.
  Immutable deployment: <https://9f6cd598.wsmc.pages.dev>.
- Preview runs `5724809` at <https://cloudflare-preview.wsmc.pages.dev>.
  Immutable deployment: <https://9960ea06.wsmc.pages.dev>.
- Both databases have all migrations applied. The deployed environment bindings
  were checked through the Pages API and point to distinct D1 IDs.
- Production accounts and session records were retained; existing administrator
  access was verified with a previously issued session. The original 40 schools,
  320 fictional students, and mixed regional contest states remain intact.
- Preview has 53 schools and 517 historical students. The cutoff values and
  complete qualification draft were saved through the deployed application:
  250 active event qualifications, still editable and unpublished.
- Production administrator accounts and statewide grants were provisioned in
  preview. Production sessions were not copied. A deployment-only preview
  verification session was removed after authenticated route/save checks.
- Preview's encrypted email secret was configured from the existing local
  send-only Resend credential. No verification emails were sent to users.
- Unauthenticated smoke checks passed on both hosts, including private-route
  protection and the unpublished state-results boundary. Named team members
  and removal of the target/preset controls were checked on the deployed preview.

The earlier evaluation above describes the pre-rollout state. Keep this
historical record when using the runbook for subsequent upgrades; pending
migration names and fixture counts must be rechecked each time.

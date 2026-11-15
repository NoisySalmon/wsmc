# Initial statewide coordinator bootstrap

The v2 seed includes a development coordinator. In a new production D1, the
first statewide coordinator must be created before passwordless sign-in can be
used. Run an authenticated administrative bootstrap from a trusted machine:

1. Insert one active user with a generated UUID and the coordinator’s normalized
   email into `users`.
2. Insert a row in `statewide_assignments` with that account’s `user_id`.
   Administrator access has no season.
3. Request a sign-in link from `/login` using that exact email.
4. After the first login, use the user administration flow to add the normal
   administrator, regional, coach, or scorekeeper assignments and revoke the temporary
   bootstrap authority if appropriate.

Do not put a raw sign-in token in source control, logs, tickets, or shell history.
Tokens are hashed in D1, expire after 24 hours, and are single-use. The
development email adapter logs a link only when no production email credentials
are configured; production must set `EMAIL_API_KEY`, `EMAIL_FROM`, and the
trusted public `APP_ORIGIN`.
Set `ENVIRONMENT=production` in the deployed Pages environment. Production
fails closed when the email provider is not configured, so raw sign-in links
cannot be emitted by an accidental development fallback.

For an existing account whose sign-in email is blocked, an administrator
can instead show a five-minute, single-use QR sign-in code from **Users &
access**. Regional coordinators can assist eligible coaches and scorekeepers
from their contest's **People** page. See [In-person QR sign-in](qr-sign-in.md).

## Email requests and abuse limits

Adding a person creates their account and grants access without sending email.
People request a sign-in email from `/login` (the anonymous homepage redirects
there). Administrators can select **Send sign-in email** for any enabled
account; regional coordinators can send to enabled people assigned to their
contest from **People**. Pending accounts activate on their first successful
sign-in through either email or QR.

Email links last 24 hours and display their expiry in Pacific time using
`America/Los_Angeles`, including daylight saving time. Up to three outstanding
email links remain usable to accommodate delayed delivery. Using any sign-in
link revokes outstanding email links; existing sessions remain signed in.
Generating a QR replaces only earlier QR codes, and requesting email does not
replace QR codes. Both kinds of link show a confirmation page: GET/HEAD requests
never consume a token; pressing **Sign in** submits a same-origin POST. This
prevents ordinary email link scanners from spending the credential.

D1 enforces a shared 60-second cooldown per account across public and staff
email actions, plus 60 public requests per IP per ten-minute window. Unknown,
disabled, and recently requested addresses receive the same public response.
Expired counters are removed on subsequent requests; IP addresses are hashed
before storage. A failed delivery revokes only its newly issued token and
requires waiting one minute before retrying.

No additional Cloudflare dashboard rule, paid service, or binding is required.
Apply `0014_sign_in_delivery.sql` to each target D1 before deploying the app,
following [the D1 deployment runbook](d1-runbook.md). Without the migration,
the new token and throttling queries cannot run. The session duration stays
30 days, independent of link expiry.

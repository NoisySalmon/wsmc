# Adding Google sign-in alongside email links

Status: future implementation guide; Google sign-in is not implemented or
configured by this document. Requirements checked against Google's documentation
on 2026-11-08; recheck the linked sources when implementing.

## Purpose and current hosting

Add **Sign in with Google** to `/login` so invited coaches, coordinators, and
scorekeepers can authenticate without receiving an email. Keep email links for
users who cannot use Google. Students do not sign in.

The app currently uses `https://wsmc.pages.dev` as its production `APP_ORIGIN`
and does not yet have an affiliated domain. A Google Workspace subscription,
hosting on Google, and an affiliated domain are not prerequisites for developing
Google sign-in. Production branding does require demonstrating control of the
website domains used by the app.

For now, this guide can remain a planning reference. Before public rollout,
choose a stable hostname controlled by the app's maintainers, ideally on the
future affiliated domain. An authorized subdomain is sufficient; we do not need
ownership of each user's district domain. Do not assume that control of a
Cloudflare Pages deployment automatically satisfies Google's domain verification:
check the current Console and Search Console requirements for the exact hostname.

Direct Google sign-in is suitable for the app's $0 service budget. It does not
require purchasing an authentication platform or migrating Cloudflare Pages/D1.
Domain registration, if needed, is a separate expense. Restricting access to
basic identity information avoids the restricted-scope security assessment
process. There is still implementation and ongoing maintenance work.

## School accounts and district approval

A district address such as `npeterson@asd103.org` works if it identifies a Google
account. Managed Google Workspace accounts use the same sign-in integration as
Gmail accounts. An email suffix by itself does not establish that the account
is managed by Google.

Google's verification of our app and a district's permission to use it are
separate. A district can block even a Google-verified app. Some districts permit
basic Google sign-in automatically; others require their administrator to allow
the app's OAuth client ID. Google sign-in bypasses email delivery problems, but
cannot bypass district access policy.

If approval is needed, give district IT:

- The production app URL, app name, support contact, and privacy policy.
- The production OAuth client ID (public identifier, not the client secret).
- The exact requested scopes: `openid email`, plus `profile` only if needed.
- A statement that sign-in needs no Gmail, Drive, Classroom, or contacts access,
  and that only invited adults receive application access.

Ask them to allow the necessary identity scopes for the relevant staff accounts
under Google Admin Console's third-party app access controls. Do not request
domain-wide delegation or broad Google-data access for this integration.

## 1. Choose the identity and account-linking rules

Google establishes identity; WSMC's existing assignments establish permissions.
Preserve these rules when adding the second sign-in method:

- Only existing invited accounts can gain access. A successful Google login
  must not create an unrestricted new WSMC user or grant assignments.
- An invited, pending user can sign in and become active without first opening
  the emailed invitation. Otherwise the new option would retain the delivery
  problem it is intended to solve.
- Disabled users stay blocked, including users with an existing Google link.
- First-time linking by exact normalized email is permitted only when the
  server has validated Google's token and Google is authoritative for the
  address: Gmail, or `email_verified=true` with a Workspace `hd` claim.
- A non-Gmail Google account without `hd` is not sufficient proof of current
  email ownership, even if `email_verified=true`. Require separate proof or a
  coordinator-assisted identity check before linking it.
- A personal Gmail account must not automatically inherit an invitation sent
  to a district address. Support explicit linking while already authenticated,
  or an administrator-assisted process with identity verification when email
  delivery is unavailable. Do not merge accounts based on names or domains.
- Store a unique Google issuer/`sub` identity linked to the existing WSMC user
  ID. Use that stable identity for subsequent sign-ins; do not silently relink
  it to someone else because an email changes. Handle address changes and
  reassignment through explicit account administration.

See Google's [server-side token verification guidance][tokens] for the distinction
between managed Workspace and other non-Gmail accounts.

## 2. Prepare Google OAuth configuration

1. Create a Google Cloud project under a maintainer-controlled account with
   durable recovery and appropriate maintainer access. Use separate projects
   for development and production.
2. In Google Auth Platform, choose an **External** audience. **Internal** would
   restrict use to one Workspace organization, excluding other districts and
   personal accounts. Owning an affiliated domain does not change this choice.
3. Declare only `openid` and `email`; add `profile` if using Google's name or
   picture. These are non-sensitive scopes. Do not enable extra API permissions
   from sample code.
4. Create a **Web application** OAuth client. Select the implementation flow
   before configuring its callback. A proposed server authorization-code flow
   would use `/auth/google/start` and `/auth/google/callback`; these routes do
   not exist yet. Register the exact callback URL, including scheme, hostname,
   port when applicable, and path. No wildcard callbacks.
5. For local development, register the actual localhost callback and port in
   the development project. If using Google's browser library, also register
   its exact authorized JavaScript origin. Keep preview deployments separate
   from production credentials and production D1.
6. Keep development in Testing and follow the Console's test-user instructions.
   Google's current documentation exempts basic identity-only scopes from the
   normal testing allowlist restriction; Testing is not an app access-control
   mechanism. WSMC must enforce its own invitation checks in every environment.

Use a Cloudflare-compatible OAuth/OIDC library and follow its documented setup.
Proposed environment variables are `GOOGLE_CLIENT_ID` and, for a confidential
server code flow, `GOOGLE_CLIENT_SECRET`. These are not currently read by the app.
Add the corresponding `App.Platform.env` types when implementing. Store the
secret in Cloudflare Pages environment secrets and ignored local configuration;
never commit it or send it to browser code. Keep `APP_ORIGIN` set to the trusted
public origin used to construct callbacks.

## 3. Prepare the public site and verify branding

Before submitting production branding:

1. Publish a clear public homepage and a privacy policy on the app's domain.
   Explain Google identity data use, storage, sharing, and removal/contact
   procedures. Link the privacy policy from the homepage; add terms if used.
2. Verify the applicable authorized domains in Google Search Console using an
   account associated with the Cloud project. Include domains used by the app
   links, callbacks, and browser origins.
3. Complete Branding with accurate app identity, contact details, and URLs.
   Use **Verify Branding**, resolve findings, then **Publish branding** after
   approval. Automated review may be quick; allow time for manual review.
4. Set the production audience's publishing status to production/published.
   Publishing the app and publishing verified branding are separate steps.

Basic identity scopes do not need sensitive/restricted data-access review.
An unverified production app may lack its intended displayed branding;
unapproved sensitive/restricted scopes additionally trigger warning screens
and a lifetime user cap. Do not add such scopes to solve a branding issue.
Follow the current [brand verification][branding] and [app-state][states] docs.

## 4. Integrate with this repository

The existing authentication service is in `src/lib/server/auth/service.ts`;
sessions and users are in `src/lib/server/db/schema.ts`. Implementation should:

1. Add the Google identity mapping through a D1 migration, enforcing uniqueness
   so a Google identity cannot belong to multiple WSMC users.
2. Add the sign-in button and server endpoints. For the code flow, use fresh,
   short-lived, single-use state tied to the initiating browser, a nonce, and
   PKCE; exchange the code on the server. Validate the token's signature,
   issuer, audience, expiry, and nonce with a maintained library. Cache Google's
   signing keys according to their cache headers. Never trust a decoded token
   without verification. If choosing Google's credential POST flow instead,
   implement its documented CSRF validation.
3. Apply the linking rules above and issue the existing WSMC session cookie.
   Extract shared session creation from `consumeSignInToken` as needed; Google
   sign-in should not manufacture an email token to create a session. Preserve
   session expiry, sign-out, administrator revocation, and assignment loading.
4. Explicitly allow the new unauthenticated endpoints in `src/hooks.server.ts`.
   Also allow the public homepage/privacy routes needed for verification;
   currently most routes require a session. Scope these exceptions narrowly.
5. Validate any post-login `next` destination as an internal app path. On
   cancellation or failure, return a useful message and retain email sign-in.
   Keep tokens, authorization codes, secrets, and callback query strings out
   of application logs and error reports.
6. Review invitations and **Add person**, not just `/login`: a failed email
   delivery must not prevent an administrator from provisioning an account
   that can use Google. Explain that an invited person can visit `/login`
   directly. Keep email as a notification and alternate sign-in option.
7. Update Product Requirements Section 6.1 and user guides when this behavior
   ships. Today they describe email-link authentication only.

## 5. Verify and roll out

Before release, verify Gmail and at least two districts' managed accounts, a
pending invited user who never received email, and existing users with multiple
assignments. Check that unknown and disabled accounts cannot enter; personal
Gmail cannot claim district invitations; concurrent linking cannot create
duplicate identities; invalid/replayed callbacks fail; and external `next`
destinations are rejected. Confirm sign-out, session revocation, cancellation,
and the email fallback still work. Follow the repository's test-audit skill
when adding or changing tests, then run the applicable repository checks.

Pilot with a small set of staff before general rollout. Record district blocks
separately from token/configuration errors. An account blocked by district
policy needs district IT approval, not a broader OAuth permission request.

If Google sign-in needs to be withdrawn, hide/disable its entry point and
endpoints while retaining existing users, assignments, and email sign-in.
Do not delete account records as a rollback strategy.

## Moving to an affiliated domain later

Before switching traffic, configure the new Cloudflare hostname, verify its
domain, and add its exact callback/origin and public policy URLs in Google.
Reverify and publish changed branding. Change `APP_ORIGIN` with the deployment
and test both authentication methods at the new address. Cookies do not move
between unrelated domains, so users should expect to sign in again.

Prefer retaining the production OAuth client ID during a hostname change so
districts do not have to approve a new client. Keep old callback support only
for a deliberate transition, then remove obsolete URLs. Do not redirect a
callback containing a code blindly across hosts. If the Google project or client
must change, coordinate district approval and review identity mappings and
token audiences before cutover.

## References

- [Google: Sign in with Google setup tutorial][setup]
- [Google: OpenID Connect][oidc]
- [Google: Verify ID tokens on the server][tokens]
- [Google: Brand verification][branding]
- [Google: OAuth app states and administrator overrides][states]
- [Google Workspace: Control third-party app access][districts]
- [Google: Verification categories and FAQ][faq]
- [WSMC: Initial coordinator bootstrap](auth-bootstrap.md)

[setup]: https://codelabs.developers.google.com/codelabs/sign-in-with-google-button
[oidc]: https://developers.google.com/identity/openid-connect/openid-connect
[tokens]: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
[branding]: https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
[states]: https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
[districts]: https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data
[faq]: https://support.google.com/cloud/answer/13463817?hl=en

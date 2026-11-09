# In-person QR sign-in

An administrator or regional coordinator can show an existing user a QR code
that signs them in without receiving email. No Google account or additional
service is required. The QR image is generated inside the app.

## Show a code

1. Verify the person's identity and choose their existing account.
2. Administrators: open **Users & access** (`/admin/users`). Regional
   coordinators: open the regional contest's **People** page
   (`/contests/<contestId>/staff`).
3. Select **Show sign-in QR** beside the person. The panel identifies the
   account by name and email. Check both before showing it.
4. Have that person scan the code with their phone camera and open its link.
   They receive the usual app session and their existing assignments. A pending
   account becomes active; no invitation email needs to be opened first.
5. Select **Close and revoke code** when finished. If the code was already
   used, closing it does not sign the person out.

Codes expire after five minutes and can be used once. Generating a code
replaces that person's earlier unused sign-in links and codes, including
emailed invitations. It does not revoke their existing sessions. If the panel
is lost by navigating away, the code still expires; generate another code to
replace it. The panel's countdown does not indicate whether someone has scanned
it. A sign-in link is available under the QR as a fallback for cameras that
cannot scan.

Anyone with the QR or fallback link can sign in as that person. Show it only
to the intended person; do not project it publicly, print it, or share a
screenshot. Only a hash of the sign-in token is stored in D1. Issuance is
recorded in the audit log with the issuing user and target user, without the
sign-in credential.

## Who can generate codes

- Administrators can generate codes for any enabled account.
- Regional coordinators can generate codes for scorekeepers assigned to their
  contest and coaches of schools participating in that contest for its season.
- Regional coordinators cannot generate codes for anyone who also holds an
  administrator or regional coordinator assignment, even in another contest.
  An administrator must help these users.
- Disabled accounts cannot receive codes or sign in with existing codes.
  Administrators must re-enable them first.

The code signs into the person's entire account, including any additional
coach/scorekeeper assignments; it does not create a contest-limited session.
It never creates an account or adds permissions. Add the person and their
assignment first if they are not listed. Email delivery failure during an
invitation may leave a pending account already created: reload and check the
list before retrying.

Administrators can use **Revoke links/sessions** to invalidate outstanding
codes and sessions, or disable the account. Regional coordinators use the
panel's close/revoke control to revoke that specific unused code. Removing an
assignment removes those permissions; it does not delete the person's account.

## Phones and localhost

A code generated for `http://localhost:5173` points to localhost on the scanning
phone, not to the development computer. For real use, open the deployed site
and ensure its trusted `APP_ORIGIN` is the public HTTPS address.

For a local phone demonstration, both devices need a reachable development
origin, such as the computer's LAN address on the same network. Bind Vite to
that interface (for example, `npm run dev -- --host 0.0.0.0`), open the app by
the LAN address, and ensure any development `APP_ORIGIN` matches that address.
Restart the development server after changing local environment settings.
Use fictional demo accounts on a trusted network. Production requires HTTPS.
Do not accept a submitted origin or change production's trusted origin to make
a local demonstration work.

## Validation

`npm run test:e2e:preview` runs the QR journey against a disposable local D1 and
the built Pages worker. It covers both HTML form display and JSON actions,
authorization, pending-account activation, token hashing, expiry, replay,
replacement, revocation, and disabled accounts. It sends no email and does not
use production data.

To additionally decode the generated QR image with an independent scanner,
install `rsvg-convert` and `zbarimg`, then run:

```bash
npm run build
WSMC_VERIFY_QR_IMAGE=1 npm run test:e2e:preview
```

The decoder compares the scanned value to the generated sign-in link without
printing the credential. Temporary images and database files are removed when
the preview journey finishes.

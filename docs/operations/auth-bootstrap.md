# Initial statewide coordinator bootstrap

The v2 seed includes a development coordinator. In a new production D1, the
first statewide coordinator must be created before passwordless sign-in can be
used. Run an authenticated administrative bootstrap from a trusted machine:

1. Insert one active user with a generated UUID and the coordinator’s normalized
   email into `users`.
2. Insert a statewide assignment for that user with `season_id` set to `NULL`
   (system-wide) or to the target season ID.
3. Request a sign-in link from `/login` using that exact email.
4. After the first login, use the user administration flow to add the normal
   season, regional, coach, or scorekeeper assignments and revoke the temporary
   bootstrap authority if appropriate.

Do not put a raw sign-in token in source control, logs, tickets, or shell history.
Tokens are hashed in D1, expire after 20 minutes, and are single-use. The
development email adapter logs a link only when no production email credentials
are configured; production must set `EMAIL_API_KEY`, `EMAIL_FROM`, and the
trusted public `APP_ORIGIN`.

# Database setup

MySQL 8.0.16 or newer (CHECK constraints are only enforced from 8.0.16).

## 1. Generate the three MySQL account passwords

Each account gets its own random password. Do not reuse one password.

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

Run it three times and put the results in `server/.env` as `DB_MIGRATOR_PASSWORD`,
`DB_APP_PASSWORD` and `DB_REPORT_PASSWORD`. Generate the admin password with the
same command and set `DB_ADMIN_PASSWORD`.

Passwords must be 24-100 printable ASCII characters, without quotes or
backslashes. `db/apply.mjs` rejects anything else before touching the server.

## 2. Apply the schema and create the accounts

```bash
cp server/.env.example server/.env   # then fill in the values
node db/apply.mjs
```

`apply.mjs` connects with `DB_ADMIN_USER` (root by default), applies
`schema.sql` and `db-users.sql`, then logs in as `leave_app` and `leave_report`
and proves the grants deny what they should:

| Check | Expected |
| --- | --- |
| `leave_app` reads applications | allowed |
| `leave_app` appends an activity log (rolled back) | allowed |
| `leave_app` deletes or updates `activity_logs` | denied |
| `leave_app` deletes users or applications | denied |
| `leave_app` drops tables or creates MySQL users | denied |
| `leave_report` reads report columns | allowed |
| `leave_report` reads `password_hash` | denied (column grant) |
| `leave_report` writes `activity_logs` | denied |

If any line prints FAIL, stop and inspect the grants; the script exits non-zero.

`schema.sql` is a baseline. Re-running it on an existing database fails loudly
rather than changing tables. To start over in development, drop the database
with the admin account and apply again.

## 3. Seed demo data (development only)

```bash
NODE_ENV=development node db/seed.mjs
```

The runner reads `server/.env`, refuses unless `NODE_ENV=development`, hashes
each password with Argon2id and prints the credentials once. The SQL guard in
`seed.sql` also fails if it ever sees `NODE_ENV` set to production, prod or
staging.

- Admin: `linda.cruz@example.com` (password from `SEED_ADMIN_PASSWORD`, or generated).
- Employees: `maria.santos@example.com`, `ana.lim@example.com`,
  `david.reyes@example.com` (active) and `carla.dizon@example.com` (inactive).
- Leave types: Vacation leave (15 days, no document), Sick leave (6 days,
  document required), Emergency leave (3 days, document required, inactive).

Re-running without `--rotate` refuses and prints no passwords, so a printed
password always matches the stored hash. Use
`NODE_ENV=development node db/seed.mjs --rotate` to issue new demo passwords.

## Account privileges

| Account | Grants | Used by |
| --- | --- | --- |
| `leave_migrator` | DDL + SELECT/INSERT/UPDATE/DELETE on `leave_system.*`, `CREATE TEMPORARY TABLES`. No `FILE`, no `CREATE USER`, no `GRANT OPTION`, no `SUPER`. | `db/apply.mjs`, `db/seed.mjs`, manual migrations |
| `leave_app` | SELECT/INSERT/UPDATE on users, leave_types, leave_applications, refresh_tokens; SELECT/INSERT on documents; SELECT/INSERT on activity_logs. **No DELETE anywhere, no DDL, no FILE, no GRANT.** | Express API |
| `leave_report` | Column-limited SELECT on users, SELECT on leave_types and leave_applications (not `reason`). No writes. | Optional report export |

`activity_logs` is append-only for the runtime account: the API can insert and
read, but not edit or delete. Token rows are revoked by setting `revoked_at`;
expired rows can be purged out-of-band with `leave_migrator` if retention policy
allows it.

## Notes

- By default the accounts are created for `DB_USER_HOST=localhost`. Widen it only
  when the API runs on a different machine, and restrict it to that address.
- For a remote production database, uncomment the `REQUIRE SSL` lines at the
  bottom of `db-users.sql` (after adjusting the host) and configure the API's
  MySQL connection with TLS.
- Never commit `server/.env`. Only `server/.env.example` belongs in the repo.

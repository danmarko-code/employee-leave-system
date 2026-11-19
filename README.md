# Employee Leave Application System

Course project for Information Assurance and Security: employees apply for
leave and track it; the administrator reviews applications, manages accounts and
leave types, prints reports and reads the activity log.

One Expo codebase targets Android, iOS and desktop browsers. The client talks
only to the Express API; MySQL is reachable only from the server.

**Setting this up on another machine?** See [docs/setup.md](docs/setup.md) — `npm install` +
`npm run db:apply`, no migration framework. Full variable-by-variable reference
in [docs/env-config.md](docs/env-config.md).

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1 | Schema, seed, least-privilege DB users | Delivered; SQL, grants and constraints verified on MySQL 8.0.46 |
| 2 | Backend auth, sessions, RBAC | Delivered; 45 tests green on MySQL 8.0.46 |
| 3 | Backend leave features and reports | Delivered; 73 tests green on MySQL 8.0.46 |
| 4 | Client auth, navigation, responsive shell | Delivered; web + native bundles build, Playwright pass |
| 5 | Employee screens | Delivered; apply/list/detail verified end-to-end on web |
| 6 | Admin screens | Delivered; decision queue, accounts, leave types, reports, activity |
| 7 | Security checklist, review report, tests | Delivered; review, full test pass and e2e in [docs/step-7-verification.md](docs/step-7-verification.md) |

## Layout

```
employee-leave-system/
├─ app/                     Expo client (React Native + react-native-web) - step 4+
│  ├─ app/                  Expo Router routes
│  ├─ src/                  components, hooks, api, adapters
│  ├─ metro.config.js       workspace-aware Metro
│  ├─ app.json              expo config
│  └─ tsconfig.json
├─ server/                  Express + TypeScript API - step 2+
│  ├─ src/
│  │  ├─ routes/ controllers/ middleware/ db/ services/ lib/
│  └─ tests/
├─ shared/                  zod schemas used by client and server
├─ db/
│  ├─ schema.sql            baseline schema
│  ├─ seed.sql              development seed (placeholders)
│  ├─ db-users.sql          least-privilege MySQL accounts
│  ├─ apply.mjs             applies schema + accounts, verifies grants
│  ├─ seed.mjs              hashes passwords, runs seed once, prints them once
│  └─ README.md             setup, privileges, verification
├─ docs/                    security review, checklist, API table
├─ package.json             DB tooling only in step 1
├─ server/.env.example      names only; server/.env stays git-ignored
└─ .gitignore
```

Folders that belong to later steps are described here but not created yet, so
the tree never contains empty placeholders.

## Step 7: security review

The closing review is done: the `security` skill checklist was walked over the
whole codebase (SQL injection, RBAC per object, transactions, sessions, CSRF,
headers, uploads, logging, secrets, dependencies), a full pass ran on a
disposable MySQL 3412 (74 tests, 12/12 grant checks), and the critical
cross-role journey was exercised in a browser against the seeded demo stack —
employee files two requests on a phone-sized viewport, admin refuses one and
approves the other, the employee sees the decisions and remarks, and an
employee hitting `/approvals` is bounced to `/home`. Two Low findings (one
real, one a wrong test expectation) are recorded and closed; no High/Medium
issues were found. The residual risks and the explicit
implemented/verified vs. not-verified vs. open-risk lists are in
[docs/step-7-verification.md](docs/step-7-verification.md). This is not a
claim of "fully secure": production hardening (deployment topology, shared
rate-limit store, monitoring, store-submission audit) is out of scope for the
current build.

> Demo note: Maria's applications from this run are #3 (2027-02-08, rejected),
> #4 (2027-03-15, approved). Earlier runs left #1 (Sick, approved) and #2
> (Vacation, rejected).

## Step 6: admin screens

Everything an administrator needs is now live: the decision queue at
`/approvals` (status/search/type filters, 10 per page), account management
(`/admin/users`, create + edit + reset password + leave history), leave-type
management (`/admin/leave-types`, create + edit + deactivate-instead-of-delete),
reports (`/admin/reports`: live tiles, leave summary for a year, applications
report with CSV download), and the read-only activity log (`/admin/activity`).
Roles are re-checked server-side on every `/admin/*` request; a client-side
`RequireRole` guard only hides the screens from employees. Full walkthrough and
security notes in [docs/step-6-verification.md](docs/step-6-verification.md).

> Demo note: the demo database now contains the decided applications from the
> step-6 run: Maria's Sick leave (approved) and Vacation leave (rejected).

## Step 5: employee screens

The employee flows are live on the same shell: My Requests (filter, paginate),
the apply form (Mon–Fri working-day counter, document attach with type/size
checks), the read-only request detail with a decision timeline, and document
viewing via authenticated download. Full walkthrough and security notes in
[docs/step-5-verification.md](docs/step-5-verification.md).

> Demo note: `maria.santos@example.com` has two decided applications from the
> step-5/6 browser runs: Sick leave for 30 Nov – 2 Dec 2026 (approved) and
> Vacation leave for 14–16 Dec 2026 (rejected).

## Step 4: client

```bash
# 1. Copy app/.env.example to app/.env and point EXPO_PUBLIC_API_URL at your
#    machine (localhost for web/iOS simulators, a LAN address for a phone).

npm run dev:app          # expo start --web --port 8081
npm run dev:server       # http://localhost:4000

npm run typecheck:app
npm run export:web       # static web build into app/dist
npm run export:android   # Android bundle
```

The client shell, sign-in, home and profile screens are live. Steps 5-6 add
the remaining screens on top of the same shell. The full walkthrough, security
checklist and open risks are in
[docs/step-4-verification.md](docs/step-4-verification.md).

## Step 2: API

```bash
# 1. Copy server/.env.example to server/.env and fill it in. Generate each
#    secret with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    DB_APP_USER must be leave_app (the least-privilege account from step 1).

npm run build:shared
npm run dev:server            # tsx watch, http://localhost:4000

npm run check:sql             # CI guard: no interpolated SQL, no eval
npm run test:server           # 45 integration tests; needs a disposable DB in server/.env
```

Endpoints, session rules, the full security checklist and the open risks are
in [docs/step-2-verification.md](docs/step-2-verification.md).

### Step 3: leave features, accounts and reports

Same commands as step 2 (`npm run test:server`, `npm run check:sql`). New
routes cover leave types, balances, applications with one supporting document,
admin decisions, account management, dashboard and two printable reports
(JSON or CSV). Uploads go to `UPLOAD_DIR` (`server/var/uploads` by default),
outside any web root.

The endpoint table, business rules, document handling, the security checklist
and the open risks (no malware scanner, no holiday calendar, no carry-over,
unencrypted files at rest) are in
[docs/step-3-verification.md](docs/step-3-verification.md).

### Security decisions in step 2

- Sessions are server-side. The access JWT is short-lived, but the role and
  `is_active` flag are re-read from MySQL on every request, so deactivation and
  role changes apply immediately.
- Refresh tokens are random, stored only as SHA-256 hashes, rotated on every
  use, and a replayed token revokes the whole family (committed before the
  401).
- Web and native flows are separated by the `X-Client` header: web uses an
  `HttpOnly; Secure; SameSite=Strict` cookie, native uses a body token, and
  neither flow accepts the other's token.
- Login answers are identical for unknown email, wrong password, locked and
  deactivated accounts, and Argon2 still runs for unknown emails.
- All SQL goes through one prepared-statement helper. `npm run check:sql`
  fails if a query is built with interpolation or concatenation.
- Routes are deny-by-default: the server refuses to start if a route was
  registered without an explicit access level.

## Step 1: database

Read [db/README.md](db/README.md). Short version:

```bash
# 1. Generate DB_MIGRATOR_PASSWORD, DB_APP_PASSWORD, DB_REPORT_PASSWORD and
#    DB_ADMIN_PASSWORD, then put them in server/.env (copy the example first).
node db/apply.mjs

# 2. Demo data, development only. Passwords are printed once.
NODE_ENV=development node db/seed.mjs
```

## Security decisions in this step

- MySQL accounts are least privilege. The runtime account has no `DELETE`
  anywhere, no DDL, no `FILE`, no `GRANT OPTION`; `activity_logs` is
  INSERT+SELECT only. The report account gets column-level SELECT on `users`
  so hashes and lockout fields are unreadable from the reporting path.
- No fixed or shared seed passwords. Passwords are generated per person,
  hashed with Argon2id (19 MiB, t=2, p=1) and printed once, or taken from
  `SEED_ADMIN_PASSWORD`. `seed.mjs` fails closed unless `NODE_ENV=development`,
  and `seed.sql` repeats the guard in SQL.
- `db/apply.mjs` is the only code path with `multipleStatements`, and only for
  two trusted static files. The API will use a single-statement helper.
- Re-running the seed without `--rotate` refuses, so a printed password cannot
  silently stop matching the database.
- Ids are bigint auto-increments. The API will never expose another person's
  row: ownership checks return 404.

Spec overrides applied (spec wins, recorded here so the review is honest):

- The security skill's sign-in checklist includes a "forgot password" link;
  this spec forbids that flow, so the client will not have one.
- The skill mentions a manager role and direct-report scoping; this spec has
  only employee and administrator, so no manager role exists.

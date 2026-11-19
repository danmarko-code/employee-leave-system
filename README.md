# Employee Leave Application System

Course project for Information Assurance and Security: employees apply for
leave and track it; the administrator reviews applications, manages accounts and
leave types, prints reports and reads the activity log.

One Expo codebase targets Android, iOS and desktop browsers. The client talks
only to the Express API; MySQL is reachable only from the server.

## Status

| Step | Scope | State |
| --- | --- | --- |
| 1 | Schema, seed, least-privilege DB users | Delivered; SQL, grants and constraints verified on MySQL 8.0.46 |
| 2 | Backend auth, sessions, RBAC | Not started |
| 3 | Backend leave features and reports | Not started |
| 4 | Client auth, navigation, responsive shell | Not started |
| 5 | Employee screens | Not started |
| 6 | Admin screens | Not started |
| 7 | Security checklist, review report, tests | Not started |

## Layout

```
employee-leave-system/
├─ app/                     Expo client (React Native + react-native-web) - step 4+
│  ├─ app/                  Expo Router routes
│  └─ src/                  components, hooks, api, adapters
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

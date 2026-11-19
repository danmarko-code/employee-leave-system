# Project status

**Is there a UI yet? No.** Only `shared/` and `server/` exist. The Expo client
(`app/`) starts in step 4.

Built for the Information Assurance and Security project: Expo client +
Express/TypeScript API + MySQL.

## Steps

| Step | Scope | State |
| --- | --- | --- |
| 1 | MySQL schema, seed, least-privilege DB users | Done, verified |
| 2 | API auth, sessions, RBAC, audit log | Done, 45 tests |
| 3 | Leave applications, documents, admin tools, reports | Done, 28 tests |
| 4 | Expo client auth, navigation, responsive shell | Delivered; web + native bundles build, Playwright pass |
| 5 | Employee screens | Pending |
| 6 | Admin screens | Pending |
| 7 | Security checklist, review, full test pass | Pending |

Total: **73 tests / 7 suites** green. `npm audit` = 0 vulnerabilities.

## What exists

- `db/` — schema (users, leave types, applications, documents, audit,
  refresh tokens), dev seed, `leave_migrator` / `leave_app` / `leave_report`
  MySQL accounts, apply + seed scripts.
- `shared/` — zod schemas and DTOs used by API and (later) client.
- `server/` — 20 routes under `/api`: login/refresh/logout, me, leave types,
  balances, applications, document upload/download, admin decisions, admin
  users, admin leave types, dashboard, reports (JSON/CSV), activity log.
- `docs/` — `step-1`, `step-2`, `step-3` verification reports with security
  checklists and residual risks.

## Run

```bash
cp server/.env.example server/.env    # fill DB + JWT + CORS values
cp app/.env.example app/.env          # EXPO_PUBLIC_API_URL
npm install
node db/apply.mjs
NODE_ENV=development node db/seed.mjs # prints demo passwords once
npm run dev:server                    # http://localhost:4000
npm run dev:app                       # expo start --web --port 8081

npm run test:server                   # needs a disposable DB in server/.env
npm run check:sql
npm run typecheck:app
```

Seed users: `linda.cruz@example.com` (admin), `maria.santos@example.com`,
`ana.lim@example.com`, `david.reyes@example.com`, plus inactive
`carla.dizon@example.com`. Passwords are printed by the seed, never stored in
the repo.

## Main decisions

- Argon2id, 15-minute access JWT, rotating refresh tokens (hash-only, reuse
  detection), server-side sessions, 30-min idle / 12-hour absolute.
- Web uses an httpOnly SameSite=Strict cookie; native uses a body token;
  `X-Client` separates the flows.
- Role and `is_active` are re-read from MySQL on every request.
- All SQL is constant strings + bound parameters (`check:sql` enforces it).
- Leave rules: Mon–Fri working days, same calendar year, no overlaps, pending
  counts against balance, one document (PDF/JPEG/PNG, 1 MiB, magic-byte check,
  random name outside the web root).
- No manager role, no cancelled status, no self-registration, no
  forgot-password flow (per spec).

## Known gaps

No malware scanner on uploads, no holiday calendar, no carry-over, files
unencrypted at rest, reports capped at 5,000 rows, in-process rate limiting.
Full list in `docs/step-3-verification.md`.

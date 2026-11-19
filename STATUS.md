# Project status

Expo client + Express/TypeScript API + MySQL. The UI is live: sign-in,
Home, My Requests, Apply, request detail, Profile (employee side, step 5)
and the admin screens (decision queue, accounts, leave types, reports,
activity log, steps 5 and 6). Step 7 (security review, full test pass, e2e)
is delivered — see `docs/step-7-verification.md`.

## Steps

| Step | Scope | State |
| --- | --- | --- |
| 1 | MySQL schema, seed, least-privilege DB users | Done, verified |
| 2 | API auth, sessions, RBAC, audit log | Done, 45 tests |
| 3 | Leave applications, documents, admin tools, reports | Done, 73 tests |
| 4 | Expo client auth, navigation, responsive shell | Delivered; web + native bundles build, Playwright pass |
| 5 | Employee screens | Delivered; Playwright run green |
| 6 | Admin screens | Delivered; Playwright run green |
| 7 | Security checklist, review, full test pass | Delivered; 74/74 tests on throwaway 3412, e2e green |

Total: **74 tests / 7 suites** green. `npm audit` = 0 vulnerabilities.
End-to-end journey (Playwright + Edge): 10/10 API checks and the full
cross-role UI flow — see `docs/step-7-verification.md`.

## What exists

- `db/` — schema (users, leave types, applications, documents, audit,
  refresh tokens), dev seed, `leave_migrator` / `leave_app` / `leave_report`
  MySQL accounts, apply + seed scripts.
- `shared/` — zod schemas and DTOs used by API and (later) client.
- `server/` — 20 routes under `/api`: login/refresh/logout, me, leave types,
  balances, applications, document upload/download, admin decisions, admin
  users, admin leave types, dashboard, reports (JSON/CSV), activity log.
- `docs/` — verification reports for steps 1-6 with security checklists
  and residual risks.

## Run

See [docs/setup.md](docs/setup.md) for a full other-device runbook
(install, env, `db:apply`, seed, phone via Expo Go, troubleshooting).



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
unencrypted at rest, reports capped at 5,000 rows, in-process rate limiting,
no forced password rotation, app-switcher privacy masking not implemented,
placeholder app identifiers. Consolidated list with severity and status:
`docs/step-7-verification.md` (F1 fixed in step 7; two Low items recorded).

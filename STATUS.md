# Project status

Expo client + Express/TypeScript API + MySQL. The UI is live: sign-in,
Home, My Requests, Apply, request detail, Profile (employee side)
and the admin screens (decision queue, accounts, leave types, reports,
activity log, leave calendar, holidays). Step 7 (security review, full
test pass, e2e) is the remaining work.

## Steps

| Step | Scope | State |
| --- | --- | --- |
| 1 | Design tokens, shared components (Button, Badge, Table, Dialog, Toast, Avatar, EmptyState, Surface, TextField) | Done, typechecks green |
| 2 | Login simplified, breadcrumbs, idle warning, MySQL photo column + migration | Done, typechecks green |
| 3 | Profile photo upload/remove via authenticated API, ProfilePhotoCard, Profile revamp, approvals list thumbnails, admin users list thumbnails | Done, typechecks green |
| 4 | Admin nav grouped (Overview; Work→Applications/Calendar; People→Employees; Setup→Leave types/Holidays; Reporting→Reports/Activity), mobile bottom bar 4 tabs + More | Done, typechecks green |
| 5 | Administrator screens: Overview stat cards (linked), Applications table (photo/filters/pagination), Application detail (photo + approve/reject confirm dialogs), Employees table (photo/sort/pagination), Leave calendar (month view, dept filter), Holidays admin list, Activity table (failure in red + CSV export), Reports table (+ CSV export, formula-injection guard) | Done, typechecks green |
| 6 | Security checklist, full test pass, Playwright e2e | Pending |
| 7 | Deploy, launch assets, store listings | Pending |

Total: **74 server tests / 7 suites** (baseline). `npm audit` = 0 vulnerabilities.
Typechecks pass across all 3 workspaces (`shared`, `server`, `app`).

## What exists

- `db/` — schema (users, leave types, applications, documents, audit, refresh tokens, photos, holidays), dev seed, `leave_migrator` / `leave_app` / `leave_report` MySQL accounts, apply + seed + migrate scripts.
- `shared/` — zod schemas and DTOs used by API and client.
- `server/` — 22 routes under `/api`: login/refresh/logout, me, leave types, balances, applications, document upload/download, admin decisions, admin users, admin leave types, admin holidays, dashboard, reports (JSON/CSV), activity log (JSON/CSV).
- `app/` — Expo Router screens with shared token/theme system (`tokens.ts`), `AppShell` responsive layout, `RequireRole` guard, `IdleSessionGuard`, `PhotoProvider`, `usePhoto` hook, `ProfilePhotoCard`.

## Run

See [docs/setup.md](docs/setup.md) for a full other-device runbook
(install, env, `db:apply`, seed, phone via Expo Go, troubleshooting).

```bash
cp server/.env.example server/.env    # fill DB + JWT + CORS values
cp app/.env.example app/.env          # EXPO_PUBLIC_API_URL
npm install
node db/apply.mjs
node db/migrate.mjs                   # runs 001_profile_photo + 002_holidays
NODE_ENV=development node db/seed.mjs # prints demo passwords once
npm run dev:server                    # http://localhost:4000
npm run dev:app                       # expo start --web --port 8081

npm run test:server                   # needs a disposable DB in server/.env
npm run check:sql
npm run typecheck:app
npm run build:shared
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
- Photos served via authenticated endpoint → cached blob/object URLs in `PhotoProvider`.
- Holidays affect only newly submitted applications; weekends/duplicates rejected.
- 4 synthetic avatars seeded through real pipeline, rest initials.

## Known gaps

No malware scanner on uploads, no carry-over, files unencrypted at rest,
reports capped at 5,000 rows, in-process rate limiting, no forced password
rotation, app-switcher privacy masking not implemented, placeholder app
identifiers.
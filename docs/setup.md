# Set up and run on another device

Short answers first, details below:

- **`npm install`** — once, at the repo root (`npm install` installs the
  `shared/`, `server/` and `app/` workspaces). Run it again only when
  `package-lock.json` changes.
- **`npx migrate`** — does not exist in this project. There is no migration
  framework; the database schema and the least-privilege MySQL accounts are
  applied with **`npm run db:apply`**, and demo data with `npm run db:seed`.
- Nothing to configure in the database by hand: `db:apply` creates the
  `leave_system` database, the tables, the checks and the three MySQL accounts
  (`leave_migrator`, `leave_app`, `leave_report`), then verifies the grants.
- Node **≥ 20.19.0** and MySQL **8.0.x** are required.

## 0. Prerequisites

| Piece | Version / note |
| --- | --- |
| Node.js | ≥ 20.19.0 (`node -v`) |
| MySQL Server | 8.0.x with an administrative (`root`) account, either local or reachable on your network |
| Git | any recent version |
| For a phone | [Expo Go](https://expo.dev/go) SDK 54 on the same Wi-Fi |

## 1. Clone

```bash
git clone https://github.com/danmarko-code/employee-leave-system.git
cd employee-leave-system
```

## 2. Install dependencies

```bash
npm install
npm run build:shared      # builds shared/dist (zod schemas); server and app need it
```

Skipping `build:shared` is the most common reason the server or the app
fails to start with `@leave/shared` resolution errors.

## 3. Configure `server/.env`

Full reference for every variable (with production guidance and the exact
fail-closed boot checks): [docs/env-config.md](env-config.md).

```bash
cp server/.env.example server/.env
```

Fill in every empty value. The file is git-ignored; never commit it.

1. **MySQL passwords** — generate three, ≥ 24 chars each:

   ```bash
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```

   Put them in `DB_APP_PASSWORD`, `DB_MIGRATOR_PASSWORD`, `DB_REPORT_PASSWORD`.
   `DB_ADMIN_PASSWORD` is your MySQL admin password; `db:apply` needs it once.
   `DB_APP_USER` must be `leave_app`, **never** `root` or `leave_migrator`.

2. **JWT secrets** — generate two different ≥ 32-byte values:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Put them in `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. The API refuses
   to boot on short/placeholder or identical secrets.

3. **Cookies/HTTPS for local development over plain http** — set
   `COOKIE_SECURE=false`. (In production both must be true; localhost is
   exempt from the Secure requirement.)

4. **CORS** — for web development against the same machine,
   `CORS_ORIGINS=http://localhost:8081` is right. No wildcards.

5. **Uploads** — leave `UPLOAD_DIR` empty (defaults to `server/var/uploads`)
   or set an absolute path outside any web root and `mkdir` it yourself.

6. **Ports** — `DB_PORT` is whatever your MySQL listens on (fresh install
   usually 3306); `PORT` is the API port (4000).

## 4. Configure `app/.env`

See [docs/env-config.md](env-config.md) for the `EXPO_PUBLIC_*` rules and why
bundle values are public.

```bash
cp app/.env.example app/.env
```

Set `EXPO_PUBLIC_API_URL` to the API address **as seen from the device that
runs the app**:

| Where the app runs | Value |
| --- | --- |
| Web on the same machine | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| iOS simulator | `http://localhost:4000` |
| Physical device over Wi-Fi | `http://<your computer's LAN IP>:4000` |

## 5. Create the database (once per machine)

```bash
npm run db:apply
```

What it does: fills the password placeholders in `db/schema.sql` and
`db/db-users.sql` from `server/.env`, creates `leave_system`, applies tables /
checks / indexes, creates `leave_migrator` / `leave_app` / `leave_report` with
least-privilege grants, then runs a grant verification (it proves the app
account cannot read audit tables, alter tables, or supervise). Expect a series
of `PASS` lines. Re-running it is safe (`CREATE … IF NOT EXISTS`).

There is no separate migration step after this — schema changes in this repo
are applied in place.

## 6. Seed the demo data (optional)

```bash
NODE_ENV=development npm run db:seed
```

Creates the demo accounts and leave types and **prints the generated
passwords once**. Save them; they are never stored or printed again. Re-running
refuses to touch existing accounts unless you pass `--rotate`.

Demo accounts: `linda.cruz@example.com` (admin), `maria.santos@example.com`,
`ana.lim@example.com`, `david.reyes@example.com` (employees), and inactive
`carla.dizon@example.com`.

## 7. Run it

Two terminals:

```bash
# Terminal 1 – API on http://localhost:4000
npm run dev:server

# Terminal 2 – web app on http://localhost:8081
npm run dev:web
```

Open http://localhost:8081 and sign in. The API has no health endpoint by
design; if the sign-in screen loads, the API responded.

For a phone in Expo Go, instead of terminal 2:

```bash
npm run dev:app     # prints a QR code; phone must be on the same Wi-Fi
```

and set `EXPO_PUBLIC_API_URL` (see section 4) to your LAN IP. On Windows the
firewall may prompt to allow Node on private networks — allow it, or the phone
cannot reach the API.

## 8. Usual checks

```bash
npm run typecheck:app   # client typecheck
npm run check:sql       # proves raw SQL is constant strings + bound params
npm run test:server     # needs a THROWAWAY MySQL, never your dev database
```

`test:server` expects a disposable MySQL instance (it is destructive). The
pattern used for CI-style runs: initialise an empty datadir, start `mysqld`
on a free port with the test `leave_*` passwords, run the Jest suite against
it, then shut it down and delete the datadir. Never point it at `leave_system`.

## 9. Reset everything

```bash
# MySQL (as admin), then re-run sections 5–6:
DROP DATABASE leave_system;
```

Stopping the app: `Ctrl+C` in both terminals.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| `Cannot find module '@leave/shared'` / exports resolve to missing `dist` | `npm run build:shared` was skipped |
| `Invalid server configuration: … JWT_ACCESS_SECRET` | secrets too short, placeholder, or identical |
| `Access denied for user 'leave_app'` | `server/.env` and the MySQL grants disagree — re-run `npm run db:apply` after editing `.env` |
| Blank web page / sign-in fails with no error | `EXPO_PUBLIC_API_URL` wrong for where the app runs (emulator vs LAN vs localhost), or CORS origin mismatch (`CORS_ORIGINS` must match `http://localhost:8081` exactly) |
| Phone "Network request failed" | `EXPO_PUBLIC_API_URL` uses localhost instead of LAN IP, or the firewall blocked port 4000 |
| `UPLOAD_DIR must be an absolute path` / upload fails | set an absolute `UPLOAD_DIR` and create it, or leave it empty for the `server/var/uploads` default |
| `npm install` fails on `argon2` | needs a C++ toolchain on the machine (Windows: VS Build Tools) unless a prebuilt binary downloads |
| Port already in use (4000/8081) | another dev process is running — stop it or change `PORT` / the Expo port |

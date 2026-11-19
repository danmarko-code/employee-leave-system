# Environment configuration: `server/.env` and `app/.env`

Reference for every variable the API, the DB tooling and the Expo client read,
with production guidance. It is a reference, not a deployment guide — the repo
has no deployed production environment, so the production column tells you what
the code enforces/expects, not what is already running.

Ground rules first:

- `server/.env` and `app/.env` are git-ignored. **Never commit real values.**
  `.env.example` files list the names only.
- The API **fails closed**: `loadConfig()` validates everything at startup and
  refuses to boot on a bad value, printing the variable *name* and the rule
  that was violated, never the secret value.
- `app/.env` is compiled into the client bundle (`EXPO_PUBLIC_*`). Everyone
  who receives the built app can read it. It may contain only the API URL —
  never tokens, passwords or keys.
- Secret generation (use these, do not invent anything):

  ```bash
  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # passwords (>= 24 chars)
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # JWT secrets (48 bytes -> 64 b64url chars, >= 43)
  ```

## `server/.env` — runtime and secrets

### Process / runtime

| Variable | Required | Default | Local dev | Production |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | no | `development` | `development` | `production` (enables HSTS, `trust proxy 1`, `FORCE_HTTPS`, rejects insecure cookies) |
| `PORT` | no | `4000` | `4000` | any 1–65535; terminate TLS at a proxy, proxy sets hop count via `TRUST_PROXY` |
| `LOG_LEVEL` | no | `info` | `info` (or `warn`) | `info`; `silent` only for debugging |

### MySQL — application connection (read by the API)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DB_HOST` | **yes** | — | e.g. `127.0.0.1`. No default on purpose: a wrong default would silently point a production boot at the wrong server. |
| `DB_PORT` | no | `3306` | 1–65535. Fresh installs are usually 3306; the demo instance uses 3399. |
| `DB_NAME` | no | `leave_system` | Schema created by `npm run db:apply`. |
| `DB_APP_USER` | **yes** | — | Must be `leave_app` (the least-privilege account). `root`, `leave_migrator`, `leave_report`, `mysql`, `admin` are rejected at boot; any other value is still rejected elsewhere — don't get creative. |
| `DB_APP_PASSWORD` | **yes** | — | Min **16** enforced; use ≥ **24** (generate per above). |

`leave_app` cannot read/alter other users' passwords, cannot delete from the
audit log, and has no grant-option. Everything the API does to the database
goes through this account.

### MySQL — tooling-only accounts (read by `db:apply` / `db:seed`, **not** by the API)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DB_ADMIN_USER` | no | `root` | Used once per machine by `db:apply` to create the least-privilege accounts. The API ignores it. Empty disables nothing — `db:apply` refuses without `DB_ADMIN_PASSWORD`. |
| `DB_ADMIN_PASSWORD` | **yes for `db:apply`** | — | Your MySQL admin password. Leave it empty if you already applied the schema; never give it to the API. |
| `DB_MIGRATOR_USER` | no | `leave_migrator` | DML + DDL account used by `db:apply`/`db:seed`. |
| `DB_MIGRATOR_PASSWORD` | **yes for `db:apply`/`db:seed`** | — | ≥ 24 chars recommended (24–100 printable ASCII, no quotes/backslashes). |
| `DB_REPORT_USER` | no | — | **Not read by any script.** The reporting account is always `leave_report`; this line is kept for symmetry. |
| `DB_REPORT_PASSWORD` | **yes for `db:apply`** | — | ≥ 24 recommended. `db:apply` creates `leave_report` with read-only grants. Today nothing connects as it (reporting runs as `leave_app`). |
| `DB_USER_HOST` | no | `localhost` | Host suffix for the three `leave_*` accounts when applying grants (`'user'@'HOST'`). Widen only if the API runs on a different machine; as tight as possible. Regex-checked; keep it simple. |

If `db:apply` fails with "`DB_ADMIN_PASSWORD` is not set", that is this
section's `DB_ADMIN_PASSWORD`, not the app credentials.

### JWT / sessions

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | **yes** | — | ≥ 43 chars base64url (32 bytes). ≥ 8 unique characters, must not start like a placeholder (`change…`, `example…`, `secret…`, `password…`, `replace…`), must differ from `JWT_REFRESH_SECRET`. |
| `JWT_REFRESH_SECRET` | **yes** | — | Same rules. Both names violated → boot fails with the variable name only. |
| `JWT_ISSUER` | no | `leave-system-api` | Checked on every verification; keep the default unless you run more than one API. |
| `JWT_AUDIENCE` | no | `leave-system-client` | Same. |

Access tokens live 15 minutes in server memory + client memory; refresh
tokens are rotated on every refresh and stored hash-only. Changing either
secret invalidates nothing in the DB but all previously issued tokens fail
verification, so every client re-signs-in. That is the intended kill-switch.

### Web client / transport

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `CORS_ORIGINS` | **yes** | — | Comma-separated **bare origins**: `scheme://host[:port]`, e.g. `https://leave.example.com` — no path, no trailing slash, no wildcards (`*` refused). `http` only allowed for localhost/127.0.0.1/[::1]; the rest must be `https` in production. Exact match, duplicates deduped. No Origin header (native app, curl) bypasses CORS entirely — CORS is a browser policy, not an auth layer. |
| `TRUST_PROXY` | no | `0` dev / `1` production | Number of reverse-proxy hops in front of Express (0–10). Required for `req.secure`/rate-limit-by-IP correctness behind nginx/Cloudflare-style proxies. **Never** `true`. If `0` behind a TLS proxy, every request looks insecure and `FORCE_HTTPS`/rate limiting misbehave. |
| `COOKIE_SECURE` | no | `true` | If production: **cannot be false** (boot refuses). Set `false` only for plain-http localhost development. |
| `COOKIE_DOMAIN` | no | — (empty) | Host-only cookie on the API host when empty. Set only when frontend and API share a registrable parent domain and you need the cookie visible on both subdomains; otherwise leave it empty. |
| `FORCE_HTTPS` | no | =`NODE_ENV==='production'` | When true and `req.secure` is false → `403 https_required` **before** any handler runs. Meaningless without the proxy setting `TRUST_PROXY` correctly on real deployments. |

### Rate limits (per 15-minute window, per IP, per server instance)

| Variable | Required | Default | Range |
| --- | --- | --- | --- |
| `GLOBAL_RATE_LIMIT_MAX` | no | `300` | 10–100000 |
| `LOGIN_RATE_LIMIT_MAX` | no | `10` | 3–1000 |
| `REFRESH_RATE_LIMIT_MAX` | no | `60` | 3–1000 |

In-process counters: they protect one instance. A multi-instance production
deployment needs a shared store (Redis) — until then, per-account lockout
(5 failures → 15 min, enforced atomically in SQL) remains the real
second-layer defence for credential attacks.

### Uploads

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `UPLOAD_DIR` | no | `./var/uploads` under the server working directory | If set, **must be absolute** and outside any web root. Created recursively at boot. Stored files get random UUID names, mode `0600`, written with `wx` exclusively; serving happens only through an authenticated route. Keep the directory off the web server and off your repo clones. |

### Seed (development only)

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `SEED_ADMIN_PASSWORD` | no | generated | Only read by `db:seed`. If set, the admin password is this value (must pass policy: 12–128 chars, ≥1 letter + ≥1 number); otherwise generated and **printed once**. Never use in production; remove the line after seeding. |

## `app/.env` — client bundle values

| Variable | Required | Default (code fallback) | Notes |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | recommended | `http://10.0.2.2:4000` on Android, else `http://localhost:4000` (`app/src/lib/config.ts`) | Origin of the API, as seen by the device running the app. Trailing slashes are stripped. |

Where the app runs → value:

| App location | `EXPO_PUBLIC_API_URL` |
| --- | --- |
| Web on the same machine | `http://localhost:4000` |
| Android emulator | `http://10.0.2.2:4000` |
| iOS simulator | `http://localhost:4000` |
| Physical device (same Wi-Fi) | `http://<computer LAN IP>:4000` |

Changing `.env` requires restarting `expo start` (values are read at bundle time).

## What the API does **not** read

`DB_ADMIN_*`, `DB_MIGRATOR_*`, `DB_REPORT_*` are tooling-only. If the API ever
needs one of these, that is a bug. The API's only database credential is the
least-privilege `DB_APP_USER`/`DB_APP_PASSWORD` pair, and the least-privilege
rules are verified by `npm run db:apply` on every apply.

## Startup failure messages you may actually see

| Message | Cause / fix |
| --- | --- |
| `DB_APP_PASSWORD is required (16+ characters)` | Empty or short value in `server/.env` |
| `JWT_ACCESS_SECRET must be at least 43 characters` | Generated a short value; use `randomBytes(48).toString('base64url')` |
| `JWT_ACCESS_SECRET still looks like a placeholder` | Starts with `change`/`example`/`secret`/`password`/`replace` |
| `JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values` | Reused the same string twice |
| `DB_APP_USER must be the least-privilege application account` | `root`/`leave_migrator`/`leave_report` placed in the app slot |
| `CORS_ORIGINS contains an invalid origin` / `must be bare origins` | Included a path, wildcard, or scheme typo |
| `CORS_ORIGINS must use https in production` | Plain `http://` origin with non-localhost host under `NODE_ENV=production` |
| `COOKIE_SECURE cannot be false in production` | Left `false` while deploying for real |
| `UPLOAD_DIR must be an absolute path` | Relative path entered; use an absolute one |
| `TRUST_PROXY must be …` / `PORT must be …` | Non-numeric or out-of-range value |

Security note on these errors: they name the variable and the violated rule;
they never echo the value. Still do not paste boot logs somewhere public
without reading them — `server_started` and error lines do not include secrets.

## Production checklist (illustrative — not yet deployed)

1. `NODE_ENV=production`, `LOG_LEVEL=info`.
2. TLS terminated at a reverse proxy; `TRUST_PROXY=1`; the proxy forwards
   `/api` to the API and serves the static web export, or you run only the API.
3. `COOKIE_SECURE` omitted or `true`; `COOKIE_DOMAIN` empty unless you control
   both subdomains; cookie stays scoped to `/api/auth`.
4. `CORS_ORIGINS=https://<your-web-hostname>` only — the single origin,
   nothing else.
5. Fresh `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (the two from your dev file
   were used against your dev machine — mint new ones).
6. `DB_USER_HOST` tightened to the API host (`leave_app@apiserver`), or keep
   `localhost` if MySQL and API share the host.
7. Rotate `DB_APP_PASSWORD`/`DB_MIGRATOR_PASSWORD`/`DB_REPORT_PASSWORD` away
   from anything ever shown on a screen; re-run `npm run db:apply` (it
   re-applies grants idempotently), update `server/.env`, restart.
8. `UPLOAD_DIR` on a non-web-root disk with backups; MySQL backups
   (`mysqldump leave_system`) scheduled; both outside the repo.
9. Monitoring on the structured log (`login_failure`, `access_denied`,
   `session_reuse`); rotate logs; never log request bodies.

## Related docs

- [`setup.md`](setup.md) — install + run on a new machine (including manual
  LAN/Wi-Fi setup)
- [`step-7-verification.md`](step-7-verification.md) — which of these controls
  were verified vs. only implemented

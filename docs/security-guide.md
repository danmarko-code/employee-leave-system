# Security guide: how this app is protected, and how to test it yourself

This is a working document, not a certificate. It explains **how the security
works**, **where each control lives in the code**, and **how to attack your own
instance and confirm the defences actually fire**. Line references will drift;
file names will not.

The companion document is [`database-guide.md`](./database-guide.md) — that one
covers the tables, the accounts and the relationships.

---

## 0. Rules before you start

1. **Only attack `localhost`.** Every command below targets
   `http://localhost:4000/api` on your own machine with your own seeded data.
2. Tests **change data** — logins are recorded, failed attempts can lock an
   account, and audit rows are appended. That is the point: the evidence is the
   output. There is a cleanup section at the end.
3. `activity_logs` is append-only by database grant. You cannot (and should
   not) edit history to make a test look clean.

Start the API first (Terminal 1):

```bash
cd ~/employee-leave-system
npm run dev:server
```

You should see it listening on **4000**.

---

## 1. How authentication actually works

There are two token flows, deliberately different, because the threat models
are different:

```
                       ┌──────────────────────────────────────────┐
  email + password ───►│ POST /api/auth/login                     │
                       │  · Argon2id verify (or a dummy hash)     │
                       │  · 5 failures → 15 min account lockout    │
                       │  · writes activity_logs: login_success /  │
                       │    login_failure                          │
                       └───────────────┬──────────────────────────┘
                                       │
              ┌────────────────────────┴─────────────────────────┐
              │ web (X-Client: web)        native (X-Client: native)
              ▼                                                  ▼
   access token in memory only                  access token in memory
   refresh token in httpOnly cookie             refresh token returned in the
   `ls_rt` · Path=/api/auth ·                   body, stored in SecureStore
   SameSite=Strict · Secure in prod             (WHEN_UNLOCKED_THIS_DEVICE_ONLY)
              │                                                  │
              └──────────────────┬───────────────────────────────┘
                                 ▼
                    POST /api/auth/refresh  (rotation)
                    · row locked FOR UPDATE
                    · old token revoked, new one issued
                    · replay of a revoked token → whole
                      token *family* revoked + `session_reuse`
```

Key properties:

| Property | Value | Where |
| --- | --- | --- |
| Password hash | Argon2id, 19 MiB, t=2, p=1, 32-byte output | `server/src/lib/password.ts` |
| Access token | HS256 JWT, 15 minutes, `iss`/`aud`/`exp` checked, `alg` fixed | `server/src/lib/tokens.ts` |
| Refresh token | 32 random bytes (256 bits), base64url; **only its SHA-256 is stored** | `server/src/lib/tokens.ts`, `refresh_tokens.token_hash` |
| Session limits | 30 min idle, 12 h absolute | `shared/src/constants.ts`, `session.service.ts`, `middleware/auth.ts` |
| Logout | revokes the token family server-side | `session.service.ts`, `auth.controller.ts` |
| Role | re-read from `users` on **every** request, never trusted from the JWT | `middleware/auth.ts` |

The JWT contains `sub` (user id), `role` and `sid` (session/family id). The `sid`
is what lets the server refuse a token whose session was revoked or has gone
idle — a valid signature is not enough.

### Why the password never matters after hashing

`password_hash` is a PHC string such as:

```
$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
```

It is one-way. Sign-in re-hashes the submitted password with the stored salt and
compares in constant time (`argon2.verify`). See the appendix to prove this to
yourself in one command.

---

## 2. Every control, mapped to the file that implements it

| # | Control | What it stops | Implementation |
| --- | --- | --- | --- |
| 1 | Argon2id hashing + password policy (8–128 chars, common-password denylist) | Password cracking, trivially guessable passwords | `server/src/lib/password.ts`, `shared/src/users.ts` |
| 2 | Dummy hash for unknown emails; one generic `invalid_credentials` | Account enumeration by message or timing | `server/src/services/auth.service.ts` |
| 3 | Atomic per-account lockout: 5 failures → 15 min | Online password guessing | `auth.service.ts` (`registerFailedAttempt`), `users.failed_attempts`, `users.locked_until` |
| 4 | Per-IP rate limits: 300/15 min global, 10 login, 60 refresh, 20 photo | Flooding, credential stuffing, upload abuse | `server/src/middleware/rateLimit.ts` |
| 5 | Refresh rotation with row lock + family revoke on reuse | Stolen refresh token replayed | `server/src/services/session.service.ts` |
| 6 | httpOnly + SameSite=Strict cookie scoped to `/api/auth`; access token in memory only | XSS token theft, cross-site cookie sending | `auth.controller.ts`, `app/src/lib/api.ts` |
| 7 | CSRF: exact-origin allow-list **and** `X-Requested-With: XMLHttpRequest` on web auth routes | Cross-site request forgery against the cookie flow | `server/src/middleware/csrf.ts` |
| 8 | CORS: exact bare origins, no wildcard, production requires https | Reading API responses from an attacker's page | `server/src/app.ts`, `config/env.ts` (`parseOrigins`) |
| 9 | Helmet: CSP `default-src 'none'`, frame deny, nosniff, no-referrer, COOP/CORP, HSTS in prod | Clickjacking, MIME sniffing, referrer leakage | `server/src/app.ts` |
| 10 | Explicit access declaration on every route; server refuses to boot otherwise | A new endpoint accidentally shipping unauthenticated | `server/src/routes/registry.ts` |
| 11 | `requireAuth` re-reads user + session on every request | Deactivated users, revoked sessions, stale roles | `middleware/auth.ts` |
| 12 | `requireRole` → 403 and `access_denied` audit row | Vertical privilege escalation | `middleware/role.ts` |
| 13 | Ownership predicates in every query; foreign objects → **404** | IDOR / horizontal privilege escalation | `services/leave.service.ts` |
| 14 | Prepared statements only; `npm run check:sql` fails CI otherwise | SQL injection | `server/src/db/query.ts`, `server/scripts/check-sql.mjs` |
| 15 | Zod `strictObject` schemas, 32 kb JSON body limit, simple query parser | Mass assignment, oversized payloads, query-parser tricks | `shared/src/*.ts`, `middleware/validate.ts`, `app.ts` |
| 16 | Uploads: 1 MiB in memory, magic-byte sniffing, random UUID name, mode 0600, `wx`, outside web root, authenticated streaming | Malicious/mislabelled files, path traversal, enumerable URLs | `middleware/upload.ts`, `lib/files.ts` |
| 17 | Generic error bodies with a `requestId`; redacted logs | Stack/SQL/schema disclosure | `middleware/errorHandler.ts`, `lib/logger.ts` |
| 18 | Least-privilege MySQL accounts; append-only audit table | App compromise escalating to DDL, data deletion, log tampering | `db/db-users.sql` |
| 19 | Fail-closed startup config (secret entropy, no root app user, Secure cookies and https origins in production) | Deploying an insecure configuration | `server/src/config/env.ts` |
| 20 | CSV formula-injection neutralisation, 5,000-row cap | Spreadsheet injection through exports | `services/report.service.ts` |
| 21 | Client stores no tokens in `localStorage`/`AsyncStorage`; cross-tab sign-out via `BroadcastChannel` | Token persistence on a shared machine | `app/src/lib/session.tsx` |
| 22 | Idle warning + automatic sign-out; 30 s API deadline | An unattended unlocked session | `app/src/components/IdleSessionGuard.tsx`, `app/src/lib/api.ts` |

Two things are **not** security controls even though they look like them:
`RequireRole` on the client, and disabled buttons. They are UX. The server
enforces everything again.

---

## 3. The attack playbook

Open **Git Bash** at the project root. Each test has a PASS criterion — do not
accept "it looked fine".

### Setup: get two tokens

```bash
API=http://localhost:4000/api

login() {
  curl -s -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' -H 'X-Client: native' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken ?? 'FAILED'"
}

ADMIN=$(login linda.cruz@example.com 'AdminPass1234!')
EMP=$(login maria.santos@example.com 'TL9Qt$PnvNbhzk*J7VkP')

echo "admin: ${ADMIN:0:16}…  employee: ${EMP:0:16}…"
```

Both must print a token prefix. If one prints `FAILED`, re-read the seed output
or reset that account's password with the admin **Employees → Reset password**
screen.

> These are the seeded demo passwords from `npm run db:seed`. They are printed
> once by the seed. If you changed them, use your own.

---

### Test 1 — Horizontal escalation (IDOR)

**Attack:** an employee reading someone else's leave request.

First create one row as Maria, so there is something private to protect:

```bash
curl -s -X POST "$API/leaves" -H "Authorization: Bearer $EMP" \
  -H 'Content-Type: application/json' \
  -d '{"leaveTypeId":1,"startDate":"2027-04-05","endDate":"2027-04-06","reason":"Security test IDOR"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).application.id"
```

Note the id printed (call it `N`). Now sign in as David and ask for it:

```bash
DAVID=$(login david.reyes@example.com 't8mLunaLonD2+j^3Ufuq')
curl -s -o /dev/null -w "%{http_code}\n" "$API/leaves/N" -H "Authorization: Bearer $DAVID"
```

**PASS:** `404`. Not `403` — a 403 would confirm the row exists. Maria can still
read it with her own token:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$API/leaves/N" -H "Authorization: Bearer $EMP"   # 200
```

---

### Test 2 — Vertical escalation (RBAC)

**Attack:** an employee calling admin endpoints.

```bash
for path in admin/leaves admin/users admin/activity-logs admin/dashboard; do
  printf '%-24s ' "$path"
  curl -s -o /dev/null -w "%{http_code}\n" "$API/$path" -H "Authorization: Bearer $EMP"
done
```

**PASS:** four `403`s. Then confirm the denial was recorded:

```bash
curl -s "$API/admin/activity-logs?pageSize=5" -H "Authorization: Bearer $ADMIN" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).items.map(i=>i.action).join(', ')"
```

**PASS:** `access_denied` appears (one per attempt, newest first).

---

### Test 3 — Account enumeration

**Attack:** work out which emails exist from the response or the timing.

```bash
# unknown email
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"nobody@example.com","password":"whatever1"}'; echo

# real email, wrong password
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"maria.santos@example.com","password":"wrongpass1"}'; echo
```

**PASS:** byte-identical bodies — `401 invalid_credentials` with the same
message. A dummy Argon2 verification runs for the unknown email, so the timing
is comparable too (it should be within noise; do not expect microsecond
equality over HTTP).

---

### Test 4 — Brute force and lockout

**Attack:** guess a password repeatedly.

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
    -d '{"email":"ana.lim@example.com","password":"definitely-wrong"}'
done
# now the correct password:
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"ana.lim@example.com","password":"XYHsLeRRXNwyZ+8WYz$+"}'; echo
```

**PASS:** the last call is still `401 invalid_credentials` even though the
password is right — the account is locked for 15 minutes.

Verify in the database (`locked_until` is in the future, `failed_attempts` reset
to 0 by the lock):

```bash
export MYSQL_PWD=$(grep '^DB_ADMIN_PASSWORD=' server/.env | cut -d= -f2-)
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root leave_system \
  -e "SELECT email, failed_attempts, locked_until FROM users WHERE email='ana.lim@example.com';"
```

**Unlock for later tests:**

```bash
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root leave_system \
  -e "UPDATE users SET failed_attempts=0, locked_until=NULL WHERE email='ana.lim@example.com';"
```

Hammering login from one IP also trips the per-IP limiter: run a tight loop
more than 10 times and you will get `429 rate_limited` instead.

---

### Test 5 — CSRF against the cookie flow

**Attack:** a page on another origin trying to use the browser's cookie.

```bash
# (a) evil origin
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Client: web' \
  -H 'Origin: http://evil.example' -H 'X-Requested-With: XMLHttpRequest' \
  -d '{"email":"x@y.z","password":"whatever1"}'

# (b) allowed origin but no X-Requested-With (a plain HTML form can do this)
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Client: web' \
  -H 'Origin: http://localhost:8081' \
  -d '{"email":"x@y.z","password":"whatever1"}'
```

**PASS:** both `403`, body `csrf_failed`. A cross-site form cannot set
`X-Requested-With` without a CORS preflight, which the next test refuses.

---

### Test 6 — CORS

**Attack:** an attacker's page reading authenticated responses.

```bash
curl -s -i -X OPTIONS "$API/leaves" \
  -H 'Origin: http://evil.example' -H 'Access-Control-Request-Method: GET' \
  | grep -i "access-control-allow-origin" ; echo "exit=$?"
```

**PASS:** no `Access-Control-Allow-Origin` header at all (grep finds nothing).
With the real origin the header is present and echoes `http://localhost:8081`.

---

### Test 7 — SQL injection

**Attack:** break out of an email field.

```bash
curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"admin@x.com'"'"' OR 1=1 -- ","password":"x"}'; echo
```

**PASS:** a normal `401 invalid_credentials`, no rows returned, no SQL error.

Prove the pattern is systemic, not lucky:

```bash
npm run check:sql     # PASS = "SQL safety check passed"
```

That script fails the build if any call site builds SQL by concatenation; all
queries go through `db/query.ts` and mysql2's server-side prepared statements.

---

### Test 8 — Mass assignment

**Attack:** smuggle fields that the screen never shows.

```bash
curl -s -X PATCH "$API/admin/users/3" -H "Authorization: Bearer $ADMIN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ana","passwordHash":"$2b$fake","email":"attacker@example.com"}'; echo
```

**PASS:** `400 invalid_input` naming the unknown fields. The updater schema is a
Zod `strictObject`, so unknown keys are rejected rather than ignored. (Changing
`role` *is* allowed for an admin — that is a real feature — but you must be an
admin to reach it, which test 2 covers.)

---

### Test 9 — Upload abuse

Only if the API has a leave type that requires a document. Three separate
checks:

```bash
# (a) oversized: 2 MiB of zeros pretending to be a PDF
head -c 2097152 /dev/zero > /tmp/big.pdf
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/leaves" \
  -H "Authorization: Bearer $EMP" -F 'leaveTypeId=1' -F 'startDate=2027-05-03' \
  -F 'endDate=2027-05-04' -F 'reason=Upload test' -F 'document=@/tmp/big.pdf;type=application/pdf'

# (b) wrong bytes, right name: a text file declared as a PNG
printf 'not an image\n' > /tmp/fake.png
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/leaves" \
  -H "Authorization: Bearer $EMP" -F 'leaveTypeId=1' -F 'startDate=2027-05-06' \
  -F 'endDate=2027-05-07' -F 'reason=Upload test' -F 'document=@/tmp/fake.png;type=image/png'

# (c) no token at all
curl -s -o /dev/null -w "%{http_code}\n" "$API/leaves/1/document"
```

**PASS:** `413`, then `400`, then `401` (or `404` after a successful sign-in for
a document that is not yours). Filenames are never used for storage: the file
lands under a random UUID with mode 0600 outside any web root, so
`../../etc/passwd` has nowhere to go.

---

### Test 10 — Refresh-token replay

**Attack:** use a rotated refresh token twice — the signature of a stolen token.

```bash
# log in natively and capture the refresh token
RT=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"david.reyes@example.com","password":"t8mLunaLonD2+j^3Ufuq"}' \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).refreshToken")

# first rotation: succeeds and returns a new token
curl -s -X POST "$API/auth/refresh" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d "{\"refreshToken\":\"$RT\"}" | head -c 120; echo

# replay the ORIGINAL token: must fail
curl -s -X POST "$API/auth/refresh" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d "{\"refreshToken\":\"$RT\"}"; echo
```

**PASS:** the second call is `401 session_expired` **and** the freshly issued
token from the first call is now dead too, because the whole family was revoked.
Check the audit trail:

```bash
curl -s "$API/admin/activity-logs?pageSize=10" -H "Authorization: Bearer $ADMIN" \
  | node -pe "JSON.parse(require('fs').readFileSync(0)).items.map(i=>i.action).join(', ')"
```

**PASS:** `session_reuse` is present.

---

### Test 11 — Security headers and error leakage

```bash
curl -s -I "$API/me" | grep -iE "content-security-policy|x-frame-options|x-content-type-options|referrer-policy|cross-origin"
curl -s "$API/leaves/999999" -H "Authorization: Bearer $ADMIN"; echo
```

**PASS:** CSP contains `default-src 'none'`; `x-frame-options: DENY`;
`x-content-type-options: nosniff`; `referrer-policy: no-referrer`. The error body
is `{"error":{"code":"not_found","message":"Not found.","requestId":"…"}}` — no
stack, no SQL, no table names, and no `x-powered-by` header.

---

### Test 12 — Deactivated account

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"carla.dizon@example.com","password":"c8yyvZ@KgD7-w%45wnHs"}'
```

**PASS:** `401 invalid_credentials` — indistinguishable from a wrong password.
This is stronger than "your account is disabled", which would leak that the
account exists.

---

### Test 13 — Revocation actually revokes

**Attack:** keep using an access token after signing out.

```bash
# one login, so the access token and refresh token belong to the SAME session
LOGIN=$(curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d '{"email":"david.reyes@example.com","password":"t8mLunaLonD2+j^3Ufuq"}')
TOKEN=$(node -pe "JSON.parse(require('fs').readFileSync(0)).accessToken" <<< "$LOGIN")
RT=$(node -pe "JSON.parse(require('fs').readFileSync(0)).refreshToken" <<< "$LOGIN")

# sign out (native flow revokes the family)
curl -s -o /dev/null -w "logout=%{http_code}\n" -X POST "$API/auth/logout" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -H 'X-Client: native' \
  -d "{\"refreshToken\":\"$RT\"}"

# the access token has not expired, but its session is gone
curl -s -o /dev/null -w "after-logout=%{http_code}\n" "$API/me" -H "Authorization: Bearer $TOKEN"
```

**PASS:** `logout=204` then `after-logout=401`. The JWT is still
cryptographically valid; `requireAuth` refuses it because the session row is
revoked.

---

### Test 14 — The client itself

1. Sign in on `http://localhost:8081`, open DevTools → **Application**:
   - **Cookies** contain `ls_rt` with `HttpOnly` and `SameSite=Strict`.
   - **Local Storage / Session Storage** contain **no** token, no user object.
2. Sign out: the "Signing out…" overlay appears, then you land on sign-in.
3. In the database, that session family now has `revoked_at` set:

```bash
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root leave_system \
  -e "SELECT family_id, user_id, client_type, revoked_at FROM refresh_tokens ORDER BY id DESC LIMIT 5;"
```

**PASS:** the newest web row has a non-NULL `revoked_at`. Sign-out is a real
server-side revocation, not just a screen change.

---

## 4. Where the evidence lives

The audit trail is the point of the exercise. **Admin → Activity** shows it, or
query it directly:

```bash
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root leave_system -e "
SELECT created_at, action, target_type, target_id
  FROM activity_logs
 ORDER BY id DESC
 LIMIT 20;"
```

| Action | Written when |
| --- | --- |
| `login_success` | credentials accepted |
| `login_failure` | wrong password, unknown email, locked or inactive account |
| `logout` | explicit sign-out |
| `session_reuse` | a revoked refresh token was replayed |
| `access_denied` | a non-admin called an admin route |
| `leave_submitted` / `leave_approved` / `leave_rejected` | workflow events |
| `account_created` / `account_updated` / `account_activation_changed` / `password_reset` | admin user management |
| `leave_type_changed`, `holiday_created`, `holiday_deleted`, `report_generated`, `profile_update` | the remaining admin/self actions |

Deliberately absent from `activity_logs`: passwords, tokens, email addresses,
leave reasons, phone numbers. The table stores ids, enums and timestamps only.
`leave_app` has `INSERT` and `SELECT` on it — no `UPDATE`, no `DELETE` — so the
application cannot rewrite history even if it is compromised.

---

## 5. Automated checks (run these before any deploy)

```bash
npm run test:server    # 74 tests: auth, sessions, RBAC, uploads, reports, grants
npm run check:sql      # proves no SQL is built by string concatenation
npm audit              # dependency CVEs against the committed lockfile
npm run typecheck:app  # client types
```

A clean run is a baseline, not a proof. The manual tests above cover the
behaviour that unit tests mock.

---

## 6. What is still not covered

Recorded honestly in [`step-7-verification.md`](./step-7-verification.md); the
short version:

1. **Role checks on the client are UX only.** The API is the enforcement point.
2. **No malware scan on uploads.** Types are restricted and magic-byte
   verified, files are unencrypted at rest and outside the web root.
3. **No forced password rotation.** Admin-issued passwords are shown once.
4. **Rate limiting is in-process.** A multi-instance deployment needs a shared
   store (Redis) or the limits stop being global.
5. **IP addresses in the audit log are aids, not identity.**
6. **App-switcher masking / screen-capture blocking is not implemented.**
7. **Production topology is not deployed.** The fail-closed config paths are
   tested, but HSTS/TLS, secret management and monitoring are deploy-time work.
8. `leave_report` exists but is unused; reporting uses `leave_app`.
9. Placeholder app identifiers (`com.example.*`) must change before store
   submission.

---

## Appendix A — Prove the password hashing yourself

Generate a hash, verify it twice, and see that the salt changes every time:

```bash
cd ~/employee-leave-system
node --input-type=module -e "
import argon2 from 'argon2';
const opts = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 };
const a = await argon2.hash('TestPass1234!', opts);
const b = await argon2.hash('TestPass1234!', opts);
console.log('hash 1:', a);
console.log('hash 2:', b);
console.log('same hash?      ', a === b);
console.log('verify correct? ', await argon2.verify(a, 'TestPass1234!'));
console.log('verify wrong?   ', await argon2.verify(a, 'nope'));
"
```

Expected: different hashes, both `true` for the right password, `false` for the
wrong one. That is why a stolen database dump does not hand over passwords.

## Appendix B — Inspect the hashes in the database

```bash
export MYSQL_PWD=$(grep '^DB_ADMIN_PASSWORD=' server/.env | cut -d= -f2-)
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root leave_system \
  -e "SELECT id, email, LEFT(password_hash, 44) AS prefix, LENGTH(password_hash) AS len FROM users;"
```

Every row starts with `$argon2id$v=19$m=19456,t=2,p=1$` and is 97 characters
long. If a row ever holds anything else — plaintext, MD5, `$2b$` — that is a
finding, not a variant.

## Appendix C — Clean up after testing

These tests leave real rows behind: `activity_logs` entries, a few leave
applications, revoked token families, and possibly a locked account. That is
expected. To start from a clean demo dataset:

```bash
npm run db:seed
```

Unlock a single account without wiping anything:

```bash
export MYSQL_PWD=$(grep '^DB_ADMIN_PASSWORD=' server/.env | cut -d= -f2-)
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root leave_system \
  -e "UPDATE users SET failed_attempts=0, locked_until=NULL WHERE email='ana.lim@example.com';"
```

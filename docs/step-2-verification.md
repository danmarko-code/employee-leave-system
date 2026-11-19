# Step 2 verification: authentication, sessions and RBAC

Scope: the API's identity layer only. Leave applications, documents, admin
user management and reports arrive in step 3, so this document does not claim
they exist.

Everything below was executed against a disposable MySQL 8.0.46 instance
(temporary data directory on port 3399, removed afterwards). The user's
`MySQL80` service and data were not touched. `npm audit` reports
**0 vulnerabilities**; `npm run check:sql` passes.

## What was built

```
server/
├─ src/
│  ├─ app.ts                     Express assembly, Helmet, CORS, body limits
│  ├─ index.ts                   bootstrap: config, DB ping, Argon2 warm-up, shutdown
│  ├─ config/env.ts              startup validation; fails closed, never prints secrets
│  ├─ db/pool.ts                 pool (multipleStatements: false)
│  ├─ db/query.ts                the only SQL helper: constant string + params
│  ├─ lib/                       errors, logger, password (Argon2id), tokens, cookies, sanitize
│  ├─ middleware/                requestContext, auth, role, csrf, rateLimit, validate,
│  │                             prototypePollution, contentType, errorHandler
│  ├─ services/                  auth, session (rotation), activity (audit)
│  ├─ controllers/               auth, me, admin
│  ├─ routes/                    auth, me, admin + deny-by-default registry
│  └─ types/express.d.ts         req.id, req.auth, req.clientType, req.valid
├─ tests/                        45 tests, 5 suites
├─ scripts/check-sql.mjs         CI guard: no interpolated SQL, no eval, no stackable SQL
├─ .env.example
└─ tsconfig.json / tsconfig.test.json / jest.config.cjs
```

## API surface at the end of step 2

All routes are mounted under `/api`. Every route is registered through
`addRoute()` with an explicit access level; the app refuses to boot if any
Express route bypasses that registry.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | public | `X-Client: web` / `native` required. Web sets the refresh cookie; native returns the refresh token in the body. |
| POST | `/api/auth/refresh` | public | Rotates the refresh token. Web reads only the cookie, native reads only the body. |
| POST | `/api/auth/logout` | authenticated | Revokes the whole token family and clears the web cookie. |
| GET | `/api/me` | authenticated | Current profile from the database, role included. |
| PATCH | `/api/me` | authenticated | Phone number only. Every other field is rejected by the schema. |
| GET | `/api/admin/activity-logs` | admin | Paged audit log with action/user/date filters. |

Error shape is uniform:

```json
{ "error": { "code": "invalid_credentials",
             "message": "Email or password is incorrect.",
             "requestId": "…" } }
```

Validation errors add `fields` with per-field messages.

## Session and token design

- **Access token**: JWT HS256, 15 minutes, claims `sub`, `role`, `sid`, `iss`,
  `aud`, `iat`, `exp`. Verification pins the algorithm, checks issuer,
  audience and expiry, then requires a strict payload shape.
- **Refresh token**: 32 random bytes (base64url), stored only as a SHA-256
  hash. Rotated on every use.
- **Reuse detection**: replaying a rotated token revokes the entire family and
  writes `session_reuse`. Revocations are committed before the 401 is
  returned (the rotation transaction returns its refusal instead of throwing,
  so the rollback cannot undo the theft response).
- **Lifetime**: 30 minutes idle (`last_used_at`) and 12 hours absolute
  (`session_started_at`), enforced on refresh *and* on every access-token
  request.
- **Web**: refresh token in an `HttpOnly; Secure; SameSite=Strict;
  Path=/api/auth` cookie; access token in client memory only; body refresh
  tokens are ignored.
- **Native**: refresh token in the response body; cookies are ignored.
- **Authorization**: `requireAuth` re-reads the user and session from MySQL on
  every request. Role and `is_active` come from the database, not the token.
  Deactivation, logout, password reset and role changes take effect
  immediately.

## Security checklist

Statuses: **Implemented and verified** (a test exercises the behaviour),
**Implemented, not verified** (code exists, no automated proof yet), **Open
risk** (known gap, accepted or deferred).

| Control | Status | Evidence |
| --- | --- | --- |
| Argon2id password hashing (19 MiB, t=2, p=1) | Implemented and verified | `password.test.ts` checks the `$argon2id$` prefix and verification |
| Dummy Argon2 verify for unknown emails | Implemented and verified | Login path test; dummy hash warmed at startup |
| Generic login failure for unknown email, wrong password, locked, deactivated | Implemented and verified | `auth.test.ts` compares status, code and message |
| Per-account lockout after 5 failures for 15 minutes | Implemented and verified | `auth.test.ts` asserts `locked_until` and that a correct password is still refused |
| Access JWT algorithm pinned, iss/aud/exp checked | Implemented and verified | Expired, wrong-audience, `alg=none` and tampered tokens all 401 |
| Refresh rotation with hash-only storage | Implemented and verified | Rotation test asserts the stored value is not the token |
| Refresh reuse detection revokes the family | Implemented and verified | Replay test plus `session_reuse` audit row |
| 30-minute idle and 12-hour absolute limits | Implemented and verified | Server-side clock tests on refresh and on access token |
| Role read from the database on every request | Implemented and verified | Demoting an admin invalidates an unexpired token |
| Deactivated user refused with a valid token | Implemented and verified | `auth.test.ts` |
| Logout and password reset invalidate sessions | Implemented and verified | Both access and refresh tokens rejected |
| Web cookie flags | Implemented and verified | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`, cleared on logout |
| Cross-client token isolation (web↔native) | Implemented and verified | Web ignores body token; native ignores cookie, and the ignored token is not consumed |
| CSRF: exact Origin + `X-Requested-With` + SameSite | Implemented and verified | Missing header and foreign origin both 403; token not consumed |
| CORS allow-list, no wildcard | Implemented and verified | Preflight only returns the allow-listed origin |
| Security headers (CSP, nosniff, DENY, no-referrer, HSTS in production) | Implemented and verified | Header assertions in `security.test.ts` |
| `Cache-Control: no-store` on API responses | Implemented and verified | Header assertion |
| Request id on every response and error | Implemented and verified | Header equals `error.requestId` |
| 32 kB JSON limit, JSON-only bodies, strict JSON | Implemented and verified | 413 on oversize, 415 on form posts, 400 on parse errors |
| Unknown fields rejected (mass assignment) | Implemented and verified | Login and profile-update payloads |
| Prototype-pollution keys rejected | Implemented and verified | Raw `__proto__` body rejected; global object unchanged |
| SQL injection: prepared statements only + CI grep | Implemented and verified | Injection corpus returns 400/401 with no SQL text, under 2 s |
| Audit log contains no emails, passwords or free text | Implemented and verified | Admin log response and DB rows scanned for the test email |
| Access denied is audited | Implemented and verified | `access_denied` row after employee hits an admin route |
| Rate limiting on login/refresh/API | Implemented and verified | 429 after the configured login attempts |
| HTTPS enforced in production, HSTS emitted | Implemented and verified | Plain HTTP 403; HSTS header present in production config |
| Deny-by-default route registry | Implemented and verified | `registry.test.ts` |
| Startup configuration validation | Implemented and verified | `config.test.ts`: secrets, DB user, origins, cookie, ranges |
| Login/refresh/audit logging without PII | Implemented and verified | Logger redacts token/password/secret/email keys and email-like strings |

## Test run

```
Test Suites: 5 passed, 5 total
Tests:       45 passed, 45 total
```

Run them with a disposable database:

```bash
# server/.env must point at a throwaway database, not production.
npm run test:server
```

Tests create their own users (random emails), never the demo seed, and delete
them afterwards. They use the migrator account for setup/cleanup only.

## Spec overrides and conflicts with the security skill

The spec wins; the conflicts are recorded so the review is honest:

- The skill's sign-in checklist wants a "forgot password" link. The spec
  forbids that flow, so it is absent. Password changes will be an
  administrator action in step 3, and they revoke all of that user's sessions.
- The skill mentions manager/direct-report scoping. The spec has only
  `employee` and `admin`, so no manager role or reporting hierarchy exists.

## Open risks (not hidden, not claimed as solved)

1. **Rate limiting is in-process.** It resets on restart and is per instance.
   A multi-instance deployment needs a shared store (Redis) for the same
   guarantee.
2. **Lockout is per account only.** An attacker can lock a known account on
   purpose (denial of service) or spread guesses across many accounts within
   the IP limit. Both are mitigation trade-offs, not complete fixes.
3. **No MFA.** Not in the spec; the project relies on password strength,
   lockout and session limits.
4. **Concurrent refreshes from two tabs can look like token reuse.** The first
   refresh rotates the token; the second tab's stale token triggers the theft
   response and signs the session out. The client in step 4 must serialise
   refresh calls (single in-flight refresh, shared promise). This is a
   usability failure, not a security hole.
5. **Web access token lives in memory.** The refresh token is protected from
   XSS by `HttpOnly`, but script on the page could read the access token for
   its 15-minute lifetime. The client's CSP and output escaping in step 4 are
   the mitigation.
6. **The audit log's IP address is best effort** and depends on a correct
   proxy configuration (`TRUST_PROXY`).
7. **No account-level notification on lockout or reuse.** The events are
   logged and visible to the admin in step 6; no email is sent.

## What step 2 deliberately does not include

- Leave types, balances, applications, documents, approvals, reports.
- Admin user management and password reset endpoints.
- Client code (starts in step 4).

The API surface above is the complete authenticated backend at this point.

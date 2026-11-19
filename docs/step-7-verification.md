# Step 7 verification: security review, full test pass, e2e

Scope: the closing security review from the `security` skill (check each
control, report findings, state what was *not* verified), a full test pass on
a disposable database, an end-to-end run of the critical cross-role journey,
and the honest close-out of the risks recorded in steps 3–6.

Environment: Windows, Node 24.22.0, MySQL 8.0.46. Tests ran against a fresh
throwaway instance on port **3412** (initialize → `db:apply` → jest →
shutdown → datadir deleted); the seeded demo instance on **3399** was used
for the e2e only and was otherwise untouched. Playwright + Edge headless.

## Findings

| # | Severity | Item | Disposition |
| --- | --- | --- | --- |
| F1 | Low | `app/src/lib/api.ts` — no default request timeout. Every caller may pass a signal, but nothing set a deadline, so a hung API connection left the UI in-flight forever | **Fixed in this step**: 30 s `AbortController` bound in `send()`; a caller-provided signal still wins. Verified: `tsc --noEmit` clean, web + Android bundles re-exported, UI regression re-run green (`step7.js`) |
| F2 | Low | Step-7 test expectation (CORS/CSRF origin check) wrong on the first run — server was right; unauthenticated callers meet `requireAuth` before CORS/CSRF is ever consulted | Test rewritten to assert the actual layers: evil-origin **login** → `403 csrf_failed`; preflight carries **no** `Access-Control-Allow-Origin` for non-allow-listed origins. Both pass |
| F3 | Info | `leave_report` least-privilege account is unused — all reporting queries use `leave_app` | Unchanged by design; restated as a residual risk |

No High or Medium issues were found in this review. That is a statement
about the code as reviewed, not a claim of "fully secure" — see residual
risks and the unverified list below.

## Spec vs. security-skill conflicts (resolved in favour of the spec)

1. The security skill's sign-in checklist expects a "forgot password" link.
   The product spec forbids a self-service reset. The sign-in screen shows
   only brand, email, password, submit and the line "Accounts are created and
   passwords reset by an administrator." **Spec wins; the skill's item is not
   applicable to this product.**
2. The skill asks for rate limiting "per account and per IP". The API has a
   per-IP limiter on every `/auth/*` route plus a per-account 5-failure →
   15-minute lockout enforced atomically in SQL. The per-account control is
   the lockout, not a token bucket; functionally it is stronger for the
   credential case. Documented as implemented, not as missing.
3. The skill allows biometric unlock for existing sessions. Not implemented
   and not required by the spec; would need a device to verify. **Not
   verified / out of scope.** See unverified list.
4. The skill asks for HTTPS-only including test builds. Development uses
   `http://localhost` by design (Localhost is exactly the carve-out HSTS is
   irrelevant for); production cannot be booted that way — config fails
   closed on non-Secure cookies, non-https origins, wildcard CORS, weak or
   identical JWT secrets, placeholder secrets, root/migrator references as
   APP user. The demo environment is explicitly non-production.

## Security checklist walk (this session's evidence)

| Area | Control | Status | Evidence |
| --- | --- | --- | --- |
| Sign-in | Nothing beyond brand/fields/button; no accounts, counts or hints exposed | Implemented and verified | `app/sign-in.tsx` (screenshot `step7-01-employee-home-mobile`); no demo hints anywhere on the screen |
| Sign-in | Identical generic failure for unknown email / wrong password / locked / deactivated | Implemented and verified | Server: dummy Argon2 for unknown emails, one `invalid_credentials` path (`auth.service.ts`); e2e: 5×wrong → `invalid_credentials`; correct password on locked account → `invalid_credentials`; unknown email → `invalid_credentials` |
| Sign-in | Timing equalisation, password managers, show/hide, disabled while submitting | Implemented and verified | Dummy-hash path covers unknown emails; `autoComplete="email"/"current-password"`, `textContentType`, `secure` with eye toggle (`TextField`), submit disabled while `submitting` |
| Sessions | Argon2id; hash-only refresh tokens; rotation with reuse detection; family revoke | Implemented and verified | Step-2 code re-read this session (`session.service.ts`: `FOR UPDATE` rotation, revoked-token family revoke, reuse logged `session_reuse`); 74/74 tests incl. reuse detection |
| Sessions | 30-minute idle / 12-hour absolute, server-side | Implemented and verified | `loadSessionState` + middleware + rotation both enforce; covered by tests (timeout/lockout suites) |
| Sessions | Web: httpOnly Secure SameSite=Strict cookie scoped to `/api/auth`; memory-only access token; cross-tab sign-out | Implemented and verified | Cookies set path-scoped with `sameSite:'strict'`; `api.ts` keeps tokens in module memory only; `BroadcastChannel('leave.session')`; no `localStorage`/`AsyncStorage` anywhere |
| Sessions | Native: SecureStore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Implemented but not verified on device | Code path present (`session.tsx`); device build not installable here |
| Authorization | Role from DB on every request, not the token; deactivated users refused | Implemented and verified | `requireAuth` re-reads `users` on every request (`auth.ts`); deactivation test in suite |
| Authorization | Explicit access declaration on every route; no implicit default | Implemented and verified | `routes/registry.ts`: `addRoute` + `assertRoutesDeclared` refuse boot on undeclared routes; `registry.test`-adjacent coverage via boot tests |
| Authorization | Per-object ownership; 404-not-403 for foreign objects | Implemented and verified | `leave.service.ts` ownership predicates; foreign id → 404 |
| Authorization | Business rules in the same transaction as the write | Implemented and verified | Balance/overlap checks inside `withTransaction` with user-row `FOR UPDATE` (create and decide paths) |
| Authorization | Decision is one-time; approver's action is audited | Implemented and verified | e2e: replay of a decided row → `409`; `decidedBy`/`decidedAt` and audit entries confirmed in steps 5/6; `leave_approved`-style actions logged |
| Authorization | Denial of admin routes audited | Implemented and verified | `requireRole` writes `access_denied` |
| Uploads | 1 MiB memory-only; magic-byte sniffing; random stored name; mode 0600; `wx` flag; outside web root; authenticated streaming only; approval blocked without required document | Implemented and verified | `middleware/upload.ts`, `lib/files.ts`, `leave.service.ts` (`requires_document` enforced at approval); e2e in step 5; server tests incl. mislabelled-file case |
| CSRF | Cookie flow protected on all `/auth/*` routes | Implemented and verified | `csrfForWeb`: exact-origin allowlist + `X-Requested-With` requirement; e2e: evil-origin login → `403` |
| CORS | Allow-list, no wildcards, exact bare origins; production requires https | Implemented and verified | Config fails closed (`parseOrigins`); e2e preflight from evil origin: no `Access-Control-Allow-Origin` |
| Headers | helmet CSP `default-src 'none'`, frame deny, nosniff, no-referrer, COOP/CORP same-origin; HSTS in production only | Implemented and verified | `app.ts`; HSTS conditional on `isProduction` (verified in step-2 config tests) |
| Errors | No stack traces / SQL / driver messages to clients; request id only; details server-side, redacted | Implemented and verified | `errorHandler`, `lib/logger.ts` redacts token/password/secret/authorization/cookie/email/reason/phone/hash + email-like values; `safeErrorFacts` = name+code |
| Logging | No user text in audit fields; append-only | Implemented and verified | `activity.service.ts` callers pass ids/enums only; SQL grant checks deny DELETE/UPDATE to `leave_app` |
| SQL | Constant strings + bound parameters; enforced by checker | Implemented and verified | `npm run check:sql` → "SQL safety check passed" |
| CSV | Formula-injection neutralised; quoting; 5,000-row hard cap | Implemented and verified | `report.service.ts` (`csvCell`); CSV downloaded through authenticated client only |
| Secrets | No secrets in the repo, bundle or examples; `EXPO_PUBLIC_*` used for the API URL only | Implemented and verified | Pre-push scan: no `.env` or secret material tracked; `git ls-files` only example files; audit clean |
| Dependencies | Lockfile committed; known-vuln count zero | Implemented and verified (as of 2026-11-20) | `npm audit` → `found 0 vulnerabilities`; `package-lock.json` tracked |
| Data on device | Web: nothing persisted; sign-out clears state + BroadcastChannel broadcast; errors in frames | Implemented and verified | `session.tsx`; `grep`: no `localStorage`/`AsyncStorage`/`sessionStorage` |
| Data on device | App-switcher privacy / screen capture | **Not implemented** | See residual risks |
| Deep links | Dedicated scheme, no external URL navigation | Implemented-by-absence, **not re-verified** | `leavesystem://` only; no universal links configured |
| Build | `com.example.*` identifiers are placeholders | Open risk | Must change before store submission; no impact on current threat model |
| Timeouts | Default 30 s bound on every API request | Implemented and verified (this step) | F1 fix; regression re-run green |

## e2e — what actually ran

**API checks (node, against the live demo stack)** — 10/10 PASS:

1. anonymous `GET /api/leaves` → `401`
2. employee token on `GET /api/admin/users` → `403`
3. employee token on own route → `200`
4. after 5 failed logins, the correct password is refused (`401`) — per-account lockout
5. the 6 attempts were written to the audit log (`+6` `login_failure` entries)
6. after DB unlock, the same account signs in again (`200`) — recovery path verified
7. unknown email → generic `401 invalid_credentials`
8. replay of a decision on the already-approved application #1 → `409`
9. web login origin `https://evil.example` → `403 csrf_failed`
10. preflight from `https://evil.example` → no `Access-Control-Allow-Origin`

**Browser journey (Playwright + Edge)** — PASS:

| Step | Evidence screenshot |
| --- | --- |
| Employee opens the app on a 390×844 phone viewport | `step7-01-employee-home-mobile.png` |
| Employee files Vacation leave (8–9 Feb 2027) — pending | `step7-02-applied-mobile.png` |
| Employee files a second (15–16 Mar 2027) — pending | `step7-03-second-applied-mobile.png` |
| Admin queue lists both, newest first | `step7-04-approvals-queue.png` |
| Admin approves with remarks "Step 7 e2e approval." | `step7-05-approve-form.png`, `step7-06-application-approved.png` |
| Admin rejects the other, remarks required | `step7-07-application-rejected.png` |
| Employee sees Approved with decider name/time/remarks | `step7-08-employee-sees-approval.png` |
| Employee sees Rejected with remarks verbatim | `step7-09-employee-sees-rejection.png` |
| Employee opening `/approvals` is redirected to `/home` | `step7-10-role-guard-redirects.png` |

Console output during the run: no errors other than the expected 401/refresh
noise (documented as routine since step 4). The two cancelled/interrupted
iterations are disclosed here for honesty: the UI harness initially failed at
sign-out (mobile layout) and the API script had one incorrect expectation
(F2); applications #3 and #4 were filed once and are tracked as filed — no
duplicates were created by the re-runs.

## Full test pass — 2026-11-20

- Throwaway MySQL 3412: `db/apply.mjs` → schema + accounts + **12/12 least-privilege
  grant checks PASS**.
- `npm run test:server` → **74 passed, 7 suites, 0 failed**.
- `npm run check:sql` → passed.
- `tsc --noEmit` (client) and server typecheck → clean.
- `npm audit` → **0 vulnerabilities**.
- Demo `.env` restored bit-for-bit identical; disposable 3412 datadir deleted;
  demo data changes limited to the e2e outcomes above (applications #3
  rejected / #4 approved, both visible to any reviewer).

## Residual risks (restated from steps 3–6, unchanged by design)

1. Client role checks (`RequireRole`) are UX; the API is the only enforcement
   point — by design and stated in every step.
2. No malware scan on documents; files are unencrypted at rest (OS/filesystem
   controls assumed); storage sits outside the web root with mode 0600.
3. Upload types restricted to magic-byte-verified PDF/JPEG/PNG ≤ 1 MiB.
4. No forced password rotation; administrator-created passwords are shown once
   at creation/reset. A "must change on first sign-in" flow would need a
   schema flag and a client step — future work.
5. No email/push notifications; decisions surface in-app only (spec).
6. No holiday calendar, no carry-over, `leave_report` unused, 5,000-row
   report cap, in-process rate limiting (per server instance — multi-instance
   deploys need a shared store).
7. Activity-log IP addresses are normalised aids, not proof of identity.
8. Document/share sheet path on native is unverified on a physical device.
9. `expo-screen-capture` (app-switcher masking) is not implemented.
10. Placeholder app identifiers; universal links/ATS audit pending store
    submission.

## The three lists

**Implemented and verified** — every row in the checklist tables above that
says "verified"; the 10 API checks; the UI journey; the 74 tests; grants;
check:sql; audit; bundles build.

**Implemented but not verified** — native SecureStore persistence path;
native document download/share; universal-links/ATS behaviour; production
HTTPS deploy (config fail-closed paths are test-covered but the production
topology itself is undeployed).

**Open risks needing product/ops decisions** — residual risks 2–6, 8–10
above; in particular forced rotation (#4) and app-switcher masking (#9) would
be my recommended next two hardening items.

## Verdict

The system held up under this review: RBAC on every route is enforced
server-side and exercised end-to-end; credentials and sessions follow
current practice; the two real defects found are recorded with their fixes
(F1 fixed, F2 test-corrected). It is **not** "fully secure" and is not
claimed to be: production hardening (deployment topology, secret
management, monitoring, shared rate-limit store, store-submission audit)
was outside the scope of these seven steps. The sign-in silhouette of this
build includes no demo affordances and no information leaks.

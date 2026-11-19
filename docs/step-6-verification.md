# Step 6 verification: administrator screens

Scope: everything an administrator can do in the client on top of the step-4
shell: review and decide applications, manage user accounts, manage leave
types, run the reports, and read the activity log. Employee screens are step 5.

Verified with `tsc --noEmit` clean, `expo export` succeeding for web and
Android, **74 server tests green** on a disposable MySQL 8.0.46 instance (one
new test for the account-by-id endpoint added here), `npm run check:sql`
passing, and a Playwright (Edge) run against the live API + Metro
(screenshots 30–50 in `G:/temp/Temp/opencode/shot/`).

## What was built

- Navigation: the sidebar lists all seven admin destinations; the bottom bar
  on narrow screens carries Overview, Applications, Employees and Profile plus
  a **More** sheet (Leave types, Reports, Activity). Employee bar unchanged.
  `RequireRole role="admin"` guards every admin route — see the checklist
  below on why this is UX only.
- `/approvals` — the decision queue. Status chips (Pending selected by
  default), debounced people search (250 ms), leave-type chips including
  inactive types so older filings stay reviewable, 10 rows per page, pressable
  rows.
- `/requests/[id]` — shared with the employee detail. Admins see a
  **Make a decision** card when the request is pending: remarks field
  (required client-side and server-side when rejecting), Approve / Reject
  buttons. Server failures surface as readable notices (`409` already decided,
  `400 insufficient_balance` on approval). The screen re-fetches the admin
  branch (`/admin/leaves/:id`).
- `/admin/users` — account list: debounced search, role chips (everyone /
  employees / administrators), status chips (all / active / inactive),
  10 per page.
- `/admin/users/new` — create account (name, email, temporary password with
  the server policy surfaced, role picker, position/department/phone). Duplicate
  email maps to the `409` notice. Successful create replaces the route with
  the new account's edit screen.
- `/admin/users/[id]` — fields editable per server contract (name, position,
  department, phone, role, active status); email is immutable. Admins cannot
  change their own role or deactivate themselves (client disables, server
  enforces; last-active-admin protection lives server-side). **Reset
  password** is a separate card (admin sets the password; sessions are
  revoked; the person signs in with it afterwards). **Leave history** lists
  the five most recent applications.
- `/admin/leave-types` (+ `new`, `[id]`) — list with document-requirement and
  active/inactive indicators; create and edit with a shared form. There is no
  delete by design — deactivate instead; the UI says so.
- `/admin/reports` — live dashboard tiles (waiting / approved / rejected /
  active people / active leave types), **Leave summary** (year + optional
  department, horizontal table with per-row and totals), **Applications
  report** (from/to, status chips, type chips, inline table, CSV download).
  Inline preview is capped at 25 rows; the CSV always contains the full
  result and is downloaded through the authenticated client
  (`downloadAttachment`), preserving the formula-injection apostrophe guard
  the server applies.
- `/admin/activity` — read-only audit trail, one horizontal chip per action
  ("All" first; denial/reuse actions rendered in the danger tone), 10 per page.
- Server: `GET /api/admin/users/:id` added (the edit screen used to rely on
  route params; it now fetches the account). One new test covers it; the
  employee-role 403 test list extended.

## Security checklist for step 6

| Control | Status | Evidence |
| --- | --- | --- |
| Every admin route re-checks RBAC server-side | Implemented and verified | `adminAccess` middleware on all `/admin/*` routes; employee JWT gets 403 (test list extended) |
| Client route guard is UX only | Implemented but not enforcement | `RequireRole` redirects employees to `/home` (verified in browser); API is the real boundary |
| Document/CSV downloads use Bearer auth, no static serving | Implemented and verified | `apiFetchRaw` + web blob/`blob:`, native cache-write + share sheet; CSV saved via `downloadAttachment` |
| Admin decision is one-time and re-validates balance/entitlement server-side | Implemented and verified | Approved #1 in-browser via UI (balance dropped from 6 to 3); decision replays return 409 (server tests) |
| Reject requires remarks; approver identity recorded | Implemented and verified | Client inline block (34 shot) + server `400` mapping; `approvedById`/`decidedAt` shown in detail and reports |
| Self-protection rails (own role, self-deactivation, last admin) | Implemented and verified | Client disables both for `me`; server throws (409/400) and is covered by tests |
| Admin cannot exfiltrate data beyond their role | Implemented and verified | Admins by role see all users/leaves — that is the design; employee JWT reaches nothing `/admin/*` |
| Deactivation revokes access | Implemented and verified | `is_active=false` PATCH revokes sessions (server); list/edit show Inactive (Carla Dizon) |
| Audit log records sensitive actions | Implemented and verified | Approve/reject, account updates, password resets, report runs, leave-type changes all written (`48` shot shows the approve entry) |
| CSV formula injection | Implemented and verified | Server prefixes leading `= + - @` with an apostrophe; verified in downloaded file header and rows |
| Secrets/tokens handled as in step 2 | Implemented and verified | No change to auth flow; access token stays in memory |
| Least-privilege DB for reports | Implemented but not exercised | `leave_report` account exists and is select-only; the code uses `leave_app` everywhere — the report role is unused |

## Playwright run (Edge/Chromium, live API + Metro)

- Admin home tiles render (Waiting 2 at run time) and rows navigate to
  requests; "View all applications" reaches the queue.
- Queue defaults to Pending; `maria` search narrows (debounce honoured);
  type chips filter; empty state for approved (day before decision) exists.
- Detail → decision panel; reject with empty remarks blocked inline;
  approve with remark succeeds and the timeline completes
  (Filed → Reviewed → Approved) with approver/date/remarks shown.
- Vacation application rejected with remark through the same UI.
- Employees: list, search (retaken to honour the debounce), create
  (duplicate-safe email), edit (saved notice), password reset
  (sessions revoked; confirmation notice), leave-history card.
- Leave types: list, create ("Step6 Test Leave 2"), deactivate (no delete).
- Reports: stat tiles render; leave summary generates for 2026 (totals row
  correct: entitlement 84, approved 3); applications report generates 2 rows;
  CSV downloads (3 lines incl. header, proper quoting, formula guard intact).
- Activity: chip filter to "Leave approved" lists Linda's decision entry.
- Role guard: employee navigating to `/admin/users` lands on `/home`.
- Mobile 390×844: queue renders; bottom bar (Overview / Applications /
  Employees / Profile / More) fits — a real layout bug was found and fixed
  here (`minWidth: 88` × 5 overflowed the 390 px viewport; tabs are now
  `flex: 1`).
- Console errors during the run: three routine 401→refresh pairs (sign-in
  races after token expiry), same class as step 5's expected pair.

Shots retaken to correct races in the first pass: 35 (Approve loading state —
recaptured settled), 45 (false-positive wait on "Vacation" chip — recaptured
after the summary table rendered), 46 (table below the fold — recaptured at
the section), 38 (screenshot raced the 250 ms debounce — recaptured filtered),
50 (layout fix above).

## Demo data note

The demo database now holds one **approved** application (Maria, Sick,
30 Nov – 2 Dec 2026, remark "Recovered and approved — enjoy the rest."), one
**rejected** application (Maria, Vacation, 14–16 Dec 2026, remark "Team is
already at minimum staffing that week."), an active sacrificial employee
(`step6.tester@example.com`, "Step Six Tester", QA — no applications), an
inactive leave type ("Step6 Test Leave 2") and the corresponding audit-log
entries. None of it is a fixture; it was created through the UI during the
verification runs.

## Open risks and limitations

1. **Client-side role guard is UX only.** `RequireRole` prevents accidental
   navigation; it is not an access control. The API's RBAC middleware is the
   enforcement — employees receive 403 on direct requests regardless.
2. **Admin-created passwords are shown once and chosen by the admin.** Asking
   for rotation at next sign-in would need a schema flag that does not exist;
   treat admin-set passwords as temporary and rotate out-of-band.
3. **No deletes anywhere in admin screens.** Deactivation is the destructive
   operation everywhere (users, leave types). This is the server's design,
   surfaced deliberately.
4. **Reports run in process** (5,000-row cap) and the summary loads the
   applications of the year; this is fine at demo scale, but the API has no
   streaming path.
5. **Activity log shows the connection IP** (`::1` in development) — it is an
   audit aid, not a proof of identity; behind a proxy it is as trustworthy as
   the `trust proxy` setting.
6. **Native download/share remains unverified on a device** (cache write +
   `Sharing.shareAsync`), as in step 5; web path verified via Playwright.
7. **The applications report CSV export is the full match set**, inline
   preview is capped at 25 rows; the CSV includes a formula-injection guard
   but not sanitised HTML (it is plain text).
8. **Excel/Sheets opening the CSV** is outside our control — the guard only
   covers formula-leading cells.

## Spec adherence

- Admin actions limited to: review applications, manage accounts and leave
  types, view reports, read activity. Exactly the requested surfaces.
- No manager affordances; no delete endpoints; no new roles; remarks required
  for rejection; balance-locked approval. All as specified.

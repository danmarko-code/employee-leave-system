# Step 5 verification: employee screens

Scope: everything an employee can do with leave applications on top of the
step-4 shell: file an application, list and filter their own requests, open a
request, and view the attached document. Admin screens (decision queue,
accounts, leave types, reports) are step 6.

Verified with `tsc --noEmit` clean, `expo export` succeeding for web and
Android, the 73 server tests still green on a disposable MySQL 8.0.46 instance,
`npm run check:sql` passing, `npm audit` at **0 vulnerabilities**, and a
Playwright (Edge) run against the live API + Metro (screenshots 10–20 in
`G:/temp/Temp/opencode/shot/`).

## What was built

- `/requests` — list of the signed-in person's applications: pending /
  approved / rejected / all filter chips, 10 rows per page with previous/next
  paging, newest start date first, loading skeletons, empty states (with an
  "Apply for leave" call to action when the person has none), and a pressable
  row per application.
- `/requests/new` — application form:
  - Leave type picker showing yearly entitlement, this year's remaining days
    and the days already set aside as pending; a "Document" badge marks types
    that need one. Sick: 6/year, document required. Vacation: 15/year.
  - Start/end dates as plain `YYYY-MM-DD` fields (see limitation 2 below)
    carrying a live working-day count (Monday–Friday), mirroring the server's
    `countWorkingDays` exactly, including the same "no working days in
    range" and "one application cannot span two calendar years" rules.
  - Reason multiline field with a 500-character counter.
  - Supporting document picker (PDF/JPEG/PNG, ≤ 1 MB) via
    `expo-document-picker`; client-side size/type checks are UX only, the
    server re-sniffs the bytes. Attach state can be cleared.
  - Client-side gating (inline errors, disabled submit) plus mapping of the
    server's field errors; `409 conflict` (overlap) and
    `insufficient_balance` are surfaced as readable notices.
- `/requests/[id]` — read-only request detail: status pill, a three-step
  Filed → With administrator → Decision timeline, reason block, details grid,
  decision panel (approver/rejector, date, remarks) or a "waiting" note while
  pending, and a document card. The **View** button downloads the file through
  the same authenticated client (`Authorization` header) — web opens a
  short-lived `blob:` object URL in a new tab (revoked after 60 s), native
  writes the bytes to the cache directory and opens the system share sheet.
- Home (employee): "Apply for leave" CTA in the header, pressable recent
  request rows leading to the detail, "View all requests" link, and an empty
  state CTA. Admin home unchanged.
- `EmptyState` gained an optional `action` prop; `apiFetchRaw` unwraps binary
  downloads with one transparent refresh; `formatFileSize` and client-side
  date helpers (`countWorkingDays`, `parseIsoDate`, …) added. Dates and
  working days mirror the server's UTC handling.

## Security checklist for step 5

| Control | Status | Evidence |
| --- | --- | --- |
| Documents fetched only with Bearer auth; never served statically | Implemented and verified | `apiFetchRaw('/leaves/:id/document')`; web blob URL + `noopener`; Playwright popup URL was `blob:…` |
| Client-side checks are UX; server re-validates | Implemented and verified | Forced client-side submission of a reversed range failed disabled; server overlap `409` verified live in-browser; balance re-checked server-side |
| No sensitive data in the DOM beyond the user's own | Implemented and verified | Detail shows owner's data; `/requests` lists only `user_id = self` (server-side) |
| Files kept out of web cache heuristics | Implemented and verified | `Cache-Control: no-store` on API responses; web object URL revoked after 60 s |
| Upload constrained by type and size | Implemented and verified | Picker accepts only PDF/JPEG/PNG and 1 MiB; server sniffs bytes (`sniffMime`) and stores outside the web root |
| Role-appropriate UI | Implemented and verified | Apply CTA renders only for employees; `/requests/new` shows an info notice for admins; server enforces `access: 'employee'` on `POST /leaves` |

## Playwright run (Edge/Chromium, live API + Metro)

- Employee sign-in → home shows balances with pending days set aside.
- `/requests` empty state renders with CTA; CTA opens the apply form.
- Reversed date range → inline error, submit stays disabled (client blocked).
- Sick type without a document → inline "needs a supporting document" notice,
  submit stays disabled.
- Attached `leave-note.pdf` (295 B) → submitted → landed on the detail page,
  status **Pending**, timeline rendered, document name/size shown, **View**
  opened a `blob:` URL in a new tab.
- `/requests` lists the application; Pending filter keeps it, Approved filter
  empties.
- Re-applying for the same range (Vacation, no document) → server `409`
  surfaced as "Those dates overlap an existing leave application."
- Balances reflect the pending request: Sick shows 3 of 6 left, "3 pending
  set aside".
- Mobile 390×844: list and detail render with the bottom tab bar.

One real bug was found and fixed during this run: after the user edited any
date/reason field, an internal `''` sentinel in the field-error map suppressed
live client validation permanently; the map now drops the key instead. The two
console errors during the run are expected: the routine 401→refresh, and the
intentional 409 from the overlap test.

## Demo data note

`maria.santos@example.com` filed a real application for **30 Nov – 2 Dec
2026, Sick leave, 3 working days** (pending, with `leave-note.pdf`). It is
useful demo content for step 6's admin decision queue; it is real data in the
demo database, not a fixture.

## Open risks and limitations

1. **Native document open/share is unverified on a device.** The code path
   (cache write + `Sharing.shareAsync`) compiles and typechecks but has only
   been exercised on web (object URL). The share sheet may copy the file
   outside the app's control.
2. **Date entry is plain text `YYYY-MM-DD`**, not a native picker; invalid
   values are blocked client- and server-side, but a nicer picker is a
   follow-up (`@react-native-community/datetimepicker` or Expo's equivalent).
3. **No automated client test suite yet**; Playwright remains a manual run.
   Step 7 will add it to the repo.
4. **Timeline is decorative**; there is no push/email on decision (out of
   scope by design).
5. **Overlap blocking is total across leave types** for pending/approved
   applications. This is the intended server rule; users may be surprised,
   which is why the form states the working-day and year rules but the
   overlap error comes from the server notice.
6. **The detail timeline and pending note read "your administrator"** — for
   administrators viewing someone's request it reads accordingly; the decision
   actions themselves are step 6.

## Spec adherence

- Employee role only; no manager affordances anywhere.
- The application is read-only after filing (spec: no edit/cancel).
- No forgot-password flow added to the sign-in screen.

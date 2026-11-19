# Step 3 verification: leave features, account management and reports

Scope: the business backend. The Expo client starts in step 4, so nothing here
has a screen yet. Step 1 (schema) and step 2 (auth, sessions, RBAC) are
unchanged; their guarantees still apply to every route below.

Verified against a disposable MySQL 8.0.46 instance on port 3399, removed
afterwards. `npm run check:sql` passes, `npm run build -w @leave/server`
passes, `npm audit` reports **0 vulnerabilities**, and the full suite is
**73 tests / 7 suites** green.

## New API surface

All routes are under `/api`. Every route is still declared through the
deny-by-default registry with an explicit access level.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/leave-types` | authenticated | Active leave types |
| GET | `/leave-balances?year=` | authenticated | Own entitlement, approved, pending, remaining per type |
| GET | `/leaves?status=&year=&page=&pageSize=` | authenticated | Own applications, newest first |
| POST | `/leaves` | employee (multipart) | Submit an application, with optional supporting document |
| GET | `/leaves/:id` | authenticated (owner or admin) | One application |
| GET | `/leaves/:id/document` | authenticated (owner or admin) | Stream the supporting document |
| GET | `/admin/leaves?status=&leaveTypeId=&userId=&from=&to=&q=&page=&pageSize=` | admin | All applications with employee names |
| GET | `/admin/leaves/:id` | admin | One application |
| POST | `/admin/leaves/:id/decision` | admin | Approve or reject once, atomically |
| GET | `/admin/users?q=&role=&isActive=&page=&pageSize=` | admin | Paged account list |
| POST | `/admin/users` | admin | Create an employee or administrator |
| PATCH | `/admin/users/:id` | admin | Name, role, position, department, phone, active flag |
| POST | `/admin/users/:id/reset-password` | admin | Set a new password and sign the person out everywhere |
| GET | `/admin/leave-types` | admin | All types, including inactive |
| POST | `/admin/leave-types` | admin | Create a type |
| PATCH | `/admin/leave-types/:id` | admin | Rename, change entitlement, require/stop requiring a document, activate/deactivate |
| GET | `/admin/dashboard` | admin | Pending/approved/rejected counts, active people and types |
| GET | `/admin/reports/leave-summary?year=&department=` | admin | Per employee × leave type: entitlement, approved, pending, remaining |
| GET | `/admin/reports/applications?from=&to=&status=&leaveTypeId=&userId=&format=json\|csv` | admin | Printable report, JSON or CSV |

The step 2 routes (`/auth/*`, `/me`, `/admin/activity-logs`) are unchanged.

## Business rules implemented

- **Working days are Monday–Friday inclusive**, computed by the server from the
  dates. A weekend-only request is rejected. Public holidays are **not**
  modelled (no holiday table), which is stated under open risks.
- **One calendar year per application.** A request cannot span 1 January.
  Employees may file for the current year or the next one, never the past.
- **No overlapping applications** in `pending` or `approved` state, across all
  leave types.
- **Balances.** Entitlement is per leave type per calendar year. Both approved
  and pending days count against it at submission, so an employee cannot queue
  more leave than they have. Approval re-checks the entitlement against
  approved days and refuses to overrun it.
- **Decisions are one-time.** Only `pending` can be decided; rejection requires
  remarks (also enforced by a CHECK constraint); approval requires the
  supporting document when the type requires one; an administrator cannot
  decide their own application.
- **Concurrency.** Submission locks the employee's row and approval locks both
  the application and the employee's row, so two concurrent submissions cannot
  both pass the overlap/balance test and two approvals cannot consume the same
  remaining days.
- **Leave types.** Names are unique. Types are deactivated, never deleted,
  because applications reference them.
- **Accounts.** Email is immutable and unique; passwords follow the step 2
  policy (8–128 characters, letter, number, not a common password) and are
  hashed with Argon2id. Deactivation and password reset revoke every session
  for that person. An administrator cannot demote or deactivate themselves,
  and the API refuses to remove the last active administrator.
- **Audit.** `leave_submitted`, `leave_approved`, `leave_rejected`,
  `leave_type_changed`, `account_created`, `account_updated`,
  `account_activation_changed`, `password_reset` and `report_generated` are
  appended. No reason text, email address or password is ever stored.
- **Reports.** The summary joins active employees with active leave types for
  one year; the applications report is capped at 5,000 rows and can be
  downloaded as CSV with spreadsheet-formula injection neutralised.

## Documents

- One document per application, attached at submission. Exactly the three
  types the schema allows: PDF, JPEG, PNG.
- **The bytes decide the type.** The server checks magic bytes and refuses a
  file whose declared type contradicts its content.
- Maximum 1 MiB, enforced while parsing (413 above it), plus the same CHECK in
  the schema.
- Stored under a random UUID name with mode `0600`, in `UPLOAD_DIR` (default
  `server/var/uploads`, git-ignored), **outside any web root**. There is no
  static file route; downloads go through the owner-or-admin check and set
  `Content-Disposition: attachment`, the stored MIME type and `nosniff`.
- The original filename is kept for display only, with path separators and
  control characters stripped.

## Security checklist for the new surface

| Control | Status | Evidence |
| --- | --- | --- |
| Employees only see their own applications and documents | Implemented and verified | Another employee gets 404 for both; admin gets 200 |
| Admin-only routes reject employees | Implemented and verified | Seven admin endpoints all return 403 for an employee |
| Parameterised SQL only | Implemented and verified | `check:sql` plus injection corpus from step 2; all new queries are constant strings with bound parameters |
| Mass assignment blocked on every write | Implemented and verified | All new bodies are strict zod objects; unknown fields are 400 |
| Document type enforced from bytes | Implemented and verified | PNG bytes labelled PDF are rejected, no file written |
| Upload size enforced | Implemented and verified | 1 MiB + header payload returns 413; multer limit is below the app logic |
| Filename cannot traverse directories | Implemented and verified | Random UUID on disk; original name stripped of separators; DB CHECK on stored name |
| Downloads require authorisation and never render inline | Implemented and verified | Owner/admin only, `attachment`, `nosniff` |
| Overlapping leave and over-entitlement impossible | Implemented and verified | Overlap 409, balance 400/409, pending counts at submission |
| Decisions are one-time and cannot self-serve | Implemented and verified | Second decision 409; role gate 403; schema CHECK |
| Rejection requires a reason | Implemented and verified | 400 without remarks; stored and returned |
| Deactivation and password reset kill live sessions | Implemented and verified | Access token rejected on the next request |
| No self-lockout of the last administrator | Implemented and verified | Self deactivation/demotion 400; count guard for other admins |
| CSV formula injection neutralised | Implemented and verified | Employee `=SUM(1)` exported as `"'=SUM(1)"` |
| Reports capped and audited | Implemented and verified | 5,000-row cap; `report_generated` rows |
| Audit contains no free text | Implemented and verified | Leave reason and type name absent from activity rows |
| Passwords never returned or logged | Implemented and verified | Create/reset respond without hashes; create test scans the body |

## Test run

```
Test Suites: 7 passed, 7 total
Tests:       73 passed, 73 total
```

28 tests were added in this step: 18 for leave applications and documents,
10 for administrator features, reports and audit. The step 2 suites still pass
unchanged.

## Open risks and limitations

1. **No malware scanning.** Uploads are type- and size-checked but not
   scanned. In a real deployment, run ClamAV or a hosted scanner before the
   file is made available, and keep the upload directory off the web root (it
   already is).
2. **Public holidays are not deducted.** Working days are Monday–Friday only.
   Adding a holidays table is a schema change, not a code-only fix.
3. **No carry-over and no mid-year proration.** Entitlement is a flat yearly
   number; joining mid-year does not prorate it, and unused days do not roll
   over.
4. **One document, attached at submission.** There is no replace/upload-later
   endpoint. A wrong attachment currently needs an administrator decision or a
   new application; adding one would need a second document slot or a replace
   flow.
5. **Files are stored unencrypted on disk.** Disk access equals document
   access. Encrypting at rest (filesystem or application-level) is a
   deployment decision.
6. **Reports are in-memory.** The CSV is built as one string, capped at 5,000
   rows; a larger export needs streaming.
7. **The report CSV contains personal data** (names, departments, dates).
   Download is admin-only and audited, but the file leaves the system once
   downloaded.
8. **No employee cancellation or edit** because the spec has no cancelled
   state. A mistaken pending application stays until an administrator decides.
9. **Rate limits remain in-process** and lockout remains per account, as noted
   in step 2.
10. **Audit writes are best-effort after the business transaction.** A crash
    between commit and audit can lose the audit row; the business effect is
    still correct.

## Spec conflicts, restated

- No manager role and no direct-report scoping (spec has employee and admin
  only).
- No forgot-password flow (spec excludes it); password changes are an
  administrator action.
- No cancelled/withdrawn state (spec lists pending, approved, rejected).

## What step 3 deliberately does not include

- Any client code (step 4 onward).
- Email notifications.
- A separate report-account usage path: the report login exists from step 1,
  but the API still queries through the application account. Wiring reports to
  `leave_report` is an optional hardening step.

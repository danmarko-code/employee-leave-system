# Step 1 verification record

Date: 2026-11-19
Environment: Windows, Node 24.22.0, MySQL 8.0.46 (separate throwaway data
directory on port 3399; your `MySQL80` service was not touched). The throwaway
instance was shut down and its data directory deleted after the checks.

## What was run

| Check | Result |
| --- | --- |
| `node --check db/apply.mjs db/seed.mjs` | Pass |
| `db/apply.mjs` applies `schema.sql` | Pass |
| `db/apply.mjs` creates `leave_migrator`, `leave_app`, `leave_report` | Pass (3/3 accounts) |
| `leave_app` SELECT on applications | Allowed, as intended |
| `leave_app` INSERT activity log (rolled back) | Allowed, as intended |
| `leave_app` DELETE/UPDATE `activity_logs` | Denied (1142) |
| `leave_app` DELETE users / applications | Denied (1142) |
| `leave_app` DROP TABLE | Denied (1142) |
| `leave_app` CREATE USER | Denied (1227) |
| `leave_report` column SELECT on users | Allowed |
| `leave_report` SELECT `password_hash` | Denied (1143) |
| `leave_report` write activity log | Denied (1142) |
| Seed refuses `NODE_ENV=production` | Refused, exit 1 |
| `seed.sql` SQL guard with production value | Rejected (CHECK 3819) |
| Seed applies 5 users + 3 leave types | Pass |
| Seed re-run without `--rotate` | Refused, no passwords printed |
| Seed `--rotate` | Pass |
| `npm audit` | 0 vulnerabilities |

## Constraint tests (15/15 passed)

- `end_date < start_date` rejected (3819)
- `working_days = 0` rejected (3819)
- rejected without remarks rejected (3819)
- pending with a decision rejected (3819)
- deciding your own application rejected (3819)
- duplicate email rejected (1062)
- name over 100 characters rejected (1406)
- negative entitlement rejected (1264)
- unknown `user_id` rejected (FK 1216)
- disallowed document MIME / stored name rejected (3819)
- document over 1 MB rejected (3819)
- blank activity action rejected (3819)
- malformed refresh-token hash rejected (3819)
- valid application + document insert succeeded, then cleaned up by the
  migration account

## Not verified in step 1

- Running against the production MySQL host, with `REQUIRE SSL` enabled.
- Logging in with a seeded password: no API exists yet (step 2 verifies the
  Argon2id hashes end to end).
- Backup/restore and point-in-time recovery: deployment concern, not step 1.
- Concurrent approval locking: schema supports it, the transaction lives in
  step 3 and will be tested there.

## Notes

- The verification scripts above were temporary and are not committed. The
  permanent API tests (Jest + supertest) arrive with the backend in step 2.
- No real password was written to a file. The throwaway MySQL root and account
  passwords existed only in that shell session and the instance is gone.

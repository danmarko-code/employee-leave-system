# Database guide: tables, accounts and how they connect

Everything the app stores lives in one MySQL 8 database called **`leave_system`**.
This guide covers how to get into it, what each table is for, how the tables
relate, and the queries worth having on hand.

The security rationale is in [`security-guide.md`](./security-guide.md). This
file is the map.

---

## 1. What is running on your machine

| Piece | Value |
| --- | --- |
| Server | MySQL 8.0.46, Windows service `MySQL80` |
| Port | `3306` |
| Database | `leave_system` (utf8mb4) |
| Data directory | `C:/ProgramData/MySQL/MySQL Server 8.0/Data` |
| Server config | `C:\ProgramData\MySQL\MySQL Server 8.0\my.ini` |

Check the service is up:

```bash
sc query MySQL80
```

You want `STATE : 4 RUNNING`.

---

## 2. Connecting

### Option A — `mysql.exe` (always works, no extra install)

The CLI ships with the server:

```bash
cd ~/employee-leave-system

# Read the admin password out of the (git-ignored) server config
export MYSQL_PWD=$(grep '^DB_ADMIN_PASSWORD=' server/.env | cut -d= -f2-)

MYSQL="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"
"$MYSQL" -u root leave_system
```

You are now at a `mysql>` prompt. Useful:

```sql
SHOW TABLES;
DESCRIBE users;
SELECT COUNT(*) FROM leave_applications;
exit
```

Run one query without entering the shell:

```bash
"$MYSQL" -u root leave_system -e "SELECT id, email, role FROM users;"
```

> `MYSQL_PWD` is a convenience for local work. Never put it in a script or a
> shell profile that ends up in version control.

### Option B — MySQL Workbench

Workbench is the official GUI, but on this machine its install is broken (the
shortcut points at a folder that no longer exists). If you want it back:

1. Open **MySQL Installer** (Start menu → "MySQL Installer - Community").
2. Choose **Add** (or **Modify** on the existing install) → **MySQL Workbench**
   → **Execute**. Let it repair/download.
3. Create a connection with:

| Field | Value |
| --- | --- |
| Connection name | `leave_system (local)` |
| Hostname | `127.0.0.1` |
| Port | `3306` |
| Username | `root` |
| Password | the `DB_ADMIN_PASSWORD` value in `server/.env` |
| Default schema | `leave_system` |

### Option C — VS Code (no install beyond an extension)

Install the **MySQL** extension (cweijan), then add a connection with the same
host/port/user/password and database `leave_system`. It gives you a table tree,
a query editor and an editable grid.

### Option D — DBeaver

Also fine: **New Database Connection → MySQL**, host `127.0.0.1`, port `3306`,
user `root`, password from `server/.env`.

---

## 3. The three database accounts (and why)

The application **never** connects as `root`. `db/apply.mjs` creates three
least-privilege accounts from `db/db-users.sql`, each with its password taken
from `server/.env`:

| Account | Used by | Privileges | Cannot |
| --- | --- | --- | --- |
| `leave_app` | the running API (`npm run dev:server`) | `SELECT/INSERT/UPDATE` on app tables; `INSERT`-only on `documents`; `SELECT/INSERT` on `activity_logs`; `SELECT/INSERT/DELETE` on `holidays` | run DDL, `DELETE` users/leaves/logs, grant anything |
| `leave_migrator` | `db:apply` / `db:migrate` / `db:seed` (manual) | schema + data changes (`CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE`, …) | `GRANT OPTION`, `CREATE USER`, `SUPER`, `FILE` |
| `leave_report` | optional read-only reporting | `SELECT` on selected columns of `users`, `leave_types`, `leave_applications` | read password hashes, emails, phones, lockout counters |

Two design points worth remembering:

- `activity_logs` is **append-only for the app**: the runtime account has no
  `UPDATE` and no `DELETE`. A compromised API cannot rewrite its own audit
  trail.
- `leave_report` uses **column-level** grants so a reporting bug (or CSV export)
  cannot leak `password_hash`, `email` or `phone`.

See exactly what an account may do:

```sql
SHOW GRANTS FOR 'leave_app'@'localhost';
SHOW GRANTS FOR 'leave_report'@'localhost';
```

Prove the restriction yourself — this must fail with a permission error:

```bash
export MYSQL_PWD=$(grep '^DB_APP_PASSWORD=' server/.env | cut -d= -f2-)
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u leave_app leave_system \
  -e "DELETE FROM activity_logs WHERE id = 1;"
```

```
ERROR 1142 (42000): DELETE command denied to user 'leave_app'@'localhost' for table 'activity_logs'
```

---

## 4. The tables

Eight tables. Seven belong to the product; `schema_migrations` is bookkeeping
for the migration runner.

### `users` — accounts

One row per person who can sign in. Accounts are created by an administrator;
there is no self-registration.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED, PK | |
| `name` | VARCHAR(100) | |
| `email` | VARCHAR(255), UNIQUE | sign-in identifier |
| `password_hash` | VARCHAR(255) | Argon2id PHC string — never a password |
| `role` | ENUM('employee','admin') | the only source of truth for permissions |
| `position`, `department` | VARCHAR(100) | display only |
| `phone` | VARCHAR(30), NULL | self-service editable |
| `photo_path` | CHAR(36), NULL | random UUID stem; files live on disk outside the web root |
| `is_active` | TINYINT(1) | 0 = cannot sign in; existing sessions are refused |
| `failed_attempts`, `locked_until` | | 5 failures → 15-minute lockout |
| `password_changed_at`, `created_at`, `updated_at` | DATETIME | |

Checks in the schema: email shape (must contain `@` and a dot), role whitelist,
`is_active ∈ {0,1}`, `photo_path` matches a UUID.

### `leave_types` — categories and entitlement

| Column | Type | Notes |
| --- | --- | --- |
| `id` | INT UNSIGNED, PK | |
| `name` | VARCHAR(100), UNIQUE | e.g. Vacation, Sick |
| `yearly_entitlement` | SMALLINT UNSIGNED | days per year, must be ≥ 0 |
| `requires_document` | TINYINT(1) | approval is blocked until a document exists |
| `is_active` | TINYINT(1) | retired types stay for history |
| `created_at`, `updated_at` | DATETIME | |

### `leave_applications` — the requests

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED, PK | |
| `user_id` | BIGINT UNSIGNED, FK → `users.id` | who is asking |
| `leave_type_id` | INT UNSIGNED, FK → `leave_types.id` | |
| `start_date`, `end_date` | DATE | `end_date >= start_date` |
| `working_days` | SMALLINT UNSIGNED | recomputed by the server (Mon–Fri, holidays excluded); never trusted from the client |
| `reason` | VARCHAR(500) | |
| `status` | ENUM('pending','approved','rejected') | default `pending` |
| `decided_by` | BIGINT UNSIGNED, FK → `users.id`, NULL | the approver |
| `decided_at`, `remarks` | | a rejection must carry remarks |
| `created_at`, `updated_at` | DATETIME | |

Four constraints do real work here:

- `chk_la_decision` — pending has no decision fields; approved/rejected have both.
- `chk_la_reject_notes` — a rejection without remarks is impossible, even by SQL.
- `chk_la_not_self_decided` — you cannot approve your own leave.
- `chk_la_working_days` — a request must consume at least one day.

### `documents` — supporting files (metadata only)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED, PK | |
| `application_id` | BIGINT UNSIGNED, FK → `leave_applications.id`, UNIQUE | one document per application |
| `original_name` | VARCHAR(255) | display only, never a path |
| `stored_name` | VARCHAR(64), UNIQUE | `<uuid>.<ext>` on disk |
| `mime_type` | VARCHAR(100) | `application/pdf`, `image/jpeg`, `image/png` only |
| `size_bytes` | INT UNSIGNED | 1 – 1,048,576 |
| `sha256` | CHAR(64) | integrity fingerprint |
| `created_at` | DATETIME | |

The **bytes are not in the database**. They live under `UPLOAD_DIR` (default
`server/var/uploads`) with random names and mode 0600, and are streamed only
through an authenticated route.

### `refresh_tokens` — sessions

One row per issued refresh token. Rotation inserts a new row and sets
`revoked_at` on the old one.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED, PK | |
| `user_id` | BIGINT UNSIGNED, FK → `users.id`, `ON DELETE CASCADE` | |
| `token_hash` | CHAR(64), UNIQUE | **SHA-256 of the token, never the token** |
| `family_id` | CHAR(36) | all rows in one sign-in share this |
| `client_type` | ENUM('web','native') | a token cannot switch flows |
| `session_started_at` | DATETIME | carries the 12-hour absolute limit across rotations |
| `created_at`, `last_used_at`, `expires_at` | DATETIME | `expires_at > created_at` |
| `revoked_at` | DATETIME, NULL | non-NULL = dead token |

### `activity_logs` — audit trail (append-only)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED, PK | |
| `user_id` | BIGINT UNSIGNED, FK → `users.id`, `ON DELETE SET NULL`, NULL | NULL when the email was unknown |
| `action` | VARCHAR(64) | one of the 17 values in `shared/src/constants.ts` |
| `target_type`, `target_id` | | what was acted on; not an FK because the target table varies |
| `ip_address` | VARCHAR(45) | normalised, an aid not proof of identity |
| `created_at` | DATETIME | |

No passwords, tokens, emails, phone numbers or leave reasons are written here.

### `holidays` — public holidays

| Column | Type | Notes |
| --- | --- | --- |
| `id` | BIGINT UNSIGNED, PK | |
| `name` | VARCHAR(100) | e.g. "Christmas Day" |
| `date` | DATE, UNIQUE | one row per calendar day |
| `is_active` | TINYINT(1) | inactive rows stop affecting working-day counts |
| `created_at`, `updated_at` | DATETIME | |

Holidays are excluded when `working_days` is computed, so a request spanning a
public holiday consumes one fewer day.

### `schema_migrations` — which migrations ran

| Column | Type | Notes |
| --- | --- | --- |
| `version` | VARCHAR, PK | the migration filename, e.g. `002_holidays.sql` |
| `applied_at` | DATETIME | |

Written by `db/migrate.mjs`, not by the app. Never edit it by hand — the runner
skips whatever is listed here.

---

## 5. How the tables connect

Only real foreign keys are drawn; `activity_logs.target_id` is deliberately not
one because it can point at different tables.

```
                         ┌──────────────────┐
                         │   leave_types    │
                         │ id (PK)          │
                         │ name (UNIQUE)    │
                         │ entitlement      │
                         └────────┬─────────┘
                                  │ 1
                                  │
                                  │ N
┌───────────────┐         ┌───────▼──────────────────────────┐
│    users      │ 1     N │       leave_applications         │
│ id (PK)       ├────────►│ id (PK)                          │
│ email (UNIQ)  │         │ user_id          FK → users.id   │
│ role          │         │ leave_type_id    FK → leave_types│
│ is_active     │         │ decided_by       FK → users.id   │
│ password_hash │         │ status / dates / working_days    │
└───┬───┬───┬───┘         └──────────────┬───────────────────┘
    │   │   │ 1                          │ 1
    │   │   └──────────────┐             │
    │   │                  │ N           │ 1 (at most)
    │   │        ┌─────────▼─────────┐   │
    │   │        │  refresh_tokens   │   │
    │   │        │ user_id FK        │   │
    │   │        │ token_hash (UNIQ) │   │
    │   │        │ family_id         │   │
    │   │        └───────────────────┘   │
    │   │                                │
    │   │ 1                              ▼
    │   └──────────────►┌──────────────────────────┐
    │ N                 │        documents         │
    │                   │ application_id (UNIQ, FK)│
    │                   └──────────────────────────┘
    │
    │ N
    ▼
┌─────────────────────┐        ┌──────────────────┐
│   activity_logs     │        │    holidays      │
│ user_id FK (SET NULL)│       │ date (UNIQUE)    │
│ action, target_*    │        │ (no FK: global)  │
└─────────────────────┘        └──────────────────┘

┌──────────────────────┐
│  schema_migrations   │  (standalone bookkeeping)
└──────────────────────┘
```

Relationship summary:

| From | To | Cardinality | Delete rule |
| --- | --- | --- | --- |
| `leave_applications.user_id` | `users.id` | many → one | `RESTRICT` (cannot delete a person who has requests) |
| `leave_applications.leave_type_id` | `leave_types.id` | many → one | `RESTRICT` |
| `leave_applications.decided_by` | `users.id` | many → one | `RESTRICT` |
| `documents.application_id` | `leave_applications.id` | one → one | `RESTRICT` |
| `refresh_tokens.user_id` | `users.id` | many → one | `CASCADE` (sessions die with the account) |
| `activity_logs.user_id` | `users.id` | many → one | `SET NULL` (history survives) |
| `holidays` | — | standalone | — |

`RESTRICT` everywhere on leave data is intentional: applications are records,
not drafts. Accounts are deactivated (`is_active = 0`), not deleted.

See the constraints MySQL actually holds:

```sql
SELECT TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, DELETE_RULE
  FROM information_schema.REFERENTIAL_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = 'leave_system';
```

---

## 6. Queries worth having

### The shape of the data

```sql
SELECT 'users' AS table_name, COUNT(*) AS rows_count FROM users
UNION ALL SELECT 'leave_types',         COUNT(*) FROM leave_types
UNION ALL SELECT 'leave_applications',  COUNT(*) FROM leave_applications
UNION ALL SELECT 'documents',           COUNT(*) FROM documents
UNION ALL SELECT 'refresh_tokens',      COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'activity_logs',       COUNT(*) FROM activity_logs
UNION ALL SELECT 'holidays',            COUNT(*) FROM holidays
UNION ALL SELECT 'schema_migrations',   COUNT(*) FROM schema_migrations;
```

### Who is on leave right now

```sql
SELECT u.name, lt.name AS leave_type, la.start_date, la.end_date, la.status
  FROM leave_applications la
  JOIN users u        ON u.id = la.user_id
  JOIN leave_types lt ON lt.id = la.leave_type_id
 WHERE la.status = 'approved'
   AND CURDATE() BETWEEN la.start_date AND la.end_date
 ORDER BY la.end_date;
```

### The pending approval queue

```sql
SELECT la.id, u.name AS employee, lt.name AS leave_type,
       la.start_date, la.end_date, la.working_days, la.created_at
  FROM leave_applications la
  JOIN users u        ON u.id = la.user_id
  JOIN leave_types lt ON lt.id = la.leave_type_id
 WHERE la.status = 'pending'
 ORDER BY la.created_at ASC;
```

### Balances for the current year

Approved `working_days` are already stored per application, so this is a plain
aggregate:

```sql
SELECT u.name,
       lt.name AS leave_type,
       lt.yearly_entitlement,
       COALESCE(SUM(CASE WHEN la.status = 'approved' THEN la.working_days END), 0) AS used,
       lt.yearly_entitlement
         - COALESCE(SUM(CASE WHEN la.status = 'approved' THEN la.working_days END), 0) AS remaining
  FROM users u
  JOIN leave_types lt ON lt.is_active = 1
  LEFT JOIN leave_applications la
         ON la.user_id = u.id
        AND la.leave_type_id = lt.id
        AND YEAR(la.start_date) = YEAR(CURDATE())
 WHERE u.is_active = 1
 GROUP BY u.id, lt.id
 ORDER BY u.name, lt.name;
```

### Decisions, with who made them

```sql
SELECT la.id, u.name AS employee, la.status,
       d.name AS decided_by, la.decided_at, la.remarks
  FROM leave_applications la
  JOIN users u ON u.id = la.user_id
  LEFT JOIN users d ON d.id = la.decided_by
 WHERE la.status <> 'pending'
 ORDER BY la.decided_at DESC;
```

### Sessions that are still alive

```sql
SELECT rt.id, u.email, rt.client_type, rt.family_id,
       rt.created_at, rt.last_used_at, rt.expires_at
  FROM refresh_tokens rt
  JOIN users u ON u.id = rt.user_id
 WHERE rt.revoked_at IS NULL
   AND rt.expires_at > UTC_TIMESTAMP()
 ORDER BY rt.created_at DESC;
```

### Recent audit events

```sql
SELECT created_at, action, user_id, target_type, target_id, ip_address
  FROM activity_logs
 ORDER BY id DESC
 LIMIT 25;
```

### Failed sign-ins in the last day

```sql
SELECT u.email, COUNT(*) AS failures, MAX(al.created_at) AS last_attempt
  FROM activity_logs al
  LEFT JOIN users u ON u.id = al.user_id
 WHERE al.action = 'login_failure'
   AND al.created_at > UTC_TIMESTAMP() - INTERVAL 1 DAY
 GROUP BY al.user_id, u.email
 ORDER BY failures DESC;
```

### Holidays this year

```sql
SELECT date, name, is_active
  FROM holidays
 WHERE YEAR(date) = YEAR(CURDATE())
 ORDER BY date;
```

### Anyone currently locked out

```sql
SELECT email, failed_attempts, locked_until
  FROM users
 WHERE locked_until > UTC_TIMESTAMP();
```

Unlock one account:

```sql
UPDATE users SET failed_attempts = 0, locked_until = NULL
 WHERE email = 'ana.lim@example.com';
```

---

## 7. Where the schema lives, and how to change it

| File | Purpose |
| --- | --- |
| `db/schema.sql` | baseline: all tables, indexes, constraints (except holidays) |
| `db/migrations/001_profile_photo.sql` | adds `users.photo_path` |
| `db/migrations/002_holidays.sql` | creates `holidays` |
| `db/db-users.sql` | the three accounts and their grants |
| `db/apply.mjs` | creates the database, runs `schema.sql`, provisions accounts |
| `db/migrate.mjs` | runs each `db/migrations/*.sql` once, records it in `schema_migrations` |
| `db/seed.mjs` | demo users, leave types, holidays, sample applications |

`db/schema.sql` is a **baseline, not a repeatable migration**. Re-running it
against an existing database fails loudly instead of quietly altering it. Every
change after the first deploy goes into a new numbered migration.

```bash
npm run db:apply      # schema + accounts (safe on a fresh machine; loud if already applied)
npm run db:migrate    # applies any migrations not yet in schema_migrations
npm run db:seed       # demo data; prints the seeded passwords once
```

To add a table or column later:

1. Create `db/migrations/003_what_it_does.sql` with the change.
2. If it is a **new table**, add the matching `GRANT` line for `leave_app` in
   `db/db-users.sql` — otherwise the running API cannot read it. (That is
   exactly what happened with `holidays`.)
3. Run `npm run db:migrate`.
4. Grant the new privilege on the existing database. `npm run db:apply` is for
   a **fresh** database — its `schema.sql` deliberately fails on tables that
   already exist — so on a live database run the statement as `root`:

```sql
GRANT SELECT, INSERT, DELETE ON leave_system.holidays TO 'leave_app'@'localhost';
```

   Grants take effect immediately; no `FLUSH PRIVILEGES` is needed.

---

## 8. Starting over from nothing

```bash
export MYSQL_PWD=$(grep '^DB_ADMIN_PASSWORD=' server/.env | cut -d= -f2-)
"/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe" -u root \
  -e "DROP DATABASE IF EXISTS leave_system;"
unset MYSQL_PWD

npm run db:apply
npm run db:migrate
npm run db:seed
```

The seed prints each demo account's password exactly once. Write them down or
change them from the admin **Employees → Reset password** screen.

---

## 9. Quick sanity checklist

After a rebuild, this should be true:

```bash
export MYSQL_PWD=$(grep '^DB_ADMIN_PASSWORD=' server/.env | cut -d= -f2-)
MYSQL="/c/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe"

"$MYSQL" -u root leave_system -e "SHOW TABLES;"                       # 8 tables
"$MYSQL" -u root leave_system -e "SELECT COUNT(*) FROM users WHERE is_active = 1;"   # 4 seeded active users
"$MYSQL" -u root leave_system -e "SELECT version FROM schema_migrations ORDER BY version;"  # both migrations
"$MYSQL" -u root leave_system -e "SELECT COUNT(*) FROM holidays;"     # seeded holidays
```

If `SHOW TABLES` lists 8 rows and `schema_migrations` has both versions, the
database is in the shape the API expects.

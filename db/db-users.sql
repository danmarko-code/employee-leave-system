-- ============================================================================
-- Least-privilege MySQL accounts for leave_system
--
-- DO NOT RUN BY HAND WITH REAL PASSWORDS AND DO NOT COMMIT FILLED COPIES.
-- db/apply.mjs substitutes the __PLACEHOLDERS__ from environment variables and
-- pipes this file to the server. The administrative account used to run it
-- needs CREATE USER and GRANT; the app accounts themselves never get GRANT.
--
-- Accounts
--   leave_migrator  DDL + DML, manual use only (apply.mjs, seed.mjs). No FILE,
--                   no GRANT OPTION, no CREATE USER, no SUPER.
--   leave_app       Runtime account. SELECT/INSERT/UPDATE on app tables.
--                   INSERT+SELECT only on activity_logs. No DELETE anywhere.
--   leave_report    Optional read-only account for report exports.
-- ============================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------------
-- Migration account (manual use only)
-- ---------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'leave_migrator'@'__DB_USER_HOST__' IDENTIFIED BY '__MIGRATOR_PASSWORD__';
ALTER USER 'leave_migrator'@'__DB_USER_HOST__' IDENTIFIED BY '__MIGRATOR_PASSWORD__';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'leave_migrator'@'__DB_USER_HOST__';

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER,
      CREATE TEMPORARY TABLES
  ON leave_system.* TO 'leave_migrator'@'__DB_USER_HOST__';

-- ---------------------------------------------------------------------------
-- Application account (runtime, no DDL, no DELETE)
-- ---------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'leave_app'@'__DB_USER_HOST__' IDENTIFIED BY '__APP_PASSWORD__';
ALTER USER 'leave_app'@'__DB_USER_HOST__' IDENTIFIED BY '__APP_PASSWORD__';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'leave_app'@'__DB_USER_HOST__';

GRANT SELECT, INSERT, UPDATE ON leave_system.users             TO 'leave_app'@'__DB_USER_HOST__';
GRANT SELECT, INSERT, UPDATE ON leave_system.leave_types       TO 'leave_app'@'__DB_USER_HOST__';
GRANT SELECT, INSERT, UPDATE ON leave_system.leave_applications TO 'leave_app'@'__DB_USER_HOST__';
GRANT SELECT, INSERT, UPDATE ON leave_system.refresh_tokens    TO 'leave_app'@'__DB_USER_HOST__';
GRANT SELECT, INSERT          ON leave_system.documents        TO 'leave_app'@'__DB_USER_HOST__';

-- Append-only: no UPDATE, no DELETE for the runtime account.
GRANT SELECT, INSERT          ON leave_system.activity_logs    TO 'leave_app'@'__DB_USER_HOST__';

-- ---------------------------------------------------------------------------
-- Report account (optional, read-only)
-- Column-level grant on users so password hashes, phone numbers, lockout
-- counters and email addresses are not readable by the reporting path.
-- ---------------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'leave_report'@'__DB_USER_HOST__' IDENTIFIED BY '__REPORT_PASSWORD__';
ALTER USER 'leave_report'@'__DB_USER_HOST__' IDENTIFIED BY '__REPORT_PASSWORD__';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'leave_report'@'__DB_USER_HOST__';

GRANT SELECT (id, name, role, position, department, is_active)
  ON leave_system.users TO 'leave_report'@'__DB_USER_HOST__';
GRANT SELECT
  ON leave_system.leave_types TO 'leave_report'@'__DB_USER_HOST__';
GRANT SELECT (id, user_id, leave_type_id, start_date, end_date, working_days,
              status, decided_by, decided_at, remarks, created_at)
  ON leave_system.leave_applications TO 'leave_report'@'__DB_USER_HOST__';

-- In production, require TLS for these accounts (adjust host as needed):
--   ALTER USER 'leave_app'@'__DB_USER_HOST__' REQUIRE SSL;
--   ALTER USER 'leave_report'@'__DB_USER_HOST__' REQUIRE SSL;

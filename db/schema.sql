-- ============================================================================
-- Employee Leave Application System - baseline schema
-- Requires MySQL 8.0.16+ (CHECK constraints are enforced from that version).
--
-- Apply once, with the migration account, from db/apply.mjs:
--   node db/apply.mjs
--
-- This file is a baseline, not a migration chain. Re-running it fails loudly
-- instead of silently altering an existing database. Schema changes after the
-- first deploy get their own numbered migration file.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS leave_system
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE leave_system;

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- users
-- One row per person who can sign in. Accounts are created by an administrator
-- only; there is no self-registration.
-- password_hash is an Argon2id PHC string (never a password, never reversible).
-- ----------------------------------------------------------------------------
CREATE TABLE users (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                VARCHAR(100)    NOT NULL,
  email               VARCHAR(255)    NOT NULL,
  password_hash       VARCHAR(255)    NOT NULL,
  role                ENUM('employee','admin') NOT NULL,
  position            VARCHAR(100)    NOT NULL DEFAULT '',
  department          VARCHAR(100)    NOT NULL DEFAULT '',
  phone               VARCHAR(30)     NULL,
  -- Random UUID stem for <stem>.webp / <stem>_thumb.webp outside the web root.
  photo_path          VARCHAR(36)     NULL,
  is_active           TINYINT(1)      NOT NULL DEFAULT 1,
  failed_attempts     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until        DATETIME        NULL,
  password_changed_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_is_active (is_active),

  CONSTRAINT chk_users_name_len   CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 100),
  CONSTRAINT chk_users_email_len  CHECK (CHAR_LENGTH(email) BETWEEN 3 AND 255),
  CONSTRAINT chk_users_email_form CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_users_role       CHECK (role IN ('employee','admin')),
  CONSTRAINT chk_users_is_active  CHECK (is_active IN (0,1)),
  CONSTRAINT chk_users_phone_len  CHECK (phone IS NULL OR CHAR_LENGTH(phone) <= 30),
  CONSTRAINT chk_users_photo_path CHECK (photo_path IS NULL OR photo_path REGEXP '^[0-9a-f-]{36}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- leave_types
-- ----------------------------------------------------------------------------
CREATE TABLE leave_types (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name               VARCHAR(100) NOT NULL,
  yearly_entitlement SMALLINT UNSIGNED NOT NULL,
  requires_document  TINYINT(1)   NOT NULL DEFAULT 0,
  is_active          TINYINT(1)   NOT NULL DEFAULT 1,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_leave_types_name (name),

  CONSTRAINT chk_leave_types_name_len    CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 100),
  CONSTRAINT chk_leave_types_entitlement CHECK (yearly_entitlement >= 0),
  CONSTRAINT chk_leave_types_document    CHECK (requires_document IN (0,1)),
  CONSTRAINT chk_leave_types_active      CHECK (is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- leave_applications
-- working_days is always recomputed by the server (Mon-Fri, inclusive).
-- A decision row is consistent: pending has no decision, approved/rejected do.
-- A rejected row must carry remarks (enforced both here and in the API).
-- ----------------------------------------------------------------------------
CREATE TABLE leave_applications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  leave_type_id INT UNSIGNED    NOT NULL,
  start_date    DATE            NOT NULL,
  end_date      DATE            NOT NULL,
  working_days  SMALLINT UNSIGNED NOT NULL,
  reason        VARCHAR(500)    NOT NULL,
  status        ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  decided_by    BIGINT UNSIGNED NULL,
  decided_at    DATETIME        NULL,
  remarks       VARCHAR(500)    NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_la_user_status_start (user_id, status, start_date),
  KEY idx_la_status_created    (status, created_at),
  KEY idx_la_dates             (start_date, end_date),
  KEY idx_la_leave_type        (leave_type_id),
  KEY idx_la_decided_by        (decided_by),

  CONSTRAINT fk_la_user       FOREIGN KEY (user_id)       REFERENCES users (id)       ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_la_leave_type FOREIGN KEY (leave_type_id) REFERENCES leave_types (id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_la_decided_by FOREIGN KEY (decided_by)    REFERENCES users (id)       ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT chk_la_date_order   CHECK (end_date >= start_date),
  CONSTRAINT chk_la_working_days CHECK (working_days > 0),
  CONSTRAINT chk_la_reason_len   CHECK (CHAR_LENGTH(TRIM(reason)) BETWEEN 1 AND 500),
  CONSTRAINT chk_la_remarks_len  CHECK (remarks IS NULL OR CHAR_LENGTH(remarks) <= 500),
  CONSTRAINT chk_la_reject_notes CHECK (
    status <> 'rejected'
    OR (remarks IS NOT NULL AND CHAR_LENGTH(TRIM(remarks)) > 0)
  ),
  CONSTRAINT chk_la_decision     CHECK (
    (status = 'pending'  AND decided_by IS NULL     AND decided_at IS NULL)
    OR
    (status IN ('approved','rejected') AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  ),
  CONSTRAINT chk_la_not_self_decided CHECK (decided_by IS NULL OR decided_by <> user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- documents
-- Metadata only. The bytes live on disk outside any web root under a random
-- UUID name; the client's original file name is kept for display only.
-- One supporting document per application.
-- ----------------------------------------------------------------------------
CREATE TABLE documents (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id BIGINT UNSIGNED NOT NULL,
  original_name  VARCHAR(255)    NOT NULL,
  stored_name    VARCHAR(64)     NOT NULL,
  mime_type      VARCHAR(100)    NOT NULL,
  size_bytes     INT UNSIGNED    NOT NULL,
  sha256         CHAR(64)        NOT NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_documents_application (application_id),
  UNIQUE KEY uq_documents_stored_name (stored_name),

  CONSTRAINT fk_documents_application FOREIGN KEY (application_id)
    REFERENCES leave_applications (id) ON DELETE RESTRICT ON UPDATE RESTRICT,

  CONSTRAINT chk_documents_original_len CHECK (CHAR_LENGTH(TRIM(original_name)) BETWEEN 1 AND 255),
  CONSTRAINT chk_documents_stored_name  CHECK (stored_name REGEXP '^[0-9a-f-]{36}[.][a-z0-9]{1,5}$'),
  CONSTRAINT chk_documents_mime          CHECK (mime_type IN ('application/pdf','image/jpeg','image/png')),
  CONSTRAINT chk_documents_size          CHECK (size_bytes > 0 AND size_bytes <= 1048576),
  CONSTRAINT chk_documents_sha256        CHECK (sha256 REGEXP '^[0-9a-f]{64}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- activity_logs
-- Append-only for the application account (INSERT + SELECT only, no UPDATE,
-- no DELETE). target_id is intentionally not a foreign key because the target
-- table varies; user_id is SET NULL only if a user row is ever hard-deleted.
-- Never store passwords, tokens, email addresses or leave reasons here.
-- ----------------------------------------------------------------------------
CREATE TABLE activity_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NULL,
  action      VARCHAR(64)     NOT NULL,
  target_type VARCHAR(40)     NULL,
  target_id   BIGINT UNSIGNED NULL,
  ip_address  VARCHAR(45)     NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_al_created        (created_at),
  KEY idx_al_user_created   (user_id, created_at),
  KEY idx_al_action_created (action, created_at),

  CONSTRAINT fk_al_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE RESTRICT,

  CONSTRAINT chk_al_action_len CHECK (CHAR_LENGTH(TRIM(action)) BETWEEN 1 AND 64),
  CONSTRAINT chk_al_target_len CHECK (target_type IS NULL OR CHAR_LENGTH(target_type) <= 40),
  CONSTRAINT chk_al_ip_len     CHECK (ip_address IS NULL OR CHAR_LENGTH(ip_address) <= 45)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ----------------------------------------------------------------------------
-- refresh_tokens
-- Only the SHA-256 hash of the 256-bit token is stored. Rotation inserts a new
-- row and revokes the old one; reuse of a revoked row revokes the family.
--
-- session_started_at is the same value for every row in a family. It carries
-- the 12-hour absolute session lifetime across rotations and is the value put
-- in the access token's `sid` claim (JWT sid == family_id).
-- ----------------------------------------------------------------------------
CREATE TABLE refresh_tokens (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  token_hash         CHAR(64)        NOT NULL,
  family_id          CHAR(36)        NOT NULL,
  client_type        ENUM('web','native') NOT NULL,
  session_started_at DATETIME        NOT NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at         DATETIME        NOT NULL,
  revoked_at         DATETIME        NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_refresh_tokens_hash (token_hash),
  KEY idx_rt_user    (user_id),
  KEY idx_rt_family  (family_id, revoked_at),
  KEY idx_rt_expires (expires_at),

  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE RESTRICT,

  CONSTRAINT chk_rt_hash    CHECK (token_hash REGEXP '^[0-9a-f]{64}$'),
  CONSTRAINT chk_rt_family  CHECK (family_id REGEXP '^[0-9a-f-]{36}$'),
  CONSTRAINT chk_rt_expires CHECK (expires_at > created_at),
  CONSTRAINT chk_rt_session CHECK (session_started_at <= created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

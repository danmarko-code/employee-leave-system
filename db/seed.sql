-- ============================================================================
-- Development seed data - NEVER run in production.
--
-- Run only through db/seed.mjs:
--   NODE_ENV=development node db/seed.mjs
--
-- The runner:
--   * refuses unless NODE_ENV=development (the SQL guard below fails closed too),
--   * hashes every password with Argon2id and prints generated passwords once,
--   * injects the __:named__ parameters; this file is not meant to be pasted
--     into a MySQL client with real credentials.
--
-- Emails are reserved-domain @example.com addresses. There are no fixed or
-- shared passwords: each seeded person gets their own random password, printed
-- one time by the runner, or the value of SEED_ADMIN_PASSWORD for the admin.
-- ============================================================================

-- Fail closed if anything but development reaches this file.
CREATE TEMPORARY TABLE seed_guard (
  node_env VARCHAR(32) NOT NULL,
  CONSTRAINT chk_seed_not_production CHECK (node_env NOT IN ('production', 'prod', 'staging'))
) ENGINE=MEMORY;

-- @stmt
INSERT INTO seed_guard (node_env) VALUES (:node_env);

-- @stmt
DROP TEMPORARY TABLE seed_guard;

-- ---------------------------------------------------------------------------
-- Leave types (same names and entitlements as the prototype)
-- ---------------------------------------------------------------------------
-- @stmt
INSERT INTO leave_types (name, yearly_entitlement, requires_document, is_active)
VALUES
  ('Vacation leave', 15, 0, 1),
  ('Sick leave', 6, 1, 1),
  ('Emergency leave', 3, 1, 0)
ON DUPLICATE KEY UPDATE id = id;

-- ---------------------------------------------------------------------------
-- People. is_active = 1 except one deactivated sample employee, so the admin
-- activation flow can be exercised immediately.
-- ---------------------------------------------------------------------------
-- @stmt
INSERT INTO users (name, email, password_hash, role, position, department, phone, is_active)
VALUES
  ('Linda Cruz',  'linda.cruz@example.com',  :admin_hash,  'admin',    'People and Culture Lead',        'Human Resources',   NULL, 1),
  ('Maria Santos','maria.santos@example.com',:maria_hash,  'employee', 'Customer Success Associate',     'Customer Success',  NULL, 1),
  ('Ana Lim',     'ana.lim@example.com',     :ana_hash,    'employee', 'Product Designer',               'Customer Success',  NULL, 1),
  ('David Reyes', 'david.reyes@example.com', :david_hash,  'employee', 'Head of Operations',             'Operations',        NULL, 1),
  ('Carla Dizon', 'carla.dizon@example.com', :carla_hash,  'employee', 'Finance Analyst',                'Finance',           NULL, 0)
ON DUPLICATE KEY UPDATE id = id;

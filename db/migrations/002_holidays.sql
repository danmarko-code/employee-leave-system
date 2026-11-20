-- holidays: public holidays excluded from working-day counts
-- migration for Step 5
CREATE TABLE IF NOT EXISTS holidays (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(100)    NOT NULL,
  date            DATE            NOT NULL,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_holidays_date (date),
  KEY idx_holidays_is_active (is_active),

  CONSTRAINT chk_holidays_name_len CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 100),
  CONSTRAINT chk_holidays_is_active CHECK (is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
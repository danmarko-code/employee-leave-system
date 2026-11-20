-- 001: profile photos.
--
-- photo_path stores only the random UUID stem of the two generated WebP files
-- (<stem>.webp and <stem>_thumb.webp). The path itself is never stored, so a
-- value from this column cannot traverse directories. Guarded so a fresh
-- install that already got the column from schema.sql is unaffected.
SET @has_photo_path := (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'users'
     AND COLUMN_NAME = 'photo_path'
);

SET @ddl := IF(
  @has_photo_path = 0,
  'ALTER TABLE users
     ADD COLUMN photo_path VARCHAR(36) NULL AFTER phone,
     ADD CONSTRAINT chk_users_photo_path
       CHECK (photo_path IS NULL OR photo_path REGEXP ''^[0-9a-f-]{36}$'')',
  'DO 0'
);

PREPARE photo_stmt FROM @ddl;
EXECUTE photo_stmt;
DEALLOCATE PREPARE photo_stmt;

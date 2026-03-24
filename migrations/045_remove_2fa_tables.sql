-- Drop 2FA related tables
DROP TABLE IF EXISTS user_2fa_attempts CASCADE;
DROP TABLE IF EXISTS user_2fa_backup_codes CASCADE;
DROP TABLE IF EXISTS user_2fa_secrets CASCADE;
DROP TABLE IF EXISTS user_2fa_settings CASCADE;

-- ============================================================================
-- Migration: Drop whatsapp_automation_logs
-- Created: 2026-08-02
-- Description:
--   Removes the whatsapp_automation_logs table. It was write-only telemetry
--   (no reader in the app) that duplicated SecureLogger / whatsapp_messages /
--   audit_logs. Logging/errors will move to Sentry/PostHog.
-- ============================================================================

DROP TABLE IF EXISTS public.whatsapp_automation_logs;

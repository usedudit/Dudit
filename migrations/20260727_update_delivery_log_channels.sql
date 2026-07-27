-- Migration: Update notification_delivery_log check constraint to include 'whatsapp'
-- Description: Allows central delivery log to record delivery attempts for all 3 channels (in_app, push, whatsapp)

BEGIN;

ALTER TABLE public.notification_delivery_log
  DROP CONSTRAINT IF EXISTS notification_delivery_log_channel_check;

ALTER TABLE public.notification_delivery_log
  ADD CONSTRAINT notification_delivery_log_channel_check
  CHECK (channel IN ('push', 'in_app', 'whatsapp'));

COMMIT;

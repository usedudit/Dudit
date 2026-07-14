-- Remove scheduling_enabled from services (always uses scheduling now)
-- Add recurrence_interval for service return notifications

ALTER TABLE public.services DROP COLUMN IF EXISTS scheduling_enabled;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS recurrence_interval_value INTEGER,
  ADD COLUMN IF NOT EXISTS recurrence_interval_unit TEXT NOT NULL DEFAULT 'Meses';

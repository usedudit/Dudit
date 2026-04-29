-- Performance indexes for the optimized date-range appointment queries.
-- These support the getAppointmentsByDateRangeAction which filters by
-- (partner_id, start_date range) and optionally by staff.

-- Composite index for date-range queries (covers multi-day overlap check)
CREATE INDEX IF NOT EXISTS idx_appointments_date_range
  ON public.appointments(partner_id, start_date, end_date);

-- Composite index for staff+date availability/conflict detection
CREATE INDEX IF NOT EXISTS idx_appointments_staff_date_time
  ON public.appointments(partner_id, staff_partner_user_id, start_date, start_time);

-- Index for status-based filtering (future use: dashboards, reports)
CREATE INDEX IF NOT EXISTS idx_appointments_partner_status
  ON public.appointments(partner_id, status);

-- ============================================================================
-- Fase 8 Rollback - Remove store_id from appointments
-- ============================================================================
BEGIN;

-- Restore original RLS policies (partner-only, no store check)
DROP POLICY IF EXISTS appointments_select_partner ON public.appointments;
CREATE POLICY appointments_select_partner ON public.appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.partner_id = appointments.partner_id
    )
  );

DROP POLICY IF EXISTS appointments_insert_partner ON public.appointments;
CREATE POLICY appointments_insert_partner ON public.appointments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.partner_id = appointments.partner_id
    )
  );

DROP POLICY IF EXISTS appointments_update_partner ON public.appointments;
CREATE POLICY appointments_update_partner ON public.appointments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.partner_id = appointments.partner_id
    )
  );

DROP POLICY IF EXISTS appointments_delete_partner ON public.appointments;
CREATE POLICY appointments_delete_partner ON public.appointments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.partner_id = appointments.partner_id
    )
  );

-- Drop index and column
DROP INDEX IF EXISTS idx_appointments_partner_store;
ALTER TABLE public.appointments DROP COLUMN IF EXISTS store_id;

COMMIT;

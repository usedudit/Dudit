-- ============================================================================
-- Fase 8 - Add store_id to appointments table
-- ============================================================================
BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_partner_store ON public.appointments(partner_id, store_id);

-- Backfill: set Loja Principal for existing records
UPDATE public.appointments a
SET store_id = (
  SELECT s.id FROM public.stores s
  WHERE s.partner_id = a.partner_id AND s.is_headquarters = true
  LIMIT 1
)
WHERE a.store_id IS NULL;

-- Update RLS policies to include store access check
DROP POLICY IF EXISTS appointments_select_partner ON public.appointments;
CREATE POLICY appointments_select_partner ON public.appointments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.user_id = auth.uid()
        AND pu.partner_id = appointments.partner_id
    )
    AND (
      appointments.store_id IS NULL
      OR public.user_has_store_access(appointments.store_id)
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
    AND (
      appointments.store_id IS NULL
      OR public.user_has_store_access(appointments.store_id)
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
    AND (
      appointments.store_id IS NULL
      OR public.user_has_store_access(appointments.store_id)
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
    AND (
      appointments.store_id IS NULL
      OR public.user_has_store_access(appointments.store_id)
    )
  );

COMMIT;

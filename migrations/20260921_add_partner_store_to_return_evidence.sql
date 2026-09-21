-- Migration: Add partner_id and store_id to return_evidence
-- The table was originally created without these columns, but later RPC migrations
-- started inserting partner_id. This migration adds the columns and backfills from
-- the parent return_requests table.

-- 1. Add columns
ALTER TABLE public.return_evidence
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL;

-- 2. Backfill from parent return_requests
UPDATE public.return_evidence re
SET
  partner_id = rr.partner_id,
  store_id = rr.store_id
FROM public.return_requests rr
WHERE re.return_request_id = rr.id
  AND re.partner_id IS NULL;

-- 3. Create indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_return_evidence_partner
  ON public.return_evidence(partner_id);

CREATE INDEX IF NOT EXISTS idx_return_evidence_store
  ON public.return_evidence(store_id);

-- 4. Update RLS policies to use direct partner_id/store_id columns
-- (more efficient than joining to return_requests every time)

DROP POLICY IF EXISTS "return_evidence_all_partner" ON public.return_evidence;
CREATE POLICY "return_evidence_all_partner" ON public.return_evidence
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = return_evidence.partner_id
        AND pu.user_id = (SELECT auth.uid())
        AND (
          public.active_store_id() IS NULL
          OR return_evidence.store_id = public.active_store_id()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_users pu
      WHERE pu.partner_id = return_evidence.partner_id
        AND pu.user_id = (SELECT auth.uid())
        AND (
          public.active_store_id() IS NULL
          OR return_evidence.store_id = public.active_store_id()
        )
    )
  );

DROP POLICY IF EXISTS "return_evidence_select_customer" ON public.return_evidence;
CREATE POLICY "return_evidence_select_customer" ON public.return_evidence
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.return_requests rr
      WHERE rr.id = return_evidence.return_request_id
        AND rr.customer_user_id = (SELECT auth.uid())
    )
  );

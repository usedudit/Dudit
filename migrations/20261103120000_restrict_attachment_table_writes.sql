BEGIN;

-- All attachment mutations now go through server actions/RPCs. Keep user
-- reads scoped by RLS, but remove direct PostgREST writes that bypass them.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.order_attachments,
  public.service_order_attachments,
  public.stock_movement_attachments,
  public.transaction_attachments,
  public.return_evidence
FROM PUBLIC, anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE
  public.order_attachments,
  public.service_order_attachments,
  public.stock_movement_attachments,
  public.transaction_attachments,
  public.return_evidence
TO service_role;

DROP POLICY IF EXISTS partner_access ON public.order_attachments;
DROP POLICY IF EXISTS partner_read ON public.order_attachments;
CREATE POLICY partner_read ON public.order_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.partner_users pu ON pu.partner_id = o.partner_id
      WHERE o.id = order_attachments.order_id AND pu.user_id = (SELECT auth.uid())
        AND (o.store_id IS NULL OR public.user_has_store_access(o.store_id))
    )
  );

DROP POLICY IF EXISTS store_isolation ON public.service_order_attachments;
DROP POLICY IF EXISTS partner_isolation ON public.service_order_attachments;
DROP POLICY IF EXISTS store_read ON public.service_order_attachments;
CREATE POLICY store_read ON public.service_order_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_attachments.service_order_id
        AND so.partner_id IN (SELECT public.get_user_partner_ids())
        AND (so.store_id IS NULL OR public.user_has_store_access(so.store_id))
    )
  );

DROP POLICY IF EXISTS partner_access ON public.stock_movement_attachments;
DROP POLICY IF EXISTS partner_read ON public.stock_movement_attachments;
CREATE POLICY partner_read ON public.stock_movement_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_movements sm
      JOIN public.partner_users pu ON pu.partner_id = sm.partner_id
      WHERE sm.id = stock_movement_attachments.stock_movement_id
        AND pu.user_id = (SELECT auth.uid())
        AND (sm.store_id IS NULL OR public.user_has_store_access(sm.store_id))
    )
  );

DROP POLICY IF EXISTS partner_access ON public.transaction_attachments;
DROP POLICY IF EXISTS partner_read ON public.transaction_attachments;
CREATE POLICY partner_read ON public.transaction_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      JOIN public.partner_users pu ON pu.partner_id = t.partner_id
      WHERE t.id = transaction_attachments.transaction_id
        AND pu.user_id = (SELECT auth.uid())
        AND (t.store_id IS NULL OR public.user_has_store_access(t.store_id))
    )
  );

DROP POLICY IF EXISTS "return_evidence_all_partner" ON public.return_evidence;
DROP POLICY IF EXISTS "return_evidence_partner_read" ON public.return_evidence;
CREATE POLICY "return_evidence_partner_read" ON public.return_evidence
  FOR SELECT TO authenticated
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
  );

NOTIFY pgrst, 'reload schema';
COMMIT;

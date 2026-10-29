-- Evaluate auth.uid() once per statement for frequently used policies.
-- Wrapping the stable auth helper in a scalar SELECT keeps the same user-id
-- predicate and permissions while avoiding per-row function evaluation.

ALTER POLICY orders_delete_buyer_pending ON public.orders
  USING ((buyer_id = (SELECT auth.uid())) AND (situation = 'pending'::text));

ALTER POLICY orders_insert_buyer ON public.orders
  WITH CHECK (buyer_id = (SELECT auth.uid()));

ALTER POLICY orders_select_buyer ON public.orders
  USING (buyer_id = (SELECT auth.uid()));

ALTER POLICY orders_update_buyer ON public.orders
  USING (buyer_id = (SELECT auth.uid()))
  WITH CHECK (buyer_id = (SELECT auth.uid()));

ALTER POLICY admin_select_products ON public.products
  USING (EXISTS (
    SELECT 1
    FROM public.admin_roles ar
    WHERE ar.user_id = (SELECT auth.uid())
      AND ar.role = ANY (ARRAY['moderator'::text, 'admin'::text, 'super_admin'::text])
  ));

ALTER POLICY admin_select_services ON public.services
  USING (EXISTS (
    SELECT 1
    FROM public.admin_roles ar
    WHERE ar.user_id = (SELECT auth.uid())
      AND ar.role = ANY (ARRAY['moderator'::text, 'admin'::text, 'super_admin'::text])
  ));

ALTER POLICY delivery_orders_delete_partner_users ON public.delivery_orders
  USING (EXISTS (
    SELECT 1
    FROM public.deliveries d
    WHERE d.id = delivery_orders.delivery_id
      AND d.partner_id IN (
        SELECT pu.partner_id
        FROM public.partner_users pu
        WHERE pu.user_id = (SELECT auth.uid())
      )
  ));

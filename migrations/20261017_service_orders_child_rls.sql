-- ============================================================================
-- Migration: 20261017_service_orders_child_rls.sql
-- Description: Torna o RLS das tabelas filhas de service_orders consistente com
--   a tabela pai: escopo por parceiro E por loja (store-aware), em vez do antigo
--   partner_isolation (que ignorava o acesso por loja).
--
-- Tabelas: service_order_services, service_order_products, service_order_attachments
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY.
-- ============================================================================

DROP POLICY IF EXISTS partner_isolation ON public.service_order_services;
DROP POLICY IF EXISTS store_isolation ON public.service_order_services;
CREATE POLICY store_isolation ON public.service_order_services
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_services.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_services.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  );

DROP POLICY IF EXISTS partner_isolation ON public.service_order_products;
DROP POLICY IF EXISTS store_isolation ON public.service_order_products;
CREATE POLICY store_isolation ON public.service_order_products
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_products.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_products.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  );

DROP POLICY IF EXISTS partner_isolation ON public.service_order_attachments;
DROP POLICY IF EXISTS store_isolation ON public.service_order_attachments;
CREATE POLICY store_isolation ON public.service_order_attachments
  FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_attachments.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_attachments.service_order_id
        AND so.partner_id IN (SELECT get_user_partner_ids())
        AND (so.store_id IS NULL OR user_has_store_access(so.store_id))
    )
  );

NOTIFY pgrst, 'reload schema';

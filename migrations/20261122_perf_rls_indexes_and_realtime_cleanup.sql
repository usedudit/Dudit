-- ============================================================================
-- Migration: 20261122_perf_rls_indexes_and_realtime_cleanup.sql
--
-- Objetivo (Etapa 2 - Performance + Segurança de Banco):
--   1. [SEGURANÇA CRÍTICA] Corrigir bug nas 4 policies RLS de `public.addresses`
--      onde `get_address_partner_id(pu.partner_id, ...)` recebia `pu.partner_id`
--      em vez de `addresses.partner_id` (o que avaliava TRUE para qualquer linha
--      quando o usuário pertencia a `partner_users`).
--   2. [PERFORMANCE RLS] Envolver `auth.uid()` em `(SELECT auth.uid())` nas 34
--      policies identificadas sem InitPlan, mantendo 100% da lógica, roles e
--      permissões originais.
--   3. [LIMPEZA RLS] Remover as 4 policies legadas em português de
--      `public.product_variants` (subconjunto estrito das policies `*_own`).
--      Obs.: `stock_movements_select_own` foi mantida intencionalmente (bypass do owner).
--   4. [CPU / REALTIME] Remover `notifications`, `reports` e `return_messages`
--      da publicação `supabase_realtime` (0 subscribers ativos no código).
--      Mantidas: `orders`, `recurring_subscriptions`, `delivery_assignments`.
--   5. [ESCRITA / STORAGE] Remover os 8 índices B-tree 100% duplicados,
--      preservando todos os índices UNIQUE e constraints.
--   6. [LEITURA / ESCALA] Criar 11 índices nas Foreign Keys quentes realmente
--      descobertas.
--
-- Esta migration é 100% idempotente e segura para rodar em produção.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SEGURANÇA CRÍTICA: Corrigir `pu.partner_id` -> `addresses.partner_id`
--    nas 4 policies de `public.addresses`
-- ============================================================================

DROP POLICY IF EXISTS "Users can view their own addresses" ON public.addresses;
CREATE POLICY "Users can view their own addresses"
  ON public.addresses
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND p.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND pu.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can create their own addresses" ON public.addresses;
CREATE POLICY "Users can create their own addresses"
  ON public.addresses
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND p.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND pu.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their own addresses" ON public.addresses;
CREATE POLICY "Users can update their own addresses"
  ON public.addresses
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND p.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND pu.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their own addresses" ON public.addresses;
CREATE POLICY "Users can delete their own addresses"
  ON public.addresses
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    ((SELECT auth.uid()) = user_id)
    OR EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND p.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = public.get_address_partner_id(addresses.partner_id, addresses.supplier_id, addresses.customer_id, addresses.store_id)
        AND pu.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 2. PERFORMANCE RLS: Envolver `auth.uid()` em `(SELECT auth.uid())` (InitPlan)
--    nas 34 policies sem alterar roles, ações ou regras de acesso
-- ============================================================================

-- account_deletion_requests
DROP POLICY IF EXISTS "select_own_account_deletion_requests" ON public.account_deletion_requests;
CREATE POLICY "select_own_account_deletion_requests"
  ON public.account_deletion_requests
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- billing_refund_requests
DROP POLICY IF EXISTS "billing_refund_requests_partner_insert" ON public.billing_refund_requests;
CREATE POLICY "billing_refund_requests_partner_insert"
  ON public.billing_refund_requests
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    partner_id IN (
      SELECT partners.id FROM public.partners WHERE partners.user_id = (SELECT auth.uid())
      UNION
      SELECT partner_users.partner_id FROM public.partner_users WHERE partner_users.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "billing_refund_requests_partner_select" ON public.billing_refund_requests;
CREATE POLICY "billing_refund_requests_partner_select"
  ON public.billing_refund_requests
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    partner_id IN (
      SELECT partners.id FROM public.partners WHERE partners.user_id = (SELECT auth.uid())
      UNION
      SELECT partner_users.partner_id FROM public.partner_users WHERE partner_users.user_id = (SELECT auth.uid())
    )
  );

-- delivery_assignments
DROP POLICY IF EXISTS "delivery_assignments_select_own" ON public.delivery_assignments;
CREATE POLICY "delivery_assignments_select_own"
  ON public.delivery_assignments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (driver_id = (SELECT auth.uid()))
    OR (
      ((status = ANY (ARRAY['available'::text, 'requested'::text])) OR (driver_id IS NULL))
      AND EXISTS (
        SELECT 1
        FROM public.delivery_drivers dd
        WHERE dd.user_id = (SELECT auth.uid())
          AND dd.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS "delivery_assignments_update_own" ON public.delivery_assignments;
CREATE POLICY "delivery_assignments_update_own"
  ON public.delivery_assignments
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (driver_id = (SELECT auth.uid()))
  WITH CHECK (driver_id = (SELECT auth.uid()));

-- delivery_driver_partners
DROP POLICY IF EXISTS "delivery_driver_partners_select_self" ON public.delivery_driver_partners;
CREATE POLICY "delivery_driver_partners_select_self"
  ON public.delivery_driver_partners
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (driver_id = (SELECT auth.uid()));

-- delivery_drivers
DROP POLICY IF EXISTS "delivery_drivers_insert_self" ON public.delivery_drivers;
CREATE POLICY "delivery_drivers_insert_self"
  ON public.delivery_drivers
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "delivery_drivers_select_self" ON public.delivery_drivers;
CREATE POLICY "delivery_drivers_select_self"
  ON public.delivery_drivers
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "delivery_drivers_update_self" ON public.delivery_drivers;
CREATE POLICY "delivery_drivers_update_self"
  ON public.delivery_drivers
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- enforcement_appeals
DROP POLICY IF EXISTS "Users can create own appeals" ON public.enforcement_appeals;
CREATE POLICY "Users can create own appeals"
  ON public.enforcement_appeals
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own appeals" ON public.enforcement_appeals;
CREATE POLICY "Users can view own appeals"
  ON public.enforcement_appeals
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- feedback_prompts
DROP POLICY IF EXISTS "Admins can manage all feedback prompts" ON public.feedback_prompts;
CREATE POLICY "Admins can manage all feedback prompts"
  ON public.feedback_prompts
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_roles
      WHERE admin_roles.user_id = (SELECT auth.uid())
        AND admin_roles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS "Users can create own feedback prompts" ON public.feedback_prompts;
CREATE POLICY "Users can create own feedback prompts"
  ON public.feedback_prompts
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own feedback prompts" ON public.feedback_prompts;
CREATE POLICY "Users can view own feedback prompts"
  ON public.feedback_prompts
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own feedback prompts" ON public.feedback_prompts;
CREATE POLICY "Users can update own feedback prompts"
  ON public.feedback_prompts
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((SELECT auth.uid()) = user_id);

-- feedbacks
DROP POLICY IF EXISTS "Admins can manage all feedbacks" ON public.feedbacks;
CREATE POLICY "Admins can manage all feedbacks"
  ON public.feedbacks
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_roles
      WHERE admin_roles.user_id = (SELECT auth.uid())
        AND admin_roles.role = ANY (ARRAY['admin'::text, 'super_admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS "Users can create own feedbacks" ON public.feedbacks;
CREATE POLICY "Users can create own feedbacks"
  ON public.feedbacks
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view own feedbacks" ON public.feedbacks;
CREATE POLICY "Users can view own feedbacks"
  ON public.feedbacks
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

-- order_shipments
DROP POLICY IF EXISTS "order_shipments_select_member" ON public.order_shipments;
CREATE POLICY "order_shipments_select_member"
  ON public.order_shipments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = order_shipments.partner_id
        AND pu.user_id = (SELECT auth.uid())
    )
  );

-- partner_integrations
DROP POLICY IF EXISTS "partner_integrations_select_member" ON public.partner_integrations;
CREATE POLICY "partner_integrations_select_member"
  ON public.partner_integrations
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.partner_users pu
      WHERE pu.partner_id = partner_integrations.partner_id
        AND pu.user_id = (SELECT auth.uid())
    )
  );

-- product_fiscal_profiles
DROP POLICY IF EXISTS "Partner owners can insert fiscal profiles" ON public.product_fiscal_profiles;
CREATE POLICY "Partner owners can insert fiscal profiles"
  ON public.product_fiscal_profiles
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_fiscal_profiles.product_id
        AND p.partner_id IN (
          SELECT partners.id FROM public.partners WHERE partners.user_id = (SELECT auth.uid())
          UNION
          SELECT partner_users.partner_id
          FROM public.partner_users
          WHERE partner_users.user_id = (SELECT auth.uid())
            AND partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])
        )
    )
  );

-- product_logistics
DROP POLICY IF EXISTS "Partner owners can insert logistics" ON public.product_logistics;
CREATE POLICY "Partner owners can insert logistics"
  ON public.product_logistics
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.products p
      WHERE p.id = product_logistics.product_id
        AND p.partner_id IN (
          SELECT partners.id FROM public.partners WHERE partners.user_id = (SELECT auth.uid())
          UNION
          SELECT partner_users.partner_id
          FROM public.partner_users
          WHERE partner_users.user_id = (SELECT auth.uid())
            AND partner_users.role_id = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])
        )
    )
  );

-- system_settings
DROP POLICY IF EXISTS "allow_admin_update_system_settings" ON public.system_settings;
CREATE POLICY "allow_admin_update_system_settings"
  ON public.system_settings
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.admin_roles
      WHERE admin_roles.user_id = (SELECT auth.uid())
        AND (
          (admin_roles.role = 'super_admin'::text AND (COALESCE(cardinality(admin_roles.scopes), 0) = 0 OR 'system_settings'::text = ANY (admin_roles.scopes)))
          OR (admin_roles.role = 'admin'::text AND 'system_settings'::text = ANY (admin_roles.scopes))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.admin_roles
      WHERE admin_roles.user_id = (SELECT auth.uid())
        AND (
          (admin_roles.role = 'super_admin'::text AND (COALESCE(cardinality(admin_roles.scopes), 0) = 0 OR 'system_settings'::text = ANY (admin_roles.scopes)))
          OR (admin_roles.role = 'admin'::text AND 'system_settings'::text = ANY (admin_roles.scopes))
        )
    )
  );

DROP POLICY IF EXISTS "allow_read_public_system_settings" ON public.system_settings;
CREATE POLICY "allow_read_public_system_settings"
  ON public.system_settings
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    (is_public = true)
    OR EXISTS (
      SELECT 1
      FROM public.admin_roles
      WHERE admin_roles.user_id = (SELECT auth.uid())
        AND (
          (admin_roles.role = 'super_admin'::text AND (COALESCE(cardinality(admin_roles.scopes), 0) = 0 OR 'system_settings'::text = ANY (admin_roles.scopes)))
          OR (admin_roles.role = 'admin'::text AND 'system_settings'::text = ANY (admin_roles.scopes))
        )
    )
  );

-- user_legal_consents
DROP POLICY IF EXISTS "user_legal_consents_own_insert" ON public.user_legal_consents;
CREATE POLICY "user_legal_consents_own_insert"
  ON public.user_legal_consents
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_legal_consents_own_select" ON public.user_legal_consents;
CREATE POLICY "user_legal_consents_own_select"
  ON public.user_legal_consents
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((SELECT auth.uid()) = user_id);

-- xml_import_items
DROP POLICY IF EXISTS "xml_import_items_delete_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_delete_team"
  ON public.xml_import_items
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_users.partner_id = xi.partner_id
              AND partner_users.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.partners
            WHERE partners.id = xi.partner_id
              AND partners.user_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "xml_import_items_insert_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_insert_team"
  ON public.xml_import_items
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_users.partner_id = xi.partner_id
              AND partner_users.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.partners
            WHERE partners.id = xi.partner_id
              AND partners.user_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "xml_import_items_select_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_select_team"
  ON public.xml_import_items
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_users.partner_id = xi.partner_id
              AND partner_users.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.partners
            WHERE partners.id = xi.partner_id
              AND partners.user_id = (SELECT auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS "xml_import_items_update_team" ON public.xml_import_items;
CREATE POLICY "xml_import_items_update_team"
  ON public.xml_import_items
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.xml_imports xi
      WHERE xi.id = xml_import_items.xml_import_id
        AND (
          EXISTS (
            SELECT 1 FROM public.partner_users
            WHERE partner_users.partner_id = xi.partner_id
              AND partner_users.user_id = (SELECT auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.partners
            WHERE partners.id = xi.partner_id
              AND partners.user_id = (SELECT auth.uid())
          )
        )
    )
  );

-- xml_imports
DROP POLICY IF EXISTS "xml_imports_delete_team" ON public.xml_imports;
CREATE POLICY "xml_imports_delete_team"
  ON public.xml_imports
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_users.partner_id = xml_imports.partner_id
        AND partner_users.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.partners
      WHERE partners.id = xml_imports.partner_id
        AND partners.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "xml_imports_insert_team" ON public.xml_imports;
CREATE POLICY "xml_imports_insert_team"
  ON public.xml_imports
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_users.partner_id = xml_imports.partner_id
        AND partner_users.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.partners
      WHERE partners.id = xml_imports.partner_id
        AND partners.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "xml_imports_select_team" ON public.xml_imports;
CREATE POLICY "xml_imports_select_team"
  ON public.xml_imports
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_users.partner_id = xml_imports.partner_id
        AND partner_users.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.partners
      WHERE partners.id = xml_imports.partner_id
        AND partners.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "xml_imports_update_team" ON public.xml_imports;
CREATE POLICY "xml_imports_update_team"
  ON public.xml_imports
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.partner_users
      WHERE partner_users.partner_id = xml_imports.partner_id
        AND partner_users.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.partners
      WHERE partners.id = xml_imports.partner_id
        AND partners.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- 3. LIMPEZA RLS: Remover 4 policies legadas redundantes em `product_variants`
--    (todas são subconjunto estrito das policies `product_variants_*_own`)
-- ============================================================================

DROP POLICY IF EXISTS "Parceiros podem ver suas variantes" ON public.product_variants;
DROP POLICY IF EXISTS "Parceiros podem criar variantes" ON public.product_variants;
DROP POLICY IF EXISTS "Parceiros podem atualizar variantes" ON public.product_variants;
DROP POLICY IF EXISTS "Parceiros podem deletar variantes" ON public.product_variants;

-- ============================================================================
-- 4. REALTIME: Remover tabelas sem subscriber ativo da publicação
--    Mantidas: `orders`, `recurring_subscriptions`, `delivery_assignments`
-- ============================================================================

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['notifications', 'reports', 'return_messages']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', v_table);
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 5. ÍNDICES DUPLICADOS: Remover os 8 índices B-tree 100% redundantes
--    (todos os índices UNIQUE / constraints correspondentes são mantidos)
-- ============================================================================

DROP INDEX IF EXISTS public.idx_billing_refund_requests_token;
DROP INDEX IF EXISTS public.delivery_driver_invitations_token_idx;
DROP INDEX IF EXISTS public.idx_delivery_orders_delivery_order;
DROP INDEX IF EXISTS public.idx_feedback_prompts_lookup;
DROP INDEX IF EXISTS public.idx_partner_addons_partner_slug;
DROP INDEX IF EXISTS public.idx_stock_movements_source_return_request_id;
DROP INDEX IF EXISTS public.idx_user_profiles_user_id;
DROP INDEX IF EXISTS public.idx_orders_exchange_parent_order_id;

-- ============================================================================
-- 6. ÍNDICES DE FOREIGN KEYS QUENTES: Criar índices faltantes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_return_requests_order_id
  ON public.return_requests USING btree (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items USING btree (variant_id)
  WHERE (variant_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_order_items_service_id
  ON public.order_items USING btree (service_id)
  WHERE (service_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_orders_coupon_id
  ON public.orders USING btree (coupon_id)
  WHERE (coupon_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_orders_recurring_subscription_id
  ON public.orders USING btree (recurring_subscription_id)
  WHERE (recurring_subscription_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_orders_source_quote_id
  ON public.orders USING btree (source_quote_id)
  WHERE (source_quote_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_id
  ON public.subscriptions USING btree (plan_id);

CREATE INDEX IF NOT EXISTS idx_transactions_store_id
  ON public.transactions USING btree (store_id)
  WHERE (store_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_transactions_category_id
  ON public.transactions USING btree (category_id)
  WHERE (category_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_billing_purchases_order_id
  ON public.billing_purchases USING btree (order_id)
  WHERE (order_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_billing_purchases_subscription_id
  ON public.billing_purchases USING btree (subscription_id)
  WHERE (subscription_id IS NOT NULL);

COMMIT;

-- ============================================================================
-- Alinha RLS de stock_movement_items e stock_movements com o padrão ERP:
-- dono (partners.user_id) OU membro em partner_users — sem JWT partner_id.
-- Permite SELECT de perfis (full_name) de colegas do mesmo parceiro.
-- ============================================================================

-- ─── stock_movements: SELECT para toda a equipa do parceiro ────────────────
DROP POLICY IF EXISTS "Partner owners can view stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "partner_team_can_view_stock_movements" ON public.stock_movements;

CREATE POLICY "partner_team_can_view_stock_movements"
  ON public.stock_movements
  FOR SELECT
  USING (
    partner_id IN (
      SELECT id FROM public.partners WHERE user_id = auth.uid()
      UNION
      SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
    )
  );

-- ─── stock_movement_items: substituir policies baseadas em JWT ─────────────
DROP POLICY IF EXISTS "stock_movement_items_select" ON public.stock_movement_items;
DROP POLICY IF EXISTS "stock_movement_items_insert" ON public.stock_movement_items;

CREATE POLICY "stock_movement_items_select"
  ON public.stock_movement_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.id = stock_movement_items.movement_id
        AND sm.partner_id IN (
          SELECT id FROM public.partners WHERE user_id = auth.uid()
          UNION
          SELECT partner_id FROM public.partner_users WHERE user_id = auth.uid()
        )
    )
  );

CREATE POLICY "stock_movement_items_insert"
  ON public.stock_movement_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.id = stock_movement_items.movement_id
        AND sm.partner_id IN (
          SELECT id FROM public.partners WHERE user_id = auth.uid()
          UNION
          SELECT partner_id FROM public.partner_users
            WHERE user_id = auth.uid()
            AND role IN ('OWNER', 'ADMIN', 'MANAGER')
        )
    )
  );

-- ─── user_profiles: ver nome de utilizadores do mesmo parceiro ─────────────
DROP POLICY IF EXISTS "user_profiles_select_same_partner_team" ON public.user_profiles;

CREATE POLICY "user_profiles_select_same_partner_team"
  ON public.user_profiles
  FOR SELECT
  USING (
    user_id IN (
      SELECT pu_colleague.user_id
      FROM public.partner_users pu_viewer
      INNER JOIN public.partner_users pu_colleague
        ON pu_colleague.partner_id = pu_viewer.partner_id
      WHERE pu_viewer.user_id = auth.uid()
    )
  );

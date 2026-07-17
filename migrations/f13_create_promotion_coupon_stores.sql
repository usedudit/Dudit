-- ============================================================================
-- Fase 13: Promoções e Cupons → Store-level (N:N bridge tables)
-- ============================================================================
-- Cria tabelas promotion_stores e coupon_stores para associar
-- promoções/cupons a stores específicas.
--
-- Regra:
--   Bridge vazia → vale para TODAS as stores do Partner
--   Bridge preenchida → vale apenas para as stores listadas
--
-- Padrão: idempotente, retrocompatível, RLS sem recursão.
-- Segue exatamente o padrão de RLS das fases anteriores (f3, f12).
-- ============================================================================

BEGIN;

-- ─── promotion_stores ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.promotion_stores (
  promotion_id UUID NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (promotion_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_stores_promotion
  ON public.promotion_stores(promotion_id);
CREATE INDEX IF NOT EXISTS idx_promotion_stores_store
  ON public.promotion_stores(store_id);

ALTER TABLE public.promotion_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_stores_select ON public.promotion_stores;
CREATE POLICY promotion_stores_select ON public.promotion_stores
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores
      WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

DROP POLICY IF EXISTS promotion_stores_insert ON public.promotion_stores;
CREATE POLICY promotion_stores_insert ON public.promotion_stores
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores
      WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

DROP POLICY IF EXISTS promotion_stores_delete ON public.promotion_stores;
CREATE POLICY promotion_stores_delete ON public.promotion_stores
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores
      WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

-- ─── coupon_stores ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.coupon_stores (
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coupon_id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_stores_coupon
  ON public.coupon_stores(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_stores_store
  ON public.coupon_stores(store_id);

ALTER TABLE public.coupon_stores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_stores_select ON public.coupon_stores;
CREATE POLICY coupon_stores_select ON public.coupon_stores
  FOR SELECT USING (
    store_id IN (
      SELECT id FROM stores
      WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

DROP POLICY IF EXISTS coupon_stores_insert ON public.coupon_stores;
CREATE POLICY coupon_stores_insert ON public.coupon_stores
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT id FROM stores
      WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

DROP POLICY IF EXISTS coupon_stores_delete ON public.coupon_stores;
CREATE POLICY coupon_stores_delete ON public.coupon_stores
  FOR DELETE USING (
    store_id IN (
      SELECT id FROM stores
      WHERE partner_id IN (SELECT public.get_user_partner_ids())
    )
  );

-- ─── Atualizar RLS de coupons (ainda usa partner_users subquery) ──────────────
-- promotions já foi atualizado na migration 20260531_add_promotion_services.sql

DROP POLICY IF EXISTS coupons_select_partner_users ON public.coupons;
CREATE POLICY coupons_select_partner_users ON public.coupons
  FOR SELECT USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

DROP POLICY IF EXISTS coupons_insert_partner_users ON public.coupons;
CREATE POLICY coupons_insert_partner_users ON public.coupons
  FOR INSERT WITH CHECK (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

DROP POLICY IF EXISTS coupons_update_partner_users ON public.coupons;
CREATE POLICY coupons_update_partner_users ON public.coupons
  FOR UPDATE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

DROP POLICY IF EXISTS coupons_delete_partner_users ON public.coupons;
CREATE POLICY coupons_delete_partner_users ON public.coupons
  FOR DELETE USING (
    partner_id IN (SELECT public.get_user_partner_ids())
  );

COMMIT;

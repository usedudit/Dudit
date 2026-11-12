-- Migration: Order discount breakdown (item / campaign / manual) + per-item nominal price
--
-- Motivação:
--   O DRE e o "Lucro líquido" por pedido precisam de um breakdown imutável de
--   descontos. Antes desta migration o pedido guardava apenas:
--     - `discount_amount`               -> cupom
--     - `discount_value` + `discount_type` -> desconto manual cru (fixo ou %)
--     - `payment_method_discount_amount` -> desconto do meio de pagamento
--   Descontos de campanha/promoção ficavam só em `promotions_applied` (sem
--   valor contábil) e descontos por item (preço promocional do catálogo) não
--   eram registrados em lugar nenhum. Isso fazia a receita bruta e o lucro
--   líquido serem superestimados em pedidos com campanha/desconto manual.
--
-- Regra contábil adotada:
--   receita bruta   = preço nominal (original_price) x quantidade
--   deduções        = item_discount_amount + manual_discount_amount
--                     + discount_amount (cupom) + payment_method_discount_amount
--   CMV             = unit_cost x quantidade (inclui brindes, receita 0)

-- ── 1. Breakdown de desconto no pedido ──────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS item_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS campaign_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.item_discount_amount IS
  'Soma dos descontos por item (preço promocional do catálogo + campanha), comparado ao preço nominal.';
COMMENT ON COLUMN public.orders.campaign_discount_amount IS
  'Parcela de item_discount_amount originada por campanha/promoção (subconjunto informativo).';
COMMENT ON COLUMN public.orders.manual_discount_amount IS
  'Desconto manual do pedido já convertido em reais (discount_type/discount_value aplicados).';

-- ── 2. Desconto por item ────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.order_items.discount_amount IS
  'Desconto embutido na linha: (original_price - product_price) * quantity.';

-- ── 3. Backfill conservador (histórico) ─────────────────────────────────────
-- Preenche o preço nominal dos itens não-brinde que ainda não têm
-- `original_price`. Assim o DRE passa a ler `original_price` sem alterar a
-- receita de pedidos antigos (nominal = preço cobrado).
UPDATE public.order_items
   SET original_price = product_price
 WHERE original_price IS NULL
   AND is_gift = false
   AND product_price IS NOT NULL;

-- Desconto embutido por linha (somente o que já é conhecido no histórico).
UPDATE public.order_items
   SET discount_amount = GREATEST(
         0,
         ROUND(
           (COALESCE(original_price, product_price, 0) - COALESCE(product_price, 0))
           * COALESCE(quantity, 0),
           2
         )
       )
 WHERE is_gift = false
   AND COALESCE(discount_amount, 0) = 0;

-- Desconto manual já em reais. `discount_type = 'percentage'` guarda o
-- percentual em `discount_value`; convertemos usando o subtotal original
-- (ou a soma dos itens como fallback). Pedidos antigos com `discount_type`
-- nulo/fixo são tratados como valor absoluto.
UPDATE public.orders o
   SET manual_discount_amount = CASE
         WHEN COALESCE(o.discount_value, 0) <= 0 THEN 0
         WHEN LOWER(COALESCE(o.discount_type, 'fixed')) = 'coupon' THEN 0
         WHEN LOWER(o.discount_type) = 'percentage' THEN
           ROUND(
             COALESCE(
               NULLIF(o.subtotal_original, 0),
               (
                 SELECT COALESCE(SUM(oi.subtotal), 0)
                   FROM public.order_items oi
                  WHERE oi.order_id = o.id
                    AND oi.is_gift = false
               )
             ) * (LEAST(GREATEST(o.discount_value, 0), 100) / 100.0),
             2
           )
         ELSE ROUND(o.discount_value, 2)
       END
 WHERE COALESCE(o.manual_discount_amount, 0) = 0
   AND COALESCE(o.discount_value, 0) > 0;

-- Soma dos descontos por item no pedido (histórico conhecido).
UPDATE public.orders o
   SET item_discount_amount = COALESCE(t.total, 0)
  FROM (
    SELECT order_id, ROUND(SUM(COALESCE(discount_amount, 0)), 2) AS total
      FROM public.order_items
     WHERE is_gift = false
     GROUP BY order_id
  ) t
 WHERE t.order_id = o.id
   AND COALESCE(o.item_discount_amount, 0) = 0
   AND COALESCE(t.total, 0) > 0;

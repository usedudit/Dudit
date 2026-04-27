-- Persist payment-method pricing deltas on ERP orders.
-- `discount_value` keeps manual order discount.
-- `discount_amount` keeps coupon discount amount.
-- Payment method discounts/fees are stored separately for clarity.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_discount_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_extra_amount numeric(14,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.discount_value IS
  'Desconto manual aplicado no pedido (sem cupom e sem efeito do meio de pagamento).';

COMMENT ON COLUMN public.orders.discount_amount IS
  'Desconto de cupom aplicado no pedido.';

COMMENT ON COLUMN public.orders.payment_method_discount_amount IS
  'Desconto concedido pelo meio de pagamento (ex.: desconto Pix/cartao).';

COMMENT ON COLUMN public.orders.payment_method_extra_amount IS
  'Acrescimo do meio de pagamento (juros + taxas repassadas ao cliente).';

UPDATE public.orders
SET
  payment_method_discount_amount = GREATEST(
    ROUND((
      GREATEST(
        0,
        COALESCE(total_amount, 0)
        + COALESCE(discount_amount, 0)
        + COALESCE(discount_value, 0)
        - COALESCE(shipping_cost, 0)
        - COALESCE(additional_costs, 0)
      ) - COALESCE(total_amount, 0)
    )::numeric, 2),
    0
  ),
  payment_method_extra_amount = GREATEST(
    ROUND((
      COALESCE(total_amount, 0) - GREATEST(
        0,
        COALESCE(total_amount, 0)
        + COALESCE(discount_amount, 0)
        + COALESCE(discount_value, 0)
        - COALESCE(shipping_cost, 0)
        - COALESCE(additional_costs, 0)
      )
    )::numeric, 2),
    0
  )
WHERE COALESCE(payment_method_discount_amount, 0) = 0
  AND COALESCE(payment_method_extra_amount, 0) = 0;

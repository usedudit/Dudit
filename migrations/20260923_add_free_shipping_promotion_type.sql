-- Add 'free_shipping' as a valid promotion_type in the promotions table CHECK constraint
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_promotion_type_check;
ALTER TABLE public.promotions ADD CONSTRAINT promotions_promotion_type_check
  CHECK (promotion_type IN ('gift', 'buy_x_pay_y', 'discount', 'free_shipping'));

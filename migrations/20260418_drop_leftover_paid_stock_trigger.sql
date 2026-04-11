-- SCRIPT: Drop leftover stock trigger
-- Reason: The old v2 stock trigger was left running alongside the new reservation flow,
-- causing double deduction of stock_quantity on paid orders, and preventing stock_available from recovering on cancel.

DROP TRIGGER IF EXISTS stock_decrement_on_order_paid_v2 ON public.orders CASCADE;
DROP FUNCTION IF EXISTS public.handle_order_stock_decrement_v2() CASCADE;

SELECT 'Dropped obsolete stock_decrement_on_order_paid_v2 trigger and function successfully' as msg;

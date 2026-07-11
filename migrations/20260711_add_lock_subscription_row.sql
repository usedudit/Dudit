-- Migration to add a row locking helper function for recurring subscriptions to avoid race conditions.

CREATE OR REPLACE FUNCTION public.lock_subscription_row(p_subscription_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM 1 
  FROM public.recurring_subscriptions 
  WHERE id = p_subscription_id 
  FOR UPDATE;
END;
$$;

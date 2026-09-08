-- Migration: Enable Realtime for orders and recurring_subscriptions
-- Description: Adds orders and recurring_subscriptions tables to the supabase_realtime publication
-- to enable instant WebSocket push updates on checkout, fulfillment, and POS payment screens.

DO $$
BEGIN
  -- Ensure publication exists
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Add orders table if not already in publication
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'orders'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.orders';
    END IF;

    -- Add recurring_subscriptions table if not already in publication
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'recurring_subscriptions'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_subscriptions';
    END IF;
  END IF;
END $$;

-- Set REPLICA IDENTITY to FULL on orders and recurring_subscriptions so that 
-- real-time events contain complete old and new row payloads during UPDATE.
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.recurring_subscriptions REPLICA IDENTITY FULL;

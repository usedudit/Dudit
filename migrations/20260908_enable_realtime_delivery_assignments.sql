-- Migration: Enable Realtime for delivery_assignments
-- Description: Adds delivery_assignments table to supabase_realtime publication
-- so delivery drivers receive new delivery offers instantly via WebSocket.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'delivery_assignments'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_assignments';
    END IF;
  END IF;
END $$;

ALTER TABLE public.delivery_assignments REPLICA IDENTITY FULL;

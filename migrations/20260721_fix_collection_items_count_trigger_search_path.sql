-- Fix search_path and schema qualification on update_collection_items_count trigger function
CREATE OR REPLACE FUNCTION public.update_collection_items_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.collections SET items_count = items_count + 1, updated_at = now() WHERE id = NEW.collection_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.collections SET items_count = GREATEST(items_count - 1, 0), updated_at = now() WHERE id = OLD.collection_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

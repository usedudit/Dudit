-- Migration: Add trigger to synchronize promotions usage_count consistently
-- Date: 2026-06-03

-- 1. Create the trigger function to increment/decrement count on change
CREATE OR REPLACE FUNCTION trg_update_promotion_usage_count()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.promotions 
    SET usage_count = COALESCE(usage_count, 0) + 1 
    WHERE id = NEW.promotion_id;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.promotions 
    SET usage_count = GREATEST(0, COALESCE(usage_count, 0) - 1) 
    WHERE id = OLD.promotion_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.promotion_id <> NEW.promotion_id) THEN
      UPDATE public.promotions 
      SET usage_count = GREATEST(0, COALESCE(usage_count, 0) - 1) 
      WHERE id = OLD.promotion_id;
      
      UPDATE public.promotions 
      SET usage_count = COALESCE(usage_count, 0) + 1 
      WHERE id = NEW.promotion_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create the trigger on the promotion_usages table
DROP TRIGGER IF EXISTS t_promotion_usages_count ON public.promotion_usages;

CREATE TRIGGER t_promotion_usages_count
AFTER INSERT OR DELETE OR UPDATE ON public.promotion_usages
FOR EACH ROW EXECUTE FUNCTION trg_update_promotion_usage_count();

CREATE OR REPLACE FUNCTION prevent_item_change_on_finalized_quote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $BODY$
DECLARE
  quote_status TEXT;
  target_quote_id UUID;
BEGIN
  target_quote_id := COALESCE(NEW.quote_id, OLD.quote_id);

  SELECT status INTO quote_status
  FROM public.quotes WHERE id = target_quote_id;

  IF quote_status IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF quote_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Itens do orçamento só podem ser alterados em status Rascunho. Status atual: %', quote_status;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$BODY$;

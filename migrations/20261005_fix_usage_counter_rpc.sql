-- Allowlist da RPC increment_usage_counter estava desatualizada (definida em
-- 20260622): faltava 'xml_imports_month_count', entao o incremento de
-- importacoes XML falhava silenciosamente (.catch vazio em xml-import.ts) e o
-- gate monthly_xml_imports nunca atingia o limite.
--
-- Observacoes:
--   products_count / services_count NAO entram aqui: sao mantidos pelos
--   triggers trg_products_increment_count / trg_services_increment_count
--   (adiciona-los causaria dupla contagem).

BEGIN;

CREATE OR REPLACE FUNCTION public.increment_usage_counter(
  p_partner_id uuid,
  p_column_name text,
  p_amount integer DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
  IF p_column_name NOT IN (
    'images_count',
    'quotes_month_count',
    'orders_month_count',
    'appointments_month_count',
    'service_orders_month_count',
    'xml_imports_month_count'
  ) THEN
    RAISE EXCEPTION 'Invalid counter name: %', p_column_name;
  END IF;

  EXECUTE format(
    'INSERT INTO public.usage_counters (partner_id, %I)
     VALUES ($1, $2)
     ON CONFLICT (partner_id)
     DO UPDATE SET %I = usage_counters.%I + $2, updated_at = now()',
    p_column_name, p_column_name, p_column_name
  ) USING p_partner_id, p_amount;
END;
$function$;

COMMIT;

-- Limite mensal de importacoes XML por plano.
--
-- Sem esta chave, getLimit("monthly_xml_imports") retornava 0 (deny-by-default)
-- e o checkLimit em xml-import.ts BLOQUEAVA a importacao XML do plano Crescer
-- (que possui a feature xml_import) - bug confirmado em auditoria (Fase 6).
--
-- Valores conforme intencao documentada em xml-import.ts ("Crescer: 20/month"):
--   free = 0 (feature indisponivel), crescer = 20, escalar = 999999.

BEGIN;

UPDATE public.plans
SET limits_json =
      COALESCE(limits_json, '{}'::jsonb) ||
      CASE
        WHEN slug = 'free' THEN '{"monthly_xml_imports": 0}'::jsonb
        WHEN slug = 'crescer' THEN '{"monthly_xml_imports": 20}'::jsonb
        ELSE '{"monthly_xml_imports": 999999}'::jsonb
      END,
    updated_at = NOW()
WHERE NOT (limits_json ? 'monthly_xml_imports');

COMMIT;

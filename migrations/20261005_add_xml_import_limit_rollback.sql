BEGIN;

UPDATE public.plans
SET limits_json = (limits_json - 'monthly_xml_imports'),
    updated_at = NOW()
WHERE limits_json ? 'monthly_xml_imports';

COMMIT;

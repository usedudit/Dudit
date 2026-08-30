-- ============================================================================
-- 20260830: Add granular RBAC permissions for list/fiscal/personal data access
--
-- New permissions added:
--   orders.list              - Browse full order directory (delivery: false)
--   customers.list           - Browse full customer directory (delivery: false)
--   customers.view_fiscal_data - See CPF/CNPJ/tax fields (operator/delivery: false)
--   customers.view_personal_data - See birth_date, user_id (operator/delivery: false)
--   reports.export_dre       - Export DRE financial report (manager: true)
--
-- IMPORTANT: Uses jsonb_set() to preserve existing nested keys.
-- The PostgreSQL || operator does SHALLOW merge and would destroy all
-- existing keys in orders/customers/reports modules.
-- ============================================================================

BEGIN;

-- 1) Update __base_template with new permission keys (all false)
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(permissions, '{orders,list}', 'false'::jsonb),
    '{customers,list}', 'false'::jsonb
  ),
  '{reports,export_dre}', 'false'::jsonb
)
WHERE id = '__base_template';

UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(permissions, '{customers,view_fiscal_data}', 'false'::jsonb),
  '{customers,view_personal_data}', 'false'::jsonb
)
WHERE id = '__base_template';

-- 2) Update admin role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(permissions, '{orders,list}', 'true'::jsonb),
    '{customers,list}', 'true'::jsonb
  ),
  '{reports,export_dre}', 'true'::jsonb
)
WHERE id = 'admin';

UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(permissions, '{customers,view_fiscal_data}', 'true'::jsonb),
  '{customers,view_personal_data}', 'true'::jsonb
)
WHERE id = 'admin';

-- 3) Update manager role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(permissions, '{orders,list}', 'true'::jsonb),
    '{customers,list}', 'true'::jsonb
  ),
  '{reports,export_dre}', 'true'::jsonb
)
WHERE id = 'manager';

UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(permissions, '{customers,view_fiscal_data}', 'true'::jsonb),
  '{customers,view_personal_data}', 'true'::jsonb
)
WHERE id = 'manager';

-- 4) Update operator role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(permissions, '{orders,list}', 'true'::jsonb),
    '{customers,list}', 'true'::jsonb
  ),
  '{reports,export_dre}', 'false'::jsonb
)
WHERE id = 'operator';

UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(permissions, '{customers,view_fiscal_data}', 'false'::jsonb),
  '{customers,view_personal_data}', 'false'::jsonb
)
WHERE id = 'operator';

-- 5) Update delivery role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(permissions, '{orders,list}', 'false'::jsonb),
    '{customers,list}', 'false'::jsonb
  ),
  '{reports,export_dre}', 'false'::jsonb
)
WHERE id = 'delivery';

UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(permissions, '{customers,view_fiscal_data}', 'false'::jsonb),
  '{customers,view_personal_data}', 'false'::jsonb
)
WHERE id = 'delivery';

COMMIT;

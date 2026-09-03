-- ============================================================================
-- 20260903: Align RBAC Permissions, Fix Role Gaps and Add Critical Permissions
--
-- Fixes and enhancements:
-- 1. MANAGER:
--    - orders.delete = false (anti-fraud: manager cannot permanently delete orders)
--    - customers.delete = false (preserve customer historical data)
--    - orders.can_refund = true (empowers manager to approve store returns & exchanges)
--    - settings.settings_team = true (allows manager to manage store operators & drivers)
--    - service_orders.can_generate_invoice = true (allows manager to bill finished service orders)
--    - financial.can_settle = true (allows manager to settle/pay expenses)
--    - products.view_cost_price = true (manager sees cost prices)
--    - customers.export = false (protects client base against mass export)
--
-- 2. ADMIN:
--    - stores.delete = false (store deletion is exclusive to Owner)
--    - service_orders.can_generate_invoice = true
--    - financial.can_settle = true
--    - products.view_cost_price = true
--    - customers.export = true
--
-- 3. OPERATOR:
--    - suppliers: all false (operators don't manage suppliers)
--    - products.view_cost_price = false (masks purchase cost and margin from counter staff)
--    - customers.export = false
--    - service_orders.can_generate_invoice = false
--    - financial.can_settle = false
--
-- 4. DELIVERY:
--    - dashboard.view = false (prevents crash on /erp/inicio; delivery uses /erp/entregas)
--    - products.view_cost_price = false
--    - customers.export = false
--
-- 5. __base_template:
--    - includes products.view_cost_price: false
--    - includes customers.export: false
--    - includes service_orders.can_generate_invoice: false
--    - includes financial.can_settle: false
-- ============================================================================

BEGIN;

-- 1) Update __base_template
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        permissions,
        '{products,view_cost_price}', 'false'::jsonb
      ),
      '{customers,export}', 'false'::jsonb
    ),
    '{service_orders,can_generate_invoice}', 'false'::jsonb
  ),
  '{financial,can_settle}', 'false'::jsonb
)
WHERE id = '__base_template';

-- 2) Update admin role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          permissions,
          '{stores,delete}', 'false'::jsonb
        ),
        '{products,view_cost_price}', 'true'::jsonb
      ),
      '{customers,export}', 'true'::jsonb
    ),
    '{service_orders,can_generate_invoice}', 'true'::jsonb
  ),
  '{financial,can_settle}', 'true'::jsonb
)
WHERE id = 'admin';

-- 3) Update manager role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                permissions,
                '{orders,delete}', 'false'::jsonb
              ),
              '{customers,delete}', 'false'::jsonb
            ),
            '{orders,can_refund}', 'true'::jsonb
          ),
          '{settings,settings_team}', 'true'::jsonb
        ),
        '{products,view_cost_price}', 'true'::jsonb
      ),
      '{customers,export}', 'false'::jsonb
    ),
    '{service_orders,can_generate_invoice}', 'true'::jsonb
  ),
  '{financial,can_settle}', 'true'::jsonb
)
WHERE id = 'manager';

-- 4) Update operator role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            permissions,
            '{suppliers}', '{"view": false, "create": false, "edit": false, "delete": false}'::jsonb
          ),
          '{products,view_cost_price}', 'false'::jsonb
        ),
        '{customers,export}', 'false'::jsonb
      ),
      '{service_orders,can_generate_invoice}', 'false'::jsonb
    ),
    '{financial,can_settle}', 'false'::jsonb
  ),
  '{orders,can_refund}', 'false'::jsonb
)
WHERE id = 'operator';

-- 5) Update delivery role
UPDATE public.roles
SET permissions = jsonb_set(
  jsonb_set(
    jsonb_set(
      jsonb_set(
        permissions,
        '{dashboard,view}', 'false'::jsonb
      ),
      '{products,view_cost_price}', 'false'::jsonb
    ),
    '{customers,export}', 'false'::jsonb
  ),
  '{service_orders,can_generate_invoice}', 'false'::jsonb
)
WHERE id = 'delivery';

COMMIT;

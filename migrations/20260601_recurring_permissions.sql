-- Add recurring_plans and recurring_subscriptions permissions to RBAC template

BEGIN;

UPDATE public.roles
SET permissions = permissions
    || jsonb_build_object(
        'recurring_plans', jsonb_build_object('view', false, 'manage', false),
        'recurring_subscriptions', jsonb_build_object('view', false, 'manage', false)
    )
WHERE id = '__base_template'
  AND NOT (permissions ? 'recurring_plans');

-- Owner/admin/manager: full access; operator: view only; delivery: none
UPDATE public.roles SET permissions = jsonb_set(
    jsonb_set(permissions, '{recurring_plans}', '{"view": true, "manage": true}'::jsonb),
    '{recurring_subscriptions}', '{"view": true, "manage": true}'::jsonb
) WHERE id IN ('owner', 'admin', 'manager');

UPDATE public.roles SET permissions = jsonb_set(
    jsonb_set(permissions, '{recurring_plans}', '{"view": true, "manage": false}'::jsonb),
    '{recurring_subscriptions}', '{"view": true, "manage": false}'::jsonb
) WHERE id = 'operator';

UPDATE public.partner_users
SET permissions = permissions
    || jsonb_build_object(
        'recurring_plans', COALESCE(permissions->'recurring_plans', '{"view": false, "manage": false}'::jsonb),
        'recurring_subscriptions', COALESCE(permissions->'recurring_subscriptions', '{"view": false, "manage": false}'::jsonb)
    )
WHERE permissions IS NOT NULL
  AND NOT (permissions ? 'recurring_plans');

COMMIT;

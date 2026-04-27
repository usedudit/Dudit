-- Normalize partner permission JSON into the new canonical model.
-- Applies to both partner_users.permissions and partner_invitations.permissions.

BEGIN;

CREATE OR REPLACE FUNCTION public.map_permissions_v2(input jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'orders', jsonb_build_object(
      'view', COALESCE((input->'orders'->>'view')::boolean, false),
      'create', COALESCE((input->'orders'->>'create')::boolean, false),
      'edit', COALESCE((input->'orders'->>'edit')::boolean, false),
      'delete_cancel', COALESCE((input->'orders'->>'delete_cancel')::boolean, (input->'orders'->>'delete')::boolean, false)
    ),
    'appointments', jsonb_build_object(
      'view', COALESCE((input->'appointments'->>'view')::boolean, (input->'services'->>'view')::boolean, false),
      'create', COALESCE((input->'appointments'->>'create')::boolean, (input->'services'->>'create')::boolean, false),
      'edit', COALESCE((input->'appointments'->>'edit')::boolean, (input->'services'->>'edit')::boolean, false),
      'delete', COALESCE((input->'appointments'->>'delete')::boolean, (input->'services'->>'delete')::boolean, false)
    ),
    'customers', jsonb_build_object(
      'view', COALESCE((input->'customers'->>'view')::boolean, false),
      'create', COALESCE((input->'customers'->>'create')::boolean, false),
      'edit', COALESCE((input->'customers'->>'edit')::boolean, false),
      'delete', COALESCE((input->'customers'->>'delete')::boolean, false)
    ),
    'products', jsonb_build_object(
      'view', COALESCE((input->'products'->>'view')::boolean, false),
      'create', COALESCE((input->'products'->>'create')::boolean, false),
      'edit', COALESCE((input->'products'->>'edit')::boolean, false),
      'delete', COALESCE((input->'products'->>'delete')::boolean, false)
    ),
    'pdv', jsonb_build_object(
      'view', COALESCE((input->'pdv'->>'view')::boolean, (input->'orders'->>'view')::boolean, false),
      'sell', COALESCE((input->'pdv'->>'sell')::boolean, (input->'orders'->>'create')::boolean, false)
    ),
    'cash_register', jsonb_build_object(
      'view', COALESCE((input->'cash_register'->>'view')::boolean, (input->'financial'->>'view')::boolean, false),
      'open_close', COALESCE((input->'cash_register'->>'open_close')::boolean, false),
      'manage', COALESCE((input->'cash_register'->>'manage')::boolean, (input->'financial'->>'edit')::boolean, false)
    ),
    'services', jsonb_build_object(
      'view', COALESCE((input->'services'->>'view')::boolean, false),
      'create', COALESCE((input->'services'->>'create')::boolean, false),
      'edit', COALESCE((input->'services'->>'edit')::boolean, false),
      'delete', COALESCE((input->'services'->>'delete')::boolean, false)
    ),
    'quotes', jsonb_build_object(
      'view', COALESCE((input->'quotes'->>'view')::boolean, false),
      'create', COALESCE((input->'quotes'->>'create')::boolean, false),
      'edit', COALESCE((input->'quotes'->>'edit')::boolean, false),
      'delete', COALESCE((input->'quotes'->>'delete')::boolean, false)
    ),
    'financial', jsonb_build_object(
      'view', COALESCE((input->'financial'->>'view')::boolean, false),
      'create', COALESCE((input->'financial'->>'create')::boolean, false),
      'edit', COALESCE((input->'financial'->>'edit')::boolean, false)
    ),
    'cadastros_categories', jsonb_build_object(
      'view', COALESCE((input->'cadastros_categories'->>'view')::boolean, (input->'products'->>'view')::boolean, false),
      'create', COALESCE((input->'cadastros_categories'->>'create')::boolean, (input->'products'->>'create')::boolean, false),
      'edit', COALESCE((input->'cadastros_categories'->>'edit')::boolean, (input->'products'->>'edit')::boolean, false),
      'delete', COALESCE((input->'cadastros_categories'->>'delete')::boolean, (input->'products'->>'delete')::boolean, false)
    ),
    'coupons', jsonb_build_object(
      'view', COALESCE((input->'coupons'->>'view')::boolean, false),
      'create', COALESCE((input->'coupons'->>'create')::boolean, false),
      'edit', COALESCE((input->'coupons'->>'edit')::boolean, false),
      'delete', COALESCE((input->'coupons'->>'delete')::boolean, false)
    ),
    'goals', jsonb_build_object(
      'view', COALESCE((input->'goals'->>'view')::boolean, false),
      'create', COALESCE((input->'goals'->>'create')::boolean, false),
      'edit', COALESCE((input->'goals'->>'edit')::boolean, false),
      'delete', COALESCE((input->'goals'->>'delete')::boolean, false)
    ),
    'reports', jsonb_build_object(
      'view_basic', COALESCE((input->'reports'->>'view_basic')::boolean, false),
      'view_advanced', COALESCE((input->'reports'->>'view_advanced')::boolean, false)
    ),
    'delivery', jsonb_build_object(
      'view', COALESCE((input->'delivery'->>'view')::boolean, false),
      'create', COALESCE((input->'delivery'->>'create')::boolean, false),
      'edit', COALESCE((input->'delivery'->>'edit')::boolean, false),
      'update_status', COALESCE((input->'delivery'->>'update_status')::boolean, false)
    ),
    'team', jsonb_build_object(
      'view', COALESCE((input->'team'->>'view')::boolean, false),
      'create', COALESCE((input->'team'->>'create')::boolean, false),
      'edit', COALESCE((input->'team'->>'edit')::boolean, false),
      'delete', COALESCE((input->'team'->>'delete')::boolean, false)
    ),
    'settings', jsonb_build_object(
      'view', COALESCE((input->'settings'->>'view')::boolean, false),
      'edit', COALESCE((input->'settings'->>'edit')::boolean, false)
    ),
    'specific', jsonb_build_object(
      'settings_plan', COALESCE((input->'specific'->>'settings_plan')::boolean, false),
      'settings_comissions', COALESCE((input->'specific'->>'settings_comissions')::boolean, false),
      'settings_integrations', COALESCE((input->'specific'->>'settings_integrations')::boolean, false),
      'can_apply_discount', COALESCE((input->'specific'->>'can_apply_discount')::boolean, false)
    )
  );
$$;

UPDATE public.partner_users
SET permissions = public.map_permissions_v2(COALESCE(permissions, '{}'::jsonb));

UPDATE public.partner_invitations
SET permissions = public.map_permissions_v2(COALESCE(permissions, '{}'::jsonb))
WHERE permissions IS NOT NULL;

COMMIT;

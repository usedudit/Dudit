-- Update partner permission JSON to v3 canonical model.
-- This script adds granular settings and action-based flags.

BEGIN;

CREATE OR REPLACE FUNCTION public.map_permissions_v3(input jsonb, role text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  is_owner boolean := (role = 'OWNER');
  is_admin boolean := (role = 'ADMIN');
  is_manager boolean := (role = 'MANAGER');
  is_owner_or_admin boolean := is_owner OR is_admin;
  is_management boolean := is_owner OR is_admin OR is_manager;
BEGIN
  RETURN jsonb_build_object(
    'orders', jsonb_build_object(
      'view', COALESCE((input->'orders'->>'view')::boolean, false),
      'create', COALESCE((input->'orders'->>'create')::boolean, false),
      'edit', COALESCE((input->'orders'->>'edit')::boolean, false),
      'delete', COALESCE((input->'orders'->>'delete')::boolean, false),
      'cancel', COALESCE((input->'orders'->>'cancel')::boolean, false),
      'can_apply_discount', COALESCE((input->'orders'->>'can_apply_discount')::boolean, false),
      'can_add_delivery', COALESCE((input->'orders'->>'can_add_delivery')::boolean, false),
      'delete_cancel', COALESCE((input->'orders'->>'delete_cancel')::boolean, false)
    ),
    'appointments', jsonb_build_object(
      'view', COALESCE((input->'appointments'->>'view')::boolean, false),
      'create', COALESCE((input->'appointments'->>'create')::boolean, false),
      'edit', COALESCE((input->'appointments'->>'edit')::boolean, false),
      'delete', COALESCE((input->'appointments'->>'delete')::boolean, false),
      'can_apply_discount', COALESCE((input->'appointments'->>'can_apply_discount')::boolean, is_management)
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
    'stock_movements', jsonb_build_object(
      'view', COALESCE((input->'stock_movements'->>'view')::boolean, false),
      'create', COALESCE((input->'stock_movements'->>'create')::boolean, false),
      'undo', COALESCE((input->'stock_movements'->>'undo')::boolean, false)
    ),
    'pdv', jsonb_build_object(
      'view', COALESCE((input->'pdv'->>'view')::boolean, false),
      'sell', COALESCE((input->'pdv'->>'sell')::boolean, false),
      'open_pdv', COALESCE((input->'pdv'->>'open_pdv')::boolean, false),
      'close_pdv', COALESCE((input->'pdv'->>'close_pdv')::boolean, false),
      'sangria', COALESCE((input->'pdv'->>'sangria')::boolean, false),
      'reforco', COALESCE((input->'pdv'->>'reforco')::boolean, false),
      'can_apply_discount', COALESCE((input->'pdv'->>'can_apply_discount')::boolean, false),
      'can_add_delivery', COALESCE((input->'pdv'->>'can_add_delivery')::boolean, false)
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
      'edit', COALESCE((input->'financial'->>'edit')::boolean, false),
      'cancel', COALESCE((input->'financial'->>'cancel')::boolean, false)
    ),
    'categories', jsonb_build_object(
      'view', COALESCE((input->'categories'->>'view')::boolean, false),
      'create', COALESCE((input->'categories'->>'create')::boolean, false),
      'edit', COALESCE((input->'categories'->>'edit')::boolean, false),
      'delete', COALESCE((input->'categories'->>'delete')::boolean, false)
    ),
    'dashboard', jsonb_build_object(
      'view', COALESCE((input->'dashboard'->>'view')::boolean, false)
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
    'settings', jsonb_build_object(
      'view', COALESCE((input->'settings'->>'view')::boolean, is_management),
      'settings_negocio', COALESCE((input->'settings'->>'settings_negocio')::boolean, is_management),
      'settings_team', COALESCE((input->'settings'->>'settings_team')::boolean, is_owner_or_admin),
      'settings_plan', COALESCE((input->'settings'->>'settings_plan')::boolean, is_owner),
      'settings_payments', COALESCE((input->'settings'->>'settings_payments')::boolean, is_owner_or_admin),
      'settings_comissions', COALESCE((input->'settings'->>'settings_comissions')::boolean, is_owner_or_admin),
      'settings_returns', COALESCE((input->'settings'->>'settings_returns')::boolean, is_management),
      'settings_vitrine', COALESCE((input->'settings'->>'settings_vitrine')::boolean, is_owner_or_admin),
      'settings_os', COALESCE((input->'settings'->>'settings_os')::boolean, is_management),
      'settings_messages', COALESCE((input->'settings'->>'settings_messages')::boolean, is_management),
      'settings_delivery', COALESCE((input->'settings'->>'settings_delivery')::boolean, is_owner_or_admin),
      'settings_integrations', COALESCE((input->'settings'->>'settings_integrations')::boolean, is_owner)
    ),
    'settings_negocio', jsonb_build_object(
      'edit', COALESCE((input->'settings_negocio'->>'edit')::boolean, is_owner_or_admin)
    ),
    'settings_team', jsonb_build_object(
      'invite', COALESCE((input->'settings_team'->>'invite')::boolean, is_owner_or_admin),
      'edit', COALESCE((input->'settings_team'->>'edit')::boolean, is_management),
      'remove', COALESCE((input->'settings_team'->>'remove')::boolean, is_owner_or_admin),
      'revoke_invite', COALESCE((input->'settings_team'->>'revoke_invite')::boolean, is_owner_or_admin)
    ),
    'settings_plans', jsonb_build_object(
      'change_plan', COALESCE((input->'settings_plans'->>'change_plan')::boolean, is_owner)
    ),
    'payment_methods', jsonb_build_object(
      'create', COALESCE((input->'payment_methods'->>'create')::boolean, is_owner_or_admin),
      'edit', COALESCE((input->'payment_methods'->>'edit')::boolean, is_owner_or_admin),
      'delete', COALESCE((input->'payment_methods'->>'delete')::boolean, is_owner_or_admin)
    ),
    'settings_comissions', jsonb_build_object(
      'edit', COALESCE((input->'settings_comissions'->>'edit')::boolean, is_owner_or_admin)
    ),
    'suppliers', jsonb_build_object(
      'view', COALESCE((input->'suppliers'->>'view')::boolean, false),
      'create', COALESCE((input->'suppliers'->>'create')::boolean, false),
      'edit', COALESCE((input->'suppliers'->>'edit')::boolean, false),
      'delete', COALESCE((input->'suppliers'->>'delete')::boolean, false)
    )
  );
END;
$$;

UPDATE public.partner_users
SET permissions = public.map_permissions_v3(COALESCE(permissions, '{}'::jsonb), role::text);

UPDATE public.partner_invitations
SET permissions = public.map_permissions_v3(COALESCE(permissions, '{}'::jsonb), role::text)
WHERE permissions IS NOT NULL;

COMMIT;

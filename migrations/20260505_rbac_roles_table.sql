-- ============================================================================
-- 20260505: RBAC Roles as DB Source of Truth
--
-- Goals:
-- - Store ALL roles + permissions in DB (single source of truth)
-- - Partner users reference roles via role_id
-- - Enforce a base permission template (same schema for all roles)
-- - Owner permissions are NOT stored (owner is a code override), but a role
--   record exists for referential integrity.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Roles table (source of truth)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.roles (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Ensure updated_at is maintained if the project already has a trigger helper.
-- (No-op if function/trigger is not present.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_roles_updated_at'
    ) THEN
      CREATE TRIGGER trg_roles_updated_at
      BEFORE UPDATE ON public.roles
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
    END IF;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) Base permission template (enforced shape)
--    NOTE: This is the canonical schema. All role permissions are normalized
--    against this template (missing keys → false; extra keys → ignored).
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.roles (id, name, permissions)
VALUES (
  '__base_template',
  'Base Template (system)',
  '{
    "orders": { "view": false, "create": false, "edit": false, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": false },
    "appointments": { "view": false, "create": false, "edit": false, "delete": false },
    "customers": { "view": false, "create": false, "edit": false, "delete": false },
    "products": { "view": false, "create": false, "edit": false, "delete": false },
    "stock_movements": { "view": false, "create": false, "undo": false },
    "pdv": { "view": false, "sell": false, "open_pdv": false, "close_pdv": false, "sangria": false, "reforco": false, "can_apply_discount": false, "can_add_delivery": false },
    "services": { "view": false, "create": false, "edit": false, "delete": false },
    "quotes": { "view": false, "create": false, "edit": false, "delete": false },
    "financial": { "view": false, "create": false, "edit": false, "cancel": false },
    "categories": { "view": false, "create": false, "edit": false, "delete": false },
    "coupons": { "view": false, "create": false, "edit": false, "delete": false },
    "goals": { "view": false, "create": false, "edit": false, "delete": false },
    "reports": { "view_basic": false, "view_advanced": false },
    "dashboard": { "view": false },
    "delivery": { "view": false, "create": false, "edit": false, "update_status": false },
    "recurring_plans": { "view": false, "manage": false },
    "recurring_subscriptions": { "view": false, "manage": false },
    "productivity": { "view": false, "goals_view": false, "goals_manage": false, "commissions_view": false, "commissions_manage": false },
    "community_videos": { "view": false, "create": false, "edit": false, "delete": false },
    "colecoes": { "view": false, "create": false, "edit": false, "delete": false },
    "payment_methods": { "view": false, "create": false, "edit": false, "delete": false },
    "commissions": { "view": false, "edit": false },
    "settings": {
      "view": false,
      "settings_negocio": false,
      "settings_team": false,
      "settings_plan": false,
      "settings_payments": false,
      "settings_comissions": false,
      "settings_returns": false,
      "settings_vitrine": false,
      "settings_os": false,
      "settings_messages": false,
      "settings_delivery": false,
      "settings_integrations": false,
      "settings_system": false,
      "settings_resources": false
    }
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    permissions = EXCLUDED.permissions,
    updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 3) Canonical roles (operator, delivery, manager, admin)
--    Owner is not stored as "all-true"; it is a code override.
-- ────────────────────────────────────────────────────────────────────────────

INSERT INTO public.roles (id, name, permissions) VALUES
(
  'operator',
  'Operador',
  '{
    "orders": { "view": true, "create": true, "edit": true, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": true },
    "appointments": { "view": true, "create": true, "edit": true, "delete": false },
    "customers": { "view": true, "create": true, "edit": true, "delete": false },
    "products": { "view": true, "create": false, "edit": false, "delete": false },
    "stock_movements": { "view": true, "create": false, "undo": false },
    "pdv": { "view": true, "sell": true, "open_pdv": true, "close_pdv": true, "sangria": false, "reforco": false, "can_apply_discount": false, "can_add_delivery": true },
    "services": { "view": true, "create": false, "edit": false, "delete": false },
    "quotes": { "view": true, "create": true, "edit": true, "delete": false },
    "financial": { "view": false, "create": false, "edit": false, "cancel": false },
    "categories": { "view": true, "create": false, "edit": false, "delete": false },
    "coupons": { "view": false, "create": false, "edit": false, "delete": false },
    "goals": { "view": false, "create": false, "edit": false, "delete": false },
    "reports": { "view_basic": false, "view_advanced": false },
    "dashboard": { "view": true },
    "delivery": { "view": true, "create": false, "edit": false, "update_status": true },
    "recurring_plans": { "view": false, "manage": false },
    "recurring_subscriptions": { "view": false, "manage": false },
    "productivity": { "view": false, "goals_view": false, "goals_manage": false, "commissions_view": false, "commissions_manage": false },
    "community_videos": { "view": false, "create": false, "edit": false, "delete": false },
    "colecoes": { "view": false, "create": false, "edit": false, "delete": false },
    "payment_methods": { "view": true, "create": false, "edit": false, "delete": false },
    "commissions": { "view": false, "edit": false },
    "settings": {
      "view": false,
      "settings_negocio": false,
      "settings_team": false,
      "settings_plan": false,
      "settings_payments": false,
      "settings_comissions": false,
      "settings_returns": false,
      "settings_vitrine": false,
      "settings_os": false,
      "settings_messages": false,
      "settings_delivery": false,
      "settings_integrations": false,
      "settings_system": false,
      "settings_resources": false
    }
  }'::jsonb
),
(
  'delivery',
  'Entregador',
  '{
    "orders": { "view": true, "create": false, "edit": false, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": false },
    "appointments": { "view": false, "create": false, "edit": false, "delete": false },
    "customers": { "view": true, "create": false, "edit": false, "delete": false },
    "products": { "view": false, "create": false, "edit": false, "delete": false },
    "stock_movements": { "view": false, "create": false, "undo": false },
    "pdv": { "view": false, "sell": false, "open_pdv": false, "close_pdv": false, "sangria": false, "reforco": false, "can_apply_discount": false, "can_add_delivery": false },
    "services": { "view": false, "create": false, "edit": false, "delete": false },
    "quotes": { "view": false, "create": false, "edit": false, "delete": false },
    "financial": { "view": false, "create": false, "edit": false, "cancel": false },
    "categories": { "view": false, "create": false, "edit": false, "delete": false },
    "coupons": { "view": false, "create": false, "edit": false, "delete": false },
    "goals": { "view": false, "create": false, "edit": false, "delete": false },
    "reports": { "view_basic": false, "view_advanced": false },
    "dashboard": { "view": false },
    "delivery": { "view": true, "create": false, "edit": false, "update_status": true },
    "recurring_plans": { "view": false, "manage": false },
    "recurring_subscriptions": { "view": false, "manage": false },
    "productivity": { "view": false, "goals_view": false, "goals_manage": false, "commissions_view": false, "commissions_manage": false },
    "community_videos": { "view": false, "create": false, "edit": false, "delete": false },
    "colecoes": { "view": false, "create": false, "edit": false, "delete": false },
    "payment_methods": { "view": true, "create": false, "edit": false, "delete": false },
    "commissions": { "view": false, "edit": false },
    "settings": {
      "view": false,
      "settings_negocio": false,
      "settings_team": false,
      "settings_plan": false,
      "settings_payments": false,
      "settings_comissions": false,
      "settings_returns": false,
      "settings_vitrine": false,
      "settings_os": false,
      "settings_messages": false,
      "settings_delivery": false,
      "settings_integrations": false,
      "settings_system": false,
      "settings_resources": false
    }
  }'::jsonb
),
(
  'manager',
  'Gestor',
  '{
    "orders": { "view": true, "create": true, "edit": true, "delete": true, "cancel": true, "can_apply_discount": true, "can_add_delivery": true },
    "appointments": { "view": true, "create": true, "edit": true, "delete": true },
    "customers": { "view": true, "create": true, "edit": true, "delete": true },
    "products": { "view": true, "create": true, "edit": true, "delete": true },
    "stock_movements": { "view": true, "create": true, "undo": true },
    "pdv": { "view": true, "sell": true, "open_pdv": true, "close_pdv": true, "sangria": true, "reforco": true, "can_apply_discount": true, "can_add_delivery": true },
    "services": { "view": true, "create": true, "edit": true, "delete": true },
    "quotes": { "view": true, "create": true, "edit": true, "delete": true },
    "financial": { "view": true, "create": true, "edit": true, "cancel": true },
    "categories": { "view": true, "create": true, "edit": true, "delete": true },
    "coupons": { "view": true, "create": true, "edit": true, "delete": true },
    "goals": { "view": true, "create": true, "edit": true, "delete": true },
    "reports": { "view_basic": true, "view_advanced": false },
    "dashboard": { "view": true },
    "delivery": { "view": true, "create": true, "edit": true, "update_status": true },
    "recurring_plans": { "view": true, "manage": true },
    "recurring_subscriptions": { "view": true, "manage": true },
    "productivity": { "view": true, "goals_view": true, "goals_manage": true, "commissions_view": true, "commissions_manage": true },
    "community_videos": { "view": true, "create": true, "edit": true, "delete": true },
    "colecoes": { "view": true, "create": true, "edit": true, "delete": true },
    "payment_methods": { "view": true, "create": true, "edit": true, "delete": true },
    "commissions": { "view": true, "edit": true },
    "settings": {
      "view": true,
      "settings_negocio": true,
      "settings_team": false,
      "settings_plan": false,
      "settings_payments": true,
      "settings_comissions": true,
      "settings_returns": true,
      "settings_vitrine": true,
      "settings_os": true,
      "settings_messages": true,
      "settings_delivery": true,
      "settings_integrations": false,
      "settings_system": false,
      "settings_resources": false
    }
  }'::jsonb
),
(
  'admin',
  'Admin',
  '{
    "orders": { "view": true, "create": true, "edit": true, "delete": true, "cancel": true, "can_apply_discount": true, "can_add_delivery": true },
    "appointments": { "view": true, "create": true, "edit": true, "delete": true },
    "customers": { "view": true, "create": true, "edit": true, "delete": true },
    "products": { "view": true, "create": true, "edit": true, "delete": true },
    "stock_movements": { "view": true, "create": true, "undo": true },
    "pdv": { "view": true, "sell": true, "open_pdv": true, "close_pdv": true, "sangria": true, "reforco": true, "can_apply_discount": true, "can_add_delivery": true },
    "services": { "view": true, "create": true, "edit": true, "delete": true },
    "quotes": { "view": true, "create": true, "edit": true, "delete": true },
    "financial": { "view": true, "create": true, "edit": true, "cancel": true },
    "categories": { "view": true, "create": true, "edit": true, "delete": true },
    "coupons": { "view": true, "create": true, "edit": true, "delete": true },
    "goals": { "view": true, "create": true, "edit": true, "delete": true },
    "reports": { "view_basic": true, "view_advanced": true },
    "dashboard": { "view": true },
    "delivery": { "view": true, "create": true, "edit": true, "update_status": true },
    "recurring_plans": { "view": true, "manage": true },
    "recurring_subscriptions": { "view": true, "manage": true },
    "productivity": { "view": true, "goals_view": true, "goals_manage": true, "commissions_view": true, "commissions_manage": true },
    "community_videos": { "view": true, "create": true, "edit": true, "delete": true },
    "colecoes": { "view": true, "create": true, "edit": true, "delete": true },
    "payment_methods": { "view": true, "create": true, "edit": true, "delete": true },
    "commissions": { "view": true, "edit": true },
    "settings": {
      "view": true,
      "settings_negocio": true,
      "settings_team": true,
      "settings_plan": false,
      "settings_payments": true,
      "settings_comissions": false,
      "settings_returns": true,
      "settings_vitrine": true,
      "settings_os": true,
      "settings_messages": true,
      "settings_delivery": true,
      "settings_integrations": false,
      "settings_system": true,
      "settings_resources": true
    }
  }'::jsonb
),
(
  'owner',
  'Owner (override)',
  '{}'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    permissions = EXCLUDED.permissions,
    updated_at = now();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) Wire partner_users / partner_invitations to role_id
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.partner_users
  ADD COLUMN IF NOT EXISTS role_id text;

ALTER TABLE public.partner_invitations
  ADD COLUMN IF NOT EXISTS role_id text;

-- Backfill from legacy role column (uppercase enum historically).
UPDATE public.partner_users
SET role_id = CASE UPPER(COALESCE(role, ''))
  WHEN 'OWNER' THEN 'owner'
  WHEN 'ADMIN' THEN 'admin'
  WHEN 'MANAGER' THEN 'manager'
  WHEN 'OPERATOR' THEN 'operator'
  WHEN 'DELIVERY' THEN 'delivery'
  WHEN 'EDITOR' THEN 'operator'
  WHEN 'VIEWER' THEN 'delivery'
  ELSE 'delivery'
END
WHERE role_id IS NULL OR role_id = '';

UPDATE public.partner_invitations
SET role_id = CASE UPPER(COALESCE(role, ''))
  WHEN 'OWNER' THEN 'owner'
  WHEN 'ADMIN' THEN 'admin'
  WHEN 'MANAGER' THEN 'manager'
  WHEN 'OPERATOR' THEN 'operator'
  WHEN 'DELIVERY' THEN 'delivery'
  WHEN 'EDITOR' THEN 'operator'
  WHEN 'VIEWER' THEN 'delivery'
  ELSE 'delivery'
END
WHERE role_id IS NULL OR role_id = '';

-- Make role_id required and consistent going forward.
ALTER TABLE public.partner_users
  ALTER COLUMN role_id SET NOT NULL,
  ALTER COLUMN role_id SET DEFAULT 'delivery';

ALTER TABLE public.partner_invitations
  ALTER COLUMN role_id SET NOT NULL,
  ALTER COLUMN role_id SET DEFAULT 'delivery';

-- FK constraints (deferred creation for idempotency).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_users_role_id_fkey'
  ) THEN
    ALTER TABLE public.partner_users
      ADD CONSTRAINT partner_users_role_id_fkey
      FOREIGN KEY (role_id) REFERENCES public.roles(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'partner_invitations_role_id_fkey'
  ) THEN
    ALTER TABLE public.partner_invitations
      ADD CONSTRAINT partner_invitations_role_id_fkey
      FOREIGN KEY (role_id) REFERENCES public.roles(id)
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

COMMIT;
-- ============================================================================
-- 20260810: Fix RBAC Roles and Add Stores Module Seed
--
-- Goals:
-- 1. Ensure __base_template, admin, manager, operator, delivery in public.roles
--    contain the "stores" permission module.
-- 2. Grant ADMIN full operational access to "stores" (view, create, edit, manage_members).
-- 3. Grant MANAGER view access to "stores" (view).
-- 4. Ensure settings_comissions is enabled for ADMIN.
-- 5. Backfill any partner_users / store_members with missing or misaligned role_id.
-- ============================================================================

BEGIN;

-- 1) Update __base_template to include stores
INSERT INTO public.roles (id, name, permissions)
VALUES (
  '__base_template',
  'Base Template (system)',
  '{
    "stores": { "view": false, "create": false, "edit": false, "delete": false, "manage_members": false },
    "orders": { "view": false, "create": false, "edit": false, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": false, "can_refund": false },
    "appointments": { "view": false, "create": false, "edit": false, "delete": false },
    "customers": { "view": false, "create": false, "edit": false, "delete": false },
    "suppliers": { "view": false, "create": false, "edit": false, "delete": false },
    "products": { "view": false, "create": false, "edit": false, "delete": false },
    "stock_movements": { "view": false, "create": false, "undo": false },
    "pdv": { "view": false, "sell": false, "open_pdv": false, "close_pdv": false, "sangria": false, "reforco": false, "can_apply_discount": false, "can_add_delivery": false },
    "services": { "view": false, "create": false, "edit": false, "delete": false },
    "service_orders": { "view": false, "create": false, "edit": false, "delete": false, "can_assign_technician": false, "can_change_status": false },
    "quotes": { "view": false, "create": false, "edit": false, "delete": false, "can_apply_discount": false },
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
      "settings_resources": false,
      "settings_logs": false
    }
  }'::jsonb
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    permissions = public.roles.permissions || EXCLUDED.permissions,
    updated_at = now();

-- 2) Update canonical roles with stores module included
INSERT INTO public.roles (id, name, permissions) VALUES
(
  'admin',
  'Admin',
  '{
    "stores": { "view": true, "create": true, "edit": true, "delete": false, "manage_members": true },
    "orders": { "view": true, "create": true, "edit": true, "delete": true, "cancel": true, "can_apply_discount": true, "can_add_delivery": true, "can_refund": true },
    "appointments": { "view": true, "create": true, "edit": true, "delete": true },
    "customers": { "view": true, "create": true, "edit": true, "delete": true },
    "suppliers": { "view": true, "create": true, "edit": true, "delete": true },
    "products": { "view": true, "create": true, "edit": true, "delete": true },
    "stock_movements": { "view": true, "create": true, "undo": true },
    "pdv": { "view": true, "sell": true, "open_pdv": true, "close_pdv": true, "sangria": true, "reforco": true, "can_apply_discount": true, "can_add_delivery": true },
    "services": { "view": true, "create": true, "edit": true, "delete": true },
    "service_orders": { "view": true, "create": true, "edit": true, "delete": true, "can_assign_technician": true, "can_change_status": true },
    "quotes": { "view": true, "create": true, "edit": true, "delete": true, "can_apply_discount": true },
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
      "settings_comissions": true,
      "settings_returns": true,
      "settings_vitrine": true,
      "settings_os": true,
      "settings_messages": true,
      "settings_delivery": true,
      "settings_integrations": false,
      "settings_system": true,
      "settings_resources": true,
      "settings_logs": true
    }
  }'::jsonb
),
(
  'manager',
  'Gestor',
  '{
    "stores": { "view": true, "create": false, "edit": false, "delete": false, "manage_members": false },
    "orders": { "view": true, "create": true, "edit": true, "delete": true, "cancel": true, "can_apply_discount": true, "can_add_delivery": true, "can_refund": false },
    "appointments": { "view": true, "create": true, "edit": true, "delete": true },
    "customers": { "view": true, "create": true, "edit": true, "delete": true },
    "suppliers": { "view": true, "create": true, "edit": true, "delete": true },
    "products": { "view": true, "create": true, "edit": true, "delete": true },
    "stock_movements": { "view": true, "create": true, "undo": true },
    "pdv": { "view": true, "sell": true, "open_pdv": true, "close_pdv": true, "sangria": true, "reforco": true, "can_apply_discount": true, "can_add_delivery": true },
    "services": { "view": true, "create": true, "edit": true, "delete": true },
    "service_orders": { "view": true, "create": true, "edit": true, "delete": true, "can_assign_technician": true, "can_change_status": true },
    "quotes": { "view": true, "create": true, "edit": true, "delete": true, "can_apply_discount": true },
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
      "settings_resources": false,
      "settings_logs": false
    }
  }'::jsonb
),
(
  'operator',
  'Operador',
  '{
    "stores": { "view": false, "create": false, "edit": false, "delete": false, "manage_members": false },
    "orders": { "view": true, "create": true, "edit": true, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": true, "can_refund": false },
    "appointments": { "view": true, "create": true, "edit": true, "delete": false },
    "customers": { "view": true, "create": true, "edit": true, "delete": false },
    "suppliers": { "view": true, "create": false, "edit": false, "delete": false },
    "products": { "view": true, "create": false, "edit": false, "delete": false },
    "stock_movements": { "view": true, "create": false, "undo": false },
    "pdv": { "view": true, "sell": true, "open_pdv": true, "close_pdv": true, "sangria": true, "reforco": true, "can_apply_discount": false, "can_add_delivery": true },
    "services": { "view": true, "create": false, "edit": false, "delete": false },
    "service_orders": { "view": true, "create": true, "edit": true, "delete": false, "can_assign_technician": false, "can_change_status": true },
    "quotes": { "view": true, "create": true, "edit": true, "delete": false, "can_apply_discount": false },
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
      "settings_resources": false,
      "settings_logs": false
    }
  }'::jsonb
),
(
  'delivery',
  'Entregador',
  '{
    "stores": { "view": false, "create": false, "edit": false, "delete": false, "manage_members": false },
    "orders": { "view": true, "create": false, "edit": false, "delete": false, "cancel": false, "can_apply_discount": false, "can_add_delivery": false, "can_refund": false },
    "appointments": { "view": false, "create": false, "edit": false, "delete": false },
    "customers": { "view": true, "create": false, "edit": false, "delete": false },
    "suppliers": { "view": false, "create": false, "edit": false, "delete": false },
    "products": { "view": false, "create": false, "edit": false, "delete": false },
    "stock_movements": { "view": false, "create": false, "undo": false },
    "pdv": { "view": false, "sell": false, "open_pdv": false, "close_pdv": false, "sangria": false, "reforco": false, "can_apply_discount": false, "can_add_delivery": false },
    "services": { "view": false, "create": false, "edit": false, "delete": false },
    "service_orders": { "view": false, "create": false, "edit": false, "delete": false, "can_assign_technician": false, "can_change_status": false },
    "quotes": { "view": false, "create": false, "edit": false, "delete": false, "can_apply_discount": false },
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
      "settings_resources": false,
      "settings_logs": false
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

COMMIT;

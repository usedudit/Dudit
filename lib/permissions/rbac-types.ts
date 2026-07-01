export type RoleId = "operator" | "delivery" | "manager" | "admin" | "owner"

export type PermissionTemplate = {
  orders: {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    cancel: boolean
    can_apply_discount: boolean
    can_add_delivery: boolean
    can_refund: boolean
  }
  appointments: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  customers: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  suppliers: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  products: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  stock_movements: { view: boolean; create: boolean; undo: boolean }
  pdv: {
    view: boolean
    sell: boolean
    open_pdv: boolean
    close_pdv: boolean
    sangria: boolean
    reforco: boolean
    can_apply_discount: boolean
    can_add_delivery: boolean
  }
  services: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  service_orders: { view: boolean; create: boolean; edit: boolean; delete: boolean; can_assign_technician: boolean; can_change_status: boolean }
  quotes: { view: boolean; create: boolean; edit: boolean; delete: boolean; can_apply_discount: boolean }
  financial: { view: boolean; create: boolean; edit: boolean; cancel: boolean }
  categories: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  coupons: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  goals: { view: boolean; create: boolean; edit: boolean; delete: boolean }
  reports: { view_basic: boolean; view_advanced: boolean }
  dashboard: { view: boolean }
  delivery: { view: boolean; create: boolean; edit: boolean; update_status: boolean }
  recurring_plans: { view: boolean; manage: boolean }
  recurring_subscriptions: { view: boolean; manage: boolean }
  productivity: { view: boolean; goals_view: boolean; goals_manage: boolean; commissions_view: boolean; commissions_manage: boolean }
  settings: {
    view: boolean
    settings_negocio: boolean
    settings_team: boolean
    settings_plan: boolean
    settings_payments: boolean
    settings_comissions: boolean
    settings_returns: boolean
    settings_vitrine: boolean
    settings_os: boolean
    settings_messages: boolean
    settings_delivery: boolean
    settings_integrations: boolean
  }
}

export type RbacPermissions = PermissionTemplate

export type RbacUserLike = {
  role_id?: RoleId | null
  roleId?: RoleId | null
  permissions?: unknown
}


// ─── Route-Based Permission Types ───────────────────────────────────────────

export type PartnerRole = "OWNER" | "ADMIN" | "MANAGER" | "OPERATOR" | "DELIVERY"

// Generic CRUD permissions reused by several modules
export interface ResourcePermissions {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
}

export interface OrdersPermissions {
    view: boolean
    create: boolean
    edit: boolean
    delete_cancel: boolean
}

export interface PdvPermissions {
    view: boolean
    sell: boolean
}

export interface CashRegisterPermissions {
    view: boolean
    open_close: boolean
    manage: boolean
}

export interface FinancialPermissions {
    view: boolean
    create: boolean
    edit: boolean
}

export interface ReportsPermissions {
    view_basic: boolean
    view_advanced: boolean
}

export interface DeliveryPermissions {
    view: boolean
    create: boolean
    edit: boolean
    update_status: boolean
}

export interface SettingsPermissions {
    view: boolean
    edit: boolean
}

export interface SpecificPermissions {
    settings_plan: boolean
    settings_comissions: boolean
    settings_integrations: boolean
    can_apply_discount: boolean
}

// Canonical DB model for `partner_users.permissions` / `partner_invitations.permissions`
export interface PartnerPermissions {
    orders: OrdersPermissions
    appointments: ResourcePermissions
    customers: ResourcePermissions
    products: ResourcePermissions
    pdv: PdvPermissions
    cash_register: CashRegisterPermissions
    services: ResourcePermissions
    quotes: ResourcePermissions
    financial: FinancialPermissions
    cadastros_categories: ResourcePermissions
    coupons: ResourcePermissions
    goals: ResourcePermissions
    reports: ReportsPermissions
    delivery: DeliveryPermissions
    team: ResourcePermissions
    settings: SettingsPermissions
    specific: SpecificPermissions
    // Backward compatibility alias still used by old mappings/actions
    suppliers?: ResourcePermissions
}

// ─── New Route-Based Permissions ────────────────────────────────────────────

export interface RoutePermissions {
    access: boolean
    create?: boolean
    edit?: boolean
    delete?: boolean
    specific?: Record<string, boolean>
}

// All route keys derived from sidebar navItems
export type RouteKey =
    // Início
    | "dashboard"
    // Vendas
    | "orders"
    | "returns"
    | "logistics"
    | "invoices"
    | "pos"
    | "quotes"
    | "goals"
    // Produtos
    | "products"
    | "stock_movements"
    | "import_notes"
    | "suppliers"
    | "cadastros_produtos"
    // Serviços
    | "appointments"
    | "services"
    | "cadastros_services"
    // Clientes
    | "customers"
    // Financeiro
    | "financial_transactions"
    | "cash_register"
    | "financial_dashboard"
    | "financial_dre"
    | "cadastros_financeiro"
    // Minha Vitrine
    | "store_customize"
    | "store_reviews"
    // Marketing
    | "marketing_coupons"
    | "cadastros_marketing"
    // Configurações
    | "settings"
    | "settings_business"
    | "settings_integrations"
    | "settings_team"
    | "settings_subscription"

export type PartnerRoutePermissions = Record<RouteKey, RoutePermissions>

// Legacy category names (used by existing server actions)
export type LegacyCategory = "products" | "services" | "orders" | "financial" | "customers" | "suppliers" | "quotes"

export interface PartnerUserRecord {
    id: string
    partner_id: string
    user_id: string
    role: PartnerRole
    permissions: PartnerPermissions
    route_permissions?: PartnerRoutePermissions
    created_by_user_id: string | null
    created_at: string
}

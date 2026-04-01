// ─── Route-Based Permission Types ───────────────────────────────────────────

export type PartnerRole = "OWNER" | "ADMIN" | "MANAGER" | "OPERATOR" | "DELIVERY" | "VIEWER"

// Legacy CRUD permissions (kept for backward compat with existing server actions)
export interface ResourcePermissions {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
}

// Legacy category-based permissions (backward compat)
export interface PartnerPermissions {
    products: ResourcePermissions
    services: ResourcePermissions
    orders: ResourcePermissions
    financial: ResourcePermissions
    customers: ResourcePermissions
    suppliers: ResourcePermissions
    quotes: ResourcePermissions
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
    | "settings_business"
    | "settings_integrations"
    | "settings_team"
    | "settings_subscription"

export type PartnerRoutePermissions = Record<RouteKey, RoutePermissions>

// Legacy category names (used by existing server actions)
export type LegacyCategory = keyof PartnerPermissions

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

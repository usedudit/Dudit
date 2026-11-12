export interface StorePermissions {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    manage_members: boolean
}

// ─── Route-Based Permission Types ───────────────────────────────────────────

export type PartnerRole = "OWNER" | "ADMIN" | "MANAGER" | "OPERATOR" | "DELIVERY"

// Generic CRUD permissions reused by several modules
export interface ResourcePermissions {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
}

export interface ProductsPermissions extends ResourcePermissions {
    view_cost_price?: boolean
}

export interface CustomersPermissions extends ResourcePermissions {
    list?: boolean
    view_fiscal_data?: boolean
    view_personal_data?: boolean
    export?: boolean
}

export interface ServiceOrdersPermissions extends ResourcePermissions {
    can_assign_technician: boolean
    can_change_status: boolean
    can_generate_invoice: boolean
}

export interface QuotesPermissions extends ResourcePermissions {
    can_apply_discount: boolean
}

export interface AppointmentsPermissions extends ResourcePermissions {}

export interface RecurringSubscriptionsPermissions {
    view: boolean
    manage: boolean
    can_advance_cycle?: boolean
}

export interface OrdersPermissions {
    view: boolean
    create: boolean
    edit: boolean
    delete: boolean
    cancel: boolean
    can_apply_discount: boolean
    can_add_delivery: boolean
    can_refund?: boolean
    list?: boolean
    // Backward compatibility alias
    delete_cancel?: boolean
}

export interface PdvPermissions {
    view: boolean
    sell: boolean
    open_pdv: boolean
    close_pdv: boolean
    sangria: boolean
    reforco: boolean
    can_apply_discount: boolean
    can_add_delivery: boolean
}

export interface FinancialPermissions {
    view: boolean
    create: boolean
    edit: boolean
    cancel: boolean
    can_settle?: boolean
}

export interface ReportsPermissions {
    view_basic: boolean
    view_advanced: boolean
    export_dre?: boolean
}

export interface DeliveryPermissions {
    view: boolean
    create: boolean
    edit: boolean
    update_status: boolean
}

export interface SettingsPermissions {
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
    settings_system: boolean
    settings_resources: boolean
    settings_logs: boolean
}

export interface SettingsNegocioPermissions {
    edit: boolean
}

export interface SettingsTeamPermissions {
    invite: boolean
    edit: boolean
    remove: boolean
    revoke_invite: boolean
}

export interface SettingsPlansPermissions {
    change_plan: boolean
}

export interface PaymentMethodsPermissions {
    create: boolean
    edit: boolean
    delete: boolean
}

export interface SettingsComissionsPermissions {
    edit: boolean
}

export interface StockMovementsPermissions {
    view: boolean
    create: boolean
    undo: boolean
}



// Canonical DB model for `partner_users.permissions` / `partner_invitations.permissions`
export interface PartnerPermissions {
    stores: StorePermissions
    orders: OrdersPermissions
    appointments: AppointmentsPermissions
    customers: CustomersPermissions
    products: ProductsPermissions
    stock_movements: StockMovementsPermissions
    pdv: PdvPermissions
    services: ResourcePermissions
    service_orders?: ServiceOrdersPermissions
    quotes: QuotesPermissions
    financial: FinancialPermissions
    categories: ResourcePermissions
    coupons: ResourcePermissions
    goals: ResourcePermissions
    reports: ReportsPermissions
    dashboard: { view: boolean }
    delivery: DeliveryPermissions
    recurring_plans: { view: boolean; manage: boolean }
    recurring_subscriptions: RecurringSubscriptionsPermissions
    settings: SettingsPermissions
    settings_negocio: SettingsNegocioPermissions
    settings_team: SettingsTeamPermissions
    settings_plans: SettingsPlansPermissions
    payment_methods: PaymentMethodsPermissions
    settings_comissions: SettingsComissionsPermissions
    suppliers?: ResourcePermissions
    commissions?: { view: boolean; edit: boolean }
    community_videos?: ResourcePermissions
    colecoes?: ResourcePermissions
    // Backward compatibility aliases still used by old mappings/actions
    cash_register?: { view: boolean; open_close: boolean; manage: boolean }
    cadastros_categories?: ResourcePermissions
    team?: ResourcePermissions
    specific?: {
        settings_plan: boolean
        settings_comissions: boolean
        settings_integrations: boolean
        can_apply_discount: boolean
        can_add_delivery?: boolean
    }
    productivity?: {
        view: boolean
        goals_view: boolean
        goals_manage: boolean
        commissions_view: boolean
        commissions_manage: boolean
    }
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
    | "xml_import"
    | "suppliers"
    | "cadastros_produtos"
    // Serviços
    | "appointments"
    | "services"
    | "service_orders"
    | "cadastros_services"
    // Clientes
    | "customers"
    // Financeiro
    | "financial_transactions"
    | "contas_a_pagar"
    | "contas_a_receber"
    | "cash_register"
    | "financial_dre"
    | "cadastros_financeiro"
    | "reports"
    // Minha Vitrine
    | "store_customize"
    | "store_reviews"
    // Marketing
    | "marketing_coupons"
    | "marketing_promotions"
    | "cadastros_marketing"
    | "community_videos"
    | "colecoes"
    // Assinaturas
    | "recurring_plans"
    | "recurring_subscriptions"
    // Lojas e Filiais
    | "stores"
    | "stores_members"
    | "stores_settings"
    // Configurações
    | "settings"
    | "settings_business"
    | "settings_integrations"
    | "settings_team"
    | "settings_subscription"
    // Produtividade
    | "productivity_overview"
    | "productivity_goals"
    | "productivity_commissions"

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

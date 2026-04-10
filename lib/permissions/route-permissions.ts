/**
 * Route-Based Permission System
 *
 * Maps every sidebar route to permission keys, role presets, and helpers.
 * Works on both server and client side (no server-only imports).
 *
 * EVOLUTION: Now uses operational action-based permissions (can_cancel_order,
 * can_approve_payment, etc.) instead of generic CRUD only.
 */

import type {
    RouteKey,
    RoutePermissions,
    PartnerRoutePermissions,
    PartnerRole,
    PartnerPermissions,
    LegacyCategory,
    ResourcePermissions,
} from "./types"

// ─── Route Map ──────────────────────────────────────────────────────────────
// Maps each RouteKey to its sidebar path, parent category label, and display label.

export interface RouteInfo {
    key: RouteKey
    path: string
    label: string
    category: string // Sidebar section label
    legacyCategory?: LegacyCategory // Maps to old PartnerPermissions key
    specificPermissions?: string[] // Available route-specific operational permissions
}

export const ROUTE_MAP: Record<RouteKey, RouteInfo> = {
    // ── Início
    dashboard: { key: "dashboard", path: "/erp/dashboard", label: "Início", category: "Início" },

    // ── Vendas
    orders: {
        key: "orders", path: "/erp/orders", label: "Pedidos e Vendas", category: "Vendas", legacyCategory: "orders",
        specificPermissions: [
            "can_cancel_order", "can_refund", "can_update_status",
            "can_assign_delivery", "can_view_values",
        ],
    },
    returns: { key: "returns", path: "/erp/returns", label: "Devoluções", category: "Vendas", legacyCategory: "orders" },
    logistics: {
        key: "logistics", path: "/erp/logistics", label: "Expedição e Entregas", category: "Vendas", legacyCategory: "orders",
        specificPermissions: [
            "can_update_delivery_status", "can_assign_driver",
            "can_print_label", "can_generate_tracking",
        ],
    },
    invoices: { key: "invoices", path: "/erp/invoices", label: "Notas Fiscais", category: "Vendas", legacyCategory: "orders" },
    pos: {
        key: "pos", path: "/erp/pos", label: "PDV (Frente de Caixa)", category: "Vendas", legacyCategory: "orders",
        specificPermissions: ["can_discount", "can_cancel_sale"],
    },
    quotes: { key: "quotes", path: "/erp/quotes", label: "Orçamentos", category: "Vendas", legacyCategory: "quotes" },

    // ── Produtos
    products: {
        key: "products", path: "/erp/products", label: "Catálogo de Produtos", category: "Produtos", legacyCategory: "products",
        specificPermissions: ["can_adjust_stock", "can_import_products"],
    },
    stock_movements: { key: "stock_movements", path: "/erp/stock-movements", label: "Movimentação de estoque", category: "Produtos", legacyCategory: "products" },
    import_notes: {
        key: "import_notes", path: "/erp/import-notes", label: "Notas de entrada", category: "Produtos", legacyCategory: "products",
        specificPermissions: ["can_import_products"],
    },
    suppliers: { key: "suppliers", path: "/erp/suppliers", label: "Fornecedores", category: "Produtos", legacyCategory: "suppliers" },
    cadastros_produtos: { key: "cadastros_produtos", path: "/erp/products/cadastros", label: "Cadastros", category: "Produtos", legacyCategory: "products" },

    // ── Serviços
    appointments: {
        key: "appointments", path: "/erp/appointments", label: "Agendamentos", category: "Serviços", legacyCategory: "services",
        specificPermissions: [
            "can_assign_technician", "can_cancel_appointment",
            "can_update_appointment_status",
        ],
    },
    services: {
        key: "services", path: "/erp/services", label: "Catálogo de Serviços", category: "Serviços", legacyCategory: "services",
        specificPermissions: ["can_change_service_price"],
    },
    cadastros_services: { key: "cadastros_services", path: "/erp/cadastros-services", label: "Cadastros", category: "Serviços", legacyCategory: "services" },

    // ── Clientes
    customers: { key: "customers", path: "/erp/customers", label: "Clientes", category: "Clientes", legacyCategory: "customers" },

    // ── Financeiro
    financial_transactions: {
        key: "financial_transactions", path: "/erp/financial/transactions", label: "Transações (Pagar/Receber)", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_approve_payment", "can_view_reports"],
    },
    financial_dashboard: { key: "financial_dashboard", path: "/erp/financial/dashboard", label: "Fluxo de caixa", category: "Financeiro", legacyCategory: "financial" },
    financial_dre: {
        key: "financial_dre", path: "/erp/financial/dre", label: "DRE Gerencial", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_view_dre"],
    },
    cadastros_financeiro: { key: "cadastros_financeiro", path: "/erp/financial/cadastros-financeiro", label: "Cadastros financeiros", category: "Financeiro", legacyCategory: "financial" },

    // ── Minha Vitrine
    store_customize: {
        key: "store_customize", path: "/erp/store-profile/customize", label: "Personalizar Perfil", category: "Minha Vitrine",
        specificPermissions: ["can_customize_store"],
    },
    store_reviews: {
        key: "store_reviews", path: "/erp/store-profile/reviews", label: "Avaliações e Reputação", category: "Minha Vitrine",
        specificPermissions: ["can_respond_reviews"],
    },

    // ── Marketing
    marketing_coupons: { key: "marketing_coupons", path: "/erp/marketing/coupons", label: "Cupons de Desconto", category: "Marketing" },
    cadastros_marketing: { key: "cadastros_marketing", path: "/erp/cadastros-marketing", label: "Cadastros", category: "Marketing" },

    // ── Configurações
    settings: { key: "settings", path: "/erp/settings", label: "Configurações", category: "Configurações" },
    settings_business: {
        key: "settings_business", path: "/erp/settings/business", label: "Dados do Negócio", category: "Configurações",
        specificPermissions: ["can_edit_business_data"],
    },
    settings_integrations: {
        key: "settings_integrations", path: "/erp/settings/integrations", label: "Integrações", category: "Configurações",
        specificPermissions: ["can_manage_integrations"],
    },
    settings_team: {
        key: "settings_team", path: "/erp/settings/team", label: "Equipe e Acessos", category: "Configurações",
        specificPermissions: ["can_invite", "can_remove_member", "can_manage_team"],
    },
    settings_subscription: {
        key: "settings_subscription", path: "/erp/settings/subscription", label: "Minha Assinatura", category: "Configurações",
        specificPermissions: ["can_change_subscription"],
    },
}

// ─── Path-to-RouteKey Lookup ────────────────────────────────────────────────

const pathToRouteKey: Record<string, RouteKey> = {}
for (const [key, info] of Object.entries(ROUTE_MAP)) {
    pathToRouteKey[info.path] = key as RouteKey
}

/**
 * Resolve a pathname (e.g. "/erp/products" or "/erp/products/new") to a RouteKey.
 * Supports exact match and prefix match (for subpages like /erp/products/[id]).
 */
export function resolveRouteKey(pathname: string): RouteKey | null {
    // Exact match first
    if (pathToRouteKey[pathname]) return pathToRouteKey[pathname]

    // Prefix match (longest match wins)
    let bestMatch: RouteKey | null = null
    let bestLength = 0
    for (const [path, key] of Object.entries(pathToRouteKey)) {
        if (pathname.startsWith(path + "/") && path.length > bestLength) {
            bestMatch = key
            bestLength = path.length
        }
    }
    return bestMatch
}

// ─── Permission Presets ─────────────────────────────────────────────────────

const full: RoutePermissions = { access: true, create: true, edit: true, delete: true }
const crud: RoutePermissions = { access: true, create: true, edit: true, delete: false }
const viewOnly: RoutePermissions = { access: true }
const noAccess: RoutePermissions = { access: false }

function withSpecific(base: RoutePermissions, specifics: Record<string, boolean>): RoutePermissions {
    return { ...base, specific: specifics }
}

// ─── OWNER: Controle Absoluto ───────────────────────────────────────────────

const OWNER_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: full,
    // Vendas
    orders: withSpecific(full, {
        can_cancel_order: true, can_refund: true, can_update_status: true,
        can_assign_delivery: true, can_view_values: true,
    }),
    returns: full,
    logistics: withSpecific(full, {
        can_update_delivery_status: true, can_assign_driver: true,
        can_print_label: true, can_generate_tracking: true,
    }),
    invoices: full,
    pos: withSpecific(full, { can_discount: true, can_cancel_sale: true }),
    quotes: full,
    // Produtos
    products: withSpecific(full, { can_adjust_stock: true, can_import_products: true }),
    stock_movements: full,
    import_notes: withSpecific(full, { can_import_products: true }),
    suppliers: full,
    cadastros_produtos: full,
    // Serviços
    appointments: withSpecific(full, {
        can_assign_technician: true, can_cancel_appointment: true,
        can_update_appointment_status: true,
    }),
    services: withSpecific(full, { can_change_service_price: true }),
    cadastros_services: full,
    // Clientes
    customers: full,
    // Financeiro
    financial_transactions: withSpecific(full, { can_approve_payment: true, can_view_reports: true }),
    financial_dashboard: full,
    financial_dre: withSpecific(full, { can_view_dre: true }),
    cadastros_financeiro: full,
    // Vitrine
    store_customize: withSpecific(full, { can_customize_store: true }),
    store_reviews: withSpecific(full, { can_respond_reviews: true }),
    // Marketing
    marketing_coupons: full,
    cadastros_marketing: full,
    // Configurações
    settings: full,
    settings_business: withSpecific(full, { can_edit_business_data: true }),
    settings_integrations: withSpecific(full, { can_manage_integrations: true }),
    settings_team: withSpecific(full, { can_invite: true, can_remove_member: true, can_manage_team: true }),
    settings_subscription: withSpecific(full, { can_change_subscription: true }),
}

// ─── ADMIN: Operacional Completo (exceto nível societário) ──────────────────

const ADMIN_PERMISSIONS: PartnerRoutePermissions = {
    ...OWNER_PERMISSIONS,
    // ADMIN cannot change subscription
    settings: full,
    settings_subscription: viewOnly,
    // ADMIN cannot manage integrations estratégicas (optional, can be overridden)
    settings_integrations: withSpecific(full, { can_manage_integrations: true }),
}

// ─── MANAGER: Gestão Operacional ────────────────────────────────────────────

const MANAGER_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: full,
    // Vendas — full ops, can cancel but CANNOT refund
    orders: withSpecific(full, {
        can_cancel_order: true, can_refund: false, can_update_status: true,
        can_assign_delivery: true, can_view_values: true,
    }),
    returns: full,
    logistics: withSpecific(full, {
        can_update_delivery_status: true, can_assign_driver: true,
        can_print_label: true, can_generate_tracking: true,
    }),
    invoices: full,
    pos: withSpecific(full, { can_discount: true, can_cancel_sale: true }),
    quotes: full,
    // Produtos — full
    products: withSpecific(full, { can_adjust_stock: true, can_import_products: true }),
    stock_movements: full,
    import_notes: withSpecific(full, { can_import_products: true }),
    suppliers: full,
    cadastros_produtos: full,
    // Serviços — full
    appointments: withSpecific(full, {
        can_assign_technician: true, can_cancel_appointment: true,
        can_update_appointment_status: true,
    }),
    services: withSpecific(full, { can_change_service_price: true }),
    cadastros_services: full,
    // Clientes
    customers: full,
    // Financeiro — view only, no approve/delete
    financial_transactions: withSpecific(viewOnly, { can_approve_payment: false, can_view_reports: true }),
    financial_dashboard: viewOnly,
    financial_dre: withSpecific(viewOnly, { can_view_dre: true }),
    cadastros_financeiro: viewOnly,
    // Vitrine
    store_customize: withSpecific(crud, { can_customize_store: true }),
    store_reviews: withSpecific(viewOnly, { can_respond_reviews: true }),
    // Marketing
    marketing_coupons: full,
    cadastros_marketing: full,
    // Config — limited team management, no integrations/subscription
    settings: viewOnly,
    settings_business: withSpecific(viewOnly, { can_edit_business_data: true }),
    settings_integrations: noAccess,
    settings_team: withSpecific(viewOnly, { can_invite: true, can_remove_member: false, can_manage_team: true }),
    settings_subscription: noAccess,
}

// ─── OPERATOR: Atendente / Vendedor ─────────────────────────────────────────

const OPERATOR_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: viewOnly,
    // Vendas — create/edit orders, update status, no cancel/refund
    orders: withSpecific(crud, {
        can_cancel_order: false, can_refund: false, can_update_status: true,
        can_assign_delivery: false, can_view_values: true,
    }),
    returns: viewOnly,
    logistics: viewOnly,
    invoices: viewOnly,
    pos: withSpecific(crud, { can_discount: false, can_cancel_sale: false }),
    quotes: crud,
    // Produtos — view only
    products: withSpecific(viewOnly, { can_adjust_stock: false, can_import_products: false }),
    stock_movements: viewOnly,
    import_notes: noAccess,
    suppliers: noAccess,
    cadastros_produtos: viewOnly,
    // Serviços — view only (cannot create/edit services)
    // Agendamentos — create/edit, update status, no cancel
    appointments: withSpecific(crud, {
        can_assign_technician: false, can_cancel_appointment: false,
        can_update_appointment_status: true,
    }),
    services: viewOnly,
    cadastros_services: viewOnly,
    // Clientes — view/create (for POS/orders)
    customers: crud,
    // Financeiro — no access
    financial_transactions: noAccess,
    financial_dashboard: noAccess,
    financial_dre: noAccess,
    cadastros_financeiro: noAccess,
    // Vitrine — no access
    store_customize: noAccess,
    store_reviews: noAccess,
    // Marketing — no access
    marketing_coupons: noAccess,
    cadastros_marketing: noAccess,
    // Config — no access
    settings: noAccess,
    settings_business: noAccess,
    settings_integrations: noAccess,
    settings_team: noAccess,
    settings_subscription: noAccess,
}

// ─── DELIVERY: Entregador ───────────────────────────────────────────────────

const DELIVERY_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: noAccess,
    // Vendas — view assigned orders only, update delivery status
    orders: withSpecific(viewOnly, {
        can_cancel_order: false, can_refund: false, can_update_status: true,
        can_assign_delivery: false, can_view_values: false,
    }),
    returns: noAccess,
    logistics: withSpecific(viewOnly, {
        can_update_delivery_status: true, can_assign_driver: false,
        can_print_label: false, can_generate_tracking: false,
    }),
    invoices: noAccess,
    pos: noAccess,
    quotes: noAccess,
    // Produtos — no access
    products: noAccess,
    stock_movements: noAccess,
    import_notes: noAccess,
    suppliers: noAccess,
    cadastros_produtos: noAccess,
    // Serviços — no access
    appointments: noAccess,
    services: noAccess,
    cadastros_services: noAccess,
    // Clientes — no access
    customers: noAccess,
    // Financeiro — no access
    financial_transactions: noAccess,
    financial_dashboard: noAccess,
    financial_dre: noAccess,
    cadastros_financeiro: noAccess,
    // Vitrine — no access
    store_customize: noAccess,
    store_reviews: noAccess,
    // Marketing — no access
    marketing_coupons: noAccess,
    cadastros_marketing: noAccess,
    // Config — no access
    settings: noAccess,
    settings_business: noAccess,
    settings_integrations: noAccess,
    settings_team: noAccess,
    settings_subscription: noAccess,
}

// ─── VIEWER: Somente Leitura ────────────────────────────────────────────────

const VIEWER_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: viewOnly,
    orders: viewOnly,
    returns: viewOnly,
    logistics: viewOnly,
    invoices: viewOnly,
    pos: noAccess,
    quotes: viewOnly,
    products: viewOnly,
    stock_movements: viewOnly,
    import_notes: viewOnly,
    suppliers: viewOnly,
    cadastros_produtos: viewOnly,
    appointments: viewOnly,
    services: viewOnly,
    cadastros_services: viewOnly,
    customers: viewOnly,
    financial_transactions: noAccess,
    financial_dashboard: noAccess,
    financial_dre: noAccess,
    cadastros_financeiro: noAccess,
    store_customize: noAccess,
    store_reviews: noAccess,
    marketing_coupons: noAccess,
    cadastros_marketing: noAccess,
    settings: noAccess,
    settings_business: noAccess,
    settings_integrations: noAccess,
    settings_team: noAccess,
    settings_subscription: noAccess,
}

// ─── Combined Presets ───────────────────────────────────────────────────────

export const ROUTE_PERMISSION_PRESETS: Record<PartnerRole, PartnerRoutePermissions> = {
    OWNER: OWNER_PERMISSIONS,
    ADMIN: ADMIN_PERMISSIONS,
    MANAGER: MANAGER_PERMISSIONS,
    OPERATOR: OPERATOR_PERMISSIONS,
    DELIVERY: DELIVERY_PERMISSIONS,
    VIEWER: VIEWER_PERMISSIONS,
}

// ─── Permission Check Helpers ───────────────────────────────────────────────

/**
 * Check if user can access a route.
 */
export function canAccessRoute(permissions: PartnerRoutePermissions | null | undefined, routeKey: RouteKey): boolean {
    if (!permissions) return false
    return permissions[routeKey]?.access === true
}

/**
 * Check if user can perform a CRUD action on a route.
 */
export function canPerformAction(
    permissions: PartnerRoutePermissions | null | undefined,
    routeKey: RouteKey,
    action: "create" | "edit" | "delete"
): boolean {
    if (!permissions) return false
    const perm = permissions[routeKey]
    if (!perm?.access) return false
    return perm[action] === true
}

/**
 * Check a route-specific operational permission (e.g. orders → can_cancel_order).
 */
export function hasSpecificPermission(
    permissions: PartnerRoutePermissions | null | undefined,
    routeKey: RouteKey,
    permKey: string
): boolean {
    if (!permissions) return false
    const perm = permissions[routeKey]
    if (!perm?.access) return false
    return perm.specific?.[permKey] === true
}

/**
 * Get all accessible route keys for a permission set.
 * Used by sidebar to filter visible routes.
 */
export function getAccessibleRoutes(permissions: PartnerRoutePermissions | null | undefined): RouteKey[] {
    if (!permissions) return []
    return (Object.keys(permissions) as RouteKey[]).filter(key => permissions[key]?.access === true)
}

/**
 * Check if a path is accessible given route permissions.
 * Resolves the path to a RouteKey first.
 *
 * SECURITY: Default DENY for unknown routes.
 */
export function canAccessPath(permissions: PartnerRoutePermissions | null | undefined, pathname: string): boolean {
    const routeKey = resolveRouteKey(pathname)
    if (!routeKey) return false // SECURITY: Default deny for unknown routes
    return canAccessRoute(permissions, routeKey)
}

// ─── Legacy Compatibility ───────────────────────────────────────────────────

/**
 * Convert route permissions to legacy PartnerPermissions structure.
 * Uses the "primary" route for each legacy category.
 */
export function routeToLegacyPermissions(routePerms: PartnerRoutePermissions): PartnerPermissions {
    const mapRoute = (key: RouteKey): ResourcePermissions => ({
        view: routePerms[key]?.access ?? false,
        create: routePerms[key]?.create ?? false,
        edit: routePerms[key]?.edit ?? false,
        delete: routePerms[key]?.delete ?? false,
    })

    return {
        products: mapRoute("products"),
        services: mapRoute("services"),
        orders: mapRoute("orders"),
        financial: mapRoute("financial_transactions"),
        customers: mapRoute("customers"),
        suppliers: mapRoute("suppliers"),
        quotes: mapRoute("quotes"),
    }
}

/**
 * Convert legacy PartnerPermissions to route permissions.
 * Spreads each legacy category across its related routes.
 */
export function legacyToRoutePermissions(legacy: PartnerPermissions, role: PartnerRole): PartnerRoutePermissions {
    // Start from role preset and override with legacy permissions
    const base = { ...ROUTE_PERMISSION_PRESETS[role] }

    const mapLegacy = (res: ResourcePermissions): RoutePermissions => ({
        access: res.view,
        create: res.create,
        edit: res.edit,
        delete: res.delete,
    })

    // Override from legacy categories
    const categoryRoutes: Record<keyof PartnerPermissions, RouteKey[]> = {
        products: ["products", "stock_movements", "import_notes", "cadastros_produtos"],
        services: ["appointments", "services", "cadastros_services"],
        orders: ["orders", "returns", "logistics", "invoices", "pos"],
        financial: ["financial_transactions", "financial_dashboard", "financial_dre", "cadastros_financeiro"],
        customers: ["customers"],
        suppliers: ["suppliers"],
        quotes: ["quotes"],
    }

    for (const [cat, routes] of Object.entries(categoryRoutes)) {
        const legacyPerm = legacy[cat as keyof PartnerPermissions]
        if (legacyPerm) {
            const mapped = mapLegacy(legacyPerm)
            for (const routeKey of routes) {
                // Merge: keep specific permissions from base, override CRUD from legacy
                base[routeKey] = {
                    ...mapped,
                    specific: base[routeKey]?.specific,
                }
            }
        }
    }

    return base
}

// ─── Route labels for permission-denied messages ────────────────────────────

const ACTION_LABELS: Record<string, string> = {
    create: "criar",
    edit: "editar",
    delete: "excluir",
    access: "acessar",
}

/**
 * Build a user-friendly "permission denied" message.
 */
export function permissionDeniedMessage(routeKey: RouteKey, action: string): string {
    const route = ROUTE_MAP[routeKey]
    const actionLabel = ACTION_LABELS[action] || action
    return `Você não tem permissão para ${actionLabel} em ${route?.label || routeKey}.`
}

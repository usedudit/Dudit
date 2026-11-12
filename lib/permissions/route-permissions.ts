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
    dashboard: { key: "dashboard", path: "/erp/painel", label: "Início", category: "Início" },

    // ── Vendas
    orders: {
        key: "orders", path: "/erp/pedidos", label: "Pedidos e Vendas", category: "Vendas", legacyCategory: "orders",
        specificPermissions: [
            "can_cancel_order", "can_refund", "can_update_status",
            "can_assign_delivery", "can_view_values", "can_apply_discount",
        ],
    },
    returns: { key: "returns", path: "/erp/devolucoes", label: "Devoluções", category: "Vendas", legacyCategory: "orders" },
    logistics: {
        key: "logistics", path: "/erp/entregas", label: "Expedição e Entregas", category: "Vendas", legacyCategory: "orders",
        specificPermissions: [
            "can_update_delivery_status", "can_assign_driver",
            "can_print_label", "can_generate_tracking", "can_view_delivery_details",
        ],
    },
    invoices: { key: "invoices", path: "/erp/notas-fiscais", label: "Notas Fiscais", category: "Vendas", legacyCategory: "orders" },
    pos: {
        key: "pos", path: "/erp/pdv", label: "PDV (Frente de Caixa)", category: "Vendas", legacyCategory: "orders",
        specificPermissions: ["can_sell", "can_discount", "can_cancel_sale", "can_add_delivery"],
    },
    quotes: { key: "quotes", path: "/erp/orcamentos", label: "Orçamentos", category: "Vendas", legacyCategory: "quotes", specificPermissions: ["can_apply_discount"] },
    goals: { key: "goals", path: "/erp/metas", label: "Metas", category: "Vendas", legacyCategory: "orders" },

    // ── Produtos
    products: {
        key: "products", path: "/erp/produtos", label: "Catálogo de Produtos", category: "Produtos", legacyCategory: "products",
        specificPermissions: ["can_adjust_stock", "can_import_products", "view_cost_price"],
    },
    stock_movements: { key: "stock_movements", path: "/erp/movimentacao-estoque", label: "Movimentação de estoque", category: "Produtos", legacyCategory: "products" },
    import_notes: {
        key: "import_notes", path: "/erp/notas-entrada", label: "Notas de entrada", category: "Produtos", legacyCategory: "products",
        specificPermissions: ["can_import_products"],
    },
    xml_import: {
        key: "xml_import", path: "/erp/importacao-xml", label: "Importar XML (NF-e)", category: "Produtos", legacyCategory: "products",
        specificPermissions: ["can_import_products"],
    },
    suppliers: { key: "suppliers", path: "/erp/fornecedores", label: "Fornecedores", category: "Produtos", legacyCategory: "suppliers" },
    cadastros_produtos: { key: "cadastros_produtos", path: "/erp/produtos/cadastros", label: "Cadastros", category: "Produtos", legacyCategory: "products" },

    // ── Serviços
    appointments: {
        key: "appointments", path: "/erp/agendamentos", label: "Agendamentos", category: "Serviços", legacyCategory: "services",
        specificPermissions: [
            "can_assign_technician", "can_cancel_appointment",
            "can_update_appointment_status",
        ],
    },
    services: {
        key: "services", path: "/erp/servicos", label: "Catálogo de Serviços", category: "Serviços", legacyCategory: "services",
        specificPermissions: ["can_change_service_price"],
    },
    service_orders: {
        key: "service_orders", path: "/erp/ordens-de-servico", label: "Ordens de Serviço", category: "Serviços", legacyCategory: "services",
        specificPermissions: [
            "can_assign_technician",
            "can_change_status",
            "can_request_signature",
            "can_generate_invoice",
        ],
    },
    cadastros_services: { key: "cadastros_services", path: "/erp/servicos/cadastros", label: "Cadastros", category: "Serviços", legacyCategory: "services" },

    // ── Clientes
    customers: {
        key: "customers", path: "/erp/clientes", label: "Clientes", category: "Clientes", legacyCategory: "customers",
        specificPermissions: ["export"],
    },

    // ── Financeiro
    financial_transactions: {
        key: "financial_transactions", path: "/erp/transacoes", label: "Transações (Pagar/Receber)", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_approve_payment", "can_view_reports", "can_settle"],
    },
    contas_a_pagar: {
        key: "contas_a_pagar", path: "/erp/contas-a-pagar", label: "Contas a Pagar", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_approve_payment", "can_settle"],
    },
    contas_a_receber: {
        key: "contas_a_receber", path: "/erp/contas-a-receber", label: "Contas a Receber", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_approve_payment", "can_settle"],
    },
    cash_register: {
        key: "cash_register", path: "/erp/caixa", label: "Caixa (PDV)", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_open_cash", "can_close_cash", "can_manage_cash"],
    },
    financial_dre: {
        key: "financial_dre", path: "/erp/transacoes/dre", label: "DRE Gerencial", category: "Financeiro", legacyCategory: "financial",
        specificPermissions: ["can_view_dre"],
    },
    cadastros_financeiro: { key: "cadastros_financeiro", path: "/erp/transacoes/cadastros-financeiro", label: "Cadastros financeiros", category: "Financeiro", legacyCategory: "financial" },
    reports: { key: "reports", path: "/erp/estatisticas", label: "Estatísticas", category: "Desempenho" },

    // ── Minha Vitrine
    store_customize: {
        key: "store_customize", path: "/erp/perfil-loja/personalizar", label: "Personalizar Perfil", category: "Minha Vitrine",
        specificPermissions: ["can_customize_store"],
    },
    store_reviews: {
        key: "store_reviews", path: "/erp/perfil-loja/avaliacoes", label: "Avaliações e Reputação", category: "Minha Vitrine",
        specificPermissions: ["can_respond_reviews"],
    },

    // ── Marketing
    marketing_coupons: { key: "marketing_coupons", path: "/erp/cupons", label: "Cupons de Desconto", category: "Marketing" },
    marketing_promotions: { key: "marketing_promotions", path: "/erp/promocoes", label: "Campanhas e Promoções", category: "Marketing" },
    cadastros_marketing: { key: "cadastros_marketing", path: "/erp/cadastros-marketing", label: "Cadastros", category: "Marketing" },
    community_videos: { key: "community_videos", path: "/erp/videos", label: "Vídeos da Comunidade", category: "Marketing" },
    colecoes: { key: "colecoes", path: "/erp/marketing/colecoes", label: "Coleções", category: "Marketing" },

    // ── Assinaturas
    recurring_plans: { key: "recurring_plans", path: "/erp/recorrentes/planos", label: "Planos Recorrentes", category: "Assinaturas" },
    recurring_subscriptions: {
        key: "recurring_subscriptions", path: "/erp/recorrentes/assinaturas", label: "Assinaturas", category: "Assinaturas",
        specificPermissions: ["can_advance_cycle"],
    },

    // ── Lojas e Filiais
    stores: {
        key: "stores", path: "/erp/lojas", label: "Lojas e Filiais", category: "Configurações",
        specificPermissions: ["manage_members"],
    },
    stores_members: {
        key: "stores_members", path: "/erp/lojas/membros", label: "Membros por Loja", category: "Configurações",
    },
    stores_settings: {
        key: "stores_settings", path: "/erp/lojas/configuracoes", label: "Configurações da Loja", category: "Configurações",
    },

    // ── Configurações
    settings: { key: "settings", path: "/erp/configuracoes", label: "Configurações", category: "Configurações" },
    settings_business: {
        key: "settings_business", path: "/erp/configuracoes/dados-negocio", label: "Dados do Negócio", category: "Configurações",
        specificPermissions: ["can_edit_business_data"],
    },
    settings_integrations: {
        key: "settings_integrations", path: "/erp/configuracoes/integracoes", label: "Integrações", category: "Configurações",
        specificPermissions: ["can_manage_integrations"],
    },
    settings_team: {
        key: "settings_team", path: "/erp/configuracoes/equipe", label: "Equipe e Acessos", category: "Configurações",
        specificPermissions: ["can_invite", "can_remove_member", "can_manage_team", "can_revoke_invite"],
    },
    settings_subscription: {
        key: "settings_subscription", path: "/erp/configuracoes/assinatura", label: "Minha Assinatura", category: "Configurações",
        specificPermissions: ["can_change_subscription"],
    },

    // ── Produtividade
    productivity_overview: { key: "productivity_overview", path: "/erp/produtividade", label: "Visão Geral", category: "Produtividade" },
    productivity_goals: { key: "productivity_goals", path: "/erp/metas", label: "Metas", category: "Produtividade" },
    productivity_commissions: {
        key: "productivity_commissions", path: "/erp/comissoes", label: "Comissões", category: "Produtividade",
        specificPermissions: ["can_pay_commission"],
    },
}

// ─── Path-to-RouteKey Lookup ────────────────────────────────────────────────

// Algumas telas têm mais de uma rota e compartilham a mesma permissão.
// Ex.: o hub de Relatórios ("/erp/relatorios") e as Estatísticas
// ("/erp/estatisticas") são controlados pela mesma chave "reports".
const ROUTE_PATH_ALIASES: Record<string, RouteKey> = {
    "/erp/relatorios": "reports",
}

const pathToRouteKey: Record<string, RouteKey> = {}
for (const [key, info] of Object.entries(ROUTE_MAP)) {
    pathToRouteKey[info.path] = key as RouteKey
}
for (const [path, key] of Object.entries(ROUTE_PATH_ALIASES)) {
    pathToRouteKey[path] = key
}

/**
 * Resolve a pathname (e.g. "/erp/produtos" or "/erp/produtos/novo") to a RouteKey.
 * Supports exact match and prefix match (for subpages like /erp/produtos/[id]).
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

const storePermissions = withSpecific(full, { manage_members: true })
const storeViewOnly = withSpecific(viewOnly, { manage_members: false })

const OWNER_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: full,
    // Lojas e Filiais
    stores: storePermissions,
    stores_members: full,
    stores_settings: full,
    // Vendas
    orders: withSpecific(full, {
        can_cancel_order: true, can_refund: true, can_update_status: true,
        can_assign_delivery: true, can_view_values: true, can_apply_discount: true,
    }),
    returns: full,
    logistics: withSpecific(full, {
        can_update_delivery_status: true, can_assign_driver: true,
        can_print_label: true, can_generate_tracking: true,
    }),
    invoices: full,
    pos: withSpecific(full, { can_sell: true, can_discount: true, can_cancel_sale: true, can_add_delivery: true }),
    quotes: withSpecific(full, { can_apply_discount: true }),
    goals: full,
    // Produtos
    products: withSpecific(full, { can_adjust_stock: true, can_import_products: true, view_cost_price: true }),
    stock_movements: full,
    import_notes: withSpecific(full, { can_import_products: true }),
    xml_import: withSpecific(full, { can_import_products: true }),
    suppliers: full,
    cadastros_produtos: full,
    // Serviços
    appointments: withSpecific(full, {
        can_assign_technician: true, can_cancel_appointment: true,
        can_update_appointment_status: true,
    }),
    services: withSpecific(full, { can_change_service_price: true }),
    service_orders: withSpecific(full, {
        can_assign_technician: true, can_change_status: true,
        can_request_signature: true, can_generate_invoice: true,
    }),
    cadastros_services: full,
    // Clientes
    customers: withSpecific(full, { export: true }),
    // Financeiro
    financial_transactions: withSpecific(full, { can_approve_payment: true, can_view_reports: true, can_settle: true }),
    contas_a_pagar: withSpecific(full, { can_approve_payment: true, can_settle: true }),
    contas_a_receber: withSpecific(full, { can_approve_payment: true, can_settle: true }),
    cash_register: withSpecific(full, { can_open_cash: true, can_close_cash: true, can_manage_cash: true }),
    financial_dre: withSpecific(full, { can_view_dre: true }),
    cadastros_financeiro: full,
    reports: full,
    // Vitrine
    store_customize: withSpecific(full, { can_customize_store: true }),
    store_reviews: withSpecific(full, { can_respond_reviews: true }),
    // Marketing
    marketing_coupons: full,
    marketing_promotions: full,
    cadastros_marketing: full,
    recurring_plans: full,
    recurring_subscriptions: withSpecific(full, { can_advance_cycle: true }),
    community_videos: full,
    colecoes: full,
    // Configurações
    settings: full,
    settings_business: withSpecific(full, { can_edit_business_data: true }),
    settings_integrations: withSpecific(full, { can_manage_integrations: true }),
    settings_team: withSpecific(full, { can_invite: true, can_remove_member: true, can_revoke_invite: true, can_manage_team: true }),
    settings_subscription: withSpecific(full, { can_change_subscription: true }),
    // Produtividade - full
    productivity_overview: full,
    productivity_goals: full,
    productivity_commissions: withSpecific(full, { can_pay_commission: true }),
}

// ─── ADMIN: Operacional Completo (exceto nível societário) ──────────────────

const ADMIN_PERMISSIONS: PartnerRoutePermissions = {
    ...OWNER_PERMISSIONS,
    stores: withSpecific(crud, { manage_members: true }),
    // Admin: tudo operacional, exceto assinatura e integrações
    settings: full,
    settings_business: full,
    settings_integrations: noAccess,
    settings_team: withSpecific(full, { can_invite: true, can_remove_member: true, can_revoke_invite: true, can_manage_team: true }),
    settings_subscription: noAccess,
}

// ─── MANAGER (Gestor): Gestão Operacional ───────────────────────────────────

const MANAGER_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: full,
    // Lojas e Filiais
    stores: storeViewOnly,
    stores_members: viewOnly,
    stores_settings: viewOnly,
    // Vendas - full ops, can cancel and refund, but CANNOT hard delete orders
    orders: withSpecific(crud, {
        can_cancel_order: true, can_refund: true, can_update_status: true,
        can_assign_delivery: true, can_view_values: true, can_apply_discount: true,
    }),
    returns: full,
    logistics: withSpecific(full, {
        can_update_delivery_status: true, can_assign_driver: true,
        can_print_label: true, can_generate_tracking: true,
    }),
    invoices: full,
    pos: withSpecific(full, { can_sell: true, can_discount: true, can_cancel_sale: true, can_add_delivery: true }),
    quotes: withSpecific(full, { can_apply_discount: true }),
    goals: full,
    // Produtos - full
    products: withSpecific(full, { can_adjust_stock: true, can_import_products: true, view_cost_price: true }),
    stock_movements: full,
    import_notes: withSpecific(full, { can_import_products: true }),
    xml_import: withSpecific(full, { can_import_products: true }),
    suppliers: full,
    cadastros_produtos: full,
    // Serviços - full
    appointments: withSpecific(full, {
        can_assign_technician: true, can_cancel_appointment: true,
        can_update_appointment_status: true,
    }),
    services: withSpecific(full, { can_change_service_price: true }),
    service_orders: withSpecific(full, {
        can_assign_technician: true, can_change_status: true,
        can_request_signature: true, can_generate_invoice: true,
    }),
    cadastros_services: full,
    // Clientes - CRUD sem exclusão
    customers: withSpecific(crud, { export: true }),
    // Financeiro - pode visualizar e gerenciar pagamentos
    financial_transactions: withSpecific(full, { can_approve_payment: true, can_view_reports: true, can_settle: true }),
    contas_a_pagar: withSpecific(full, { can_approve_payment: true, can_settle: true }),
    contas_a_receber: withSpecific(full, { can_approve_payment: true, can_settle: true }),
    cash_register: withSpecific(full, { can_open_cash: true, can_close_cash: true, can_manage_cash: true }),
    financial_dre: withSpecific(viewOnly, { can_view_dre: true }),
    cadastros_financeiro: full,
    reports: full,
    // Vitrine
    store_customize: withSpecific(crud, { can_customize_store: true }),
    store_reviews: withSpecific(viewOnly, { can_respond_reviews: true }),
    // Marketing
    marketing_coupons: full,
    marketing_promotions: full,
    cadastros_marketing: full,
    recurring_plans: full,
    recurring_subscriptions: withSpecific(full, { can_advance_cycle: true }),
    community_videos: noAccess,
    colecoes: full,
    // Configurações (limitado): pode visualizar; sem assinatura/integrações
    settings: viewOnly,
    settings_business: viewOnly,
    settings_integrations: noAccess,
    settings_team: withSpecific(viewOnly, { can_invite: true, can_remove_member: false, can_revoke_invite: true, can_manage_team: true }),
    settings_subscription: noAccess,
    // Produtividade - full
    productivity_overview: full,
    productivity_goals: full,
    productivity_commissions: withSpecific(full, { can_pay_commission: true }),
}

// ─── OPERATOR: Operador ─────────────────────────────────────────────────────

const OPERATOR_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: viewOnly,
    // Lojas e Filiais
    stores: noAccess,
    stores_members: noAccess,
    stores_settings: noAccess,
    // Vendas - create/edit orders, update status, no cancel/refund
    orders: withSpecific(crud, {
        can_cancel_order: false, can_refund: false, can_update_status: true,
        can_assign_delivery: false, can_view_values: true, can_apply_discount: false,
    }),
    returns: viewOnly,
    logistics: viewOnly,
    invoices: viewOnly,
    pos: withSpecific(crud, { can_sell: true, can_discount: false, can_cancel_sale: false, can_add_delivery: true }),
    quotes: withSpecific(crud, { can_apply_discount: false }),
    goals: viewOnly,
    // Produtos - view only
    products: withSpecific(viewOnly, { can_adjust_stock: false, can_import_products: false, view_cost_price: false }),
    stock_movements: viewOnly,
    import_notes: noAccess,
    xml_import: withSpecific(viewOnly, { can_import_products: false }),
    suppliers: noAccess,
    cadastros_produtos: viewOnly,
    // Serviços - view only (cannot create/edit services)
    // Agendamentos - create/edit, update status, no cancel
    appointments: withSpecific(crud, {
        can_assign_technician: false, can_cancel_appointment: false,
        can_update_appointment_status: true,
    }),
    services: viewOnly,
    service_orders: withSpecific(crud, {
        can_assign_technician: false, can_change_status: true,
        can_request_signature: false, can_generate_invoice: false,
    }),
    cadastros_services: viewOnly,
    // Clientes - CRUD sem exclusão
    customers: withSpecific(crud, { export: false }),
    // Financeiro - no financial access for operator
    financial_transactions: noAccess,
    contas_a_pagar: noAccess,
    contas_a_receber: noAccess,
    cash_register: withSpecific(full, { can_open_cash: true, can_close_cash: true, can_manage_cash: true }),
    financial_dre: noAccess,
    cadastros_financeiro: noAccess,
    reports: noAccess,
    // Vitrine - no access
    store_customize: noAccess,
    store_reviews: noAccess,
    // Marketing - no access
    marketing_coupons: noAccess,
    marketing_promotions: noAccess,
    cadastros_marketing: noAccess,
    recurring_plans: viewOnly,
    recurring_subscriptions: viewOnly,
    community_videos: noAccess,
    colecoes: noAccess,
    // Config - no access
    settings: noAccess,
    settings_business: noAccess,
    settings_integrations: noAccess,
    settings_team: noAccess,
    settings_subscription: noAccess,
    // Produtividade - sem acesso
    productivity_overview: noAccess,
    productivity_goals: noAccess,
    productivity_commissions: noAccess,
}

// ─── DELIVERY: Entregador ───────────────────────────────────────────────────

const DELIVERY_PERMISSIONS: PartnerRoutePermissions = {
    dashboard: noAccess,
    // Lojas e Filiais
    stores: noAccess,
    stores_members: noAccess,
    stores_settings: noAccess,
    // Vendas
    orders: noAccess,
    returns: noAccess,
    logistics: withSpecific(viewOnly, {
        can_update_delivery_status: true, can_assign_driver: false,
        can_print_label: false, can_generate_tracking: false, can_view_delivery_details: true,
    }),
    invoices: noAccess,
    pos: withSpecific(noAccess, { can_sell: false, can_discount: false, can_cancel_sale: false, can_add_delivery: false }),
    quotes: noAccess,
    goals: noAccess,
    // Produtos - no access
    products: noAccess,
    stock_movements: noAccess,
    import_notes: noAccess,
    xml_import: noAccess,
    suppliers: noAccess,
    cadastros_produtos: noAccess,
    // Serviços - no access
    appointments: noAccess,
    services: noAccess,
    service_orders: noAccess,
    cadastros_services: noAccess,
    // Clientes - no access
    customers: noAccess,
    // Financeiro - no access
    financial_transactions: noAccess,
    contas_a_pagar: noAccess,
    contas_a_receber: noAccess,
    cash_register: noAccess,
    financial_dre: noAccess,
    cadastros_financeiro: noAccess,
    reports: noAccess,
    // Vitrine - no access
    store_customize: noAccess,
    store_reviews: noAccess,
    // Marketing - no access
    marketing_coupons: noAccess,
    marketing_promotions: noAccess,
    cadastros_marketing: noAccess,
    recurring_plans: noAccess,
    recurring_subscriptions: noAccess,
    community_videos: noAccess,
    colecoes: noAccess,
    // Config - no access
    settings: noAccess,
    settings_business: noAccess,
    settings_integrations: noAccess,
    settings_team: noAccess,
    settings_subscription: noAccess,
    // Produtividade - sem acesso
    productivity_overview: noAccess,
    productivity_goals: noAccess,
    productivity_commissions: noAccess,
}

// ─── Combined Presets ───────────────────────────────────────────────────────

export const ROUTE_PERMISSION_PRESETS: Record<PartnerRole, PartnerRoutePermissions> = {
    OWNER: OWNER_PERMISSIONS,
    ADMIN: ADMIN_PERMISSIONS,
    MANAGER: MANAGER_PERMISSIONS,
    OPERATOR: OPERATOR_PERMISSIONS,
    DELIVERY: DELIVERY_PERMISSIONS,
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

// ─── Permission Model Compatibility ─────────────────────────────────────────

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

    const orders = mapRoute("orders")
    const financial = mapRoute("financial_transactions")
    const cashRegister = mapRoute("cash_register")
    const logistics = mapRoute("logistics")
    const pos = mapRoute("pos")

    return {
        stores: {
            view: routePerms.stores?.access ?? false,
            create: routePerms.stores?.create ?? false,
            edit: routePerms.stores?.edit ?? false,
            delete: routePerms.stores?.delete ?? false,
            manage_members: hasSpecificPermission(routePerms, "stores", "manage_members"),
        },
        orders: {
            view: orders.view,
            create: orders.create,
            edit: orders.edit,
            delete: orders.delete,
            cancel: hasSpecificPermission(routePerms, "orders", "can_cancel_order"),
            can_apply_discount: hasSpecificPermission(routePerms, "orders", "can_apply_discount"),
            can_add_delivery: hasSpecificPermission(routePerms, "pos", "can_add_delivery") || hasSpecificPermission(routePerms, "orders", "can_assign_delivery"),
            delete_cancel: orders.delete,
            can_refund: hasSpecificPermission(routePerms, "orders", "can_refund") || routePerms.returns?.access || false,
            list: orders.view,
        },
        appointments: {
            view: routePerms.appointments?.access ?? false,
            create: routePerms.appointments?.create ?? false,
            edit: routePerms.appointments?.edit ?? false,
            delete: routePerms.appointments?.delete ?? false,
        },
        customers: {
            ...mapRoute("customers"),
            export: hasSpecificPermission(routePerms, "customers", "export"),
        },
        products: {
            ...mapRoute("products"),
            view_cost_price: hasSpecificPermission(routePerms, "products", "view_cost_price"),
        },
        pdv: {
            view: pos.view,
            sell: hasSpecificPermission(routePerms, "pos", "can_sell") || pos.create || pos.edit,
            open_pdv: hasSpecificPermission(routePerms, "cash_register", "can_open_cash"),
            close_pdv: hasSpecificPermission(routePerms, "cash_register", "can_close_cash"),
            sangria: hasSpecificPermission(routePerms, "cash_register", "can_manage_cash"),
            reforco: hasSpecificPermission(routePerms, "cash_register", "can_manage_cash"),
            can_apply_discount: hasSpecificPermission(routePerms, "pos", "can_discount"),
            can_add_delivery: hasSpecificPermission(routePerms, "pos", "can_add_delivery"),
        },
        cash_register: {
            view: cashRegister.view,
            open_close: cashRegister.create || hasSpecificPermission(routePerms, "cash_register", "can_open_cash") || hasSpecificPermission(routePerms, "cash_register", "can_close_cash"),
            manage: cashRegister.edit,
        },
        services: mapRoute("services"),
        service_orders: {
            ...mapRoute("service_orders"),
            can_assign_technician: hasSpecificPermission(routePerms, "service_orders", "can_assign_technician"),
            can_change_status: hasSpecificPermission(routePerms, "service_orders", "can_change_status"),
            can_generate_invoice: hasSpecificPermission(routePerms, "service_orders", "can_generate_invoice"),
        },
        quotes: {
            ...mapRoute("quotes"),
            can_apply_discount: hasSpecificPermission(routePerms, "quotes", "can_apply_discount"),
        },
        stock_movements: {
            view: mapRoute("stock_movements").view,
            create: mapRoute("stock_movements").create,
            undo: mapRoute("stock_movements").delete,
        },
        financial: {
            view: financial.view,
            create: financial.create,
            edit: financial.edit,
            cancel: hasSpecificPermission(routePerms, "financial_transactions", "can_cancel"),
            can_settle: hasSpecificPermission(routePerms, "financial_transactions", "can_settle"),
        },
        categories: mapRoute("cadastros_produtos"),
        coupons: mapRoute("marketing_coupons"), // both coupons and promotions map to legacy coupons for compatibility
        goals: mapRoute("goals"),
        reports: {
            view_basic: mapRoute("reports").view,
            view_advanced: mapRoute("financial_dre").view,
        },
        delivery: {
            view: logistics.view,
            create: logistics.create,
            edit: logistics.edit,
            update_status: hasSpecificPermission(routePerms, "logistics", "can_update_delivery_status"),
        },
        recurring_plans: {
            view: routePerms.recurring_plans?.access ?? false,
            manage: routePerms.recurring_plans?.edit ?? routePerms.recurring_plans?.create ?? false,
        },
        recurring_subscriptions: {
            view: routePerms.recurring_subscriptions?.access ?? false,
            manage: routePerms.recurring_subscriptions?.edit ?? routePerms.recurring_subscriptions?.create ?? false,
            can_advance_cycle: Boolean(routePerms.recurring_subscriptions?.specific?.can_advance_cycle),
        },
        team: mapRoute("settings_team"),
        dashboard: { view: mapRoute("dashboard").view },
        settings: {
            view: mapRoute("settings").view,
            settings_negocio: mapRoute("settings_business").view,
            settings_team: mapRoute("settings_team").view,
            settings_plan: mapRoute("settings_subscription").view,
            settings_payments: mapRoute("settings").view,
            settings_comissions: mapRoute("settings").view,
            settings_returns: mapRoute("returns").view,
            settings_vitrine: mapRoute("store_customize").view,
            settings_os: mapRoute("service_orders").view,
            settings_messages: mapRoute("settings").view,
            settings_delivery: mapRoute("logistics").view,
            settings_integrations: mapRoute("settings_integrations").view,
            settings_system: mapRoute("settings").view,
            settings_resources: mapRoute("settings").view,
            settings_logs: mapRoute("settings").view,
        },
        cadastros_categories: mapRoute("cadastros_produtos"),
        specific: {
            settings_plan: mapRoute("settings_subscription").view,
            settings_comissions: mapRoute("settings").view,
            settings_integrations: mapRoute("settings_integrations").view,
            can_apply_discount: hasSpecificPermission(routePerms, "pos", "can_discount"),
            can_add_delivery: hasSpecificPermission(routePerms, "pos", "can_add_delivery"),
        },
        settings_negocio: { edit: hasSpecificPermission(routePerms, "settings_business", "can_edit_business_data") },
        settings_team: {
            invite: hasSpecificPermission(routePerms, "settings_team", "can_invite"),
            edit: hasSpecificPermission(routePerms, "settings_team", "can_manage_team"),
            remove: hasSpecificPermission(routePerms, "settings_team", "can_remove_member"),
            revoke_invite: hasSpecificPermission(routePerms, "settings_team", "can_revoke_invite"),
        },
        settings_plans: { change_plan: hasSpecificPermission(routePerms, "settings_subscription", "can_change_subscription") },
        payment_methods: {
            create: routePerms.settings?.create ?? false,
            edit: routePerms.settings?.edit ?? false,
            delete: routePerms.settings?.delete ?? false,
        },
        settings_comissions: { edit: routePerms.settings?.edit ?? false },
        suppliers: mapRoute("suppliers"),
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

    const apply = (routeKey: RouteKey, patch: Partial<RoutePermissions>) => {
        base[routeKey] = {
            ...base[routeKey],
            ...patch,
            specific: {
                ...(base[routeKey]?.specific || {}),
                ...(patch.specific || {}),
            },
        }
    }

    if (legacy.products) {
        const mapped = mapLegacy(legacy.products)
            ;["products", "stock_movements", "import_notes", "xml_import", "cadastros_produtos", "suppliers"].forEach((routeKey) =>
                apply(routeKey as RouteKey, mapped)
            )
        if (legacy.products.view_cost_price !== undefined) {
            base.products.specific = {
                ...(base.products?.specific || {}),
                view_cost_price: legacy.products.view_cost_price,
            }
        }
    }

    if (legacy.services) {
        const mapped = mapLegacy(legacy.services)
            ;["appointments", "services", "service_orders", "cadastros_services"].forEach((routeKey) =>
                apply(routeKey as RouteKey, mapped)
            )
    }

    if (legacy.service_orders) {
        apply("service_orders", {
            ...mapLegacy(legacy.service_orders),
            specific: {
                ...(base.service_orders?.specific || {}),
                can_assign_technician: legacy.service_orders.can_assign_technician ?? false,
                can_change_status: legacy.service_orders.can_change_status ?? false,
                can_generate_invoice: legacy.service_orders.can_generate_invoice ?? false,
            },
        })
    }

    if (legacy.orders) {
        const mapped: RoutePermissions = {
            access: role === "DELIVERY" ? false : legacy.orders.view,
            create: legacy.orders.create,
            edit: legacy.orders.edit,
            delete: legacy.orders.delete ?? legacy.orders.delete_cancel ?? false,
        }
        const routes = ["orders", "returns", "invoices"] as RouteKey[]
        routes.forEach((routeKey) => {
            apply(routeKey, mapped)
            if (routeKey === "orders" && legacy.orders.can_apply_discount !== undefined) {
                base[routeKey].specific = {
                    ...(base[routeKey]?.specific || {}),
                    can_apply_discount: legacy.orders.can_apply_discount,
                }
            }
            if (routeKey === "orders" && legacy.orders.can_add_delivery !== undefined) {
                base[routeKey].specific = {
                    ...(base[routeKey]?.specific || {}),
                    can_assign_delivery: legacy.orders.can_add_delivery,
                }
            }
        })
    }

    if (legacy.delivery) {
        apply("logistics", {
            access: legacy.delivery.view,
            create: legacy.delivery.create,
            edit: legacy.delivery.edit,
            specific: {
                can_update_delivery_status: legacy.delivery.update_status,
                can_view_delivery_details: legacy.delivery.view,
            },
        })
    }

    if (legacy.pdv) {
        apply("pos", {
            access: legacy.pdv.view,
            create: legacy.pdv.sell,
            edit: legacy.pdv.sell,
            specific: {
                can_sell: legacy.pdv.sell,
                can_discount: legacy.pdv.can_apply_discount ?? legacy.specific?.can_apply_discount ?? false,
                can_add_delivery: legacy.pdv.can_add_delivery ?? legacy.specific?.can_add_delivery ?? false,
            },
        })
        if (legacy.pdv.open_pdv !== undefined || legacy.pdv.close_pdv !== undefined ||
            legacy.pdv.sangria !== undefined || legacy.pdv.reforco !== undefined) {
            base.cash_register.specific = {
                ...(base.cash_register?.specific || {}),
                ...(legacy.pdv.open_pdv !== undefined && { can_open_cash: legacy.pdv.open_pdv }),
                ...(legacy.pdv.close_pdv !== undefined && { can_close_cash: legacy.pdv.close_pdv }),
                ...(legacy.pdv.sangria !== undefined && { can_manage_cash: legacy.pdv.sangria }),
            }
        }
    }

    if (legacy.quotes) {
        apply("quotes", mapLegacy(legacy.quotes))
        if (legacy.quotes.can_apply_discount !== undefined) {
            base.quotes.specific = {
                ...(base.quotes?.specific || {}),
                can_apply_discount: legacy.quotes.can_apply_discount,
            }
        }
    }
    if (legacy.goals) apply("goals", mapLegacy(legacy.goals))
    if (legacy.stores) {
        apply("stores", {
            access: legacy.stores.view,
            create: legacy.stores.create,
            edit: legacy.stores.edit,
            delete: legacy.stores.delete,
            specific: { manage_members: legacy.stores.manage_members },
        })
        apply("stores_members", { access: legacy.stores.manage_members })
        apply("stores_settings", { access: legacy.stores.edit || legacy.stores.view })
    }

    if (legacy.productivity) {
        apply("productivity_overview", { access: legacy.productivity.view })
        apply("productivity_goals", {
            access: legacy.productivity.goals_view,
            create: legacy.productivity.goals_manage,
            edit: legacy.productivity.goals_manage,
            specific: { can_manage: legacy.productivity.goals_manage },
        })
        apply("productivity_commissions", {
            access: legacy.productivity.commissions_view,
            specific: { can_pay_commission: legacy.productivity.commissions_manage },
        })
    }
    if (legacy.customers) {
        apply("customers", {
            ...mapLegacy(legacy.customers),
            access: role === "DELIVERY" ? false : legacy.customers.view,
            specific: {
                ...(base.customers?.specific || {}),
                export: legacy.customers.export ?? false,
            },
        })
    }

    if (legacy.financial) {
        const mapped: RoutePermissions = {
            access: legacy.financial.view,
            create: legacy.financial.create,
            edit: legacy.financial.edit,
            delete: false,
            specific: {
                can_cancel: legacy.financial.cancel ?? false,
                can_settle: legacy.financial.can_settle ?? false,
            },
        }
            ;["financial_transactions", "contas_a_pagar", "contas_a_receber", "cadastros_financeiro"].forEach((routeKey) => apply(routeKey as RouteKey, mapped))
    }

    if (legacy.cash_register) {
        apply("cash_register", {
            access: legacy.cash_register.view,
            create: legacy.cash_register.open_close,
            edit: legacy.cash_register.manage,
            specific: {
                can_open_cash: legacy.cash_register.open_close,
                can_close_cash: legacy.cash_register.open_close,
            },
        })
    }

    if (legacy.coupons) {
        apply("marketing_coupons", mapLegacy(legacy.coupons))
        apply("marketing_promotions", mapLegacy(legacy.coupons))
    }

    if (legacy.recurring_plans) {
        apply("recurring_plans", {
            access: legacy.recurring_plans.view,
            create: legacy.recurring_plans.manage,
            edit: legacy.recurring_plans.manage,
            delete: legacy.recurring_plans.manage,
        })
    }
    if (legacy.recurring_subscriptions) {
        apply("recurring_subscriptions", {
            access: legacy.recurring_subscriptions.view,
            create: legacy.recurring_subscriptions.manage,
            edit: legacy.recurring_subscriptions.manage,
            delete: legacy.recurring_subscriptions.manage,
            specific: { can_advance_cycle: Boolean(legacy.recurring_subscriptions.can_advance_cycle) },
        })
    }
    if (legacy.categories) apply("cadastros_produtos", mapLegacy(legacy.categories))
    if (legacy.cadastros_categories) apply("cadastros_produtos", mapLegacy(legacy.cadastros_categories))

    if (legacy.reports) {
        apply("financial_dre", { access: legacy.reports.view_advanced, specific: { can_view_dre: legacy.reports.view_advanced } })
        apply("reports", { access: legacy.reports.view_basic || legacy.reports.view_advanced })
    }

    if (legacy.team) {
        apply("settings_team", {
            access: legacy.team.view,
            create: legacy.team.create,
            edit: legacy.team.edit,
            delete: legacy.team.delete,
            specific: {
                can_invite: legacy.team.create,
                can_remove_member: legacy.team.delete,
                can_manage_team: legacy.team.edit,
            },
        })
    }

    if (legacy.settings) {
        apply("settings", { access: legacy.settings.view })
        apply("settings_business", { access: legacy.settings.settings_negocio })
        apply("settings_team", { access: legacy.settings.settings_team })
        apply("settings_subscription", { access: legacy.settings.settings_plan })
        apply("settings_integrations", { access: legacy.settings.settings_integrations })
    }

    if (legacy.specific) {
        apply("settings_subscription", { access: legacy.specific.settings_plan })
        apply("settings_integrations", { access: legacy.specific.settings_integrations })
    }

    return base
}

function isRoutePermissionEntry(value: unknown): value is RoutePermissions {
    if (!value || typeof value !== "object") return false
    const maybe = value as Record<string, unknown>
    return typeof maybe.access === "boolean"
}

function isLegacyResourceEntry(value: unknown): value is ResourcePermissions {
    if (!value || typeof value !== "object") return false
    const maybe = value as Record<string, unknown>
    return (
        typeof maybe.view === "boolean" &&
        typeof maybe.create === "boolean" &&
        typeof maybe.edit === "boolean" &&
        typeof maybe.delete === "boolean"
    )
}

export function isRoutePermissionsShape(value: unknown): value is Partial<PartnerRoutePermissions> {
    if (!value || typeof value !== "object") return false
    return (Object.keys(ROUTE_MAP) as RouteKey[]).some((key) => isRoutePermissionEntry((value as Record<string, unknown>)[key]))
}

export function isLegacyPermissionsShape(value: unknown): value is Partial<PartnerPermissions> {
    if (!value || typeof value !== "object") return false
    const v = value as Record<string, unknown>
    return (
        isLegacyResourceEntry(v.products) ||
        isLegacyResourceEntry(v.services) ||
        isLegacyResourceEntry(v.customers) ||
        isLegacyResourceEntry(v.quotes) ||
        isLegacyResourceEntry(v.coupons) ||
        isLegacyResourceEntry(v.goals) ||
        (typeof v.orders === "object" && v.orders !== null && typeof (v.orders as any).delete_cancel === "boolean") ||
        (typeof v.pdv === "object" && v.pdv !== null && typeof (v.pdv as any).sell === "boolean") ||
        (typeof v.delivery === "object" && v.delivery !== null && typeof (v.delivery as any).update_status === "boolean")
    )
}

/**
 * Normalize whatever is stored in DB (`partner_users.permissions`) into route permissions.
 * Accepts route-based JSON, legacy category JSON, partial objects, or null.
 */
export function normalizeToRoutePermissions(role: PartnerRole, stored: unknown): PartnerRoutePermissions {
    const base = { ...ROUTE_PERMISSION_PRESETS[role] }

    if (!stored || typeof stored !== "object") return base

    if (isRoutePermissionsShape(stored)) {
        const patch = stored as Record<string, RoutePermissions>
        for (const key of Object.keys(ROUTE_MAP) as RouteKey[]) {
            const incoming = patch[key]
            if (!incoming || typeof incoming.access !== "boolean") continue
            base[key] = {
                ...base[key],
                ...incoming,
                specific: {
                    ...(base[key]?.specific || {}),
                    ...(incoming.specific || {}),
                },
            }
        }
        return base
    }

    if (isLegacyPermissionsShape(stored)) {
        return legacyToRoutePermissions(stored as PartnerPermissions, role)
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

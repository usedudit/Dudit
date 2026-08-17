import type { PartnerRole, PartnerPermissions, ResourcePermissions } from "./types"

// ─── Role Hierarchy (higher number = more privilege) ────────────────────────

export const ROLE_HIERARCHY: Record<PartnerRole, number> = {
    OWNER: 5,
    ADMIN: 4,
    MANAGER: 3,
    OPERATOR: 2,
    DELIVERY: 1,
}

export const ALL_ROLES: PartnerRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "DELIVERY"]

// ─── Role Display Labels (pt-BR) ───────────────────────────────────────────

export const ROLE_LABELS: Record<PartnerRole, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    MANAGER: "Gestor",
    OPERATOR: "Operador",
    DELIVERY: "Entregador",
}

export const ROLE_DESCRIPTIONS: Record<PartnerRole, string> = {
    OWNER: "Controle absoluto do sistema. Pode excluir loja, transferir propriedade e alterar assinatura.",
    ADMIN: "Acesso operacional completo, exceto plano/assinatura e integrações.",
    MANAGER: "Controla operação. Pode gerir equipe abaixo do próprio cargo.",
    OPERATOR: "Executa o dia a dia: pedidos, agenda e atendimento.",
    DELIVERY: "Atualiza entregas e acompanha rotas/pedidos atribuídos.",
}

// ─── Permission Presets (DB Canonical Model) ────────────────────────────────

const crudFull: ResourcePermissions = { view: true, create: true, edit: true, delete: true }
const crudNoDelete: ResourcePermissions = { view: true, create: true, edit: true, delete: false }
const crudViewOnly: ResourcePermissions = { view: true, create: false, edit: false, delete: false }
const crudNone: ResourcePermissions = { view: false, create: false, edit: false, delete: false }

const settingsNone = {
    view: false, settings_negocio: false, settings_team: false, settings_plan: false,
    settings_payments: false, settings_comissions: false, settings_returns: false,
    settings_vitrine: false, settings_os: false, settings_messages: false,
    settings_delivery: false, settings_integrations: false,
    settings_system: false, settings_resources: false, settings_logs: false,
}

const fullPdv = {
    view: true, sell: true, open_pdv: true, close_pdv: true, sangria: true, reforco: true, can_apply_discount: true, can_add_delivery: true,
}

const recurringFull = { view: true, manage: true }
const recurringViewOnly = { view: true, manage: false }
const recurringNone = { view: false, manage: false }

const storesFull = { view: true, create: true, edit: true, delete: true, manage_members: true }
const storesOperational = { view: true, create: true, edit: true, delete: false, manage_members: true }
const storesViewOnly = { view: true, create: false, edit: false, delete: false, manage_members: false }
const storesNone = { view: false, create: false, edit: false, delete: false, manage_members: false }

export const PERMISSION_PRESETS: Record<PartnerRole, PartnerPermissions> = {
    OWNER: {
        stores: storesFull,
        orders: { view: true, create: true, edit: true, delete: true, cancel: true, can_apply_discount: true, can_add_delivery: true, delete_cancel: true },
        appointments: { view: true, create: true, edit: true, delete: true },
        customers: crudFull,
        products: crudFull,
        stock_movements: { view: true, create: true, undo: true },
        pdv: fullPdv,
        services: crudFull,
        quotes: { ...crudFull, can_apply_discount: true },
        financial: { view: true, create: true, edit: true, cancel: true },
        categories: crudFull,
        coupons: crudFull,
        goals: crudFull,
        reports: { view_basic: true, view_advanced: true },
        dashboard: { view: true },
        delivery: { view: true, create: true, edit: true, update_status: true },
        recurring_plans: recurringFull,
        recurring_subscriptions: recurringFull,
        settings: {
            view: true, settings_negocio: true, settings_team: true, settings_plan: true, settings_payments: true, settings_comissions: true,
            settings_returns: true, settings_vitrine: true, settings_os: true, settings_messages: true, settings_delivery: true, settings_integrations: true,
            settings_system: true, settings_resources: true, settings_logs: true,
        },
        settings_negocio: { edit: true },
        settings_team: { invite: true, edit: true, remove: true, revoke_invite: true },
        settings_plans: { change_plan: true },
        payment_methods: { create: true, edit: true, delete: true },
        settings_comissions: { edit: true },
        suppliers: crudFull,
    },
    ADMIN: {
        stores: storesOperational,
        orders: { view: true, create: true, edit: true, delete: true, cancel: true, can_apply_discount: true, can_add_delivery: true, delete_cancel: true },
        appointments: { view: true, create: true, edit: true, delete: true },
        customers: crudFull,
        products: crudFull,
        stock_movements: { view: true, create: true, undo: true },
        pdv: fullPdv,
        services: crudFull,
        quotes: { ...crudFull, can_apply_discount: true },
        financial: { view: true, create: true, edit: true, cancel: true },
        categories: crudFull,
        coupons: crudFull,
        goals: crudFull,
        reports: { view_basic: true, view_advanced: true },
        dashboard: { view: true },
        delivery: { view: true, create: true, edit: true, update_status: true },
        recurring_plans: recurringFull,
        recurring_subscriptions: recurringFull,
        settings: {
            view: true, settings_negocio: true, settings_team: true, settings_plan: false, settings_payments: true, settings_comissions: true,
            settings_returns: true, settings_vitrine: true, settings_os: true, settings_messages: true, settings_delivery: true, settings_integrations: false,
            settings_system: true, settings_resources: true, settings_logs: true,
        },
        settings_negocio: { edit: true },
        settings_team: { invite: true, edit: true, remove: true, revoke_invite: true },
        settings_plans: { change_plan: false },
        payment_methods: { create: true, edit: true, delete: true },
        settings_comissions: { edit: true },
        suppliers: crudFull,
    },
    MANAGER: {
        stores: storesViewOnly,
        orders: { view: true, create: true, edit: true, delete: true, cancel: true, can_apply_discount: true, can_add_delivery: true, delete_cancel: true },
        appointments: { view: true, create: true, edit: true, delete: true },
        customers: crudFull,
        products: crudFull,
        stock_movements: { view: true, create: true, undo: true },
        pdv: fullPdv,
        services: crudFull,
        quotes: { ...crudFull, can_apply_discount: true },
        financial: { view: true, create: true, edit: true, cancel: true },
        categories: crudFull,
        coupons: crudFull,
        goals: crudFull,
        reports: { view_basic: true, view_advanced: false },
        dashboard: { view: true },
        delivery: { view: true, create: true, edit: true, update_status: true },
        recurring_plans: recurringFull,
        recurring_subscriptions: recurringFull,
        settings: {
            view: true, settings_negocio: true, settings_team: false, settings_plan: false, settings_payments: false, settings_comissions: false,
            settings_returns: true, settings_vitrine: false, settings_os: true, settings_messages: true, settings_delivery: false, settings_integrations: false,
            settings_system: false, settings_resources: false, settings_logs: false,
        },
        settings_negocio: { edit: false },
        settings_team: { invite: false, edit: true, remove: false, revoke_invite: false },
        settings_plans: { change_plan: false },
        payment_methods: { create: false, edit: false, delete: false },
        settings_comissions: { edit: false },
        suppliers: crudFull,
    },
    OPERATOR: {
        stores: storesNone,
        orders: { view: true, create: true, edit: true, delete: false, cancel: false, can_apply_discount: false, can_add_delivery: true, delete_cancel: false },
        appointments: { view: true, create: true, edit: true, delete: false },
        customers: crudNoDelete,
        products: crudViewOnly,
        stock_movements: { view: true, create: false, undo: false },
        pdv: { view: true, sell: true, open_pdv: true, close_pdv: true, sangria: false, reforco: false, can_apply_discount: false, can_add_delivery: true },
        services: crudViewOnly,
        quotes: { ...crudNoDelete, can_apply_discount: false },
        financial: { view: false, create: false, edit: false, cancel: false },
        categories: crudViewOnly,
        coupons: crudNone,
        goals: crudNone,
        reports: { view_basic: false, view_advanced: false },
        dashboard: { view: true },
        delivery: { view: true, create: false, edit: false, update_status: true },
        recurring_plans: recurringViewOnly,
        recurring_subscriptions: recurringViewOnly,
        settings: settingsNone,
        settings_negocio: { edit: false },
        settings_team: { invite: false, edit: false, remove: false, revoke_invite: false },
        settings_plans: { change_plan: false },
        payment_methods: { create: false, edit: false, delete: false },
        settings_comissions: { edit: false },
        suppliers: crudNone,
    },
    DELIVERY: {
        stores: storesNone,
        orders: { view: true, create: false, edit: false, delete: false, cancel: false, can_apply_discount: false, can_add_delivery: false, delete_cancel: false },
        appointments: { view: false, create: false, edit: false, delete: false },
        customers: crudViewOnly,
        products: crudNone,
        stock_movements: { view: false, create: false, undo: false },
        pdv: { view: false, sell: false, open_pdv: false, close_pdv: false, sangria: false, reforco: false, can_apply_discount: false, can_add_delivery: false },
        services: crudNone,
        quotes: { ...crudNone, can_apply_discount: false },
        financial: { view: false, create: false, edit: false, cancel: false },
        categories: crudNone,
        coupons: crudNone,
        goals: crudNone,
        reports: { view_basic: false, view_advanced: false },
        dashboard: { view: true },
        delivery: { view: true, create: false, edit: false, update_status: true },
        recurring_plans: recurringNone,
        recurring_subscriptions: recurringNone,
        settings: settingsNone,
        settings_negocio: { edit: false },
        settings_team: { invite: false, edit: false, remove: false, revoke_invite: false },
        settings_plans: { change_plan: false },
        payment_methods: { create: false, edit: false, delete: false },
        settings_comissions: { edit: false },
        suppliers: crudNone,
    },
}

// ─── Role Authority Functions ───────────────────────────────────────────────

/**
 * Determines if a user with `inviterRole` can invite someone as `targetRole`.
 *
 * Rules:
 * - OWNER → can invite ADMIN, MANAGER, OPERATOR, DELIVERY
 * - ADMIN → can invite ADMIN, MANAGER, OPERATOR, DELIVERY (not OWNER)
 * - MANAGER → can invite OPERATOR, DELIVERY only
 * - OPERATOR / DELIVERY → cannot invite anyone
 */
export function canUserInviteRole(inviterRole: PartnerRole, targetRole: PartnerRole): boolean {
    // OWNER is exclusive, never invite-able
    if (targetRole === "OWNER") return false

    const inviterLevel = ROLE_HIERARCHY[inviterRole]
    const targetLevel = ROLE_HIERARCHY[targetRole]

    // Only OWNER, ADMIN, MANAGER can invite
    if (inviterLevel < ROLE_HIERARCHY.MANAGER) return false

    // OWNER can invite anyone except OWNER
    if (inviterRole === "OWNER") return true

    // ADMIN can invite ADMIN/MANAGER/OPERATOR/DELIVERY
    if (inviterRole === "ADMIN") return true

    // MANAGER can only invite OPERATOR or DELIVERY
    if (inviterRole === "MANAGER") return targetLevel < ROLE_HIERARCHY.MANAGER

    return false
}

/**
 * Returns the list of roles a user with `inviterRole` can invite.
 */
export function getAllowedInviteRoles(inviterRole: PartnerRole): PartnerRole[] {
    return ALL_ROLES.filter((r) => canUserInviteRole(inviterRole, r))
}

/**
 * Determines if a user with `actorRole` can modify the role/permissions
 * of a user with `targetRole`.
 *
 * Prevents privilege escalation: you can only modify users with
 * strictly lower privilege than yourself.
 */
export function canModifyUser(actorRole: PartnerRole, targetRole: PartnerRole): boolean {
    return ROLE_HIERARCHY[actorRole] > ROLE_HIERARCHY[targetRole]
}

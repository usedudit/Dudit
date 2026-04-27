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

export const PERMISSION_PRESETS: Record<PartnerRole, PartnerPermissions> = {
    OWNER: {
        orders: { view: true, create: true, edit: true, delete_cancel: true },
        appointments: crudFull,
        customers: crudFull,
        products: crudFull,
        pdv: { view: true, sell: true },
        cash_register: { view: true, open_close: true, manage: true },
        services: crudFull,
        quotes: crudFull,
        financial: { view: true, create: true, edit: true },
        cadastros_categories: crudFull,
        coupons: crudFull,
        goals: crudFull,
        reports: { view_basic: true, view_advanced: true },
        delivery: { view: true, create: true, edit: true, update_status: true },
        team: crudFull,
        settings: { view: true, edit: true },
        specific: {
            settings_plan: true,
            settings_comissions: true,
            settings_integrations: true,
            can_apply_discount: true,
        },
        suppliers: crudFull,
    },
    ADMIN: {
        orders: { view: true, create: true, edit: true, delete_cancel: true },
        appointments: crudFull,
        customers: crudFull,
        products: crudFull,
        pdv: { view: true, sell: true },
        cash_register: { view: true, open_close: true, manage: true },
        services: crudFull,
        quotes: crudFull,
        financial: { view: true, create: true, edit: true },
        cadastros_categories: crudNoDelete,
        coupons: crudNoDelete,
        goals: crudNoDelete,
        reports: { view_basic: true, view_advanced: true },
        delivery: { view: true, create: true, edit: true, update_status: true },
        team: crudNoDelete,
        settings: { view: true, edit: true },
        specific: {
            settings_plan: false,
            settings_comissions: true,
            settings_integrations: false,
            can_apply_discount: true,
        },
        suppliers: crudFull,
    },
    MANAGER: {
        orders: { view: true, create: true, edit: true, delete_cancel: false },
        appointments: crudNoDelete,
        customers: crudNoDelete,
        products: crudNoDelete,
        pdv: { view: true, sell: true },
        cash_register: { view: true, open_close: true, manage: true },
        services: crudNoDelete,
        quotes: crudNoDelete,
        financial: { view: true, create: true, edit: true },
        cadastros_categories: crudNoDelete,
        coupons: crudNoDelete,
        goals: crudNoDelete,
        reports: { view_basic: true, view_advanced: false },
        delivery: { view: true, create: true, edit: true, update_status: true },
        team: crudNoDelete,
        settings: { view: true, edit: false },
        specific: {
            settings_plan: false,
            settings_comissions: true,
            settings_integrations: false,
            can_apply_discount: true,
        },
        suppliers: crudNoDelete,
    },
    OPERATOR: {
        orders: { view: true, create: true, edit: true, delete_cancel: false },
        appointments: crudNoDelete,
        customers: crudNoDelete,
        products: crudViewOnly,
        pdv: { view: true, sell: false },
        cash_register: { view: true, open_close: false, manage: false },
        services: crudViewOnly,
        quotes: crudNoDelete,
        financial: { view: false, create: false, edit: false },
        cadastros_categories: crudViewOnly,
        coupons: crudNoDelete,
        goals: crudNoDelete,
        reports: { view_basic: false, view_advanced: false },
        delivery: { view: true, create: false, edit: false, update_status: false },
        team: crudNone,
        settings: { view: false, edit: false },
        specific: {
            settings_plan: false,
            settings_comissions: false,
            settings_integrations: false,
            can_apply_discount: false,
        },
        suppliers: crudNone,
    },
    DELIVERY: {
        orders: { view: false, create: false, edit: false, delete_cancel: false },
        appointments: crudNone,
        customers: crudNone,
        products: crudNone,
        pdv: { view: false, sell: false },
        cash_register: { view: false, open_close: false, manage: false },
        services: crudNone,
        quotes: crudNone,
        financial: { view: false, create: false, edit: false },
        cadastros_categories: crudNone,
        coupons: crudNone,
        goals: crudNone,
        reports: { view_basic: false, view_advanced: false },
        delivery: { view: true, create: false, edit: false, update_status: true },
        team: crudNone,
        settings: { view: false, edit: false },
        specific: {
            settings_plan: false,
            settings_comissions: false,
            settings_integrations: false,
            can_apply_discount: false,
        },
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

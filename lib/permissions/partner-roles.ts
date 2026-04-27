import type { PartnerRole, PartnerPermissions } from "./types"

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

// ─── Permission Presets (Legacy CRUD) ───────────────────────────────────────

const fullAccess = { view: true, create: true, edit: true, delete: true }
const editAccess = { view: true, create: true, edit: true, delete: false }
const viewOnly = { view: true, create: false, edit: false, delete: false }
const noAccess = { view: false, create: false, edit: false, delete: false }

export const PERMISSION_PRESETS: Record<PartnerRole, PartnerPermissions> = {
    OWNER: {
        products: fullAccess,
        services: fullAccess,
        orders: fullAccess,
        financial: fullAccess,
        customers: fullAccess,
        suppliers: fullAccess,
        quotes: fullAccess,
    },
    ADMIN: {
        products: fullAccess,
        services: fullAccess,
        orders: fullAccess,
        financial: fullAccess,
        customers: fullAccess,
        suppliers: fullAccess,
        quotes: fullAccess,
    },
    MANAGER: {
        products: fullAccess,
        services: fullAccess,
        orders: fullAccess,
        financial: editAccess,
        customers: fullAccess,
        suppliers: fullAccess,
        quotes: fullAccess,
    },
    OPERATOR: {
        products: viewOnly,
        services: viewOnly,
        orders: editAccess,
        financial: noAccess,
        customers: viewOnly,
        suppliers: noAccess,
        quotes: editAccess,
    },
    DELIVERY: {
        products: noAccess,
        services: noAccess,
        orders: viewOnly,
        financial: noAccess,
        customers: viewOnly,
        suppliers: noAccess,
        quotes: noAccess,
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

import type { PartnerRole, PartnerPermissions } from "./types"

// ─── Role Hierarchy (higher number = more privilege) ────────────────────────

export const ROLE_HIERARCHY: Record<PartnerRole, number> = {
    OWNER: 6,
    ADMIN: 5,
    MANAGER: 4,
    OPERATOR: 3,
    DELIVERY: 2,
    VIEWER: 1,
}

export const ALL_ROLES: PartnerRole[] = ["OWNER", "ADMIN", "MANAGER", "OPERATOR", "DELIVERY", "VIEWER"]

// ─── Role Display Labels (pt-BR) ───────────────────────────────────────────

export const ROLE_LABELS: Record<PartnerRole, string> = {
    OWNER: "Proprietário",
    ADMIN: "Administrador",
    MANAGER: "Gerente",
    OPERATOR: "Atendente",
    DELIVERY: "Entregador",
    VIEWER: "Visualizador",
}

export const ROLE_DESCRIPTIONS: Record<PartnerRole, string> = {
    OWNER: "Controle absoluto do sistema. Pode excluir loja, transferir propriedade e alterar assinatura.",
    ADMIN: "Braço direito do proprietário. Acesso operacional completo, exceto ações societárias.",
    MANAGER: "Gestão operacional diária. Gerencia equipe, pedidos, produtos e serviços.",
    OPERATOR: "Operação cotidiana. Cria pedidos, atende clientes e gerencia agendamentos.",
    DELIVERY: "Perfil logístico restrito. Atualiza status de entrega dos pedidos atribuídos.",
    VIEWER: "Acesso somente leitura a módulos autorizados.",
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
    },
    ADMIN: {
        products: fullAccess,
        services: fullAccess,
        orders: fullAccess,
        financial: fullAccess,
        customers: fullAccess,
        suppliers: fullAccess,
    },
    MANAGER: {
        products: fullAccess,
        services: fullAccess,
        orders: fullAccess,
        financial: viewOnly,
        customers: fullAccess,
        suppliers: fullAccess,
    },
    OPERATOR: {
        products: viewOnly,
        services: viewOnly,
        orders: editAccess,
        financial: noAccess,
        customers: viewOnly,
        suppliers: noAccess,
    },
    DELIVERY: {
        products: noAccess,
        services: noAccess,
        orders: editAccess,
        financial: noAccess,
        customers: noAccess,
        suppliers: noAccess,
    },
    VIEWER: {
        products: viewOnly,
        services: viewOnly,
        orders: viewOnly,
        financial: noAccess,
        customers: viewOnly,
        suppliers: viewOnly,
    },
}

// ─── Role Authority Functions ───────────────────────────────────────────────

/**
 * Determines if a user with `inviterRole` can invite someone as `targetRole`.
 *
 * Rules:
 * - OWNER → can invite anyone
 * - ADMIN → can invite ADMIN, MANAGER, OPERATOR, DELIVERY, VIEWER (not OWNER)
 * - MANAGER → can invite OPERATOR, DELIVERY, VIEWER only
 * - OPERATOR / DELIVERY / VIEWER → cannot invite anyone
 */
export function canUserInviteRole(inviterRole: PartnerRole, targetRole: PartnerRole): boolean {
    const inviterLevel = ROLE_HIERARCHY[inviterRole]
    const targetLevel = ROLE_HIERARCHY[targetRole]

    // Only OWNER, ADMIN, MANAGER can invite
    if (inviterLevel < ROLE_HIERARCHY.MANAGER) return false

    // OWNER can invite anyone
    if (inviterRole === "OWNER") return true

    // ADMIN cannot invite OWNER
    if (inviterRole === "ADMIN") return targetRole !== "OWNER"

    // MANAGER can only invite OPERATOR, DELIVERY, or VIEWER
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

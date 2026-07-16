import "server-only"
import {
    requirePartnerAccessWithPermission,
    checkPartnerPermission,
} from "@/lib/auth/authorization"
import type { PermissionTemplate, RoleId, RbacPermissions } from "./rbac-types"

type PermissionResource = keyof PermissionTemplate
type PermissionAction<R extends PermissionResource> = keyof PermissionTemplate[R]

/**
 * Throws ForbiddenError se o usuário autenticado não tiver a permissão
 * `resource.action` para o partner informado.
 *
 * Uso: server actions, API routes, qualquer mutação.
 *
 * @example
 * await requirePermission(partnerId, "orders", "view")
 * await requirePermission(partnerId, "orders", "can_apply_discount")
 * await requirePermission(partnerId, "products", "create")
 */
export async function requirePermission<R extends PermissionResource>(
    partnerId: string,
    resource: R,
    action: PermissionAction<R>,
    resolvedUser?: any
): Promise<{
    partnerId: string
    userId: string
    roleId: RoleId
    permissions: RbacPermissions
}> {
    return requirePartnerAccessWithPermission(partnerId, resource as any, action as string, resolvedUser)
}

/**
 * Retorna `{ allowed: boolean }` sem lançar erro se o usuário não tiver
 * a permissão `resource.action`.
 *
 * Uso: page loaders, renderização condicional no servidor.
 *
 * @example
 * const { allowed } = await checkPermission(partnerId, "orders", "view")
 * if (!allowed) return <AccessDenied />
 *
 * Quando `storeId` é fornecido, também verifica se o usuário tem acesso
 * à store específica (via userHasStoreAccess).
 */
export async function checkPermission<R extends PermissionResource>(
    partnerId: string,
    resource: R,
    action: PermissionAction<R>,
    storeId?: string
): Promise<{ allowed: boolean }> {
    if (storeId) {
        const { userHasStoreAccess } = await import("@/lib/store-members")
        const hasStoreAccess = await userHasStoreAccess(partnerId, storeId)
        if (!hasStoreAccess) return { allowed: false }
    }
    return checkPartnerPermission(partnerId, resource as any, action as string)
}

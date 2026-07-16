import "server-only"
import {
    requirePartnerAccessWithPermission,
} from "@/lib/auth/authorization"
import type { PermissionTemplate, RoleId, RbacPermissions } from "./rbac-types"
import { getCurrentUser } from "@/lib/auth/server-user"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"

type PermissionResource = keyof PermissionTemplate
type PermissionAction<R extends PermissionResource> = keyof PermissionTemplate[R]

/**
 * Throws ForbiddenError se o usuário autenticado não tiver a permissão
 * `resource.action` para o partner informado.
 *
 * Uso: server actions, API routes, qualquer mutação.
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
 * Quando `storeId` é fornecido, usa `resolveEffectivePermissions` como
 * fonte única de verdade para a permissão na store específica.
 */
export async function checkPermission<R extends PermissionResource>(
    partnerId: string,
    resource: R,
    action: PermissionAction<R>,
    storeId?: string
): Promise<{ allowed: boolean }> {
    if (storeId) {
        const { resolveEffectivePermissions } = await import("@/lib/store-members")
        const effective = await resolveEffectivePermissions(partnerId, storeId)
        if (!effective) return { allowed: false }
        const rbacUser: RbacUserLike = {
            role_id: effective.role.toLowerCase() as any,
            permissions: effective.permissions,
        }
        return { allowed: can(rbacUser, `${String(resource)}.${String(action)}`) }
    }
    return checkPartnerPermissionFallback(partnerId, resource as any, action as string)
}

/**
 * Fallback: verifica permissão em nível de partner (sem store).
 * Usa requirePartnerAccessWithPermission com try/catch.
 */
async function checkPartnerPermissionFallback(
    partnerId: string,
    resource: string,
    action: string
): Promise<{ allowed: boolean }> {
    try {
        await requirePartnerAccessWithPermission(partnerId, resource as any, action as string)
        return { allowed: true }
    } catch {
        return { allowed: false }
    }
}

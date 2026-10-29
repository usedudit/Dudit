import "server-only"
import { cache } from "react"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import type { PartnerRole, PartnerPermissions } from "@/lib/permissions/types"
import { normalizePermissions, mergePermissionsWithRole } from "@/lib/permissions/rbac-normalize"
import { getPermissionTemplate } from "@/lib/permissions/rbac-template-loader"
import { can as checkCan } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"

export interface EffectivePermissions {
    role: PartnerRole
    permissions: PartnerPermissions
}

/**
 * Resolve permissões efetivas para um (user, partner, store).
 *
 * Fluxo:
 * 1. Busca partner_user para (auth.uid(), partnerId)
 * 2. Se role = OWNER → acesso total (bypass)
 * 3. Se storeId = null → retorna role/permissions do partner_user (contexto global)
 * 4. Se storeId != null:
 *    a. Busca store_member para (partner_user.id, storeId)
 *    b. Se não existir → retorna null (acesso negado à store)
 *    c. Se existir:
 *       - role = COALESCE(sm.role, pu.role)
 *       - permissions = merge profundo: base = pu.permissions, overrides = sm.permissions
 *
 * Esta é a ÚNICA fonte de verdade para resolução de permissões por loja.
 * Nenhuma Server Action deve implementar lógica alternativa.
 */
export const resolveEffectivePermissions = cache(async (
    partnerId: string,
    storeId: string | null
): Promise<EffectivePermissions | null> => {
    const user = await getCurrentUser()
    if (!user) return null

    const supabase = createAdminClient()

    // A store ID is not authorized by the caller's partner ID alone. Resolve
    // the relationship from the database before using any store_members row;
    // otherwise a crafted (partnerId, storeId) pair could cross tenant bounds.
    if (storeId) {
        const { data: store } = await supabase
            .from("stores")
            .select("id")
            .eq("id", storeId)
            .eq("partner_id", partnerId)
            .maybeSingle()

        if (!store) return null
    }

    // 0. Check if user is partner owner (bypass partner_users table)
    const { data: ownerPartner } = await supabase
        .from("partners")
        .select("id")
        .eq("id", partnerId)
        .eq("user_id", user.id)
        .maybeSingle()

    if (ownerPartner) {
        const template = await getPermissionTemplate()
        return {
            role: "OWNER",
            permissions: normalizePermissions(template, {}) as unknown as PartnerPermissions,
        }
    }

    // 1. Buscar partner_user
    const { data: pu } = await supabase
        .from("partner_users")
        .select("id, role, role_id, permissions")
        .eq("partner_id", partnerId)
        .eq("user_id", user.id)
        .maybeSingle()

    if (!pu) return null

    const puRoleLower = String(pu.role_id || pu.role || "").toLowerCase()

    // 2. OWNER bypass
    if (puRoleLower === "owner" || pu.role === "OWNER") {
        const template = await getPermissionTemplate()
        return {
            role: "OWNER",
            permissions: normalizePermissions(template, {}) as unknown as PartnerPermissions,
        }
    }

    const template = await getPermissionTemplate()

    // 3. Contexto global (sem store específica)
    if (!storeId) {
        const globalRoleId = String(pu.role_id || pu.role || "delivery").toLowerCase()
        const { data: roleRow } = await supabase.from("roles").select("permissions").eq("id", globalRoleId).maybeSingle()
        const mergedPerms = mergePermissionsWithRole(template, roleRow?.permissions, pu.permissions)
        return {
            role: (pu.role || pu.role_id || "delivery").toUpperCase() as PartnerRole,
            permissions: mergedPerms as unknown as PartnerPermissions,
        }
    }

    // 4. Buscar store_member
    const { data: sm } = await supabase
        .from("store_members")
        .select("role, permissions")
        .eq("partner_user_id", pu.id)
        .eq("store_id", storeId)
        .maybeSingle()

    // 4b. Sem store_member: verificar se há restrição explícita de lojas em _store_ids_
    const storeIdsArray = Array.isArray((pu.permissions as any)?._store_ids_) ? (pu.permissions as any)._store_ids_ : null
    if (!sm && storeIdsArray && !storeIdsArray.includes(storeId)) {
        return null
    }

    // 4c. Com store_member ou fallback para o cargo em partner_users
    const effectiveRoleUpper = (sm?.role || pu.role || pu.role_id || "delivery").toUpperCase() as PartnerRole
    const effectiveRoleIdLower = effectiveRoleUpper.toLowerCase()
    const { data: roleRow } = await supabase.from("roles").select("permissions").eq("id", effectiveRoleIdLower).maybeSingle()

    const rawUserStorePerms = sm.permissions
        ? deepMergePermissions(pu.permissions as unknown as PartnerPermissions, sm.permissions as unknown as Partial<PartnerPermissions>)
        : pu.permissions

    const effectivePermissions = mergePermissionsWithRole(template, roleRow?.permissions, rawUserStorePerms)

    return {
        role: effectiveRoleUpper,
        permissions: effectivePermissions as unknown as PartnerPermissions,
    }
})

/**
 * Verifica se o usuário autenticado tem acesso a uma store específica.
 *
 * Em Fase 4, verifica:
 * 1. Se é OWNER do partner da store → true
 * 2. Se tem store_member para a store → true
 * 3. Caso contrário → false
 */
export async function userHasStoreAccess(
    partnerId: string,
    storeId: string
): Promise<boolean> {
    const effective = await resolveEffectivePermissions(partnerId, storeId)
    return effective !== null
}

/**
 * Verifica se o usuário tem uma permissão específica em uma store.
 * Usa resolveEffectivePermissions como fonte única de verdade.
 */
export async function checkStorePermission(
    partnerId: string,
    storeId: string | null,
    module: string,
    action: string
): Promise<boolean> {
    if (!storeId) {
        // Contexto global: usa checkPermission padrão
        const { checkPermission } = await import("@/lib/permissions/access")
        const result = await checkPermission(partnerId, module as any, action as any)
        return result.allowed
    }

    const effective = await resolveEffectivePermissions(partnerId, storeId)
    if (!effective) return false

    const rbacUser: RbacUserLike = {
        role_id: effective.role.toLowerCase() as any,
        permissions: effective.permissions,
    }

    return checkCan(rbacUser, `${module}.${action}`)
}

/**
 * Deep merge de PartnerPermissions.
 * Para cada módulo, mescla as chaves internas: base + overrides.
 */
function deepMergePermissions(
    base: PartnerPermissions,
    overrides: Partial<PartnerPermissions>
): PartnerPermissions {
    const result = { ...base }

    for (const key of Object.keys(overrides) as Array<keyof PartnerPermissions>) {
        const overrideVal = overrides[key]
        if (overrideVal === undefined || overrideVal === null) continue

        const baseVal = base[key]
        if (typeof overrideVal === "object" && typeof baseVal === "object" && !Array.isArray(overrideVal)) {
            result[key] = { ...(baseVal as any), ...(overrideVal as any) }
        } else {
            (result as any)[key] = overrideVal
        }
    }

    return result
}

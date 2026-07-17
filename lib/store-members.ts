import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import type { PartnerRole, PartnerPermissions } from "@/lib/permissions/types"
import { normalizePermissions } from "@/lib/permissions/rbac-normalize"
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
export async function resolveEffectivePermissions(
    partnerId: string,
    storeId: string | null
): Promise<EffectivePermissions | null> {
    const user = await getCurrentUser()
    if (!user) return null

    const supabase = createAdminClient()

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
        .select("id, role, permissions")
        .eq("partner_id", partnerId)
        .eq("user_id", user.id)
        .maybeSingle()

    if (!pu) return null

    // 2. OWNER bypass
    if (pu.role === "OWNER") {
        const template = await getPermissionTemplate()
        return {
            role: "OWNER",
            permissions: normalizePermissions(template, {}) as unknown as PartnerPermissions,
        }
    }

    // 3. Contexto global (sem store específica)
    if (!storeId) {
        return {
            role: pu.role as PartnerRole,
            permissions: pu.permissions as unknown as PartnerPermissions,
        }
    }

    // 4. Buscar store_member
    const { data: sm } = await supabase
        .from("store_members")
        .select("role, permissions")
        .eq("partner_user_id", pu.id)
        .eq("store_id", storeId)
        .maybeSingle()

    // 4b. Sem store_member → acesso negado
    if (!sm) return null

    // 4c. Com store_member → aplicar fallback
    const effectiveRole = (sm.role || pu.role) as PartnerRole
    const basePermissions = pu.permissions as unknown as PartnerPermissions

    let effectivePermissions: PartnerPermissions
    if (!sm.permissions) {
        // Fallback: usa permissions do partner_user
        effectivePermissions = basePermissions
    } else {
        // Merge: base = partner_user, overrides = store_member
        effectivePermissions = deepMergePermissions(
            basePermissions,
            sm.permissions as unknown as Partial<PartnerPermissions>
        )
    }

    return {
        role: effectiveRole,
        permissions: effectivePermissions,
    }
}

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

import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { PartnerRole, PartnerPermissions } from "@/lib/permissions/types"

export interface EffectivePermissions {
    role: PartnerRole
    permissions: PartnerPermissions
}

/**
 * Verifica se um usuário autenticado tem acesso a uma store específica.
 *
 * Em Fase 3 (antes de store_members existir), a verificação é feita
 * em nível de partner: se o usuário tem acesso ao partner da store,
 * ele tem acesso à store.
 *
 * A partir da Fase 4, esta função também consultará store_members.
 */
export async function userHasStoreAccess(
    partnerId: string,
    storeId: string
): Promise<boolean> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("stores")
        .select("id")
        .eq("id", storeId)
        .eq("partner_id", partnerId)
        .maybeSingle()
    return data !== null
}

/**
 * Resolve permissões efetivas para um (partner_user, store).
 *
 * Em Fase 3, retorna role/permissions do partner_user (contexto global).
 * A partir da Fase 4, consultará store_members com fallback.
 *
 * NOTA: Implementação completa virá na Fase 4.
 */
export async function resolveEffectivePermissions(
    _userId: string,
    partnerId: string,
    _storeId: string | null
): Promise<EffectivePermissions | null> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("partner_users")
        .select("role, permissions")
        .eq("partner_id", partnerId)
        .eq("user_id", _userId)
        .maybeSingle()

    if (!data) return null

    return {
        role: data.role as PartnerRole,
        permissions: data.permissions as unknown as PartnerPermissions,
    }
}

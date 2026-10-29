"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { requireUser, requireStorePermission, requirePartnerAccess } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/observability/audit-log"
import type { ActionResponse } from "@/lib/types/action-response"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import { ALL_ROLES, canModifyUser, canUserInviteRole } from "@/lib/permissions/partner-roles"
import type { PartnerRole } from "@/lib/permissions/types"

interface StoreMemberRow {
    id: string
    partner_user_id: string
    store_id: string
    role: string | null
    permissions: unknown
    created_at: string
}

export async function listStoreMembersAction(storeId: string, partnerId: string): Promise<StoreMemberRow[]> {
    await requireUser()
    await requireStorePermission(storeId, partnerId, "stores", "view")

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
        .from("store_members")
        .select("*")
        .eq("store_id", storeId)

    if (error) throw new Error(error.message)
    return data || []
}

export async function addStoreMemberAction(
    partnerUserId: string,
    storeId: string,
    partnerId: string,
    role?: string,
    permissions?: unknown
): Promise<ActionResponse<void>> {
    try {
        const user = await requireUser()
        const access = await requirePartnerAccess(partnerId, user)
        if (!can(access as RbacUserLike, "settings.settings_team")) {
            return { success: false, error: "Apenas Proprietários e Administradores podem adicionar membros." }
        }
        const actorRole = String(access.roleId || "").toUpperCase() as PartnerRole

        const admin = getAdminClient()
        const [{ data: target }, { data: store }] = await Promise.all([
            admin
                .from("partner_users")
                .select("id, role_id")
                .eq("id", partnerUserId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id")
                .eq("id", storeId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
        ])

        if (!target || !store) {
            return { success: false, error: "Membro ou loja não pertence a este parceiro." }
        }

        const targetRole = String(target.role_id || "delivery").toUpperCase() as PartnerRole
        const assignedRole = String(role || target.role_id || "delivery").toUpperCase() as PartnerRole
        if (!canModifyUser(actorRole, targetRole) ||
            !ALL_ROLES.includes(assignedRole) ||
            !canUserInviteRole(actorRole, assignedRole)) {
            return { success: false, error: "Você não pode atribuir esse cargo a este membro." }
        }
        if (permissions != null && actorRole !== "OWNER" && actorRole !== "ADMIN") {
            return { success: false, error: "Somente proprietários e administradores podem personalizar permissões." }
        }

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase
            .from("store_members")
            .insert({
                partner_user_id: partnerUserId,
                store_id: storeId,
                role: role || null,
                permissions: permissions || null,
            })

        if (error) throw new Error(error.message)

        logAudit("store_member.added", {
            partnerId,
            storeId,
            targetUserId: partnerUserId,
        })

        revalidatePath("/erp/lojas/membros")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao adicionar membro" }
    }
}

export async function updateStoreMemberAction(
    memberId: string,
    storeId: string,
    partnerId: string,
    role?: string | null,
    permissions?: unknown | null
): Promise<ActionResponse<void>> {
    try {
        const user = await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "manage_members")
        const actor = await requirePartnerAccess(partnerId, user)
        const actorRole = String(actor.roleId || "").toUpperCase() as PartnerRole

        const admin = getAdminClient()
        const [{ data: targetMembership }, { data: store }] = await Promise.all([
            admin
                .from("store_members")
                .select("partner_user_id, store_id")
                .eq("id", memberId)
                .eq("store_id", storeId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id")
                .eq("id", storeId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
        ])

        if (!targetMembership || !store) {
            return { success: false, error: "Membro ou loja não pertence a este parceiro." }
        }

        const { data: target } = await admin
            .from("partner_users")
            .select("id, role_id")
            .eq("id", targetMembership.partner_user_id)
            .eq("partner_id", partnerId)
            .maybeSingle()

        if (!target) {
            return { success: false, error: "Membro ou loja não pertence a este parceiro." }
        }

        const targetRole = String(target.role_id || "delivery").toUpperCase() as PartnerRole
        const assignedRole = String(role || target.role_id || "delivery").toUpperCase() as PartnerRole
        if (!canModifyUser(actorRole, targetRole) ||
            !ALL_ROLES.includes(assignedRole) ||
            !canUserInviteRole(actorRole, assignedRole)) {
            return { success: false, error: "Você não pode atribuir esse cargo a este membro." }
        }
        if (permissions != null && actorRole !== "OWNER" && actorRole !== "ADMIN") {
            return { success: false, error: "Somente proprietários e administradores podem personalizar permissões." }
        }

        const supabase = await getSupabaseServerClient()
        const updateData: Record<string, unknown> = {}
        if (role !== undefined) updateData.role = role
        if (permissions !== undefined) updateData.permissions = permissions

        const { error } = await supabase
            .from("store_members")
            .update(updateData)
            .eq("id", memberId)

        if (error) throw new Error(error.message)

        logAudit("store_member.role_updated", {
            partnerId,
            storeId,
            memberId,
            newRole: role,
        })

        revalidatePath("/erp/lojas/membros")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao atualizar membro" }
    }
}

export async function removeStoreMemberAction(
    memberId: string,
    storeId: string,
    partnerId: string
): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "manage_members")

        const admin = getAdminClient()
        const { data: membership } = await admin
            .from("store_members")
            .select("partner_user_id")
            .eq("id", memberId)
            .eq("store_id", storeId)
            .maybeSingle()
        if (!membership) {
            return { success: false, error: "Membro não encontrado nesta loja." }
        }

        const { data: target } = await admin
            .from("partner_users")
            .select("id")
            .eq("id", membership.partner_user_id)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!target) {
            return { success: false, error: "Membro não pertence a este parceiro." }
        }

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase
            .from("store_members")
            .delete()
            .eq("id", memberId)
            .eq("store_id", storeId)

        if (error) throw new Error(error.message)

        logAudit("store_member.removed", {
            partnerId,
            storeId,
            memberId,
        })

        revalidatePath("/erp/lojas/membros")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao remover membro" }
    }
}

export async function listUserStoresAction(
    partnerUserId: string,
    partnerId: string
): Promise<{ id: string; store_id: string; role: string | null }[]> {
    const user = await requireUser()
    const access = await requirePartnerAccess(partnerId, user)
    if (!can(access as RbacUserLike, "settings.settings_team")) {
        throw new Error("Acesso negado")
    }

    const admin = getAdminClient()
    const { data: target } = await admin
        .from("partner_users")
        .select("id")
        .eq("id", partnerUserId)
        .eq("partner_id", partnerId)
        .maybeSingle()
    if (!target) throw new Error("Membro não pertence a este parceiro")

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
        .from("store_members")
        .select("id, store_id, role")
        .eq("partner_user_id", partnerUserId)

    if (error) throw new Error(error.message)
    return data || []
}

export async function saveMemberStoreAccessAction(params: {
    partnerUserId: string
    partnerId: string
    storeAccesses: Array<{ storeId: string; role: string }>
}): Promise<ActionResponse<void>> {
    try {
        const user = await requireUser()
        const { partnerUserId, partnerId, storeAccesses } = params

        const access = await requirePartnerAccess(partnerId, user)
        if (!can(access as RbacUserLike, "settings.settings_team")) {
            return { success: false, error: "Apenas Proprietários e Administradores podem alterar os acessos às lojas dos membros." }
        }

        const admin = getAdminClient()
        const [{ data: target }, stores] = await Promise.all([
            admin
                .from("partner_users")
                .select("id, role_id")
                .eq("id", partnerUserId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
            storeAccesses.length > 0
                ? admin
                    .from("stores")
                    .select("id")
                    .eq("partner_id", partnerId)
                    .in("id", [...new Set(storeAccesses.map((item) => item.storeId))])
                : Promise.resolve({ data: [] as Array<{ id: string }> }),
        ])

        if (!target || (stores.data || []).length !== new Set(storeAccesses.map((item) => item.storeId)).size) {
            return { success: false, error: "Membro ou loja não pertence a este parceiro." }
        }

        const actorRole = String(access.roleId || "").toUpperCase() as PartnerRole
        const targetRole = String(target.role_id || "delivery").toUpperCase() as PartnerRole
        if (!canModifyUser(actorRole, targetRole) ||
            storeAccesses.some(({ role }) => {
                const assignedRole = String(role || "").toUpperCase() as PartnerRole
                return !ALL_ROLES.includes(assignedRole) || !canUserInviteRole(actorRole, assignedRole)
            })) {
            return { success: false, error: "Você não pode atribuir esses cargos a este membro." }
        }

        const supabase = await getSupabaseServerClient()

        const { data: existing, error: fetchErr } = await supabase
            .from("store_members")
            .select("id, store_id, role")
            .eq("partner_user_id", partnerUserId)

        if (fetchErr) throw new Error(fetchErr.message)

        const existingMap = new Map((existing || []).map((e: any) => [e.store_id, e]))
        const targetMap = new Map(storeAccesses.map(a => [a.storeId, a.role]))

        for (const [storeId, sm] of existingMap.entries()) {
            if (!targetMap.has(storeId)) {
                await supabase.from("store_members").delete().eq("id", sm.id)
            }
        }

        for (const access of storeAccesses) {
            const sm = existingMap.get(access.storeId)
            if (sm) {
                if (sm.role !== access.role) {
                    await supabase
                        .from("store_members")
                        .update({ role: access.role })
                        .eq("id", sm.id)
                }
            } else {
                await supabase
                    .from("store_members")
                    .insert({
                        partner_user_id: partnerUserId,
                        store_id: access.storeId,
                        role: access.role || "OPERATOR",
                    })
            }
        }

        logAudit("store_member.role_updated", {
            partnerId,
            targetPartnerUserId: partnerUserId,
            storeCount: storeAccesses.length,
        })

        revalidatePath("/erp/configuracoes")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao salvar acessos às lojas" }
    }
}

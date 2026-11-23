"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { requireUser, requireStorePermission, requirePartnerAccess } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { logAudit } from "@/lib/observability/audit-log"
import { auditLog } from "@/lib/security/audit-logger"
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
                .select("id, user_id, role_id")
                .eq("id", partnerUserId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id, name")
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

        await auditLog({
            action: "store_member.added",
            actorUserId: user.id,
            partnerId,
            targetUserId: target.user_id,
            metadata: {
                storeId,
                storeName: store.name,
                role: assignedRole,
            },
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
                .select("partner_user_id, store_id, role")
                .eq("id", memberId)
                .eq("store_id", storeId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id, name")
                .eq("id", storeId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
        ])

        if (!targetMembership || !store) {
            return { success: false, error: "Membro ou loja não pertence a este parceiro." }
        }

        const { data: target } = await admin
            .from("partner_users")
            .select("id, user_id, role_id")
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

        await auditLog({
            action: "store_member.updated",
            actorUserId: user.id,
            partnerId,
            targetUserId: target.user_id,
            metadata: {
                storeId,
                storeName: store.name,
                oldRole: targetMembership.role || null,
                newRole: role || null,
            },
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
        const user = await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "manage_members")

        const admin = getAdminClient()
        const [{ data: membership }, { data: store }] = await Promise.all([
            admin
                .from("store_members")
                .select("partner_user_id")
                .eq("id", memberId)
                .eq("store_id", storeId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id, name")
                .eq("id", storeId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
        ])
        if (!membership) {
            return { success: false, error: "Membro não encontrado nesta loja." }
        }

        const { data: target } = await admin
            .from("partner_users")
            .select("id, user_id")
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

        await auditLog({
            action: "store_member.removed",
            actorUserId: user.id,
            partnerId,
            targetUserId: target.user_id,
            metadata: {
                storeId,
                storeName: store?.name || storeId,
            },
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
        const [{ data: target }, allPartnerStores] = await Promise.all([
            admin
                .from("partner_users")
                .select("id, user_id, role_id")
                .eq("id", partnerUserId)
                .eq("partner_id", partnerId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id, name")
                .eq("partner_id", partnerId),
        ])

        const partnerStoreMap = new Map<string, string>(
            (allPartnerStores.data || []).map((s: any) => [s.id, s.name])
        )
        const requestedStoreIds = [...new Set(storeAccesses.map((item) => item.storeId))]
        if (!target || requestedStoreIds.some((sid) => !partnerStoreMap.has(sid))) {
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

        const removedStores: string[] = []
        const addedStores: string[] = []
        const roleChanges: string[] = []

        for (const [storeId, sm] of existingMap.entries()) {
            if (!targetMap.has(storeId)) {
                await supabase.from("store_members").delete().eq("id", sm.id)
                removedStores.push(partnerStoreMap.get(storeId) || storeId)
            }
        }

        for (const item of storeAccesses) {
            const sm = existingMap.get(item.storeId)
            const storeName = partnerStoreMap.get(item.storeId) || item.storeId
            if (sm) {
                if (sm.role !== item.role) {
                    await supabase
                        .from("store_members")
                        .update({ role: item.role })
                        .eq("id", sm.id)
                    roleChanges.push(`${storeName}:${sm.role || ""}:${item.role}`)
                }
            } else {
                const newRole = item.role || "OPERATOR"
                await supabase
                    .from("store_members")
                    .insert({
                        partner_user_id: partnerUserId,
                        store_id: item.storeId,
                        role: newRole,
                    })
                addedStores.push(`${storeName}:${newRole}`)
            }
        }

        logAudit("store_member.role_updated", {
            partnerId,
            targetPartnerUserId: partnerUserId,
            storeCount: storeAccesses.length,
        })

        if (addedStores.length > 0 || removedStores.length > 0 || roleChanges.length > 0) {
            await auditLog({
                action: "store_member.access_updated",
                actorUserId: user.id,
                partnerId,
                targetUserId: target.user_id,
                metadata: {
                    addedStores,
                    removedStores,
                    roleChanges,
                    storeCount: storeAccesses.length,
                },
            })
        }

        revalidatePath("/erp/configuracoes")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao salvar acessos às lojas" }
    }
}

"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { logAudit } from "@/lib/observability/audit-log"
import type { ActionResponse } from "@/lib/types/action-response"

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
        await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "manage_members")

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

        revalidatePath("/erp/stores/members")
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
        await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "manage_members")

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

        revalidatePath("/erp/stores/members")
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

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase
            .from("store_members")
            .delete()
            .eq("id", memberId)

        if (error) throw new Error(error.message)

        logAudit("store_member.removed", {
            partnerId,
            storeId,
            memberId,
        })

        revalidatePath("/erp/stores/members")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao remover membro" }
    }
}

export async function listUserStoresAction(
    partnerUserId: string,
    partnerId: string
): Promise<{ store_id: string; role: string | null }[]> {
    await requireUser()
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
        .from("store_members")
        .select("store_id, role")
        .eq("partner_user_id", partnerUserId)

    if (error) throw new Error(error.message)
    return data || []
}

"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireUser, requirePartnerAccess, requirePartnerAccessWithPermission, requireStorePermission, requireStoreAccess } from "@/lib/auth/authorization"
import { setActiveStore } from "@/lib/auth/partner-context"
import { logAudit } from "@/lib/observability/audit-log"
import type { ActionResponse } from "@/lib/types/action-response"

export async function listStoresAction(partnerId: string) {
    await requireUser()
    await requirePartnerAccess(partnerId)

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: true })

    if (error) throw new Error(error.message)
    return data || []
}

export async function getStoreAction(storeId: string) {
    await requireUser()

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
        .from("stores")
        .select("*")
        .eq("id", storeId)
        .single()

    if (error) throw new Error(error.message)

    await requireStoreAccess(storeId, data.partner_id)
    return data
}

interface CreateStoreInput {
    partnerId: string
    name: string
    slug?: string
    description?: string
    phone?: string
    city?: string
    state?: string
    opening_hours?: Record<string, unknown>
    logo_url?: string
    image_url?: string
}

export async function createStoreAction(input: CreateStoreInput): Promise<ActionResponse<{ id: string }>> {
    try {
        await requireUser()
        await requirePartnerAccessWithPermission(input.partnerId, "stores" as any, "create")

        const supabase = await getSupabaseServerClient()

        const slug = input.slug || generateSlug(input.name)

        const { data, error } = await supabase
            .from("stores")
            .insert({
                partner_id: input.partnerId,
                name: input.name,
                slug,
                description: input.description || null,
                phone: input.phone || null,
                city: input.city || null,
                state: input.state || null,
                opening_hours: input.opening_hours || null,
                logo_url: input.logo_url || null,
                image_url: input.image_url || null,
                is_active: true,
            })
            .select("id")
            .single()

        if (error) throw new Error(error.message)

        logAudit("store.created", {
            partnerId: input.partnerId,
            storeId: data.id,
            storeName: input.name,
        })

        revalidatePath("/erp/stores")
        return { success: true, data: { id: data.id } }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao criar loja" }
    }
}

interface UpdateStoreInput {
    storeId: string
    partnerId: string
    name?: string
    slug?: string
    description?: string
    phone?: string
    city?: string
    state?: string
    opening_hours?: Record<string, unknown>
    banner_url?: string
    logo_url?: string
    gallery?: unknown[]
    whatsapp_phone?: string
    is_active?: boolean
    is_headquarters?: boolean
}

export async function updateStoreAction(input: UpdateStoreInput): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStorePermission(input.storeId, input.partnerId, "stores", "edit")

        const supabase = await getSupabaseServerClient()
        const updateData: Record<string, unknown> = {}

        if (input.name !== undefined) updateData.name = input.name
        if (input.slug !== undefined) updateData.slug = input.slug
        if (input.description !== undefined) updateData.description = input.description
        if (input.phone !== undefined) updateData.phone = input.phone
        if (input.city !== undefined) updateData.city = input.city
        if (input.state !== undefined) updateData.state = input.state
        if (input.opening_hours !== undefined) updateData.opening_hours = input.opening_hours
        if (input.banner_url !== undefined) updateData.banner_url = input.banner_url
        if (input.logo_url !== undefined) updateData.logo_url = input.logo_url
        if (input.gallery !== undefined) updateData.gallery = input.gallery
        if (input.whatsapp_phone !== undefined) updateData.whatsapp_phone = input.whatsapp_phone
        if (input.is_active !== undefined) updateData.is_active = input.is_active
        if (input.is_headquarters !== undefined) updateData.is_headquarters = input.is_headquarters
        updateData.updated_at = new Date().toISOString()

        const { error } = await supabase
            .from("stores")
            .update(updateData)
            .eq("id", input.storeId)
            .eq("partner_id", input.partnerId)

        if (error) throw new Error(error.message)

        logAudit("store.updated", {
            partnerId: input.partnerId,
            storeId: input.storeId,
            changes: Object.keys(updateData),
        })

        revalidatePath("/erp/stores")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao atualizar loja" }
    }
}

export async function deleteStoreAction(storeId: string, partnerId: string): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "delete")

        const supabase = await getSupabaseServerClient()
        const { error } = await supabase
            .from("stores")
            .delete()
            .eq("id", storeId)
            .eq("partner_id", partnerId)

        if (error) throw new Error(error.message)

        logAudit("store.deleted", {
            partnerId,
            storeId,
        })

        revalidatePath("/erp/stores")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao excluir loja" }
    }
}

export async function setActiveStoreAction(storeId: string): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStoreAccess(storeId)
        await setActiveStore(storeId)

        logAudit("store.switched", {
            storeId,
        })

        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao trocar loja" }
    }
}

function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        || "loja"
}

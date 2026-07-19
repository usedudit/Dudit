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
    // F5.4a: Showcase / storefront fields
    is_showcase_active?: boolean
    order_flow?: string
    // F5.4b: Business data fields
    business_info?: Record<string, unknown>
    category_id?: string | null
    subcategory_id?: string | null
    latitude?: number | null
    longitude?: number | null
    timezone?: string
    pickup_payment_policy?: string
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
        // F5.4a: Showcase fields
        if (input.is_showcase_active !== undefined) updateData.is_showcase_active = input.is_showcase_active
        if (input.order_flow !== undefined) updateData.order_flow = input.order_flow
        // F5.4b: Business data fields
        if (input.business_info !== undefined) updateData.business_info = input.business_info
        if (input.category_id !== undefined) updateData.category_id = input.category_id
        if (input.subcategory_id !== undefined) updateData.subcategory_id = input.subcategory_id
        if (input.latitude !== undefined) updateData.latitude = input.latitude
        if (input.longitude !== undefined) updateData.longitude = input.longitude
        if (input.timezone !== undefined) updateData.timezone = input.timezone
        if (input.pickup_payment_policy !== undefined) updateData.pickup_payment_policy = input.pickup_payment_policy
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

interface CreateStoreWithInheritanceInput {
    partnerId: string
    name: string
    sourceStoreId: string
    inheritProducts?: boolean
    inheritServices?: boolean
    inheritCategories?: boolean
    inheritPaymentMethods?: boolean
    inheritFinancialSettings?: boolean
    inheritLogistics?: boolean
    inheritOpeningHours?: boolean
    inheritShowcase?: boolean
}

export async function createStoreWithInheritanceAction(input: CreateStoreWithInheritanceInput): Promise<ActionResponse<{ id: string }>> {
    try {
        await requireUser()
        await requirePartnerAccessWithPermission(input.partnerId, "stores" as any, "create")
        await requireStorePermission(input.sourceStoreId, input.partnerId, "stores", "edit")

        const supabase = await getSupabaseServerClient()

        // 1. Create the store with auto-slug
        const slug = generateSlug(input.name)
        const { data: store, error: createError } = await supabase
            .from("stores")
            .insert({
                partner_id: input.partnerId,
                name: input.name,
                slug,
                is_active: true,
            })
            .select("id")
            .single()

        if (createError) throw new Error(createError.message)

        const newStoreId = store.id

        // 2. Source store data to inherit from
        const { data: sourceStore } = await supabase
            .from("stores")
            .select("*")
            .eq("id", input.sourceStoreId)
            .single()

        if (sourceStore) {
            const updateData: Record<string, unknown> = {}

            if (input.inheritOpeningHours && sourceStore.opening_hours) {
                updateData.opening_hours = sourceStore.opening_hours
            }

            if (input.inheritShowcase) {
                if (sourceStore.banner_url) updateData.banner_url = sourceStore.banner_url
                if (sourceStore.logo_url) updateData.logo_url = sourceStore.logo_url
                if (sourceStore.gallery) updateData.gallery = sourceStore.gallery
                if (sourceStore.is_showcase_active !== undefined) updateData.is_showcase_active = sourceStore.is_showcase_active
                if (sourceStore.order_flow) updateData.order_flow = sourceStore.order_flow
            }

            if (input.inheritCategories) {
                if (sourceStore.category_id) updateData.category_id = sourceStore.category_id
                if (sourceStore.subcategory_id) updateData.subcategory_id = sourceStore.subcategory_id
            }

            if (Object.keys(updateData).length > 0) {
                updateData.updated_at = new Date().toISOString()
                await supabase.from("stores").update(updateData).eq("id", newStoreId)
            }
        }

        // 3. Inherit products (visibility_scope bridge copies)
        if (input.inheritProducts) {
            const { data: productBridges } = await supabase
                .from("store_products")
                .select("product_id, visibility_scope")
                .eq("store_id", input.sourceStoreId)

            if (productBridges?.length) {
                const newBridges = productBridges.map((b: any) => ({
                    store_id: newStoreId,
                    product_id: b.product_id,
                    visibility_scope: b.visibility_scope,
                }))
                await supabase.from("store_products").upsert(newBridges, {
                    onConflict: "store_id,product_id",
                    ignoreDuplicates: false,
                })
            }
        }

        // 4. Inherit services
        if (input.inheritServices) {
            const { data: serviceBridges } = await supabase
                .from("store_services")
                .select("service_id, visibility_scope")
                .eq("store_id", input.sourceStoreId)

            if (serviceBridges?.length) {
                const newBridges = serviceBridges.map((b: any) => ({
                    store_id: newStoreId,
                    service_id: b.service_id,
                    visibility_scope: b.visibility_scope,
                }))
                await supabase.from("store_services").upsert(newBridges, {
                    onConflict: "store_id,service_id",
                    ignoreDuplicates: false,
                })
            }
        }

        // 5. Inherit payment methods
        if (input.inheritPaymentMethods) {
            const { data: paymentMethods } = await supabase
                .from("partner_payment_methods")
                .select("*")
                .eq("partner_id", input.partnerId)

            if (paymentMethods?.length) {
                for (const pm of paymentMethods) {
                    await supabase.from("partner_payment_methods").upsert({
                        id: pm.id,
                        store_id: newStoreId,
                        partner_id: input.partnerId,
                        ...pm,
                    }, { onConflict: "id" })
                }
            }
        }

        // 6. Inherit logistics (delivery settings)
        if (input.inheritLogistics) {
            const { data: deliverySettings } = await supabase
                .from("delivery_settings")
                .select("*")
                .eq("store_id", input.sourceStoreId)

            if (deliverySettings?.length) {
                for (const ds of deliverySettings) {
                    const { id, created_at, updated_at, ...dsData } = ds
                    await supabase.from("delivery_settings").insert({
                        ...dsData,
                        store_id: newStoreId,
                    })
                }
            }
        }

        logAudit("store.created_with_inheritance", {
            partnerId: input.partnerId,
            storeId: newStoreId,
            storeName: input.name,
            inherited: Object.entries(input).filter(([k, v]) => k.startsWith("inherit") && v).map(([k]) => k),
        })

        revalidatePath("/erp/stores")
        return { success: true, data: { id: newStoreId } }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao criar loja" }
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

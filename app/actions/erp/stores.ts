"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { requireUser, requirePartnerAccess, requirePartnerAccessWithPermission, requireStorePermission, requireStoreAccess, requireMinimumPlan } from "@/lib/auth/authorization"
import { setActiveStore } from "@/lib/auth/partner-context"
import { logAudit } from "@/lib/observability/audit-log"
import type { ActionResponse } from "@/lib/types/action-response"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"

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
    whatsapp_phone?: string
    city?: string
    state?: string
    opening_hours?: Record<string, unknown>
    logo_url?: string
    image_url?: string
    // Address fields
    zip_code?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    noNumber?: boolean
}

export async function createStoreAction(input: CreateStoreInput): Promise<ActionResponse<{ id: string }>> {
    try {
        await requireUser()
        await requirePartnerAccessWithPermission(input.partnerId, "stores" as any, "create")
        await requireMinimumPlan(input.partnerId, "escalar")

        const supabase = await getSupabaseServerClient()
        const admin = createAdminClient()

        const slug = input.slug || generateSlug(input.name)

        const { data, error } = await supabase
            .from("stores")
            .insert({
                partner_id: input.partnerId,
                name: input.name,
                slug,
                description: input.description || null,
                phone: input.phone || null,
                whatsapp_phone: input.whatsapp_phone || null,
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

        // Handle address creation if address fields are provided
        const hasAddressFields = input.zip_code || input.street || input.number || input.neighborhood || input.city || input.state
        if (hasAddressFields) {
            const numberVal = input.noNumber ? "S/N" : (input.number || "")
            const { data: newAddr } = await admin
                .from("addresses")
                .insert({
                    zip_code: input.zip_code || null,
                    street: input.street || null,
                    number: numberVal,
                    complement: input.complement || null,
                    neighborhood: input.neighborhood || null,
                    city: input.city || null,
                    state: input.state || null,
                    country: "BR",
                    store_id: data.id,
                })
                .select("id")
                .single()

            if (newAddr?.id) {
                await supabase.from("stores").update({ address_id: newAddr.id }).eq("id", data.id)
            }
        }

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
    // F5.5c: Address fields (city/state already declared above)
    zip_code?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    noNumber?: boolean
}

export async function updateStoreAction(input: UpdateStoreInput): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStorePermission(input.storeId, input.partnerId, "stores", "edit")

        const admin = createAdminClient()
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

        // F5.5c: Handle address upsert
        const hasAddressFields = input.zip_code !== undefined || input.street !== undefined ||
            input.number !== undefined || input.complement !== undefined ||
            input.neighborhood !== undefined || input.city !== undefined ||
            input.state !== undefined
        if (hasAddressFields) {
            const numberVal = input.noNumber ? "S/N" : (input.number || "")
            const addressPayload: Record<string, unknown> = {
                zip_code: input.zip_code ?? null,
                street: input.street ?? null,
                number: numberVal,
                complement: input.complement ?? null,
                neighborhood: input.neighborhood ?? null,
                city: input.city ?? null,
                state: input.state ?? null,
                country: "BR",
                store_id: input.storeId,
            }

            // Check if store already has an address_id
            const { data: existingStore } = await admin
                .from("stores")
                .select("address_id")
                .eq("id", input.storeId)
                .single()

            if (existingStore?.address_id) {
                // Update existing address
                const { error: addrError } = await admin
                    .from("addresses")
                    .update(addressPayload)
                    .eq("id", existingStore.address_id)
                if (addrError) throw new Error(addrError.message)
            } else {
                // Check if there's an address with this store_id
                const { data: addrByStore } = await admin
                    .from("addresses")
                    .select("id")
                    .eq("store_id", input.storeId)
                    .maybeSingle()
                if (addrByStore?.id) {
                    const { error: addrError } = await admin
                        .from("addresses")
                        .update(addressPayload)
                        .eq("id", addrByStore.id)
                    if (addrError) throw new Error(addrError.message)
                    updateData.address_id = addrByStore.id
                } else {
                    // Create new address
                    const { data: newAddr, error: addrError } = await admin
                        .from("addresses")
                        .insert({ ...addressPayload, id: undefined })
                        .select("id")
                        .single()
                    if (addrError) throw new Error(addrError.message)
                    updateData.address_id = newAddr.id
                }
            }
        }

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
        await requireMinimumPlan(input.partnerId, "escalar")
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

        // 3. Inherit products (deep copy with new store_id)
        if (input.inheritProducts) {
            const { data: sourceProducts } = await supabase
                .from("products")
                .select("*")
                .eq("store_id", input.sourceStoreId)

            if (sourceProducts?.length) {
                for (const prod of sourceProducts) {
                    const { id, created_at, updated_at, is_active, ...productData } = prod

                    const { data: newProduct, error: pErr } = await supabase
                        .from("products")
                        .insert({
                            ...productData,
                            store_id: newStoreId,
                            stock_quantity: 0,
                            stock_reserved: 0,
                            stock_available: 0,
                        })
                        .select("id")
                        .single()

                    if (pErr || !newProduct) {
                        console.error("[StoreInherit] Error copying product:", prod.name, pErr)
                        continue
                    }

                    const { data: variants } = await supabase
                        .from("product_variants")
                        .select("*")
                        .eq("product_id", id)

                    if (variants?.length) {
                        const newVariants = variants.map((v: any) => {
                            const { id: vId, created_at: vCa, updated_at: vUa, ...vData } = v
                            return {
                                ...vData,
                                product_id: newProduct.id,
                                stock_quantity: 0,
                                stock_available: 0,
                                stock_reserved: 0,
                            }
                        })
                        await supabase.from("product_variants").insert(newVariants)
                    }
                }
            }
        }

        // 4. Inherit services (deep copy with new store_id)
        if (input.inheritServices) {
            const { data: sourceServices } = await supabase
                .from("services")
                .select("*")
                .eq("store_id", input.sourceStoreId)

            if (sourceServices?.length) {
                const newServices = sourceServices.map((s: any) => {
                    const { id, created_at, updated_at, is_active, ...serviceData } = s
                    return { ...serviceData, store_id: newStoreId }
                })
                await supabase.from("services").insert(newServices)
            }
        }

        // 5. Inherit payment methods
        if (input.inheritPaymentMethods) {
            const { data: paymentMethods } = await supabase
                .from("payment_methods")
                .select("*")
                .eq("partner_id", input.partnerId)
                .or(`store_id.is.null,store_id.eq.${input.sourceStoreId}`)

            if (paymentMethods?.length) {
                const newMethods = paymentMethods.map((pm: any) => {
                    const { id, created_at, updated_at, store_id, ...rest } = pm
                    return { ...rest, store_id: newStoreId, partner_id: input.partnerId }
                })
                await supabase.from("payment_methods").insert(newMethods)
            }
        }

        // 5b. Inherit financial settings (fiscal fields + business_info)
        if (input.inheritFinancialSettings && sourceStore) {
            const finData: Record<string, unknown> = {}
            if (sourceStore.crt !== undefined) finData.crt = sourceStore.crt
            if (sourceStore.contribuinte !== undefined) finData.contribuinte = sourceStore.contribuinte
            if (sourceStore.inscricao_estadual !== undefined) finData.inscricao_estadual = sourceStore.inscricao_estadual
            if (sourceStore.ie_isento !== undefined) finData.ie_isento = sourceStore.ie_isento
            if (sourceStore.inscricao_municipal !== undefined) finData.inscricao_municipal = sourceStore.inscricao_municipal
            if (sourceStore.business_info) finData.business_info = sourceStore.business_info
            if (sourceStore.timezone) finData.timezone = sourceStore.timezone
            if (sourceStore.pickup_payment_policy) finData.pickup_payment_policy = sourceStore.pickup_payment_policy
            if (Object.keys(finData).length > 0) {
                finData.updated_at = new Date().toISOString()
                await supabase.from("stores").update(finData).eq("id", newStoreId)
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

export async function setActiveStoreAction(storeId: string, partnerId?: string): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStoreAccess(storeId)

        // Resolve partnerId for cache invalidation
        // (if not provided, fetch from store)
        let effectivePartnerId = partnerId
        if (!effectivePartnerId) {
            const admin = createAdminClient()
            const { data: store } = await admin.from("stores").select("partner_id").eq("id", storeId).single()
            effectivePartnerId = store?.partner_id
        }
        if (!effectivePartnerId) return { success: false, error: "Loja não encontrada" }

        await setActiveStore(storeId)

        // F5.5a + cache audit: Invalidate ALL store-dependent caches
        // RevalidatePath handles Next.js Router Cache
        revalidatePath("/", "layout")

        // RevalidateTag handles unstable_cache entries
        safeRevalidateTag(TAGS.products(effectivePartnerId))
        safeRevalidateTag(TAGS.orders(effectivePartnerId))
        safeRevalidateTag(TAGS.customers(effectivePartnerId))
        safeRevalidateTag(TAGS.suppliers(effectivePartnerId))
        safeRevalidateTag(TAGS.quotes(effectivePartnerId))
        safeRevalidateTag(TAGS.stockMovements(effectivePartnerId))
        safeRevalidateTag(TAGS.transactions(effectivePartnerId))
        safeRevalidateTag(TAGS.coupons(effectivePartnerId))
        safeRevalidateTag(`payment-methods-${effectivePartnerId}`)
        safeRevalidateTag(`suppliers-list-${effectivePartnerId}`)
        safeRevalidateTag(DASHBOARD_TAGS.general(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.products(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.services(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.financial(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.operations(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.metrics(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.alerts(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.revenue(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.revenueOrigin(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.activity(effectivePartnerId))
        safeRevalidateTag(DASHBOARD_TAGS.categories(effectivePartnerId))
        safeRevalidateTag(`partner-${effectivePartnerId}`)

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

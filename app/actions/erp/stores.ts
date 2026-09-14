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
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { validateBrazilMobile, sanitizeInput } from "@/lib/input-validator"
import { normalizePhoneToE164 } from "@/lib/utils/phone-utils"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"

export async function listStoresAction(partnerId: string) {
    const user = await requireUser()
    await requirePartnerAccess(partnerId)

    return getCachedErpPage(
        ["erp-stores", user.id, partnerId],
        [TAGS.partner(partnerId), TAGS.userAccess(user.id)],
        async () => {
            // Escopo por store_members: dono (partners.user_id) ou role owner veem todas
            // as lojas; membros convidados veem APENAS as lojas em que têm store_member.
            const admin = createAdminClient()
            const [partnerRes, puRes] = await Promise.all([
                admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
                admin.from("partner_users").select("id, role_id").eq("partner_id", partnerId).eq("user_id", user.id).maybeSingle(),
            ])

            const isPartnerOwner = partnerRes.data?.user_id === user.id
            const roleId = String(puRes.data?.role_id || "").toLowerCase()
            let allowedStoreIds: string[] | null = null

            if (!isPartnerOwner && roleId !== "owner") {
                if (!puRes.data) return []
                const { data: members } = await admin
                    .from("store_members")
                    .select("store_id, role")
                    .eq("partner_user_id", puRes.data.id)
                const memberStoreIds = (members || []).map((m: any) => m.store_id)
                if (memberStoreIds.length === 0) return []
                allowedStoreIds = memberStoreIds
            }

            let query = admin
                .from("stores")
                .select("*, addresses!store_id(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
                .eq("partner_id", partnerId)
                .eq("is_active", true)
                .is("suspended_at", null)
            if (allowedStoreIds !== null) query = query.in("id", allowedStoreIds)
            const { data, error } = await query.order("created_at", { ascending: true })
            if (error) throw new Error(error.message)

            // Build a map of store_id -> user_role for non-owner users
            const storeRoleMap = new Map<string, string>()
            if (!isPartnerOwner && roleId !== "owner" && puRes.data) {
                const { data: members } = await admin
                    .from("store_members")
                    .select("store_id, role")
                    .eq("partner_user_id", puRes.data.id)
                for (const m of members || []) {
                    if (m.store_id && m.role) storeRoleMap.set(m.store_id, m.role)
                }
            }

            const stores: any[] = []
            for (const store of data || []) {
                const { addresses, ...rest } = store
                const addrList = Array.isArray(addresses) ? addresses : []
                const address = addrList.find((a: any) => a.is_default) || addrList[0] || null
                const merged: any = { ...rest, addresses: addrList }
                if (address) {
                    merged.zip_code = address.zip_code ?? null
                    merged.street = address.street ?? null
                    merged.number = address.number ?? null
                    merged.complement = address.complement ?? null
                    merged.neighborhood = address.neighborhood ?? null
                    merged.city = address.city ?? null
                    merged.state = address.state ?? null
                }
                if (merged.cpf) {
                    try {
                        const { decryptCPF } = await import("@/lib/crypto")
                        merged.cpf = await decryptCPF(merged.cpf as string)
                    } catch { /* keep encrypted */ }
                }
                // Attach user's effective role for this store
                if (isPartnerOwner || roleId === "owner") {
                    merged.user_role = "owner"
                } else {
                    merged.user_role = storeRoleMap.get(store.id) || roleId
                }
                stores.push(merged)
            }
            return stores
        },
        60,
    )
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

    if (data.cpf) {
        try {
            const { decryptCPF } = await import("@/lib/crypto")
            data.cpf = await decryptCPF(data.cpf)
        } catch { /* keep encrypted */ }
    }

    return data
}

interface CreateStoreInput {
    partnerId: string
    name: string
    phone: string
    slug?: string
    description?: string
    opening_hours?: Record<string, unknown>
    logo_url?: string
    accept_orders_when_closed?: boolean
    // Address fields
    zip_code?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
    noNumber?: boolean
    latitude?: number | null
    longitude?: number | null
}

export async function createStoreAction(input: CreateStoreInput): Promise<ActionResponse<{ id: string }>> {
    try {
        await requireUser()
        await requirePartnerAccessWithPermission(input.partnerId, "stores" as any, "create")
        await requireMinimumPlan(input.partnerId, "escalar")

        if (!input.name || !input.name.trim()) {
            return { success: false, error: "Nome da loja é obrigatório" }
        }

        if (!input.phone || !input.phone.trim()) {
            return { success: false, error: "WhatsApp é obrigatório" }
        }

        const supabase = await getSupabaseServerClient()
        const admin = createAdminClient()

        const slug = input.slug || generateSlug(input.name)

        const sanitizedPhone = typeof input.phone === "string" ? sanitizeInput(input.phone, 20) : ""
        let phoneToValidate = sanitizedPhone
        const digits = sanitizedPhone.replace(/\D/g, "")
        if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
            phoneToValidate = digits.slice(2)
        }
        if (!validateBrazilMobile(phoneToValidate)) {
            return { success: false, error: "Número de WhatsApp inválido" }
        }
        const normalizedPhone = normalizePhoneToE164(sanitizedPhone)

        const { data, error } = await supabase
            .from("stores")
            .insert({
                partner_id: input.partnerId,
                name: sanitizeInput(input.name, 150),
                slug,
                description: input.description || null,
                phone: normalizedPhone,
                opening_hours: input.opening_hours || null,
                logo_url: input.logo_url || null,
                banner_url: getRandomDefaultBanner(),
                is_active: true,
                accept_orders_when_closed: input.accept_orders_when_closed ?? true,
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
                    latitude: input.latitude ?? null,
                    longitude: input.longitude ?? null,
                    store_id: data.id,
                })
                .select("id")
                .single()

            if (newAddr?.id) {
                // address is linked via addresses.store_id, no need for stores.address_id
            }
        }

        logAudit("store.created", {
            partnerId: input.partnerId,
            storeId: data.id,
            storeName: input.name,
        })

        await safeRevalidateTag(TAGS.partner(input.partnerId))
        revalidatePath("/erp/lojas")
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
    opening_hours?: Record<string, unknown>
    banner_url?: string
    logo_url?: string
    gallery?: unknown[]
    is_active?: boolean
    is_headquarters?: boolean
    // F5.4a: Showcase / storefront fields
    is_showcase_active?: boolean
    accept_orders_when_closed?: boolean
    // F5.4b: Business data fields
    business_info?: Record<string, unknown>
    category_id?: string | null
    subcategory_id?: string | null
    timezone?: string
    // Tax / fiscal fields (per store)
    person_type?: "pf" | "pj"
    cnpj?: string | null
    cpf?: string | null
    razaoSocial?: string | null
    nomeFantasia?: string | null
    crt?: string
    contribuinte?: string
    inscricaoEstadual?: string | null
    ieIsento?: boolean
    inscricaoMunicipal?: string | null
    // Address fields
    city?: string
    state?: string
    zip_code?: string
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    noNumber?: boolean
    municipioCodigoIbge?: string | null
    latitude?: number | null
    longitude?: number | null
}

export async function updateStoreAction(input: UpdateStoreInput): Promise<ActionResponse<void>> {
    try {
        await requireUser()
        await requireStorePermission(input.storeId, input.partnerId, "stores", "edit")

        const admin = createAdminClient()
        const supabase = await getSupabaseServerClient()
        const updateData: Record<string, unknown> = {}

        if (input.name !== undefined) updateData.name = sanitizeInput(input.name, 150)
        if (input.slug !== undefined) updateData.slug = input.slug
        if (input.description !== undefined) updateData.description = input.description
        if (input.phone !== undefined) {
            const sanitizedPhone = typeof input.phone === "string" ? sanitizeInput(input.phone, 20) : ""
            if (sanitizedPhone) {
                let phoneToValidate = sanitizedPhone
                const digits = sanitizedPhone.replace(/\D/g, "")
                if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
                    phoneToValidate = digits.slice(2)
                }
                if (!validateBrazilMobile(phoneToValidate)) {
                    return { success: false, error: "Número de telefone inválido" }
                }
                updateData.phone = normalizePhoneToE164(sanitizedPhone)
            } else {
                updateData.phone = null
            }
        }
        if (input.opening_hours !== undefined) updateData.opening_hours = input.opening_hours
        if (input.banner_url !== undefined) updateData.banner_url = input.banner_url
        if (input.logo_url !== undefined) updateData.logo_url = input.logo_url
        if (input.gallery !== undefined) updateData.gallery = input.gallery
        if (input.is_active !== undefined) updateData.is_active = input.is_active
        if (input.is_headquarters !== undefined) updateData.is_headquarters = input.is_headquarters
        // F5.4a: Showcase fields
        if (input.is_showcase_active !== undefined) updateData.is_showcase_active = input.is_showcase_active
        if (input.accept_orders_when_closed !== undefined) updateData.accept_orders_when_closed = input.accept_orders_when_closed
        // F5.4b: Business data fields
        if (input.business_info !== undefined) updateData.business_info = input.business_info
        if (input.category_id !== undefined) updateData.category_id = input.category_id
        if (input.subcategory_id !== undefined) updateData.subcategory_id = input.subcategory_id
        if (input.timezone !== undefined) updateData.timezone = input.timezone
        // Tax / fiscal fields
        if (input.person_type !== undefined) updateData.person_type = input.person_type
        if (input.razaoSocial !== undefined) updateData.razao_social = sanitizeInput(input.razaoSocial ?? "", 150)
        if (input.nomeFantasia !== undefined) updateData.nome_fantasia = sanitizeInput(input.nomeFantasia ?? "", 150)
        if (input.cnpj !== undefined) {
            updateData.cnpj = input.cnpj ? input.cnpj.replace(/\D/g, "") : null
            if (updateData.cnpj === "") updateData.cnpj = null
        }
        if (input.cpf !== undefined) {
            const cleanCPF = input.cpf ? input.cpf.replace(/\D/g, "") : null
            if (cleanCPF) {
                const { encryptCPF } = await import("@/lib/crypto")
                updateData.cpf = await encryptCPF(cleanCPF)
            } else {
                updateData.cpf = null
            }
        }
        if (input.crt !== undefined) updateData.crt = input.crt
        if (input.contribuinte !== undefined) updateData.contribuinte = input.contribuinte
        if (input.inscricaoEstadual !== undefined) updateData.inscricao_estadual = input.inscricaoEstadual
        if (input.ieIsento !== undefined) updateData.ie_isento = input.ieIsento
        if (input.inscricaoMunicipal !== undefined) updateData.inscricao_municipal = input.inscricaoMunicipal
        updateData.updated_at = new Date().toISOString()

        // Upsert address on addresses table (linked via store_id)
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
                municipio_codigo_ibge: input.municipioCodigoIbge ?? null,
                latitude: input.latitude ?? null,
                longitude: input.longitude ?? null,
            }

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
            } else {
                const { error: addrError } = await admin
                    .from("addresses")
                    .insert(addressPayload)
                if (addrError) throw new Error(addrError.message)
            }
        }

        const { error } = await supabase
            .from("stores")
            .update(updateData)
            .eq("id", input.storeId)
            .eq("partner_id", input.partnerId)

        if (error) throw new Error(error.message)

        if (input.is_showcase_active !== undefined) {
            await admin
                .from("partners")
                .update({ is_showcase_active: input.is_showcase_active })
                .eq("id", input.partnerId)
        }

        logAudit("store.updated", {
            partnerId: input.partnerId,
            storeId: input.storeId,
            changes: Object.keys(updateData),
        })

        const { invalidateStoreCache } = await import("@/lib/cache/invalidation")
        await invalidateStoreCache(input.storeId, input.partnerId, input.slug)

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

        const { data: store } = await supabase
            .from("stores")
            .select("slug")
            .eq("id", storeId)
            .maybeSingle()

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

        await safeRevalidateTag(TAGS.partner(partnerId))
        await safeRevalidateTag(TAGS.storeProfile(storeId))
        if (store?.slug) await safeRevalidateTag(`store-${store.slug}`)
        revalidatePath("/erp/lojas")
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Erro ao excluir loja" }
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

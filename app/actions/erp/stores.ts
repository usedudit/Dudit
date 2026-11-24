"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath, revalidateTag } from "next/cache"
import { headers } from "next/headers"
import crypto from "crypto"
import { requireUser, requirePartnerAccess, requirePartnerAccessWithPermission, requireStorePermission, requireStoreAccess, requireMinimumPlan } from "@/lib/auth/authorization"
import { setActiveStore, getActiveStoreId, clearActiveStore } from "@/lib/auth/partner-context"
import { logAudit } from "@/lib/observability/audit-log"
import type { ActionResponse } from "@/lib/types/action-response"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"
import { getRandomDefaultBanner } from "@/lib/utils/banner"
import { validateBrazilMobile, sanitizeInput } from "@/lib/input-validator"
import { normalizePhoneToE164 } from "@/lib/utils/phone-utils"
import { toBusinessInfoRecord } from "@/lib/business-info"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { getFiscalPublishBlockReason } from "@/lib/fiscal/publish-gate"
import { moderateStoreContent } from "@/lib/moderation/product-moderation"
import { StoreDeletionService, type StorePreDeleteReport } from "@/lib/services/store-deletion.service"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getTrustedClientCountry, getTrustedClientIP } from "@/lib/security/client-ip"
import { SMTP2GOService } from "@/lib/services/smtp2go.service"
import {
    getStoreDeletionEmailHtml,
    getStoreDeletionEmailText,
} from "@/lib/services/email-templates/store-deletion-code.template"
import { SecureLogger } from "@/lib/secure-logger"
import { auditLog } from "@/lib/security/audit-logger"

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
            const storeRoleMap = new Map<string, string>()

            if (!isPartnerOwner && roleId !== "owner") {
                if (!puRes.data) return []
                const { data: members } = await admin
                    .from("store_members")
                    .select("store_id, role")
                    .eq("partner_user_id", puRes.data.id)
                for (const member of members || []) {
                    if (member.store_id && member.role) storeRoleMap.set(member.store_id, member.role)
                }
                const memberStoreIds = Array.from(storeRoleMap.keys())
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

        const storeModeration = await moderateStoreContent({
            name: input.name,
            description: input.description,
            userId: input.partnerId,
        })
        if (!storeModeration.valid) {
            return { success: false, error: storeModeration.error || "Conteúdo não aprovado pela moderação" }
        }

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
    // Regime tributário simplificado (DRE gerencial)
    simplesTaxRateProducts?: number | null
    simplesTaxRateServices?: number | null
    meiFixedTaxAmount?: number | null
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

        // Gate de publicação: MEI sem CNPJ não consegue emitir documento fiscal
        // para cliente PJ, então a loja não deve ir ao ar nesse estado.
        if (input.is_active === true || input.is_showcase_active === true) {
            const publishBlock = await getFiscalPublishBlockReason(admin, input.storeId, {
                isActive: input.is_active,
                isShowcaseActive: input.is_showcase_active,
            })
            if (publishBlock) {
                return { success: false, error: publishBlock }
            }
        }

        // SEO cooldown: store name, city, and state can only be changed every 15 days
        const { data: currentStore } = await admin
            .from("stores")
            .select("name, last_seo_update_at, business_info, addresses(city, state)")
            .eq("id", input.storeId)
            .maybeSingle()

        const currentAddress = currentStore?.addresses?.[0] || {}
        const isSeoSensitiveChange =
            (input.name !== undefined && currentStore?.name && input.name !== currentStore.name) ||
            (input.city !== undefined && input.city !== currentAddress?.city) ||
            (input.state !== undefined && input.state !== currentAddress?.state)

        if (isSeoSensitiveChange) {
            if (currentStore?.last_seo_update_at) {
                const lastUpdate = new Date(currentStore.last_seo_update_at)
                const daysSinceUpdate = (new Date().getTime() - lastUpdate.getTime()) / (1000 * 3600 * 24)
                if (daysSinceUpdate < 15) {
                    const nextAllowed = new Date(lastUpdate.getTime() + 15 * 24 * 3600 * 1000)
                    return { success: false, error: `Você só pode alterar o nome, cidade e estado da loja a cada 15 dias. Próxima alteração permitida em: ${nextAllowed.toLocaleDateString('pt-BR')}` }
                }
            }
        }

        const updateData: Record<string, unknown> = {}

        if (input.name !== undefined || input.description !== undefined) {
            const storeModeration = await moderateStoreContent({
                name: input.name,
                description: input.description,
                userId: input.partnerId,
            })
            if (!storeModeration.valid) {
                return { success: false, error: storeModeration.error || "Conteúdo não aprovado pela moderação" }
            }
        }

        if (input.name !== undefined) updateData.name = sanitizeInput(input.name, 150)

        // Set last_seo_update_at when SEO-sensitive fields are changed
        if (isSeoSensitiveChange) {
            updateData.last_seo_update_at = new Date().toISOString()
        }
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
        if (input.is_showcase_active !== undefined) {
            if (input.is_showcase_active === true) {
                const { isShowcaseAdminSuspended } = await import("@/lib/commerce/store-showcase")
                const [{ data: storeShowcaseRow }, { data: partnerShowcaseRow }] = await Promise.all([
                    admin
                        .from("stores")
                        .select("showcase_suspended_at, showcase_suspended_until")
                        .eq("id", input.storeId)
                        .maybeSingle(),
                    admin
                        .from("partners")
                        .select("showcase_suspended_at, showcase_suspended_until")
                        .eq("id", input.partnerId)
                        .maybeSingle(),
                ])
                if (isShowcaseAdminSuspended(storeShowcaseRow) || isShowcaseAdminSuspended(partnerShowcaseRow)) {
                    return {
                        success: false,
                        error: "A vitrine online desta loja está desativada pela administração e não pode ser reativada manualmente.",
                    }
                }
            }
            updateData.is_showcase_active = input.is_showcase_active
        }
        if (input.accept_orders_when_closed !== undefined) updateData.accept_orders_when_closed = input.accept_orders_when_closed
        // F5.4b: Business data fields
        if (input.business_info !== undefined) {
            // Mescla com o registro atual em vez de sobrescrever: o formulário
            // envia apenas `{ mode }` e sobrescrever apagaria as flags de
            // onboarding do Guia de Configuração.
            updateData.business_info = {
                ...toBusinessInfoRecord(currentStore?.business_info),
                ...toBusinessInfoRecord(input.business_info),
            }
        }
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
        // Regime tributário simplificado (usado no DRE gerencial)
        if (input.simplesTaxRateProducts !== undefined) updateData.simples_tax_rate_products = input.simplesTaxRateProducts ?? 0
        if (input.simplesTaxRateServices !== undefined) updateData.simples_tax_rate_services = input.simplesTaxRateServices ?? 0
        if (input.meiFixedTaxAmount !== undefined) updateData.mei_fixed_tax_amount = input.meiFixedTaxAmount ?? 0
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

function maskEmailAddress(email: string): string {
    const parts = email.split("@")
    if (parts.length !== 2) return "seu e-mail"
    const [name, domain] = parts
    const maskedName = name.length > 2
        ? `${name[0]}***${name[name.length - 1]}`
        : `${name[0]}***`
    return `${maskedName}@${domain}`
}

/**
 * Dry-run volumetry report before deleting a branch/store.
 */
export async function getStoreDeletionDryRunAction(
    storeId: string,
    partnerId: string,
    csrf_token?: string,
): Promise<{ success?: boolean; report?: StorePreDeleteReport; error?: string }> {
    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(csrf_token)
    if (!csrfValidation.valid) {
        return { error: csrfValidation.error || "Token CSRF inválido" }
    }

    try {
        await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "delete")

        const res = await StoreDeletionService.getPreDeleteReport(partnerId, storeId)
        if (!res.success || !res.report) {
            return { error: res.error || "Erro ao simular exclusão da filial." }
        }
        return { success: true, report: res.report }
    } catch (error) {
        return { error: error instanceof Error ? error.message : "Erro ao simular exclusão da filial." }
    }
}

/**
 * Cancels all active recurring subscriptions linked strictly to a branch/store
 * before requesting branch deletion.
 */
export async function cancelStoreRecurringSubscriptionsAction(
    storeId: string,
    partnerId: string,
    csrf_token?: string,
): Promise<{ success?: boolean; cancelled?: number; failed?: number; error?: string }> {
    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(csrf_token)
    if (!csrfValidation.valid) {
        return { error: csrfValidation.error || "Token CSRF inválido" }
    }

    try {
        await requireUser()
        await requireStorePermission(storeId, partnerId, "stores", "delete")

        const { cancelled, failed } = await StoreDeletionService.cancelStoreRecurringSubscriptions(
            partnerId,
            storeId,
        )

        revalidatePath("/erp/assinaturas")
        revalidatePath("/assinaturas")
        try {
            revalidateTag(`partner_recurring_plans_${partnerId}`, { expire: 0 })
        } catch { }

        return { success: true, cancelled, failed }
    } catch (error) {
        SecureLogger.error("Error cancelling store recurring subscriptions", {
            storeId,
            partnerId,
            error: error instanceof Error ? error.message : String(error),
        })
        return { error: "Não foi possível cancelar as assinaturas recorrentes desta filial agora." }
    }
}

/**
 * Step 1 of Store/Branch Deletion Flow:
 * Validates permissions, ensures store is deletable and has no active recurring subscriptions,
 * generates a 6-digit numeric OTP, saves SHA-256 hash into store_deletion_requests,
 * and sends the verification code via SMTP2GO.
 */
export async function requestStoreDeletionCodeAction(input: {
    storeId: string
    partnerId: string
    reason?: string | null
    csrf_token?: string
}): Promise<{
    success?: boolean
    error?: string
    maskedEmail?: string
    cooldownSeconds?: number
}> {
    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")

    try {
        const [, csrfValidation, user, reqHeaders] = await Promise.all([
            requireRateLimit(RateLimitCategory.STORE_DELETE_REQUEST),
            requireCSRF(input.csrf_token),
            requireUser(),
            headers(),
        ])

        if (!csrfValidation.valid) {
            return { error: csrfValidation.error || "Token CSRF inválido" }
        }

        await requireStorePermission(input.storeId, input.partnerId, "stores", "delete")

        const rawEmail = user.email?.trim().toLowerCase()
        if (!rawEmail) {
            return { error: "Usuário não possui um e-mail válido vinculado à conta." }
        }

        const validation = await StoreDeletionService.validateStoreDeletable(input.partnerId, input.storeId)
        if (!validation.valid || !validation.store) {
            return { error: validation.error || "Esta filial não pode ser excluída." }
        }

        const { countActiveStoreRecurringSubscriptions } = await import("@/lib/services/recurring/limits")
        const activeRecurringCount = await countActiveStoreRecurringSubscriptions(input.partnerId, input.storeId)
        if (activeRecurringCount > 0) {
            return {
                error: `Esta filial possui ${activeRecurringCount} assinatura(s) recorrente(s) ativa(s). Cancele todas antes de solicitar a exclusão.`,
            }
        }

        const admin = createAdminClient()
        const nowMs = Date.now()
        const twentyFourHoursAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString()

        const { data: recentRequests } = await admin
            .from("store_deletion_requests")
            .select("created_at")
            .eq("user_id", user.id)
            .eq("store_id", input.storeId)
            .gt("created_at", twentyFourHoursAgo)
            .order("created_at", { ascending: false })
            .limit(5)

        const latestRequest = recentRequests?.[0]
        if (latestRequest) {
            const elapsedMs = nowMs - new Date(latestRequest.created_at).getTime()
            if (elapsedMs < 60 * 1000) {
                const remainingSec = Math.max(1, Math.ceil((60 * 1000 - elapsedMs) / 1000))
                return {
                    error: `Aguarde ${remainingSec} segundos antes de solicitar um novo código.`,
                    cooldownSeconds: remainingSec,
                }
            }
        }

        if ((recentRequests?.length || 0) >= 5) {
            return { error: "Você atingiu o limite de solicitações de código para esta filial hoje. Tente novamente mais tarde." }
        }

        const nowIso = new Date(nowMs).toISOString()
        const rawCode = crypto.randomInt(100000, 1000000).toString()
        const codeHash = crypto.createHash("sha256").update(rawCode).digest("hex")
        const expiresAt = new Date(nowMs + 15 * 60 * 1000) // 15 minutes

        const userAgent = reqHeaders.get("user-agent")
        const ip = getTrustedClientIP(reqHeaders)
        const country = getTrustedClientCountry(reqHeaders) || "unknown"
        const sanitizedReason = input.reason ? sanitizeInput(input.reason, 500) : null

        const [, { data: requestRow, error: insertError }, emailResult] = await Promise.all([
            admin
                .from("store_deletion_requests")
                .update({ expires_at: nowIso })
                .eq("user_id", user.id)
                .eq("store_id", input.storeId)
                .is("verified_at", null)
                .lt("created_at", nowIso),
            admin
                .from("store_deletion_requests")
                .insert({
                    user_id: user.id,
                    partner_id: input.partnerId,
                    store_id: input.storeId,
                    email: rawEmail,
                    code_hash: codeHash,
                    expires_at: expiresAt.toISOString(),
                    attempts: 0,
                    max_attempts: 5,
                    request_ip: ip,
                    user_agent: userAgent,
                    metadata: {
                        reason: sanitizedReason,
                        store_name: validation.store.name,
                        country,
                    },
                })
                .select("id")
                .single(),
            SMTP2GOService.sendEmail({
                to: [{ email: rawEmail, name: user.user_metadata?.full_name || undefined }],
                subject: `Confirme a exclusão da filial ${validation.store.name} - Dudit`,
                html: getStoreDeletionEmailHtml(rawCode, validation.store.name, 15),
                text: getStoreDeletionEmailText(rawCode, validation.store.name, 15),
                userId: user.id,
                partnerId: input.partnerId,
            }),
        ])

        if (insertError || !requestRow) {
            SecureLogger.error("Failed to insert store_deletion_requests record", {
                userId: user.id,
                storeId: input.storeId,
                error: insertError?.message,
            })
            return { error: "Erro ao gerar código de confirmação." }
        }

        if (!emailResult.success) {
            SecureLogger.error("Failed to send store deletion verification email", {
                userId: user.id,
                storeId: input.storeId,
                error: emailResult.error,
            })
            return { error: "Não foi possível enviar o e-mail com o código. Tente novamente." }
        }

        void auditLog({
            action: "store.deletion_code_requested",
            actorUserId: user.id,
            partnerId: input.partnerId,
            metadata: {
                requestId: requestRow.id,
                storeId: input.storeId,
                storeName: validation.store.name,
                maskedEmail: maskEmailAddress(rawEmail),
            },
        }).catch(() => { })

        return {
            success: true,
            maskedEmail: maskEmailAddress(rawEmail),
            cooldownSeconds: 60,
        }
    } catch (error) {
        SecureLogger.error("Unexpected error in requestStoreDeletionCodeAction", {
            storeId: input.storeId,
            error: error instanceof Error ? error.message : String(error),
        })
        return { error: error instanceof Error ? error.message : "Ocorreu um erro inesperado ao solicitar o código." }
    }
}

/**
 * Step 2 of Store/Branch Deletion Flow:
 * Verifies the 6-digit numeric code with constant-time comparison, tracks failed attempts,
 * and on success executes full atomic deletion of all store data across ERP and Marketplace.
 */
export async function confirmStoreDeletionAction(input: {
    storeId: string
    partnerId: string
    code: string
    reason?: string | null
    csrf_token?: string
}): Promise<{
    success?: boolean
    error?: string
    remainingAttempts?: number
    isLocked?: boolean
    fallbackStoreId?: string | null
}> {
    await requireRateLimit(RateLimitCategory.STORE_DELETE_VERIFY)

    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(input.csrf_token)
    if (!csrfValidation.valid) {
        return { error: csrfValidation.error || "Token CSRF inválido" }
    }

    try {
        const user = await requireUser()
        await requireStorePermission(input.storeId, input.partnerId, "stores", "delete")

        const cleanCode = (input.code || "").trim()
        if (!/^\d{6}$/.test(cleanCode)) {
            return { error: "O código de confirmação deve ter exatamente 6 dígitos numéricos." }
        }

        const admin = createAdminClient()

        const { data: requestRow, error: reqError } = await admin
            .from("store_deletion_requests")
            .select("*")
            .eq("user_id", user.id)
            .eq("partner_id", input.partnerId)
            .eq("store_id", input.storeId)
            .is("verified_at", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (reqError || !requestRow) {
            return { error: "Nenhuma solicitação de código pendente encontrada. Solicite um novo código." }
        }

        if (requestRow.attempts >= requestRow.max_attempts) {
            return {
                error: "Número máximo de tentativas incorretas excedido. Solicite um novo código.",
                isLocked: true,
                remainingAttempts: 0,
            }
        }

        if (new Date(requestRow.expires_at).getTime() < Date.now()) {
            return { error: "O código de confirmação expirou. Solicite um novo código." }
        }

        const inputHash = crypto.createHash("sha256").update(cleanCode).digest("hex")
        const storedHash = String(requestRow.code_hash || "")
        const isMatch =
            storedHash.length === inputHash.length &&
            crypto.timingSafeEqual(Buffer.from(storedHash, "utf8"), Buffer.from(inputHash, "utf8"))

        if (!isMatch) {
            const newAttempts = requestRow.attempts + 1
            await admin
                .from("store_deletion_requests")
                .update({
                    attempts: newAttempts,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestRow.id)

            void auditLog({
                action: "store.deletion_code_failed",
                actorUserId: user.id,
                partnerId: input.partnerId,
                metadata: {
                    requestId: requestRow.id,
                    storeId: input.storeId,
                    attempt: newAttempts,
                },
            }).catch(() => { })

            const remaining = Math.max(0, requestRow.max_attempts - newAttempts)
            if (remaining === 0) {
                return {
                    error: "Código incorreto. Limite de 5 tentativas atingido. Solicite um novo código.",
                    isLocked: true,
                    remainingAttempts: 0,
                }
            }

            return {
                error: `Código incorreto. Você ainda tem ${remaining} tentativa(s).`,
                remainingAttempts: remaining,
            }
        }

        // Mark code verified
        await admin
            .from("store_deletion_requests")
            .update({
                verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", requestRow.id)

        const rawReason = input.reason || requestRow.metadata?.reason || null
        const finalReason = rawReason ? sanitizeInput(String(rawReason), 500) : null

        await auditLog({
            action: "store.deletion_confirmed",
            actorUserId: user.id,
            partnerId: input.partnerId,
            metadata: {
                requestId: requestRow.id,
                storeId: input.storeId,
                reason: finalReason,
            },
        })

        // Execute complete store-scoped purge
        const deletionResult = await StoreDeletionService.executeStoreDeletion({
            storeId: input.storeId,
            partnerId: input.partnerId,
            actorUserId: user.id,
            reason: finalReason,
        })

        logAudit("store.deleted", {
            partnerId: input.partnerId,
            storeId: input.storeId,
            storeName: deletionResult.storeName,
            reason: finalReason,
            dbRowsDeleted: deletionResult.dbRowsDeleted,
        })

        // If the user's active store cookie was the deleted store, switch it to fallback (headquarters)
        const currentActiveStoreId = await getActiveStoreId()
        if (currentActiveStoreId === input.storeId) {
            if (deletionResult.fallbackStoreId) {
                await setActiveStore(deletionResult.fallbackStoreId)
            } else {
                await clearActiveStore()
            }
        }

        return {
            success: true,
            fallbackStoreId: deletionResult.fallbackStoreId,
        }
    } catch (error) {
        SecureLogger.error("Unexpected error in confirmStoreDeletionAction", {
            storeId: input.storeId,
            partnerId: input.partnerId,
            error: error instanceof Error ? error.message : String(error),
        })
        return {
            error: error instanceof Error ? error.message : "Ocorreu um erro inesperado ao excluir a filial.",
        }
    }
}

/**
 * Legacy direct store deletion action: blocked to enforce 2-step email OTP verification.
 */
export async function deleteStoreAction(storeId: string, partnerId: string): Promise<ActionResponse<void>> {
    return {
        success: false,
        error: "A exclusão direta de filiais foi descontinuada. Confirme com o código de 6 dígitos enviado por e-mail.",
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

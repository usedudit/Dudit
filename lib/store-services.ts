import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { Service, StoreServiceOverride, ResolvedService } from "@/lib/types/service"

type RawService = Record<string, unknown>

/**
 * Resolve um serviço para uma store específica, aplicando overrides.
 *
 * Segue exatamente o mesmo padrão de resolveProduct() (Fase 5).
 *
 * Fluxo:
 * 1. Busca o serviço base em services (inclui joins de metadados)
 * 2. Busca o store_services para (service_id, store_id)
 * 3. Se existir store_services: mescla override fields com COALESCE
 * 4. Se não existir: usa os valores base do services
 */
export async function resolveService(
    serviceId: string,
    storeId: string
): Promise<ResolvedService | null> {
    const supabase = createAdminClient()

    const [serviceRes, ssRes, allSsRes] = await Promise.all([
        supabase
            .from("services")
            .select(`
                *,
                category:service_categories!category_id(name),
                subcategory:service_categories!subcategory_id(name)
            `)
            .eq("id", serviceId)
            .maybeSingle(),
        supabase
            .from("store_services")
            .select("*")
            .eq("service_id", serviceId)
            .eq("store_id", storeId)
            .maybeSingle(),
        supabase
            .from("store_services")
            .select("store_id, visibility_scope")
            .eq("service_id", serviceId),
    ])

    if (serviceRes.error || !serviceRes.data) return null

    const service = serviceRes.data as unknown as Service & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
    }

    const override = ssRes.data as StoreServiceOverride | null
    const allLinks = (allSsRes.data || []) as { store_id: string; visibility_scope: string }[]

    if (!override) {
        if (allLinks.length > 0) {
            const hasGlobalScope = allLinks.some(l => l.visibility_scope === 'all')
            if (!hasGlobalScope) {
                return null
            }
        }
    }

    return buildResolvedService(service, override)
}

/**
 * Lista serviços resolvidos para uma store específica.
 *
 * Usa LEFT JOIN único entre services e store_services para evitar N+1.
 * O JOIN é filtrado por store_id no banco (PostgREST coloca na cláusula ON).
 */
export async function listStoreServices(
    partnerId: string,
    storeId: string | null,
    options?: {
        isActive?: boolean
        search?: string
        categoryId?: string
        limit?: number
        offset?: number
    }
): Promise<ResolvedService[]> {
    const supabase = createAdminClient()

    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0

    let query = supabase
        .from("services")
        .select(`
            *,
            category:service_categories!category_id(name),
            subcategory:service_categories!subcategory_id(name),
            store_overrides:store_services!left(
                id, override_price, override_sku, is_active, visibility_scope, marketplace_visible
            )
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

    if (options?.isActive !== undefined) {
        query = query.eq("is_active", options.isActive)
    }

    if (options?.search) {
        query = query.ilike("name", `%${options.search}%`)
    }

    if (options?.categoryId) {
        query = query.eq("category_id", options.categoryId)
    }

    if (storeId) {
        query = query.filter("store_overrides.store_id", "eq", storeId)
    }

    const { data, error } = await query

    if (error || !data) return []

    let fetchedServices = (data as RawService[]).map((row) => {
        const overrides = (row.store_overrides as RawService[] | null) || []
        const storeOverride = overrides[0] ? (overrides[0] as unknown as StoreServiceOverride) : undefined

        const service = { ...row } as unknown as Service & {
            category?: { name: string } | null
            subcategory?: { name: string } | null
        }

        if (service.category?.name) service.category = service.category.name as any
        if (service.subcategory?.name) service.subcategory = service.subcategory.name as any
        delete (service as any).store_overrides

        return { service, storeOverride: storeOverride || null }
    })

    if (storeId && fetchedServices.length > 0) {
        const serviceIds = fetchedServices.map(s => s.service.id)
        const { data: allLinks } = await supabase
            .from("store_services")
            .select("service_id, store_id, visibility_scope")
            .in("service_id", serviceIds)

        if (allLinks && allLinks.length > 0) {
            const restrictions = new Map<string, { hasAll: boolean; storeHasBridge: boolean }>()
            for (const link of allLinks) {
                if (!restrictions.has(link.service_id)) {
                    restrictions.set(link.service_id, { hasAll: false, storeHasBridge: false })
                }
                const r = restrictions.get(link.service_id)!
                if (link.visibility_scope === 'all') r.hasAll = true
                if (link.store_id === storeId) r.storeHasBridge = true
            }

            fetchedServices = fetchedServices.filter(({ service }) => {
                const r = restrictions.get(service.id)
                if (!r) return true
                if (r.hasAll) return true
                if (r.storeHasBridge) return true
                return false
            })
        }
    }

    return fetchedServices.map(({ service, storeOverride }) =>
        buildResolvedService(service, storeOverride)
    )
}

/**
 * Cria (ou atualiza) um vínculo de serviço a uma store com overrides.
 * Idempotente: se já existir store_services para (service_id, store_id),
 * faz UPDATE dos overrides.
 */
export async function linkServiceToStore(
    serviceId: string,
    storeId: string,
    overrides?: {
        override_price?: number | null
        override_sku?: string | null
        is_active?: boolean | null
        visibility_scope?: 'all' | 'selected' | 'exclusive'
        marketplace_visible?: boolean
    }
): Promise<StoreServiceOverride> {
    const supabase = createAdminClient()

    const payload: Record<string, unknown> = {
        service_id: serviceId,
        store_id: storeId,
        updated_at: new Date().toISOString(),
    }

    if (overrides?.override_price !== undefined) payload.override_price = overrides.override_price
    if (overrides?.override_sku !== undefined) payload.override_sku = overrides.override_sku
    if (overrides?.is_active !== undefined) payload.is_active = overrides.is_active
    if (overrides?.visibility_scope !== undefined) payload.visibility_scope = overrides.visibility_scope
    if (overrides?.marketplace_visible !== undefined) payload.marketplace_visible = overrides.marketplace_visible

    const { data, error } = await supabase
        .from("store_services")
        .upsert(payload, { onConflict: "service_id, store_id" })
        .select()
        .single()

    if (error || !data) {
        throw new Error(error?.message || "Erro ao vincular serviço à loja")
    }

    return data as StoreServiceOverride
}

/**
 * Atualiza os override fields de um store_services existente.
 */
export async function updateStoreServiceOverride(
    serviceId: string,
    storeId: string,
    overrides: {
        override_price?: number | null
        override_sku?: string | null
        is_active?: boolean | null
        visibility_scope?: 'all' | 'selected' | 'exclusive'
        marketplace_visible?: boolean
    }
): Promise<StoreServiceOverride> {
    const supabase = createAdminClient()

    const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    }

    if (overrides.override_price !== undefined) payload.override_price = overrides.override_price
    if (overrides.override_sku !== undefined) payload.override_sku = overrides.override_sku
    if (overrides.is_active !== undefined) payload.is_active = overrides.is_active
    if (overrides.visibility_scope !== undefined) payload.visibility_scope = overrides.visibility_scope
    if (overrides.marketplace_visible !== undefined) payload.marketplace_visible = overrides.marketplace_visible

    const { data, error } = await supabase
        .from("store_services")
        .update(payload)
        .eq("service_id", serviceId)
        .eq("store_id", storeId)
        .select()
        .single()

    if (error || !data) {
        throw new Error(error?.message || "Erro ao atualizar override do serviço na loja")
    }

    return data as StoreServiceOverride
}

/**
 * Remove o vínculo de um serviço a uma store.
 */
export async function unlinkServiceFromStore(
    serviceId: string,
    storeId: string
): Promise<void> {
    const supabase = createAdminClient()

    const { error } = await supabase
        .from("store_services")
        .delete()
        .eq("service_id", serviceId)
        .eq("store_id", storeId)

    if (error) {
        throw new Error(error?.message || "Erro ao desvincular serviço da loja")
    }
}

/**
 * Retorna todos os store_services para um serviço (em todas as stores).
 */
export async function getServiceStoreLinks(
    serviceId: string
): Promise<StoreServiceOverride[]> {
    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from("store_services")
        .select("*")
        .eq("service_id", serviceId)

    if (error) return []
    return (data || []) as StoreServiceOverride[]
}

/**
 * Verifica se um serviço está vinculado a uma store específica.
 */
export async function isServiceLinkedToStore(
    serviceId: string,
    storeId: string
): Promise<boolean> {
    const supabase = createAdminClient()

    const { data } = await supabase
        .from("store_services")
        .select("id")
        .eq("service_id", serviceId)
        .eq("store_id", storeId)
        .maybeSingle()

    return data !== null
}

/**
 * Constrói um ResolvedService a partir do serviço base e do override (opcional).
 * ÚNICA função de COALESCE para serviços. Nenhum lugar deve fazer merge manual.
 */
function buildResolvedService(
    service: Service & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
    },
    override: StoreServiceOverride | null
): ResolvedService {
    const hasOverride = override !== null

    return {
        ...service,
        category: (service.category as any)?.name ?? service.category ?? null,
        subcategory: (service.subcategory as any)?.name ?? service.subcategory ?? null,
        resolved_price: hasOverride && override!.override_price !== null
            ? Number(override!.override_price)
            : Number(service.price),
        resolved_sku: hasOverride && override!.override_sku !== null
            ? override!.override_sku
            : service.sku,
        store_is_active: hasOverride
            ? override!.is_active !== false
            : service.is_active,
        store_service_id: hasOverride ? override!.id : null,
        has_store_override: hasOverride,
        visibility_scope: hasOverride
            ? override!.visibility_scope
            : 'all',
        marketplace_visible: hasOverride
            ? override!.marketplace_visible
            : (service.show_in_marketplace ?? true),
    }
}

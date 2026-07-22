import "server-only"
import { createAdminClient } from "@/lib/supabase/server"
import type { Service, ResolvedService } from "@/lib/types/service"

type RawService = Record<string, unknown>

export async function resolveService(
    serviceId: string,
    storeId: string
): Promise<ResolvedService | null> {
    const supabase = createAdminClient()

    const { data: service, error } = await supabase
        .from("services")
        .select(`
            *,
            category:service_categories!category_id(name),
            subcategory:service_categories!subcategory_id(name)
        `)
        .eq("id", serviceId)
        .eq("store_id", storeId)
        .maybeSingle()

    if (error || !service) return null

    const s = service as unknown as Service & {
        category?: { name: string } | null
        subcategory?: { name: string } | null
    }

    return {
        ...s,
        category: (s.category as any)?.name ?? s.category ?? null,
        subcategory: (s.subcategory as any)?.name ?? s.subcategory ?? null,
        resolved_price: Number(s.price),
        resolved_sku: s.sku,
        store_is_active: s.is_active,
        store_service_id: null,
        has_store_override: false,
        visibility_scope: 'exclusive' as const,
        marketplace_visible: service.show_in_marketplace ?? true,
    }
}

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
            subcategory:service_categories!subcategory_id(name)
        `)
        .eq("partner_id", partnerId)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1)

    if (storeId) {
        query = query.eq("store_id", storeId)
    }

    if (options?.isActive !== undefined) {
        query = query.eq("status", options.isActive ? "ativo" : "inativo")
    }

    if (options?.search) {
        query = query.ilike("name", `%${options.search}%`)
    }

    if (options?.categoryId) {
        query = query.eq("category_id", options.categoryId)
    }

    const { data, error } = await query

    if (error || !data) return []

    return (data as RawService[]).map((row) => {
        const service = { ...row } as unknown as Service & {
            category?: { name: string } | null
            subcategory?: { name: string } | null
        }

        if (service.category?.name) service.category = service.category.name as any
        if (service.subcategory?.name) service.subcategory = service.subcategory.name as any

        return {
            ...service,
            resolved_price: Number(service.price),
            resolved_sku: service.sku,
            store_is_active: service.is_active,
            store_service_id: null,
            has_store_override: false,
            visibility_scope: 'exclusive' as const,
            marketplace_visible: (service as any).show_in_marketplace ?? true,
        }
    })
}

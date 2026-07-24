"use server"

import "server-only"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { listStoreProducts } from "@/lib/store-products"
import { listStoreServices } from "@/lib/store-services"

const storeBySlugCacheMap = new Map<string, any>()
const storeByIdCacheMap = new Map<string, any>()
const storeProductsCacheMap = new Map<string, any>()
const storeServicesCacheMap = new Map<string, any>()
const storeReviewsCacheMap = new Map<string, any>()
const storeStatsCacheMap = new Map<string, any>()

export const getCachedStoreBySlug = async (slug: string) => {
    let fn = storeBySlugCacheMap.get(slug)
    if (!fn) {
        fn = unstable_cache(
            async () => {
                const supabase = createAdminClient()
                const { data } = await supabase
                    .from("stores")
                    .select(`
                        *,
                        partners!inner(id, store_name, store_description, store_image_url, rating, phone, opening_hours, business_info, created_at, marketplace_reputation, vendas_totais, vendas_produtos, vendas_servicos, vendas_assinaturas, payment_methods(*))
                    `)
                    .eq("slug", slug)
                    .eq("is_active", true)
                    .maybeSingle()
                return data
            },
            [`store-slug-${slug}`],
            { tags: [`store-${slug}`], revalidate: 30 }
        )
        storeBySlugCacheMap.set(slug, fn)
    }
    return fn()
}

export async function getStoreBySlug(slug: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("stores")
        .select(`
                        *,
                        partners!inner(id, store_name, store_description, store_image_url, rating, phone, opening_hours, business_info, created_at, marketplace_reputation, vendas_totais, vendas_produtos, vendas_servicos, vendas_assinaturas, payment_methods(*))
        `)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle()
    return data
}

export const getCachedStoreById = async (storeId: string) => {
    let fn = storeByIdCacheMap.get(storeId)
    if (!fn) {
        fn = unstable_cache(
            async () => {
                const supabase = createAdminClient()
                const { data, error } = await supabase
                    .from("stores")
                    .select(`
                        *,
                        partners!left(id, store_name, store_description, store_image_url, rating, phone, opening_hours, business_info, created_at, marketplace_reputation, vendas_totais, vendas_produtos, vendas_servicos, vendas_assinaturas, payment_methods(*))
                    `)
                    .eq("id", storeId)
                    .maybeSingle()
                if (error) console.error("[getCachedStoreById] Erro na query:", error.message, { storeId })
                if (!data) console.error("[getCachedStoreById] Store nao encontrada:", { storeId })
                return data
            },
            [`store-profile-${storeId}`],
            { tags: ["store-profile", `store-${storeId}`], revalidate: 30 }
        )
        storeByIdCacheMap.set(storeId, fn)
    }
    return fn()
}

export const getCachedStoreProducts = async (storeId: string, partnerId: string) => {
    const mapKey = `${storeId}:${partnerId}`
    let fn = storeProductsCacheMap.get(mapKey)
    if (!fn) {
        fn = unstable_cache(
            async () => listStoreProducts(partnerId, storeId, { isActive: true, includeVariants: true }),
            [`store-products-${storeId}`],
            { tags: ["store-products", `store-${storeId}`], revalidate: 30 }
        )
        storeProductsCacheMap.set(mapKey, fn)
    }
    return fn()
}

export const getCachedStoreServices = async (storeId: string, partnerId: string) => {
    const mapKey = `${storeId}:${partnerId}`
    let fn = storeServicesCacheMap.get(mapKey)
    if (!fn) {
        fn = unstable_cache(
            async () => listStoreServices(partnerId, storeId, { isActive: true }),
            [`store-services-${storeId}`],
            { tags: ["store-services", `store-${storeId}`], revalidate: 30 }
        )
        storeServicesCacheMap.set(mapKey, fn)
    }
    return fn()
}

export const getCachedStoreReviews = async (storeId: string) => {
    let fn = storeReviewsCacheMap.get(storeId)
    if (!fn) {
        fn = unstable_cache(
            async () => {
                const supabase = createAdminClient()
                const { data: reviewsData } = await supabase
                    .from("reviews")
                    .select(`
                        *,
                        products:product_id(name),
                        services:service_id(name)
                    `)
                    .eq("store_id", storeId)
                    .order("created_at", { ascending: false })
                    .limit(50)

                if (!reviewsData || reviewsData.length === 0) return []

                const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
                const profilesMap = new Map<string, { full_name: string }>()

                if (userIds.length > 0) {
                    const { data: profilesData } = await supabase
                        .from("user_profiles")
                        .select("user_id, full_name")
                        .in("user_id", userIds)

                    if (profilesData) {
                        profilesData.forEach((p: any) => {
                            profilesMap.set(p.user_id, { full_name: p.full_name })
                        })
                    }
                }

                return reviewsData.map((r: any) => ({
                    ...r,
                    profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" }
                }))
            },
            [`store-reviews-${storeId}`],
            { tags: ["store-reviews", `store-${storeId}`] }
        )
        storeReviewsCacheMap.set(storeId, fn)
    }
    return fn()
}

export const getCachedStoreStats = async (storeId: string) => {
    let fn = storeStatsCacheMap.get(storeId)
    if (!fn) {
        fn = unstable_cache(
            async () => {
                const supabase = createAdminClient()
                const [reviews] = await Promise.all([
                    supabase.from("reviews").select("*", { count: "exact", head: true }).eq("store_id", storeId),
                ])
                return { reviewsCount: reviews.count || 0 }
            },
            [`store-stats-${storeId}`],
            { tags: ["store-stats", `store-${storeId}`] }
        )
        storeStatsCacheMap.set(storeId, fn)
    }
    return fn()
}

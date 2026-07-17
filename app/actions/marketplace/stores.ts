"use server"

import "server-only"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { listStoreProducts } from "@/lib/store-products"
import { listStoreServices } from "@/lib/store-services"

export function normalizeSlugForUrl(slug: string): string {
    return slug
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
}

export function buildStoreCitySlug(store: { city?: string | null; state?: string | null }): string {
    const city = store.city || "brasil"
    const state = store.state || ""
    const slug = `${normalizeSlugForUrl(city)}-${state.toLowerCase()}`
    return slug.replace(/-+$/, "")
}

export const getCachedStoreBySlug = async (slug: string) => {
    const fn = unstable_cache(
        async () => {
            const supabase = createAdminClient()
            const { data } = await supabase
                .from("stores")
                .select(`
                    *,
                    partners!inner(id, store_name, store_description, store_image_url, banner_url, rating, phone, opening_hours, business_info, created_at, is_showcase_active, marketplace_reputation, vendas_totais),
                    addresses!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)
                `)
                .eq("slug", slug)
                .eq("is_active", true)
                .maybeSingle()
            return data
        },
        [`store-slug-${slug}`],
        { tags: [`store-${slug}`], revalidate: 30 }
    )
    return fn()
}

export async function getStoreBySlug(slug: string) {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("stores")
        .select(`
            *,
            partners!inner(id, store_name, store_description, store_image_url, banner_url, rating, phone, opening_hours, business_info, created_at, is_showcase_active, marketplace_reputation, vendas_totais),
            addresses!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)
        `)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle()
    return data
}

export const getCachedStoreById = async (storeId: string) => {
    const fn = unstable_cache(
        async () => {
            const supabase = createAdminClient()
            const { data } = await supabase
                .from("stores")
                .select(`
                    *,
                    partners!inner(id, store_name, store_description, store_image_url, banner_url, rating, phone, opening_hours, business_info, created_at, is_showcase_active, marketplace_reputation, vendas_totais),
                    addresses!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)
                `)
                .eq("id", storeId)
                .maybeSingle()
            return data
        },
        [`store-profile-${storeId}`],
        { tags: ["store-profile", `store-${storeId}`] }
    )
    return fn()
}

export const getCachedStoreProducts = async (storeId: string, partnerId: string) => {
    const fn = unstable_cache(
        async () => listStoreProducts(partnerId, storeId, { isActive: true, includeVariants: true }),
        [`store-products-${storeId}`],
        { tags: ["store-products", `store-${storeId}`], revalidate: 30 }
    )
    return fn()
}

export const getCachedStoreServices = async (storeId: string, partnerId: string) => {
    const fn = unstable_cache(
        async () => listStoreServices(partnerId, storeId, { isActive: true }),
        [`store-services-${storeId}`],
        { tags: ["store-services", `store-${storeId}`], revalidate: 30 }
    )
    return fn()
}

export const getCachedStoreReviews = async (storeId: string) => {
    const fn = unstable_cache(
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
    return fn()
}

export const getCachedStoreStats = async (storeId: string) => {
    const fn = unstable_cache(
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
    return fn()
}

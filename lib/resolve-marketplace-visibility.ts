import "server-only"
import { createAdminClient } from "@/lib/supabase/server"

export async function filterMarketplaceVisibleProducts(
    productIds: string[]
): Promise<Set<string>> {
    if (productIds.length === 0) return new Set()
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("products")
        .select("id")
        .in("id", productIds)
        .eq("show_in_marketplace", true)
    if (!data) return new Set()
    return new Set(data.map((d: { id: string }) => d.id))
}

export async function filterMarketplaceVisibleServices(
    serviceIds: string[]
): Promise<Set<string>> {
    if (serviceIds.length === 0) return new Set()
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("services")
        .select("id")
        .in("id", serviceIds)
        .eq("show_in_marketplace", true)
    if (!data) return new Set()
    return new Set(data.map((d: { id: string }) => d.id))
}

export async function resolveProductsForStore(
    productIds: string[],
    storeId: string
): Promise<Set<string>> {
    if (productIds.length === 0) return new Set()
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("products")
        .select("id")
        .in("id", productIds)
        .eq("store_id", storeId)
    if (!data) return new Set()
    return new Set(data.map((d: { id: string }) => d.id))
}

export async function resolveServicesForStore(
    serviceIds: string[],
    storeId: string
): Promise<Set<string>> {
    if (serviceIds.length === 0) return new Set()
    const supabase = createAdminClient()
    const { data } = await supabase
        .from("services")
        .select("id")
        .in("id", serviceIds)
        .eq("store_id", storeId)
    if (!data) return new Set()
    return new Set(data.map((d: { id: string }) => d.id))
}

import { createClient } from "@/lib/supabase/client"

let cachedRootProductCategories: { id?: string; name: string; icon_url: string | null; parent_id?: string | null }[] | null = null
let cachedRootServiceCategories: { id?: string; name: string; icon_url: string | null; parent_id?: string | null }[] | null = null
let cachedRootPartnerCategories: { id?: string; name: string; icon_url: string | null; parent_id?: string | null }[] | null = null

/**
 * Client-side fetcher for marketplace product categories with in-memory caching.
 */
export async function getMarketplaceCategoriesClient(parentId: string | null = null) {
  if (parentId === null && cachedRootProductCategories) {
    return cachedRootProductCategories
  }

  const supabase = createClient()
  
  let query = supabase
    .from("marketplace_product_categories")
    .select("id, name, icon_url, parent_id")
    .order("name")

  if (parentId) {
    query = query.eq("parent_id", parentId)
  } else {
    query = query.is("parent_id", null)
  }

  const { data, error } = await query
  if (error) {
    console.error("Error fetching marketplace categories:", error)
    return cachedRootProductCategories || []
  }

  const result = data || []
  if (parentId === null) {
    cachedRootProductCategories = result
  }
  return result
}

/**
 * Client-side fetcher for full category path.
 */
export async function getCategoryPathClient(categoryId: string, type: "product" | "service" = "product") {
  const supabase = createClient()
  const tableName = type === "service" ? "marketplace_service_categories" : "marketplace_product_categories"
  const path = []
  let currentId: string | null = categoryId

  while (currentId && !currentId.startsWith("auto-")) {
    const { data, error }: { data: any; error: any } = await supabase
      .from(tableName)
      .select("id, name, parent_id")
      .eq("id", currentId)
      .single()

    if (error || !data) break
    path.unshift(data.name)
    currentId = data.parent_id
  }

  return path.join(" > ")
}

/**
 * Client-side fetcher for marketplace service categories with in-memory caching.
 */
export async function getMarketplaceServiceCategoriesClient(parentId: string | null = null) {
  if (parentId === null && cachedRootServiceCategories) {
    return cachedRootServiceCategories
  }

  const supabase = createClient()

  let query = supabase
    .from("marketplace_service_categories")
    .select("id, name, icon_url, parent_id")
    .order("name")

  if (parentId) {
    query = query.eq("parent_id", parentId)
  } else {
    query = query.is("parent_id", null)
  }

  const { data, error } = await query
  if (error) {
    console.error("Error fetching marketplace service categories:", error)
    return cachedRootServiceCategories || []
  }

  const result = data || []
  if (parentId === null) {
    cachedRootServiceCategories = result
  }
  return result
}

/**
 * Client-side fetcher for marketplace partner (store) categories with in-memory caching.
 */
export async function getMarketplacePartnerCategoriesClient(parentId: string | null = null) {
  if (parentId === null && cachedRootPartnerCategories) {
    return cachedRootPartnerCategories
  }

  const supabase = createClient()

  let query = supabase
    .from("marketplace_partner_categories")
    .select("id, name, icon_url, parent_id")
    .order("name")

  if (parentId) {
    query = query.eq("parent_id", parentId)
  } else {
    query = query.is("parent_id", null)
  }

  const { data, error } = await query
  if (error) {
    console.error("Error fetching marketplace partner categories:", error)
    return cachedRootPartnerCategories || []
  }

  const result = data || []
  if (parentId === null) {
    cachedRootPartnerCategories = result
  }
  return result
}

/**
 * Parallel fetcher for all 3 category types.
 */
export async function fetchAllMarketplaceCategoriesClient() {
  const [products, services, partners] = await Promise.all([
    getMarketplaceCategoriesClient(null),
    getMarketplaceServiceCategoriesClient(null),
    getMarketplacePartnerCategoriesClient(null),
  ])
  return { products, services, partners }
}

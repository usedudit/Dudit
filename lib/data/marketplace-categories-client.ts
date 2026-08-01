import { createClient } from "@/lib/supabase/client"

/**
 * Client-side fetcher for marketplace categories.
 * Uses direct Supabase GET requests via the browser client.
 * This avoids the overhead and POST requests of Server Actions.
 */
export async function getMarketplaceCategoriesClient(parentId: string | null = null) {
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
    return []
  }

  return data || []
}

/**
 * Client-side fetcher for full category path.
 */
export async function getCategoryPathClient(categoryId: string) {
  const supabase = createClient()
  const path = []
  let currentId: string | null = categoryId

  while (currentId && !currentId.startsWith("auto-")) {
    const { data, error }: { data: any; error: any } = await supabase
      .from("marketplace_product_categories")
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
 * Client-side fetcher for marketplace service categories.
 */
export async function getMarketplaceServiceCategoriesClient(parentId: string | null = null) {
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
    return []
  }

  return data || []
}

/**
 * Client-side fetcher for marketplace partner (store) categories.
 */
export async function getMarketplacePartnerCategoriesClient(parentId: string | null = null) {
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
    return []
  }

  return data || []
}

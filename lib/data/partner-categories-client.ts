import { createClient } from "@/lib/supabase/client"

export async function getPartnerCategoriesClient(parentId: string | null = null) {
  const supabase = createClient()
  
  let query = supabase
    .from("marketplace_partner_categories")
    .select("id, name, slug, icon_url, parent_id")
    .order("name")

  if (parentId) {
    query = query.eq("parent_id", parentId)
  } else {
    query = query.is("parent_id", null)
  }

  const { data, error } = await query
  if (error) {
    console.error("Error fetching partner categories:", error)
    return []
  }

  return data || []
}

export async function getPartnerCategoryPathClient(categoryId: string) {
  const supabase = createClient()
  const path = []
  let currentId: string | null = categoryId

  while (currentId) {
    const { data, error }: { data: any; error: any } = await supabase
      .from("marketplace_partner_categories")
      .select("id, name, parent_id")
      .eq("id", currentId)
      .single()

    if (error || !data) break
    path.unshift(data.name)
    currentId = data.parent_id
  }

  return path.join(" > ")
}

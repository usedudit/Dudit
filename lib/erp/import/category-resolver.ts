import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export async function resolveCategories(
  partnerId: string,
  names: string[],
  entityType: "products" | "services",
): Promise<{ matched: Map<string, string>; unknown: string[] }> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))]

  if (unique.length === 0) {
    return { matched: new Map(), unknown: [] }
  }

  const table = entityType === "products" ? "product_categories" : "service_categories"

  const supabase = await getSupabaseServerClient()

  const { data: existing } = await supabase
    .from(table)
    .select("id, name")
    .eq("partner_id", partnerId)

  const matched = new Map<string, string>()
  const existingMap = new Map<string, string>()

  for (const c of existing || []) {
    const key = c.name.trim().toLowerCase()
    if (!existingMap.has(key)) {
      existingMap.set(key, c.id)
    }
  }

  for (const name of unique) {
    const key = name.trim().toLowerCase()
    if (existingMap.has(key)) {
      matched.set(key, existingMap.get(key)!)
    }
  }

  const unknown = unique.filter((n) => !matched.has(n.trim().toLowerCase()))

  return { matched, unknown }
}

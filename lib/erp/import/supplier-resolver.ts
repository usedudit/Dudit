import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { normalizeBusinessInfo } from "@/lib/business-info"

interface SupplierMatch {
  id: string | null
  name: string
  exists: boolean
}

export async function resolveSuppliers(
  partnerId: string,
  names: string[],
): Promise<{ matched: Map<string, string>; unknown: { name: string; rows: number[] }[] }> {
  const unique = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))]

  if (unique.length === 0) {
    return { matched: new Map(), unknown: [] }
  }

  const supabase = await getSupabaseServerClient()

  const { data: existing } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("partner_id", partnerId)
    .in("name", unique)

  const matched = new Map<string, string>()

  const existingMap = new Map<string, string>()
  for (const s of existing || []) {
    existingMap.set(s.name.trim().toLowerCase(), s.id)
  }

  for (const name of unique) {
    if (existingMap.has(name)) {
      matched.set(name, existingMap.get(name)!)
    }
  }

  const unknown = unique
    .filter((n) => !matched.has(n))
    .map((name) => ({
      name,
      rows: names
        .map((n, i) => (n.trim().toLowerCase() === name ? i + 1 : -1))
        .filter((i) => i !== -1),
    }))

  return { matched, unknown }
}

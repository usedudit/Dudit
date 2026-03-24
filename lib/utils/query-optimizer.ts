import { getSupabaseServerClient } from "@/lib/supabase/request-client"

export async function batchVerifyOwnership(
  resourceIds: string[],
  partnerId: string,
  resourceType: "products" | "orders" | "customers",
): Promise<{ [key: string]: boolean }> {
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from(resourceType)
    .select("id")
    .in("id", resourceIds)
    .eq("partner_id", partnerId)

  if (error) {
    console.error(`Error verifying ${resourceType} ownership:`, error)
    return {}
  }

  const ownedIds = new Set(data.map((item: any) => item.id))

  return resourceIds.reduce(
    (acc, id) => {
      acc[id] = ownedIds.has(id)
      return acc
    },
    {} as { [key: string]: boolean },
  )
}

export async function batchFetchWithRelations<T>(table: string, ids: string[], relations?: string): Promise<T[]> {
  const supabase = await getSupabaseServerClient()

  const query = supabase
    .from(table)
    .select(relations || "*")
    .in("id", ids)

  const { data, error } = await query

  if (error) {
    console.error(`Error batch fetching ${table}:`, error)
    return []
  }

  return data as T[]
}

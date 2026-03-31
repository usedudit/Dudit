"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { unstable_cache } from "next/cache"
import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/**
 * Busca parceiros baseados no bounding box da viewport do mapa.
 * Esta action garante performance delegando à RPC no PostgreSQL via Índices B-Tree.
 */
export async function getPartnersInBoundsAction(bounds: BoundingBox, limit: number = 200) {
  try {
    const supabase = await getSupabaseServerClient()

    // O uso de RPC é a forma mais performática para consultas geo-espaciais no Supabase
    // sem expor a complexidade no Client Side
    const { data, error } = await supabase.rpc("get_partners_in_bounds", {
      min_lat: bounds.minLat,
      min_lng: bounds.minLng,
      max_lat: bounds.maxLat,
      max_lng: bounds.maxLng,
      max_limit: limit
    })

    if (error) {
      console.error("[MapAction] Error fetching bounded partners:", error)
      return { success: false, data: [] }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[MapAction] Exception:", error)
    return { success: false, data: [] }
  }
}

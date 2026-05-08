"use server"

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
    // BUG FIX: getSupabaseServerClient respects RLS which often hides 'partners' from strictly untrusted sessions.
    // VendorProfile uses getAdminClient() under the hood, so we must use it here too to guarantee visibility.
    const supabase = getAdminClient()
    
    console.log("[DEBUG MAP] Bounding Box Query:", bounds)

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

    console.log(`[DEBUG MAP] Found ${data?.length || 0} partners via Bounds on DB.`)

    // FALLBACK: User requested radius search if NO partners are found in the bounding box.
    if (!data || data.length === 0) {
       console.log("[DEBUG MAP] Bounds empty! Executing Haversine Radius Fallback (30km)...")
       const centerLat = (bounds.minLat + bounds.maxLat) / 2
       const centerLng = (bounds.minLng + bounds.maxLng) / 2

       const { data: radiusData, error: radiusError } = await supabase.rpc("get_partners_in_radius", {
          center_lat: centerLat,
          center_lng: centerLng,
          radius_km: 30.0,
          max_limit: limit
       })

       if (radiusError) {
         console.error("[MapAction] Radius error:", radiusError)
       } else if (radiusData && radiusData.length > 0) {
         console.log(`[DEBUG MAP] Fallback Success! Found ${radiusData.length} via Radius 30km.`)
         return { success: true, data: radiusData, isFallback: true }
       }
    }

    return { success: true, data: data || [] }
  } catch (error) {
    console.error("[MapAction] Exception:", error)
    return { success: false, data: [] }
  }
}

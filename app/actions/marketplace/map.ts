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

/**
 * Função utilitária (Server Action) para inicializar geocoding em parceiros antigos.
 * Se houver algum parceiro sem latitude/longitude (legado), ela usa o token mapbox público
 * (que é seguro no servidor pois existe tbm) para geocodificar seu endereço e salvar.
 */
export async function geocodeMissingPartnersAction() {
  try {
    const supabase = await getSupabaseServerClient()
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

    if (!mapboxToken) return { success: false, error: "No Mapbox token" }

    // Pega até 50 parceiros sem coordenada para não estourar o limite de geocoding
    const { data: partners } = await supabase
      .from("partners")
      .select("id, addresses(street, number, city, state, zip_code)")
      .is("latitude", null)
      .limit(50)

    if (!partners || partners.length === 0) {
      return { success: true, processed: 0 }
    }

    let successCount = 0

    for (const p of partners) {
      const addressRecord: any = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses
      if (addressRecord && addressRecord.city && addressRecord.street) {
        const addressString = `${addressRecord.street}, ${addressRecord.number || ''}, ${addressRecord.city} - ${addressRecord.state || ''}, Brazil, ${addressRecord.zip_code || ''}`
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json?access_token=${mapboxToken}&limit=1&country=BR`
        
        try {
          const res = await fetch(geocodeUrl)
          const geocodeData: any = await res.json()
          
          if (geocodeData.features && geocodeData.features.length > 0) {
            const [lng, lat] = geocodeData.features[0].center
            // Atualiza partner usando Supabase Service Role para ignorar RLS ou auth puro se tivermos trigger.
            // Aqui usamos request-client, mas o update em partner talvez peça o adminClient.
            const adminClient = getAdminClient()
            await adminClient.from("partners").update({ latitude: lat, longitude: lng }).eq("id", p.id)
            successCount++
          }
        } catch (e) {
          console.error("Geocoding mapbox err:", e)
        }
      }
    }

    return { success: true, processed: successCount }

  } catch (err: any) {
     return { success: false, error: err.message }
  }
}

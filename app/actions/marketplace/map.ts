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

    // IF STILL EMPTY (or no bounds matched), check if we have uncached legacy partners
    if (!data || data.length === 0) {
      console.log("[DEBUG MAP] Both Bounds and Radius empty, fetching legacy missing-coordinate partners...")
      const { data: legacyData, error: legacyError } = await supabase
         .from("partners_public_secure")
         .select("*")
         .limit(50)

      if (legacyData && legacyData.length > 0) {
         console.log(`[DEBUG MAP] Returning ${legacyData.length} legacy partners to be resolved by Frontend!`)
         const mappedLegacy = legacyData.map((p: any) => ({
           id: p.id,
           store_name: p.store_name,
           store_image_url: p.store_image_url,
           store_description: p.store_description,
           business_type: p.business_type,
           latitude: null,
           longitude: null,
           opening_hours: p.opening_hours,
           rating: p.rating,
           address_display: `${p.street || ''}, ${p.number || ''} - ${p.city || ''}`
         }))
         return { success: true, data: mappedLegacy, isFallback: true }
      }
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
    console.log("[DEBUG MAP] Starting auto-geocode background task...")
    // Usamos admin client para poder ler e escrever partners ignorando RLS
    const supabaseAdmin = getAdminClient()
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

    if (!mapboxToken) return { success: false, error: "No Mapbox token" }

    // Pega até 50 parceiros sem coordenada para não estourar o limite de geocoding
    const { data: partners, error } = await supabaseAdmin
      .from("partners")
      .select("id, addresses(street, number, city, state, zip_code)")
      .is("latitude", null)
      .limit(50)

    if (error) console.error("[DEBUG MAP] Fetch null lat err:", error)

    if (!partners || partners.length === 0) {
      console.log("[DEBUG MAP] No missing coordinates found.")
      return { success: true, processed: 0 }
    }

    console.log(`[DEBUG MAP] Found ${partners.length} legacy partners without coordinates to fix...`)

    let successCount = 0

    for (const p of partners) {
      const addressRecord: any = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses
      if (addressRecord && addressRecord.city && addressRecord.street) {
        const addressString = `${addressRecord.street}, ${addressRecord.number || ''}, ${addressRecord.city} - ${addressRecord.state || ''}, Brazil, ${addressRecord.zip_code || ''}`
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json?access_token=${mapboxToken}&limit=1&country=BR`
        
        console.log(`[DEBUG MAP] Geocoding attempt for ${p.id} with address: ${addressString}`)
        
        try {
          const res = await fetch(geocodeUrl)
          const geocodeData: any = await res.json()
          
          if (geocodeData.features && geocodeData.features.length > 0) {
            const [lng, lat] = geocodeData.features[0].center
            // Atualiza partner usando Supabase Service Role
            await supabaseAdmin.from("partners").update({ latitude: lat, longitude: lng }).eq("id", p.id)
            successCount++
            console.log(`[DEBUG MAP] Geocoded ${p.id} successfully to [${lat}, ${lng}].`)
          } else {
            console.log(`[DEBUG MAP] No Mapbox features returned for ${addressString}`)
          }
        } catch (e) {
          console.error("Geocoding mapbox err:", e)
        }
      } else {
        console.log(`[DEBUG MAP] Partner ${p.id} has no full address (record=${JSON.stringify(addressRecord)})`)
      }
    }

    return { success: true, processed: successCount }

  } catch (err: any) {
     return { success: false, error: err.message }
  }
}

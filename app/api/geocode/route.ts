import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { safeFetch } from "@/lib/security/ssrf-guard"

export async function GET() {
  const supabase = getAdminClient()
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN

  if (!mapboxToken) {
    return NextResponse.json({ error: "Missing mapbox token" }, { status: 500 })
  }

  const { data: partners, error } = await supabase
    .from("partners")
    .select("id, addresses(street, number, city, state, zip_code)")
    .is("latitude", null)

  if (error || !partners) {
    return NextResponse.json({ error }, { status: 500 })
  }

  let successCount = 0
  const results = []

  for (const p of partners) {
    const addressRecord = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses
    
    if (addressRecord && addressRecord.city && addressRecord.street) {
      const addressString = `${addressRecord.street}, ${addressRecord.number || ''}, ${addressRecord.city} - ${addressRecord.state}, Brazil, ${addressRecord.zip_code || ''}`
      
      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressString)}.json?access_token=${mapboxToken}&limit=1&country=BR`
      
      try {
        const res = await safeFetch(geocodeUrl, {
          timeoutMs: 8_000,
          maxResponseBytes: 512 * 1024, // 512 KB — geocoding responses are small JSON
          maxRedirects: 2,
        })
        const geocodeData: any = await res.json()
        
        if (geocodeData.features && geocodeData.features.length > 0) {
          const [lng, lat] = geocodeData.features[0].center
          
          await supabase.from("partners").update({ latitude: lat, longitude: lng }).eq("id", p.id)
          successCount++
          results.push({ id: p.id, lat, lng, status: "success" })
        } else {
          results.push({ id: p.id, status: "not_found", addressString })
        }
      } catch (err: any) {
        results.push({ id: p.id, status: "error", error: err.message })
      }
      
      // Delay to avoid rate limit
      await new Promise(r => setTimeout(r, 200))
    } else {
      results.push({ id: p.id, status: "skipped" })
    }
  }

  return NextResponse.json({
    successCount,
    total: partners.length,
    results
  })
}

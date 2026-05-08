import { NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/admin"
import { geocodeAddress } from "@/lib/services/location.service"

export async function GET() {
  const supabase = getAdminClient()

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
      
      try {
        const coords = await geocodeAddress(addressString)
        if (coords) {
          await supabase
            .from("partners")
            .update({ latitude: coords.lat, longitude: coords.lng })
            .eq("id", p.id)
          successCount++
          results.push({ id: p.id, lat: coords.lat, lng: coords.lng, status: "success" })
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

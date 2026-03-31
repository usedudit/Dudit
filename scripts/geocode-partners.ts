import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!
const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN!

const supabase = createClient(supabaseUrl, supabaseServiceRole)

async function geocodeAddress(addressStr: string): Promise<[number, number] | null> {
  const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addressStr)}.json?access_token=${mapboxToken}&limit=1&country=BR`
  
  try {
    const res = await fetch(geocodeUrl)
    const data: any = await res.json()
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center
      return [lng, lat]
    }
  } catch (error) {
    console.error("Geocoding failed for:", addressStr, error)
  }
  return null
}

async function run() {
  console.log("Iniciando geocoding de parceiros legados...")
  
  // 1. Busca todos os parceiros que estão com latitude e longitude NULL
  const { data: partners, error } = await supabase
    .from("partners")
    .select("id, addresses(street, number, city, state, zip_code)")
    .is("latitude", null)
    
  if (error) {
    console.error("Erro ao buscar parceiros:", error)
    return
  }

  console.log(`Encontrados ${partners.length} parceiros sem coordenadas. Processando...`)

  let successCount = 0
  for (const p of partners) {
    const addressRecord = Array.isArray(p.addresses) ? p.addresses[0] : p.addresses
    
    if (addressRecord && addressRecord.city && addressRecord.street) {
      const addressString = `${addressRecord.street}, ${addressRecord.number || ''}, ${addressRecord.city} - ${addressRecord.state}, Brazil, ${addressRecord.zip_code || ''}`
      console.log(`Geocoding (${p.id}):`, addressString)
      
      const coords = await geocodeAddress(addressString)
      if (coords) {
        const [lng, lat] = coords
        // Update partner
        const { error: updErr } = await supabase
           .from("partners")
           .update({ latitude: lat, longitude: lng })
           .eq("id", p.id)
           
        if (!updErr) {
           console.log(`✅ Sucesso -> Lat: ${lat}, Lng: ${lng}`)
           successCount++
        } else {
           console.error("❌ Erro ao salvar DB:", updErr)
        }
      } else {
        console.log(`⚠️ Mapbox não encontrou: ${addressString}`)
      }
      
      // Respeitar Rate Limit do Mapbox
      await new Promise(r => setTimeout(r, 200))
    } else {
      console.log(`⏩ Ignorado (sem endereço estruturado) - ID: ${p.id}`)
    }
  }

  console.log(`\n🎉 Geocodificação finalizada! ${successCount}/${partners.length} atualizados.`)
}

run()

import { safeFetch } from "@/lib/security/ssrf-guard"

type Coordinate = { lat: number; lon: number }

async function geocodeAddress(address: string): Promise<Coordinate | null> {
  const query = encodeURIComponent(address)
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`
  try {
    const response = await safeFetch(url, {
      headers: { "User-Agent": "DuditERP/1.0 (delivery-fee-system)" },
      timeoutMs: 8_000,
      maxResponseBytes: 512 * 1024, // 512 KB — geocoding responses are small JSON
      maxRedirects: 2,
    })
    if (!response.ok) return null
    const data = await response.json()
    const first = Array.isArray(data) ? data[0] : null
    if (!first?.lat || !first?.lon) return null
    return { lat: Number(first.lat), lon: Number(first.lon) }
  } catch {
    return null
  }
}

export async function calculateRouteDistanceKm(originAddress: string, destinationAddress: string): Promise<number | null> {
  if (!originAddress || !destinationAddress) return null

  const [origin, destination] = await Promise.all([
    geocodeAddress(originAddress),
    geocodeAddress(destinationAddress),
  ])
  if (!origin || !destination) return null

  try {
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lon},${origin.lat};${destination.lon},${destination.lat}?overview=false`
    const response = await safeFetch(osrmUrl, {
      timeoutMs: 8_000,
      maxResponseBytes: 512 * 1024, // 512 KB — routing responses are small JSON
      maxRedirects: 2,
    })
    if (!response.ok) return null
    const payload = await response.json()
    const route = payload?.routes?.[0]
    if (!route?.distance) return null
    const km = Number(route.distance || 0) / 1000
    return Math.round((km + Number.EPSILON) * 100) / 100
  } catch {
    return null
  }
}

export type LocationPoint = {
    lat: number
    lng: number
}

type GeocodeResult = LocationPoint | null

const EARTH_RADIUS_KM = 6371
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const NOMINATIM_USER_AGENT =
    process.env.NOMINATIM_USER_AGENT || "Dudit/1.0 (contato@dudit.com.br)"
const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_RETRIES = 2

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value)
}

function normalizePoint(point: Partial<LocationPoint> | null | undefined): LocationPoint | null {
    if (!point) return null
    if (!isFiniteNumber(point.lat) || !isFiniteNumber(point.lng)) return null
    if (point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) return null
    return { lat: point.lat, lng: point.lng }
}

function toRadians(value: number): number {
    return (value * Math.PI) / 180
}

function withTimeout(signalTimeoutMs: number): AbortController {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), signalTimeoutMs)
    return controller
}

function shouldRetryStatus(status: number): boolean {
    return status === 408 || status === 425 || status === 429 || status >= 500
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export function calculateDistance(origin: LocationPoint, destination: LocationPoint): number {
    const a = normalizePoint(origin)
    const b = normalizePoint(destination)
    if (!a || !b) return 0

    const dLat = toRadians(b.lat - a.lat)
    const dLng = toRadians(b.lng - a.lng)
    const lat1 = toRadians(a.lat)
    const lat2 = toRadians(b.lat)

    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
    return EARTH_RADIUS_KM * c
}

export function formatDistance(distanceKm: number | null | undefined): string | null {
    if (!isFiniteNumber(distanceKm) || distanceKm < 0) return null
    return `${distanceKm.toFixed(1)} km`
}

export function estimateDeliveryTime(distanceKm: number | null | undefined): number | null {
    if (!isFiniteNumber(distanceKm) || distanceKm <= 0) return null
    const avgUrbanSpeedKmH = 22
    const baseMinutes = 8
    const travelMinutes = (distanceKm / avgUrbanSpeedKmH) * 60
    return Math.max(10, Math.round(baseMinutes + travelMinutes))
}

export function buildBoundingBox(center: LocationPoint, radiusKm: number) {
    const normalizedCenter = normalizePoint(center)
    if (!normalizedCenter) return null
    if (!isFiniteNumber(radiusKm) || radiusKm <= 0) return null

    const latDelta = radiusKm / 111.32
    const lngDelta = radiusKm / (111.32 * Math.cos(toRadians(normalizedCenter.lat)))

    return {
        minLat: normalizedCenter.lat - latDelta,
        maxLat: normalizedCenter.lat + latDelta,
        minLng: normalizedCenter.lng - lngDelta,
        maxLng: normalizedCenter.lng + lngDelta,
    }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const raw = String(address || "").trim()
  if (!raw) return null

  // Nominatim free-text search fails when the query contains a Brazilian CEP
  // (e.g. "17783-124" or "01304000") or dashes between city/state ("Lucélia - SP").
  // Sanitize: strip CEP, normalize dashes, remove "BR"/"Brazil" noise.
  function sanitize(addr: string): string {
    return addr
      .replace(/\b\d{5}-?\d{3}\b/g, "")   // strip CEP patterns (XXXXX-XXX or XXXXXXXX)
      .replace(/\s*-\s*/g, ", ")            // "Lucélia - SP" => "Lucélia, SP"
      .replace(/,\s*BR\b/gi, "")            // strip trailing ", BR"
      .replace(/,\s*Brazil\b/gi, "")        // strip trailing ", Brazil"
      .replace(/,\s*,/g, ",")              // collapse empty segments
      .replace(/\s{2,}/g, " ")             // collapse whitespace
      .replace(/,\s*$/g, "")              // strip trailing comma
      .trim()
  }

  const query = sanitize(raw)
  if (!query) return null

  const result = await _geocodeFetch(query)
  if (result) return result

  // Fallback: retry without the street number (Nominatim is more flexible with just street + city)
  const simplified = query
    .replace(/,\s*\d+\s*,/, ",")          // remove ", 286," style numbers
    .replace(/,\s*S\/N\s*,/i, ",")        // remove ", S/N,"
    .replace(/,\s*,/g, ",")
    .trim()

  if (simplified !== query) {
    console.log(`[Geocode] Retrying with simplified: "${simplified}"`)
    return _geocodeFetch(simplified)
  }

  return null
}

async function _geocodeFetch(query: string): Promise<GeocodeResult> {
    const params = new URLSearchParams({
        q: query,
        format: "jsonv2",
        limit: "1",
        countrycodes: "br",
        addressdetails: "0",
    })
    const url = `${NOMINATIM_URL}?${params.toString()}`

    for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const controller = new AbortController()
        try {
            timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "User-Agent": NOMINATIM_USER_AGENT,
                    Accept: "application/json",
                },
                signal: controller.signal,
                next: { revalidate: 0 },
            })

            if (!response.ok) {
                console.error(`[Geocode] HTTP ${response.status} for "${query}" (attempt ${attempt})`)
                if (attempt < DEFAULT_RETRIES && shouldRetryStatus(response.status)) {
                    await sleep(250 * (attempt + 1))
                    continue
                }
                return null
            }

            const payload = await response.json()
            const first = Array.isArray(payload) ? payload[0] : null
            if (!first) {
                console.warn(`[Geocode] No results for "${query}"`)
                return null
            }
            const lat = first?.lat != null ? Number(first.lat) : NaN
            const lng = first?.lon != null ? Number(first.lon) : NaN
            if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
                console.warn(`[Geocode] Invalid coords in response for "${query}": lat=${first?.lat}, lon=${first?.lon}`)
                return null
            }
            const result = normalizePoint({ lat, lng })
            if (result) {
                console.log(`[Geocode] OK "${query}" => [${result.lat}, ${result.lng}]`)
            }
            return result
        } catch (err: any) {
            const isAbort = err?.name === "AbortError"
            console.error(`[Geocode] ${isAbort ? "Timeout" : "Error"} for "${query}" (attempt ${attempt}):`, isAbort ? "request aborted after 8s" : err?.message || err)
            if (attempt < DEFAULT_RETRIES) {
                await sleep(250 * (attempt + 1))
                continue
            }
            return null
        } finally {
            if (timeoutId) clearTimeout(timeoutId)
        }
    }

    return null
}

export async function calculateAddressDistance(
    originAddress: string,
    destinationAddress: string,
): Promise<number | null> {
    if (!originAddress?.trim() || !destinationAddress?.trim()) return null
    const [origin, destination] = await Promise.all([
        geocodeAddress(originAddress),
        geocodeAddress(destinationAddress),
    ])
    if (!origin || !destination) return null
    return Number(calculateDistance(origin, destination).toFixed(2))
}

export function enrichMarketplaceDistance<T extends { partners?: any }>(
    items: T[],
    userLocation?: LocationPoint | null,
): T[] {
    const normalizedUser = normalizePoint(userLocation || null)
    if (!normalizedUser) return items

    return items.map((item) => {
        const partner = item?.partners
        const normalizedPartner = normalizePoint({
            lat: partner?.latitude,
            lng: partner?.longitude,
        })
        if (!normalizedPartner) return item

        const distanceKm = Number(calculateDistance(normalizedUser, normalizedPartner).toFixed(1))
        return {
            ...item,
            partners: {
                ...partner,
                distance_km: distanceKm,
                distance_km_formatted: formatDistance(distanceKm),
            },
        }
    })
}

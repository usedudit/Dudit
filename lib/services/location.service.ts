export type LocationPoint = {
  lat: number
  lng: number
}

type GeocodeResult = LocationPoint | null

const EARTH_RADIUS_KM = 6371
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || "Dudit/1.0 (contact@dudit.com.br)"
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
  const query = String(address || "").trim()
  if (!query) return null

  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "1",
    countrycodes: "br",
    addressdetails: "0",
  })
  const url = `${NOMINATIM_URL}?${params.toString()}`

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    const controller = withTimeout(DEFAULT_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": NOMINATIM_USER_AGENT,
          Accept: "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      })

      if (!response.ok) {
        if (attempt < DEFAULT_RETRIES && shouldRetryStatus(response.status)) {
          await sleep(250 * (attempt + 1))
          continue
        }
        return null
      }

      const payload = await response.json()
      const first = Array.isArray(payload) ? payload[0] : null
      const lat = first?.lat != null ? Number(first.lat) : NaN
      const lng = first?.lon != null ? Number(first.lon) : NaN
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null
      return normalizePoint({ lat, lng })
    } catch {
      if (attempt < DEFAULT_RETRIES) {
        await sleep(250 * (attempt + 1))
        continue
      }
      return null
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

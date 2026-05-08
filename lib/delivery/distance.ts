/**
 * Delivery distance calculation utilities.
 *
 * Resolves the road-route distance (in kilometers) between two address strings
 * using the Mapbox Geocoding + Directions APIs. Falls back to a great-circle
 * (Haversine) distance whenever the Directions API is unavailable so the
 * delivery quote engine can still produce a reasonable estimate.
 *
 * All outbound HTTP calls go through `safeFetch` (SSRF guard) and Mapbox
 * (`api.mapbox.com`) is already on the project allowlist.
 */

import { safeFetch } from "@/lib/security/ssrf-guard"

type Coords = { lat: number; lng: number }

const MAPBOX_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  ""

/**
 * Returns the great-circle distance in kilometers between two coordinates.
 * Used as a fallback when the Directions API is unreachable or unavailable.
 */
function haversineKm(a: Coords, b: Coords): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const R = 6371 // Earth radius in km
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return R * c
}

/**
 * Geocode a single free-form address string into lat/lng coordinates using
 * the Mapbox Geocoding API. Returns null when no match is found or the call
 * fails.
 */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  if (!MAPBOX_TOKEN) return null
  const trimmed = (address || "").trim()
  if (!trimmed) return null

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    trimmed,
  )}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=BR`

  try {
    const res = await safeFetch(url, {
      timeoutMs: 8_000,
      maxResponseBytes: 512 * 1024,
      maxRedirects: 2,
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const feature = data?.features?.[0]
    if (!feature?.center || feature.center.length < 2) return null
    const [lng, lat] = feature.center
    if (typeof lat !== "number" || typeof lng !== "number") return null
    return { lat, lng }
  } catch {
    return null
  }
}

/**
 * Returns the driving-route distance in kilometers between two Mapbox
 * coordinates using the Mapbox Directions API. Returns null on failure so the
 * caller can fall back to a Haversine estimate.
 */
async function routeDistanceKm(origin: Coords, destination: Coords): Promise<number | null> {
  if (!MAPBOX_TOKEN) return null

  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=false`

  try {
    const res = await safeFetch(url, {
      timeoutMs: 8_000,
      maxResponseBytes: 1 * 1024 * 1024,
      maxRedirects: 2,
    })
    if (!res.ok) return null
    const data: any = await res.json()
    const route = data?.routes?.[0]
    const meters = typeof route?.distance === "number" ? route.distance : null
    if (meters == null || !Number.isFinite(meters) || meters < 0) return null
    return meters / 1000
  } catch {
    return null
  }
}

/**
 * Calculate the driving distance (in km) between two address strings.
 *
 * Strategy:
 *   1. Geocode both addresses via Mapbox.
 *   2. Ask the Directions API for the road distance.
 *   3. If Directions fails, fall back to the great-circle (Haversine) distance
 *      between the two geocoded points (still useful for fee estimation).
 *
 * Returns null only when geocoding itself fails (so the caller can surface a
 * clear "could not compute distance" error to the user).
 */
export async function calculateRouteDistanceKm(
  originAddress: string,
  destinationAddress: string,
): Promise<number | null> {
  if (!originAddress?.trim() || !destinationAddress?.trim()) return null

  const [origin, destination] = await Promise.all([
    geocodeAddress(originAddress),
    geocodeAddress(destinationAddress),
  ])

  if (!origin || !destination) return null

  const driving = await routeDistanceKm(origin, destination)
  if (driving != null) {
    return Math.round(driving * 100) / 100
  }

  // Fallback: straight-line distance. Multiply by a small detour factor (1.3)
  // to approximate the typical road overhead vs. great-circle distance.
  const straight = haversineKm(origin, destination)
  return Math.round(straight * 1.3 * 100) / 100
}
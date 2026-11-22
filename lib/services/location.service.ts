import { sanitizeAddressComplement } from "@/lib/utils/phone-utils"
import { getEffectiveMaxDeliveryKm } from "@/lib/delivery/fee"

export type LocationPoint = {
    lat: number
    lng: number
}

type GeocodeResult = LocationPoint | null

const EARTH_RADIUS_KM = 6371
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
const NOMINATIM_USER_AGENT =
    process.env.NOMINATIM_USER_AGENT || "Dudit/1.0 (contato@dudit.com.br)"
const DEFAULT_TIMEOUT_MS = 3500
const DEFAULT_RETRIES = 1

interface CachedGeocode {
    result: GeocodeResult
    expiresAt: number
}

const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const geocodeCache = new Map<string, CachedGeocode>()
const inFlightGeocodes = new Map<string, Promise<GeocodeResult>>()

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

/**
 * Formato unificado de distância para os cards do marketplace:
 * - < 1km → "A 500m"
 * - <= 10km → "A 1,2 km"
 * - > 10km → "A 12 km"
 */
export function formatDistanceLabel(distanceKm: number | null | undefined): string | null {
    if (!isFiniteNumber(distanceKm) || distanceKm < 0) return null
    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`
    if (distanceKm <= 10) return `${distanceKm.toFixed(1)} km`
    return `${Math.round(distanceKm)} km`
}

export function estimateDeliveryTime(distanceKm: number | null | undefined): number | null {
    if (!isFiniteNumber(distanceKm) || distanceKm <= 0) return null
    const avgUrbanSpeedKmH = 22
    const baseMinutes = 8
    const travelMinutes = (distanceKm / avgUrbanSpeedKmH) * 60
    return Math.max(10, Math.round(baseMinutes + travelMinutes))
}

/**
 * Estima a faixa de tempo de entrega no formato padrão de delivery (ex: "20-30 min", "25-35 min", "35-50 min")
 */
export function estimateDeliveryTimeRange(distanceKm: number | null | undefined): string | null {
    if (!isFiniteNumber(distanceKm) || distanceKm <= 0) return null

    // Base de preparo/expedição: ~15 min
    // Velocidade média urbana com trânsito e semáforos: ~22 km/h (~2.7 min por km)
    const basePrepMin = 15
    const travelMin = (distanceKm / 22) * 60
    const totalMin = basePrepMin + travelMin

    if (distanceKm < 1.5) {
        return "20-30 min"
    } else if (distanceKm <= 3.5) {
        return "25-35 min"
    } else if (distanceKm <= 6) {
        return "30-40 min"
    } else if (distanceKm <= 10) {
        return "35-50 min"
    } else if (distanceKm <= 16) {
        return "45-60 min"
    } else {
        const roundedMin = Math.max(20, Math.floor((totalMin - 5) / 5) * 5)
        const roundedMax = roundedMin + 15
        return `${roundedMin}-${roundedMax} min`
    }
}

/**
 * Estima o tempo médio pontual de entrega (ex: "25 min", "30 min", "45 min")
 */
export function estimateAverageDeliveryTime(distanceKm: number | null | undefined): string | null {
    if (!isFiniteNumber(distanceKm) || distanceKm <= 0) return null

    if (distanceKm < 1.5) {
        return "25 min"
    } else if (distanceKm <= 3.5) {
        return "30 min"
    } else if (distanceKm <= 6) {
        return "35 min"
    } else if (distanceKm <= 10) {
        return "45 min"
    } else if (distanceKm <= 16) {
        return "55 min"
    } else {
        const basePrepMin = 15
        const travelMin = (distanceKm / 22) * 60
        const totalMin = Math.round(basePrepMin + travelMin)
        return `${totalMin} min`
    }
}

/**
 * Converte faixas de tempo "20-30 min" para média pontual "25 min"
 */
export function formatAverageDeliveryTimeFromRange(timeStr: string | null | undefined): string | null {
    if (!timeStr) return null
    if (!timeStr.includes("-")) return timeStr
    const match = timeStr.match(/(\d+)\s*-\s*(\d+)/)
    if (match) {
        const min = Number(match[1])
        const max = Number(match[2])
        const avg = Math.round((min + max) / 2)
        return `${avg} min`
    }
    return timeStr
}

/**
 * Formata a duração do serviço (ex: "Duração: 30 min", "Duração: 1h", "Duração: 1h 30m", "Duração: 2h")
 */
export function formatServiceDuration(minutes: number | string | null | undefined): string | null {
    if (minutes == null) return null
    const num = typeof minutes === "number" ? minutes : Number(minutes)
    if (!isFiniteNumber(num) || num <= 0) return null
    let timeStr = ""
    if (num < 60) {
        timeStr = `${num} min`
    } else {
        const hours = Math.floor(num / 60)
        const rem = num % 60
        if (rem === 0) timeStr = `${hours}h`
        else timeStr = `${hours}h ${rem}m`
    }
    return `Duração: ${timeStr}`
}

export interface DeliveryFeeEstimateParams {
    distanceKm?: number | null
    baseFee?: number | null
    includedKm?: number | null
    extraKmPrice?: number | null
    maxDeliveryKm?: number | null
    isDeliveryEnabled?: boolean | null
    deliveryPayer?: "customer" | "seller" | string | null
    freeDeliveryThreshold?: number | null
}

/**
 * Estima o rótulo de taxa de entrega para cards (ex: "Grátis", "R$ 4,99", "Apenas retirada")
 */
export function estimateDeliveryFeeLabel(params?: DeliveryFeeEstimateParams | null): string | null {
    if (!params) return null

    if (params.isDeliveryEnabled === false) {
        return "Apenas retirada"
    }

    const distanceKm = params.distanceKm != null && !isNaN(Number(params.distanceKm)) ? Number(params.distanceKm) : null
    const effectiveMaxKm = getEffectiveMaxDeliveryKm(params)

    if (distanceKm != null && effectiveMaxKm != null && distanceKm > effectiveMaxKm) {
        return null // Fora do raio de entrega
    }

    if (params.deliveryPayer === "seller") {
        return "Grátis"
    }

    // Se nenhuma configuração de taxa foi fornecida (ex: delivery_settings não carregado/inexistente), não inventar "Grátis"
    const hasExplicitFeeConfig = params.baseFee != null || params.extraKmPrice != null || params.deliveryPayer != null
    if (!hasExplicitFeeConfig) {
        return null
    }

    const baseFee = Number(params.baseFee ?? 0)
    const includedKm = Number(params.includedKm ?? 0)
    const extraKmPrice = Number(params.extraKmPrice ?? 0)

    if (baseFee === 0 && extraKmPrice === 0) {
        return "Grátis"
    }

    if (distanceKm != null && isFiniteNumber(distanceKm)) {
        const extraKm = Math.max(0, distanceKm - includedKm)
        const totalFee = baseFee + (extraKm * extraKmPrice)
        if (totalFee === 0) return "Grátis"
        return `R$ ${totalFee.toFixed(2).replace(".", ",")}`
    }

    if (baseFee > 0) {
        return `R$ ${baseFee.toFixed(2).replace(".", ",")}`
    }

    return null
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
  const raw = String(address || "").trim().toLowerCase()
  if (!raw) return null

  // 1. Check in-memory cache
  const cached = geocodeCache.get(raw)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  // 2. Check in-flight promise to deduplicate concurrent calls
  const inFlight = inFlightGeocodes.get(raw)
  if (inFlight) {
    return inFlight
  }

  const promise = (async () => {
    try {
      const result = await _executeGeocode(address)
      geocodeCache.set(raw, {
        result,
        expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
      })
      return result
    } finally {
      inFlightGeocodes.delete(raw)
    }
  })()

  inFlightGeocodes.set(raw, promise)
  return promise
}

async function _executeGeocode(address: string): Promise<GeocodeResult> {
  const raw = String(address || "").trim()
  if (!raw) return null

  // 1. If address contains an 8-digit CEP, try resolving coordinates via fast CEP API
  const cepMatch = raw.match(/\b(\d{5})-?(\d{3})\b/)
  if (cepMatch) {
    const cleanCep = `${cepMatch[1]}${cepMatch[2]}`
    try {
      const cepRes = await fetch(`https://cep.awesomeapi.com.br/json/${cleanCep}`, {
        headers: { "User-Agent": "Dudit/1.0" },
        signal: AbortSignal.timeout(3500),
      })
      if (cepRes.ok) {
        const data = await cepRes.json()
        if (data.lat && data.lng) {
          const lat = Number(data.lat)
          const lng = Number(data.lng)
          if (!isNaN(lat) && !isNaN(lng)) {
            const point = normalizePoint({ lat, lng })
            if (point) {
              console.log(`[Geocode] CEP OK "${cleanCep}" => [${point.lat}, ${point.lng}]`)
              return point
            }
          }
        }
      }
    } catch {
      // Ignore and fallback to Nominatim
    }
  }

  // 2. Sanitize and extract clean street + city + state for Nominatim
  function sanitize(addr: string): string {
    return addr
      .replace(/\b\d{5}-?\d{3}\b/g, "")   // strip CEP patterns
      .replace(/\s*-\s*/g, ", ")            // "Lucélia - SP" => "Lucélia, SP"
      .replace(/,\s*BR\b/gi, "")            // strip trailing ", BR"
      .replace(/,\s*Brasil\b/gi, "")        // strip trailing ", Brasil"
      .replace(/,\s*Brazil\b/gi, "")        // strip trailing ", Brazil"
      .replace(/,\s*,/g, ",")              // collapse empty segments
      .replace(/\s{2,}/g, " ")             // collapse whitespace
      .replace(/,\s*$/g, "")              // strip trailing comma
      .trim()
  }

  const query = sanitize(raw)
  if (!query) return null

  // In Brazil, Nominatim almost always fails if house numbers (e.g. ", 286,") or
  // specific neighborhood descriptors (e.g. "Lado Sul", "Zona Leste") are included.
  // Construct clean street + city + state directly:
  const rawParts = query.split(",").map(s => s.trim()).filter(Boolean)

  let cleanStreetQuery: string | null = null
  let cityStateQuery: string | null = null

  if (rawParts.length >= 3) {
    // rawParts: [Street, (optional number), (optional neighborhood), City, State]
    const state = rawParts[rawParts.length - 1]
    const city = rawParts[rawParts.length - 2]
    const street = rawParts[0].replace(/\s+(?:n[º°.]+|no\.|num(?:ero)?\.?|\d+[a-zA-Z]?|s\/n)$/i, "").trim()
    cleanStreetQuery = `${street}, ${city}, ${state}`
    cityStateQuery = `${city}, ${state}`
  } else if (rawParts.length === 2) {
    cityStateQuery = `${rawParts[0]}, ${rawParts[1]}`
  } else {
    cityStateQuery = query
  }

  // Attempt 1: Clean street + city + state (highest accuracy for delivery)
  if (cleanStreetQuery) {
    const r1 = await _geocodeFetch(cleanStreetQuery)
    if (r1) return r1
  }

  // Attempt 2: Full sanitized query (in case full string had a landmark)
  if (query !== cleanStreetQuery && query !== cityStateQuery) {
    const r2 = await _geocodeFetch(query)
    if (r2) return r2
  }

  // Attempt 3: City + State fallback
  if (cityStateQuery) {
    return _geocodeFetch(cityStateQuery)
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
        const partnerAddr = Array.isArray(partner?.addresses) ? partner.addresses[0] : partner?.addresses
        const itemAddr = Array.isArray((item as any)?.addresses) ? (item as any).addresses[0] : (item as any)?.addresses

        const normalizedPartner = normalizePoint({
            lat: partner?.latitude ?? (item as any)?.latitude ?? partnerAddr?.latitude ?? itemAddr?.latitude,
            lng: partner?.longitude ?? (item as any)?.longitude ?? partnerAddr?.longitude ?? itemAddr?.longitude,
        })
        if (!normalizedPartner) return item

        const distanceKm = Number(calculateDistance(normalizedUser, normalizedPartner).toFixed(1))
        const deliverySettings = partner?.delivery_settings || (item as any)?.delivery_settings || null
        const effectiveMaxKm = getEffectiveMaxDeliveryKm(deliverySettings)
        const isOutsideRadius = effectiveMaxKm != null && distanceKm > effectiveMaxKm
        
        const deliveryFeeFormatted = isOutsideRadius ? null : estimateDeliveryFeeLabel({
            distanceKm,
            baseFee: deliverySettings?.base_fee ?? deliverySettings?.baseFee,
            includedKm: deliverySettings?.included_km ?? deliverySettings?.includedKm,
            extraKmPrice: deliverySettings?.extra_km_price ?? deliverySettings?.extraKmPrice,
            maxDeliveryKm: deliverySettings?.max_delivery_km ?? deliverySettings?.maxDeliveryKm,
            isDeliveryEnabled: deliverySettings?.is_delivery_enabled ?? deliverySettings?.isDeliveryEnabled,
            deliveryPayer: deliverySettings?.delivery_payer ?? deliverySettings?.deliveryPayer,
        })

        const distanceFormatted = formatDistanceLabel(distanceKm)
        const deliveryTimeFormatted = isOutsideRadius ? null : estimateDeliveryTimeRange(distanceKm)

        return {
            ...item,
            distance_km: distanceKm,
            partners: partner ? {
                ...partner,
                distance_km: distanceKm,
                distance_km_formatted: distanceFormatted,
                delivery_time_formatted: deliveryTimeFormatted,
                delivery_fee_formatted: deliveryFeeFormatted,
            } : {
                distance_km: distanceKm,
                distance_km_formatted: distanceFormatted,
                delivery_time_formatted: deliveryTimeFormatted,
                delivery_fee_formatted: deliveryFeeFormatted,
            },
        }
    })
}

export interface RawAddressPayload {
  zip_code?: string | null
  zipCode?: string | null
  cep?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  bairro?: string | null
  city?: string | null
  state?: string | null
  uf?: string | null
  country?: string | null
  municipio_codigo_ibge?: string | null
  municipioCodigoIbge?: string | null
  ibge?: string | null
  latitude?: number | null
  longitude?: number | null
  partner_id?: string | null
  store_id?: string | null
  user_id?: string | null
  customer_id?: string | null
  supplier_id?: string | null
  address_type?: string | null
  is_default?: boolean
}

export async function enrichAddressData<T extends RawAddressPayload>(input: T) {
  const cleanZip = String(input.zip_code || input.zipCode || input.cep || "").trim()
  const street = String(input.street || "").trim()
  const number = String(input.number || "S/N").trim()
  const complement = sanitizeAddressComplement(input.complement)
  const neighborhood = String(input.neighborhood || input.bairro || "").trim()
  const city = String(input.city || "").trim()
  const state = String(input.state || input.uf || "").trim().toUpperCase()
  const country = String(input.country || "BR").trim()
  let ibge = String(input.municipio_codigo_ibge || input.municipioCodigoIbge || input.ibge || "").trim() || null
  let lat = typeof input.latitude === "number" && !isNaN(input.latitude) ? input.latitude : null
  let lng = typeof input.longitude === "number" && !isNaN(input.longitude) ? input.longitude : null

  // 1. Se municipio_codigo_ibge está ausente, mas temos CEP (8 dígitos), busca o código IBGE via ViaCEP
  const cleanDigitsCep = cleanZip.replace(/\D/g, "")
  if (!ibge && cleanDigitsCep.length === 8) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(`https://viacep.com.br/ws/${cleanDigitsCep}/json/`, {
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      if (res.ok) {
        const data = await res.json()
        if (data && data.ibge) {
          ibge = String(data.ibge).trim()
        }
      }
    } catch (e) {
      // Ignora erro de fallback
    }
  }

  // 2. Se latitude ou longitude está ausente, geocodifica o endereço para obter lat/lng
  if ((lat === null || lng === null) && (street || city || cleanZip)) {
    const fullAddressParts = [
      street,
      number !== "S/N" ? number : "",
      neighborhood,
      city,
      state,
      cleanZip,
      country === "BR" ? "Brasil" : country
    ].filter(Boolean)

    if (fullAddressParts.length > 0) {
      try {
        const coords = await geocodeAddress(fullAddressParts.join(", "))
        if (coords) {
          lat = coords.lat
          lng = coords.lng
        }
      } catch (geocodeErr) {
        console.warn("[enrichAddressData] Geocoding failed:", geocodeErr)
      }
    }
  }

  return {
    ...input,
    zip_code: cleanZip,
    street,
    number,
    complement,
    neighborhood,
    city,
    state,
    country,
    municipio_codigo_ibge: ibge,
    latitude: lat,
    longitude: lng,
    address_type: input.address_type || "primary",
    is_default: input.is_default ?? true,
  }
}

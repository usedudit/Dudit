import type { SearchIntentType } from "./intent-parser"

export type ProximityRingKey = "nearby" | "regional" | "national_shipping" | "other_distant"

export interface ProximityRing<T = any> {
  key: ProximityRingKey
  title: string
  subtitle: string
  items: T[]
}

export interface ProximityRingsResult<T = any> {
  /** Lojas/itens próximos (mesma cidade ou até nearbyRadiusKm) */
  nearby: T[]
  /** Cidades vizinhas / região (entre nearbyRadiusKm e regionalRadiusKm) */
  regional: T[]
  /** Lojas de cidades vizinhas */
  regionalSellers: T[]
  /** Vendedores nacionais que enviam para o CEP do comprador ('shipping' em fulfillment_modes) */
  nationalShipping: T[]
  /** Outros itens distantes sem envio nacional (fallback) */
  otherDistant: T[]
  /** Outras vitrines distantes */
  otherDistantSellers: T[]
}

export interface BuildProximityRingsOptions {
  /** Raio máximo para ser considerado "perto de você" (padrão: 15 km) */
  nearbyRadiusKm?: number
  /** Raio máximo para ser considerado "cidades vizinhas / região" (padrão: 65 km) */
  regionalRadiusKm?: number
  /** Intenção da busca (ajusta se faz sentido destacar envio nacional) */
  intent?: SearchIntentType
  /** UF da busca local (ajuda a identificar itens regionais quando não há distância em km) */
  localState?: string | null
}

function getItemKey(item: any): string {
  return `${item?.itemType || "item"}:${item?.id}`
}

export function extractDistanceKm(item: any): number | null {
  const candidates = [
    item?.distance_km,
    item?.partners?.distance_km,
    item?.stores?.distance_km,
  ]
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c >= 0) {
      return c
    }
  }
  return null
}

export function supportsNationalShipping(item: any): boolean {
  if (!item || item.itemType === "servico" || item.itemType === "loja") return false
  const modes = item.fulfillment_modes
  if (Array.isArray(modes) && modes.includes("shipping")) {
    return true
  }
  return false
}

function extractItemState(item: any): string | null {
  const raw =
    item?.partners?.state ||
    item?.stores?.state ||
    item?.state ||
    null
  return typeof raw === "string" && raw.trim() ? raw.trim().toUpperCase() : null
}

/**
 * Organiza os resultados locais e distantes em anéis de proximidade:
 * 1. Perto de você (local / <= nearbyRadiusKm)
 * 2. Cidades vizinhas / Região (<= regionalRadiusKm ou mesmo estado)
 * 3. Enviam para o seu CEP (produtos/planos com fulfillment_mode 'shipping')
 * 4. Outras opções distantes (fallback para nunca perder resultados)
 */
export function buildProximityRings<T extends Record<string, any>>(
  localItems: T[],
  distantItems: T[],
  distantSellers: T[] = [],
  options: BuildProximityRingsOptions = {},
): ProximityRingsResult<T> {
  const nearbyRadiusKm = options.nearbyRadiusKm ?? 15
  const regionalRadiusKm = options.regionalRadiusKm ?? 65
  const localState = options.localState ? options.localState.trim().toUpperCase() : null

  const seen = new Set<string>()
  const nearby: T[] = []
  const regional: T[] = []
  const regionalSellers: T[] = []
  const nationalShipping: T[] = []
  const otherDistant: T[] = []
  const otherDistantSellers: T[] = []

  for (const item of localItems || []) {
    const key = getItemKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    nearby.push({ ...item, _proximityRing: "nearby" })
  }

  for (const seller of distantSellers || []) {
    const key = getItemKey(seller)
    if (seen.has(key)) continue
    seen.add(key)

    const dist = extractDistanceKm(seller)
    const itemState = extractItemState(seller)
    const isRegional =
      (dist !== null && dist <= regionalRadiusKm) ||
      (dist === null && localState !== null && itemState === localState)

    if (isRegional) {
      regionalSellers.push({ ...seller, _proximityRing: "regional" })
    } else {
      otherDistantSellers.push({ ...seller, _proximityRing: "other_distant" })
    }
  }

  for (const item of distantItems || []) {
    const key = getItemKey(item)
    if (seen.has(key)) continue
    seen.add(key)

    const dist = extractDistanceKm(item)
    const itemState = extractItemState(item)
    const hasShipping = supportsNationalShipping(item)

    if (dist !== null && dist <= nearbyRadiusKm) {
      nearby.push({ ...item, _proximityRing: "nearby" })
      continue
    }

    const isRegional =
      (dist !== null && dist <= regionalRadiusKm) ||
      (dist === null && localState !== null && itemState === localState)

    if (isRegional) {
      regional.push({ ...item, _proximityRing: "regional" })
      continue
    }

    if (hasShipping && options.intent !== "service") {
      nationalShipping.push({ ...item, _proximityRing: "national_shipping" })
      continue
    }

    otherDistant.push({ ...item, _proximityRing: "other_distant" })
  }

  // Ordena regionais por distância crescente (mantendo rank como desempate)
  const sortByDistanceThenRank = (a: any, b: any) => {
    const da = extractDistanceKm(a) ?? Number.POSITIVE_INFINITY
    const db = extractDistanceKm(b) ?? Number.POSITIVE_INFINITY
    if (Math.abs(da - db) > 1) return da - db
    return Number(b._searchRank || 0) - Number(a._searchRank || 0)
  }

  regional.sort(sortByDistanceThenRank)
  regionalSellers.sort(sortByDistanceThenRank)

  return {
    nearby,
    regional,
    regionalSellers,
    nationalShipping,
    otherDistant,
    otherDistantSellers,
  }
}

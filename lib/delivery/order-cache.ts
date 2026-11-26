import type { DeliverySettings, DeliveryFeeRule } from "@/lib/delivery/fee"
import type { StoreFulfillmentCapabilities } from "@/lib/commerce/capabilities"
import type { ServiceAttendanceSettings } from "@/lib/services/service-attendance"
import type { CarrierFreeShippingRule } from "@/lib/services/shipping/carrier-free-shipping"

export type DeliveryContext = {
    settings: DeliverySettings
    rules: DeliveryFeeRule[]
    effectiveMaxKm: number | null
    shouldCalculateDistance: boolean
    originCoords: { lat: number; lng: number } | null
}

const DELIVERY_CONTEXT_TTL_MS = 30 * 1000
const DELIVERY_CONTEXT_CACHE_MAX = 200

const deliveryContextCache = new Map<string, { at: number; ctx: DeliveryContext }>()
const storeCapabilityCache = new Map<string, { at: number; caps: StoreFulfillmentCapabilities }>()
const serviceAttendanceCache = new Map<string, { at: number; settings: ServiceAttendanceSettings }>()
const carrierFreeShippingRulesCache = new Map<string, { at: number; rules: CarrierFreeShippingRule[] }>()

function prune(now: number, ttlMs: number, max: number, map: Map<string, { at: number }>) {
    for (const [key, entry] of map) {
        if (now - entry.at > ttlMs) map.delete(key)
    }
    while (map.size > max) {
        const oldest = map.keys().next().value
        if (oldest === undefined) break
        map.delete(oldest)
    }
}

export function invalidateDeliveryContextCache(partnerId: string): void {
    const prefix = `${partnerId}|`
    for (const key of deliveryContextCache.keys()) {
        if (key.startsWith(prefix)) deliveryContextCache.delete(key)
    }
}

export function invalidateStoreCapabilityCache(partnerId: string): void {
    const prefix = `${partnerId}|`
    for (const key of storeCapabilityCache.keys()) {
        if (key.startsWith(prefix)) storeCapabilityCache.delete(key)
    }
}

export function invalidateServiceAttendanceCache(partnerId: string): void {
    const prefix = `${partnerId}|`
    for (const key of serviceAttendanceCache.keys()) {
        if (key.startsWith(prefix)) serviceAttendanceCache.delete(key)
    }
}

export function invalidateCarrierFreeShippingRulesCache(partnerId: string): void {
    const prefix = `${partnerId}|`
    for (const key of carrierFreeShippingRulesCache.keys()) {
        if (key.startsWith(prefix)) carrierFreeShippingRulesCache.delete(key)
    }
}

export const deliveryContext = {
    ttlMs: DELIVERY_CONTEXT_TTL_MS,
    max: DELIVERY_CONTEXT_CACHE_MAX,
    get(key: string, now: number): DeliveryContext | undefined {
        const cached = deliveryContextCache.get(key)
        if (cached && now - cached.at <= DELIVERY_CONTEXT_TTL_MS) return cached.ctx
        return undefined
    },
    set(key: string, ctx: DeliveryContext): void {
        prune(Date.now(), DELIVERY_CONTEXT_TTL_MS, DELIVERY_CONTEXT_CACHE_MAX, deliveryContextCache)
        if (deliveryContextCache.size > DELIVERY_CONTEXT_CACHE_MAX) deliveryContextCache.clear()
        deliveryContextCache.set(key, { at: Date.now(), ctx })
    },
}

export const storeCapability = {
    ttlMs: 30 * 1000,
    get(key: string, now: number): StoreFulfillmentCapabilities | undefined {
        const cached = storeCapabilityCache.get(key)
        if (cached && now - cached.at <= 30 * 1000) return cached.caps
        return undefined
    },
    set(key: string, caps: StoreFulfillmentCapabilities): void {
        if (storeCapabilityCache.size > 300) storeCapabilityCache.clear()
        storeCapabilityCache.set(key, { at: Date.now(), caps })
    },
}

export const serviceAttendance = {
    ttlMs: 30 * 1000,
    get(key: string, now: number): ServiceAttendanceSettings | undefined {
        const cached = serviceAttendanceCache.get(key)
        if (cached && now - cached.at <= 30 * 1000) return cached.settings
        return undefined
    },
    set(key: string, settings: ServiceAttendanceSettings): void {
        if (serviceAttendanceCache.size > 300) serviceAttendanceCache.clear()
        serviceAttendanceCache.set(key, { at: Date.now(), settings })
    },
}

export const carrierFreeShippingRules = {
    ttlMs: 30 * 1000,
    get(key: string, now: number): CarrierFreeShippingRule[] | undefined {
        const cached = carrierFreeShippingRulesCache.get(key)
        if (cached && now - cached.at <= 30 * 1000) return cached.rules
        return undefined
    },
    set(key: string, rules: CarrierFreeShippingRule[]): void {
        if (carrierFreeShippingRulesCache.size > 300) carrierFreeShippingRulesCache.clear()
        carrierFreeShippingRulesCache.set(key, { at: Date.now(), rules })
    },
}

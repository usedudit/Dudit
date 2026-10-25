"use server"

import { requirePartnerAccessWithPermission, requireStoreAccess, requireUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { calculateDeliveryFee, hasDeliveryRatesConfigured, type DeliveryFeeRule, type DeliverySettings } from "@/lib/delivery/fee"
import { resolveDeliveryPlanCapability } from "@/lib/delivery/plan"
import { calculateDistance, geocodeAddress } from "@/lib/services/location.service"
import { findSuperFreteIntegration } from "@/lib/services/shipping/superfrete-integration"
import type { StoreFulfillmentCapabilities } from "@/lib/commerce/capabilities"
import {
  calculateServiceTravelFee,
  normalizeServiceAttendanceSettings,
  type ServiceAttendanceSettings,
  type ServiceTravelFeeMode,
} from "@/lib/services/service-attendance"

function mapSettingsRow(row: any): DeliverySettings {
  return {
    storeId: row?.store_id || null,
    baseFee: Number(row?.base_fee || 0),
    includedKm: Number(row?.included_km || 0),
    extraKmPrice: Number(row?.extra_km_price || 0),
    maxDeliveryKm: row?.max_delivery_km == null ? null : Number(row.max_delivery_km),
    isDeliveryEnabled: Boolean(row?.is_delivery_enabled ?? true),
    isPickupEnabled: Boolean(row?.is_pickup_enabled ?? true),
    freeDeliveryThreshold: row?.free_delivery_threshold == null ? null : Number(row.free_delivery_threshold),
    deliveryPayer: row?.delivery_payer === "seller" ? "seller" : "customer",
  }
}

export async function resolveDeliverySettingsRow(supabase: any, partnerId: string, storeId?: string | null) {
  if (storeId) {
    const { data } = await supabase
      .from("delivery_settings")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("store_id", storeId)
      .maybeSingle()
    if (data) return data
  }

  // Se não tem storeId explícito, tenta a loja matriz/padrão do parceiro
  const { data: stores } = await supabase
    .from("stores")
    .select("id")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(1)

  const defaultStoreId = stores?.[0]?.id || null
  if (defaultStoreId && defaultStoreId !== storeId) {
    const { data: storeSettings } = await supabase
      .from("delivery_settings")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("store_id", defaultStoreId)
      .maybeSingle()
    if (storeSettings) return storeSettings
  }

  // Tenta store_id IS NULL
  const { data: nullStoreData } = await supabase
    .from("delivery_settings")
    .select("*")
    .eq("partner_id", partnerId)
    .is("store_id", null)
    .maybeSingle()
  if (nullStoreData) return nullStoreData

  // Fallback: retorna a configuração mais recente cadastrada para o parceiro
  const { data: fallback } = await supabase
    .from("delivery_settings")
    .select("*")
    .eq("partner_id", partnerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return fallback
}

function mapRuleRow(row: any): DeliveryFeeRule {
  return {
    id: String(row.id),
    startTime: String(row.start_time || "00:00"),
    endTime: String(row.end_time || "23:59"),
    type: row.type === "multiplier" ? "multiplier" : "fixed",
    value: Number(row.value || 0),
    isActive: Boolean(row.is_active ?? true),
  }
}

// Configuração de entrega (settings + regras + coordenada de origem) é estática
// por parceiro/loja - não depende do destino nem do subtotal. O carrinho cota o
// frete a cada alteração de seleção/quantidade/endereço; sem cache cada cotação
// refazia ~3 queries (settings, regras, loja) antes de calcular a distância.
// Cache curto em memória (30s) elimina esse trabalho repetido; invalidado nos
// upserts de configuração de entrega. O estado em memória e os invalidadores
// vivem em lib/delivery/order-cache.ts (módulo sem "use server") para não
// ferar o compilador de Server Actions.
import {
  invalidateDeliveryContextCache,
  invalidateStoreCapabilityCache,
  invalidateServiceAttendanceCache,
  deliveryContext,
  storeCapability,
  serviceAttendance,
  type DeliveryContext,
} from "@/lib/delivery/order-cache"

async function resolveDeliveryContext(
  supabase: any,
  partnerId: string,
  storeId?: string | null,
): Promise<DeliveryContext> {
  const cacheKey = `${partnerId}|${storeId || ""}`
  const now = Date.now()
  const cachedCtx = deliveryContext.get(cacheKey, now)
  if (cachedCtx) return cachedCtx

  let rulesQuery = supabase.from("delivery_fee_rules").select("*").eq("partner_id", partnerId).eq("is_active", true)
  if (storeId) {
    rulesQuery = rulesQuery.or(`store_id.eq.${storeId},store_id.is.null`)
  }

  const [settingsRow, { data: rulesRows }, { data: store }] = await Promise.all([
    resolveDeliverySettingsRow(supabase, partnerId, storeId),
    rulesQuery.order("start_time"),
    storeId
      ? supabase
        .from("stores")
        .select("id, addresses!store_id!left(latitude, longitude)")
        .eq("id", storeId)
        .maybeSingle()
      : supabase
        .from("stores")
        .select("id, addresses!store_id!left(latitude, longitude)")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle(),
  ])

  const settings = mapSettingsRow(settingsRow)
  const effectiveMaxKm = (settings.maxDeliveryKm != null && settings.maxDeliveryKm > 0)
    ? settings.maxDeliveryKm
    : (settings.includedKm > 0 ? settings.includedKm : null)
  const shouldCalculateDistance = (
    effectiveMaxKm != null ||
    settings.extraKmPrice > 0 ||
    settings.includedKm > 0
  )

  let originCoords: { lat: number; lng: number } | null = null
  if (shouldCalculateDistance) {
    const storeAddr = Array.isArray(store?.addresses) ? store.addresses[0] : store?.addresses
    if (storeAddr?.latitude != null && storeAddr?.longitude != null) {
      originCoords = { lat: Number(storeAddr.latitude), lng: Number(storeAddr.longitude) }
    }

    if (!originCoords && storeId) {
      const { data: directAddr } = await supabase
        .from("addresses")
        .select("latitude, longitude")
        .eq("store_id", storeId)
        .not("latitude", "is", null)
        .limit(1)
        .maybeSingle()
      if (directAddr?.latitude != null && directAddr?.longitude != null) {
        originCoords = { lat: Number(directAddr.latitude), lng: Number(directAddr.longitude) }
      }
    }

    if (!originCoords) {
      const { data: partnerAddr } = await supabase
        .from("addresses")
        .select("latitude, longitude")
        .eq("partner_id", partnerId)
        .not("latitude", "is", null)
        .limit(1)
        .maybeSingle()
      if (partnerAddr?.latitude != null && partnerAddr?.longitude != null) {
        originCoords = { lat: Number(partnerAddr.latitude), lng: Number(partnerAddr.longitude) }
      }
    }

    if (!originCoords) {
      let addrQuery = supabase
        .from("addresses")
        .select("id, street, number, neighborhood, city, state, zip_code")
      if (storeId) {
        addrQuery = addrQuery.eq("store_id", storeId)
      } else {
        addrQuery = addrQuery.eq("partner_id", partnerId)
      }
      const { data: textAddr } = await addrQuery.limit(1).maybeSingle()
      if (textAddr) {
        const fullAddrString = `${textAddr.street || ""}, ${textAddr.number || ""} - ${textAddr.neighborhood || ""}, ${textAddr.city || ""} - ${textAddr.state || ""}, ${textAddr.zip_code || ""}`
        const geocoded = await geocodeAddress(fullAddrString)
        if (geocoded) {
          originCoords = geocoded
          void supabase.from("addresses").update({ latitude: geocoded.lat, longitude: geocoded.lng }).eq("id", textAddr.id)
        }
      }
    }
  }

  const ctx: DeliveryContext = {
    settings,
    rules: (rulesRows || []).map(mapRuleRow),
    effectiveMaxKm,
    shouldCalculateDistance,
    originCoords,
  }

  deliveryContext.set(cacheKey, ctx)
  return ctx
}

export async function getPartnerDeliveryConfigAction(partnerId: string, storeId?: string | null) {
  const supabase = getAdminClient()
  const plan = await getPartnerPlan(partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)

  let rulesQuery = supabase.from("delivery_fee_rules").select("*").eq("partner_id", partnerId)
  if (storeId) {
    rulesQuery = rulesQuery.or(`store_id.eq.${storeId},store_id.is.null`)
  } else {
    rulesQuery = rulesQuery.is("store_id", null)
  }

  const [settingsRow, { data: rules }] = await Promise.all([
    resolveDeliverySettingsRow(supabase, partnerId, storeId),
    rulesQuery.order("start_time"),
  ])

  const normalizedSettings = mapSettingsRow(settingsRow)
  const normalizedRules = (rules || []).map(mapRuleRow)
  return {
    success: true as const,
    planSlug: capability.planSlug,
    capability,
    settings: normalizedSettings,
    rules: normalizedRules,
  }
}

/**
 * Capacidades autoritativas de fulfillment da loja.
 * - delivery: plano permite + is_delivery_enabled
 * - pickup: is_pickup_enabled
 * - shipping: integração SuperFrete conectada
 */
export async function resolveStoreFulfillmentCapabilities(
  partnerId: string,
  storeId?: string | null,
): Promise<StoreFulfillmentCapabilities> {
  const key = `${partnerId}|${storeId || ""}`
  const now = Date.now()
  const cachedCaps = storeCapability.get(key, now)
  if (cachedCaps) return cachedCaps

  const supabase = getAdminClient()
  const [plan, config, integration, capabilities] = await Promise.all([
    getPartnerPlan(partnerId),
    getPartnerDeliveryConfigAction(partnerId, storeId),
    findSuperFreteIntegration(supabase, partnerId),
    getPartnerCapabilities(partnerId, { storeId }),
  ])

  const capability = resolveDeliveryPlanCapability(plan.slug)
  const settings = config.success ? config.settings : null
  const deliveriesEnabled = capabilities.hasDeliveries

  const caps: StoreFulfillmentCapabilities = {
    delivery: deliveriesEnabled && capability.deliveryEnabled && Boolean(settings?.isDeliveryEnabled ?? false),
    pickup: settings ? Boolean(settings.isPickupEnabled ?? true) : true,
    shipping: deliveriesEnabled && Boolean(
      integration && integration.status === "connected" && integration.access_token_encrypted,
    ),
  }

  storeCapability.set(key, caps)
  return caps
}

export async function getStoreFulfillmentCapabilitiesAction(
  partnerId: string,
  storeId?: string | null,
): Promise<StoreFulfillmentCapabilities> {
  return resolveStoreFulfillmentCapabilities(partnerId, storeId)
}

export async function upsertPartnerDeliveryConfigAction(input: {
  partnerId: string
  storeId?: string | null
  settings: DeliverySettings
}) {
  await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "settings", "settings_delivery")
  if (input.storeId) {
    await requireStoreAccess(input.storeId, input.partnerId)
  }
  const supabase = await getSupabaseServerClient()
  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)

  if (!capability.deliveryEnabled) {
    return { success: false as const, error: "Seu plano atual não possui recurso de entrega." }
  }

  const normalized: DeliverySettings = {
    storeId: input.storeId || null,
    baseFee: Math.max(0, Number(input.settings.baseFee || 0)),
    includedKm: Math.max(0, Number(input.settings.includedKm || 0)),
    extraKmPrice: Math.max(0, Number(input.settings.extraKmPrice || 0)),
    maxDeliveryKm: input.settings.maxDeliveryKm == null ? null : Math.max(0, Number(input.settings.maxDeliveryKm)),
    isDeliveryEnabled: Boolean(input.settings.isDeliveryEnabled),
    isPickupEnabled: Boolean(input.settings.isPickupEnabled),
    freeDeliveryThreshold: input.settings.freeDeliveryThreshold == null ? null : Math.max(0, Number(input.settings.freeDeliveryThreshold)),
    deliveryPayer: input.settings.deliveryPayer === "seller" ? "seller" : "customer",
  }

  if (plan.slug === "free" && normalized.deliveryPayer === "seller") {
    return { success: false as const, error: "A opção \"Quem paga a entrega\" está disponível nos planos Crescer e Escalar." }
  }

  if (!normalized.isDeliveryEnabled && !normalized.isPickupEnabled) {
    return { success: false as const, error: "Você deve manter ativo pelo menos um método de entrega (Entrega ou Retirada)." }
  }

  const storeId = input.storeId || null
  let query = supabase.from("delivery_settings").select("id").eq("partner_id", input.partnerId)
  if (storeId) {
    query = query.eq("store_id", storeId)
  } else {
    query = query.is("store_id", null)
  }
  const { data: existing } = await query.maybeSingle()

  const payload: Record<string, any> = {
    partner_id: input.partnerId,
    store_id: storeId,
    base_fee: normalized.baseFee,
    included_km: normalized.includedKm,
    extra_km_price: normalized.extraKmPrice,
    max_delivery_km: normalized.maxDeliveryKm,
    is_delivery_enabled: normalized.isDeliveryEnabled,
    is_pickup_enabled: normalized.isPickupEnabled,
    free_delivery_threshold: normalized.freeDeliveryThreshold,
    delivery_payer: normalized.deliveryPayer,
    updated_at: new Date().toISOString(),
  }

  let error: any
  if (existing) {
    payload.id = existing.id
      ; ({ error } = await supabase.from("delivery_settings").update(payload).eq("id", existing.id))
  } else {
    ; ({ error } = await supabase.from("delivery_settings").insert(payload))
  }

  if (error) return { success: false as const, error: error.message }
  if (!capability.advancedEnabled) {
    await supabase.from("delivery_fee_rules").delete().eq("partner_id", input.partnerId)
  }
  invalidateDeliveryContextCache(input.partnerId)
  invalidateStoreCapabilityCache(input.partnerId)
  return { success: true as const }
}

export async function upsertDeliveryFeeRuleAction(input: {
  partnerId: string
  storeId?: string | null
  rule: Partial<DeliveryFeeRule> & Pick<DeliveryFeeRule, "startTime" | "endTime" | "type" | "value">
}) {
  await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "settings", "settings_delivery")
  if (input.storeId) {
    await requireStoreAccess(input.storeId, input.partnerId)
  }
  const supabase = await getSupabaseServerClient()
  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)
  if (!capability.advancedEnabled) {
    return { success: false as const, error: "Regras por horário disponíveis no plano Crescer." }
  }

  const payload = {
    id: input.rule.id || undefined,
    partner_id: input.partnerId,
    store_id: input.storeId || null,
    start_time: input.rule.startTime,
    end_time: input.rule.endTime,
    type: input.rule.type,
    value: Math.max(0, Number(input.rule.value || 0)),
    is_active: Boolean(input.rule.isActive ?? true),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from("delivery_fee_rules").upsert(payload)
  if (error) return { success: false as const, error: error.message }
  invalidateDeliveryContextCache(input.partnerId)
  return { success: true as const }
}

export async function deleteDeliveryFeeRuleAction(partnerId: string, ruleId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "settings", "settings_delivery")
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase.from("delivery_fee_rules").delete().eq("partner_id", partnerId).eq("id", ruleId)
  if (error) return { success: false as const, error: error.message }
  invalidateDeliveryContextCache(partnerId)
  return { success: true as const }
}

export async function quoteDeliveryFeeAction(input: {
  partnerId: string
  storeId?: string | null
  destinationAddress: string
  currentTimeIso?: string
  freeDeliveryCoupon?: boolean
  destinationCoords?: { lat: number; lng: number } | null
  orderSubtotal?: number
  allowOutsideRadius?: boolean
}) {
  const supabase = getAdminClient()

  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)
  if (!capability.deliveryEnabled) {
    return { success: false as const, error: "Entrega não disponível no plano atual." }
  }

  const { settings, rules, effectiveMaxKm, shouldCalculateDistance, originCoords } =
    await resolveDeliveryContext(supabase, input.partnerId, input.storeId)

  if (!settings.isDeliveryEnabled) {
    return { success: false as const, error: "Entrega desativada para esta loja." }
  }

  let distanceKm = 0
  if (shouldCalculateDistance) {
    if (!originCoords) {
      // Se não foi possível obter as coordenadas da loja, fazemos fallback gracioso para a taxa base configurada ou A Combinar
      const priced = calculateDeliveryFee({
        distanceKm: 0,
        currentTime: input.currentTimeIso ? new Date(input.currentTimeIso) : new Date(),
        settings,
        rules,
        freeDeliveryCoupon: Boolean(input.freeDeliveryCoupon),
        orderSubtotal: input.orderSubtotal,
        allowOutsideRadius: true,
      })

      return {
        success: true as const,
        distanceKm: null,
        fee: priced.fee,
        breakdown: {
          ...priced.breakdown,
          isEstimate: true,
          fallbackReason: "store_address_missing",
        },
        capability,
        isOutsideRadius: false,
        maxDeliveryKm: effectiveMaxKm,
        outsideRadiusWarning: null,
        hasRatesConfigured: Boolean(priced.breakdown.hasRatesConfigured || settings.baseFee > 0),
      }
    }

    let destinationCoords = input.destinationCoords;
    if (!destinationCoords && input.destinationAddress) {
      // 1. Fast local DB lookup: check if this address string matches an existing saved address with coordinates
      const cleanAddr = input.destinationAddress.trim()
      const cepMatch = cleanAddr.match(/\b\d{5}-?\d{3}\b/)
      if (cepMatch) {
        const cleanCep = cepMatch[0].replace(/\D/g, "")
        const { data: matchedDbAddr } = await supabase
          .from("addresses")
          .select("latitude, longitude")
          .eq("zip_code", cleanCep)
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .limit(1)
          .maybeSingle()

        if (matchedDbAddr?.latitude != null && matchedDbAddr?.longitude != null) {
          destinationCoords = {
            lat: Number(matchedDbAddr.latitude),
            lng: Number(matchedDbAddr.longitude),
          }
        }
      }

      // 2. Fallback to cached geocoding
      if (!destinationCoords) {
        destinationCoords = await geocodeAddress(input.destinationAddress)
      }
    }

    if (!destinationCoords) {
      // Se não foi possível obter as coordenadas do destino, fazemos fallback gracioso
      const priced = calculateDeliveryFee({
        distanceKm: 0,
        currentTime: input.currentTimeIso ? new Date(input.currentTimeIso) : new Date(),
        settings,
        rules,
        freeDeliveryCoupon: Boolean(input.freeDeliveryCoupon),
        orderSubtotal: input.orderSubtotal,
        allowOutsideRadius: true,
      })

      return {
        success: true as const,
        distanceKm: null,
        fee: priced.fee,
        breakdown: {
          ...priced.breakdown,
          isEstimate: true,
          fallbackReason: "destination_coords_missing",
        },
        capability,
        isOutsideRadius: false,
        maxDeliveryKm: effectiveMaxKm,
        outsideRadiusWarning: null,
        hasRatesConfigured: Boolean(priced.breakdown.hasRatesConfigured || settings.baseFee > 0),
      }
    }

    const calculatedDistance = calculateDistance(originCoords, destinationCoords)
    if (calculatedDistance == null || Number.isNaN(calculatedDistance)) {
      distanceKm = 0
    } else {
      distanceKm = Number(calculatedDistance.toFixed(2))
    }
  }

  try {
    const priced = calculateDeliveryFee({
      distanceKm,
      currentTime: input.currentTimeIso ? new Date(input.currentTimeIso) : new Date(),
      settings,
      rules,
      freeDeliveryCoupon: Boolean(input.freeDeliveryCoupon),
      orderSubtotal: input.orderSubtotal,
      allowOutsideRadius: Boolean(input.allowOutsideRadius),
    })

    return {
      success: true as const,
      distanceKm,
      fee: priced.fee,
      breakdown: priced.breakdown,
      capability,
      isOutsideRadius: Boolean(priced.breakdown.isOutsideRadius),
      maxDeliveryKm: priced.breakdown.maxDeliveryKm ?? effectiveMaxKm,
      outsideRadiusWarning: priced.breakdown.outsideRadiusWarning,
      hasRatesConfigured: Boolean(priced.breakdown.hasRatesConfigured),
    }
  } catch (error: any) {
    const isOutside = error.message?.toLowerCase().includes("raio") || false
    return {
      success: false as const,
      distanceKm,
      isOutsideRadius: isOutside,
      maxDeliveryKm: effectiveMaxKm,
      error: error.message || "Erro ao calcular taxa de entrega",
    }
  }
}

// ─── Service attendance settings (raio + taxa de deslocamento de serviços) ───

export async function resolveServiceAttendanceSettings(
  supabase: any,
  partnerId: string,
  storeId?: string | null,
  serviceId?: string | null,
): Promise<ServiceAttendanceSettings> {
  const key = `${partnerId}|${storeId || ""}|${serviceId || ""}`
  const now = Date.now()
  const cachedSettings = serviceAttendance.get(key, now)
  if (cachedSettings) return cachedSettings

  // Partner default (store_id IS NULL) -> store override -> service override
  // Obs.: usar .is()/.eq() explícitos em vez de .in([null, storeId]) porque o
  // PostgREST não casa NULL dentro de .in() - a linha default (store_id NULL)
  // nunca seria retornada e a tela parecia "não salvar".
  let settings: ServiceAttendanceSettings | null = null
  const { data: defaultRow } = await supabase
    .from("service_attendance_settings")
    .select("*")
    .eq("partner_id", partnerId)
    .is("store_id", null)
    .maybeSingle()

  let storeRow: any = null
  if (storeId) {
    const { data: storeData } = await supabase
      .from("service_attendance_settings")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("store_id", storeId)
      .maybeSingle()
    storeRow = storeData || null
  }

  const merged = { ...(defaultRow || {}), ...(storeRow || {}) }
  settings = normalizeServiceAttendanceSettings(merged || null)

  // Override por serviço (camada mais específica)
  if (serviceId) {
    const { data: svc } = await supabase
      .from("services")
      .select("service_max_km, service_travel_fee_mode, service_free_travel_km, service_travel_flat_fee, service_travel_per_km, service_enforce_area")
      .eq("id", serviceId)
      .maybeSingle()
    if (svc) {
      settings = normalizeServiceAttendanceSettings({
        max_service_km: svc.service_max_km,
        travel_fee_mode: svc.service_travel_fee_mode,
        free_travel_km: svc.service_free_travel_km,
        travel_flat_fee: svc.service_travel_flat_fee,
        travel_per_km: svc.service_travel_per_km,
        enforce_service_area: svc.service_enforce_area,
        ...settings,
      })
    }
  }

  serviceAttendance.set(key, settings)
  return settings
}

export async function getServiceAttendanceSettingsAction(
  partnerId: string,
  storeId?: string | null,
  serviceId?: string | null,
): Promise<ServiceAttendanceSettings> {
  const supabase = getAdminClient()
  return resolveServiceAttendanceSettings(supabase, partnerId, storeId || null, serviceId || null)
}

export async function upsertServiceAttendanceSettingsAction(input: {
  partnerId: string
  storeId?: string | null
  settings: Partial<{
    maxServiceKm: number | null
    travelFeeMode: ServiceTravelFeeMode
    freeTravelKm: number
    travelFlatFee: number
    travelPerKm: number
    travelTiers: Array<{ upToKm: number; fee: number }>
    enforceServiceArea: boolean
  }>
}) {
  await requireUser()
  await requirePartnerAccessWithPermission(input.partnerId, "settings", "settings_delivery")
  if (input.storeId) {
    await requireStoreAccess(input.storeId, input.partnerId)
  }

  const storeId = input.storeId || null
  const supabase = await getSupabaseServerClient()

  const payload: Record<string, any> = {
    partner_id: input.partnerId,
    store_id: storeId,
    max_service_km: input.settings.maxServiceKm == null ? null : Math.max(0, Number(input.settings.maxServiceKm)),
    travel_fee_mode: input.settings.travelFeeMode ?? "free",
    free_travel_km: input.settings.freeTravelKm == null ? 0 : Math.max(0, Number(input.settings.freeTravelKm)),
    travel_flat_fee: input.settings.travelFlatFee == null ? 0 : Math.max(0, Number(input.settings.travelFlatFee)),
    travel_per_km: input.settings.travelPerKm == null ? 0 : Math.max(0, Number(input.settings.travelPerKm)),
    travel_tiers: JSON.stringify(input.settings.travelTiers || []),
    enforce_service_area: input.settings.enforceServiceArea != null ? Boolean(input.settings.enforceServiceArea) : true,
    updated_at: new Date().toISOString(),
  }

  let query = supabase.from("service_attendance_settings").select("id").eq("partner_id", input.partnerId)
  if (storeId) {
    query = query.eq("store_id", storeId)
  } else {
    query = query.is("store_id", null)
  }
  const { data: existing, error: findErr } = await query.maybeSingle()
  if (findErr) return { success: false as const, error: findErr.message }

  let error: any
  if (existing) {
    payload.id = existing.id
      ; ({ error } = await supabase.from("service_attendance_settings").update(payload).eq("id", existing.id))
  } else {
    ; ({ error } = await supabase.from("service_attendance_settings").insert(payload))
  }
  if (error) return { success: false as const, error: error.message }

  invalidateServiceAttendanceCache(input.partnerId)
  return { success: true as const }
}

/**
 * Calcula a taxa de deslocamento de um serviço a domicílio a partir da
 * distância entre a loja e o endereço de destino do cliente.
 *
 * Reusa o raio/origem ja resolvido via delivery context (originCoords) quando
 * disponível; caso contrário geocodifica o enderamento da loja + destino.
 */
export async function calculateServiceTravelFeeForOrder(input: {
  supabase: any
  partnerId: string
  storeId?: string | null
  serviceId?: string | null
  deliveryAddress: string
  destinationCoords?: { lat: number; lng: number } | null
  orderSubtotal?: number
}): Promise<{
  success: boolean
  error?: string
  fee: number
  distanceKm: number | null
  outOfRadius: boolean
  breakdown: Record<string, unknown> | null
}> {
  const settings = await resolveServiceAttendanceSettings(
    input.supabase,
    input.partnerId,
    input.storeId || null,
    input.serviceId || null,
  )

  let distanceKm: number | null = null
  try {
    const ctx = await resolveDeliveryContext(input.supabase, input.partnerId, input.storeId || null)
    if (ctx.originCoords && input.destinationCoords) {
      distanceKm = Number(calculateDistance(ctx.originCoords, input.destinationCoords).toFixed(2))
    } else if (ctx.originCoords && input.deliveryAddress) {
      const dest = await geocodeAddress(input.deliveryAddress)
      if (dest) distanceKm = Number(calculateDistance(ctx.originCoords, dest).toFixed(2))
    }
  } catch {
    distanceKm = null
  }

  const result = calculateServiceTravelFee(settings, distanceKm)
  if (result.outOfRadius && settings.enforceServiceArea) {
    return {
      success: false,
      error: "Endereço fora do raio de atendimento deste serviço.",
      fee: 0,
      distanceKm,
      outOfRadius: true,
      breakdown: null,
    }
  }

  return {
    success: true,
    fee: result.fee,
    distanceKm,
    outOfRadius: result.outOfRadius,
    breakdown: {
      source: "service_attendance",
      mode: result.mode,
      distanceKm,
      chargedKm: result.chargedKm,
      fee: result.fee,
      maxServiceKm: settings.maxServiceKm,
      enforceServiceArea: settings.enforceServiceArea,
    },
  }
}

/**
 * Verifica apenas a cobertura de atendimento do serviço (sem cobrar taxa).
 * Usado pela UI para bloquear "No meu endereço" no modal de forma de
 * atendimento quando o endereço está fora do raio configurado.
 */
export async function checkServiceAttendanceAction(input: {
  partnerId: string
  storeId?: string | null
  serviceId?: string | null
  deliveryAddress?: string
  destinationCoords?: { lat: number; lng: number } | null
}): Promise<{
  success: true
  distanceKm: number | null
  maxServiceKm: number | null
  fee: number
  outOfRadius: boolean
} | { success: false; error: string }> {
  if (!input.deliveryAddress) {
    return { success: false, error: "Selecione um endereço para verificar o atendimento." }
  }
  const admin = getAdminClient()
  const res = await calculateServiceTravelFeeForOrder({
    supabase: admin,
    partnerId: input.partnerId,
    storeId: input.storeId ?? null,
    serviceId: input.serviceId ?? null,
    deliveryAddress: input.deliveryAddress,
    destinationCoords: input.destinationCoords ?? null,
    orderSubtotal: 0,
  })
  if (!res.success) return { success: false, error: res.error || "Endereço fora do raio de atendimento deste serviço." }
  return {
    success: true,
    distanceKm: res.distanceKm,
    maxServiceKm: null,
    fee: res.fee,
    outOfRadius: res.outOfRadius,
  }
}

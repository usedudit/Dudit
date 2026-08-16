"use server"

import { requirePartnerAccessWithPermission, requireStoreAccess, requireUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAdminClient } from "@/lib/supabase/admin"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { calculateDeliveryFee, hasDeliveryRatesConfigured, type DeliveryFeeRule, type DeliverySettings } from "@/lib/delivery/fee"
import { resolveDeliveryPlanCapability } from "@/lib/delivery/plan"
import { calculateDistance, geocodeAddress } from "@/lib/services/location.service"

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
    ;({ error } = await supabase.from("delivery_settings").update(payload).eq("id", existing.id))
  } else {
    ;({ error } = await supabase.from("delivery_settings").insert(payload))
  }

  if (error) return { success: false as const, error: error.message }
  if (!capability.advancedEnabled) {
    await supabase.from("delivery_fee_rules").delete().eq("partner_id", input.partnerId)
  }
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
  return { success: true as const }
}

export async function deleteDeliveryFeeRuleAction(partnerId: string, ruleId: string) {
  await requireUser()
  await requirePartnerAccessWithPermission(partnerId, "settings", "settings_delivery")
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase.from("delivery_fee_rules").delete().eq("partner_id", partnerId).eq("id", ruleId)
  if (error) return { success: false as const, error: error.message }
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

  let rulesQuery = supabase.from("delivery_fee_rules").select("*").eq("partner_id", input.partnerId).eq("is_active", true)
  if (input.storeId) {
    rulesQuery = rulesQuery.or(`store_id.eq.${input.storeId},store_id.is.null`)
  }

  const [settingsRow, { data: rulesRows }, { data: store }] = await Promise.all([
    resolveDeliverySettingsRow(supabase, input.partnerId, input.storeId),
    rulesQuery.order("start_time"),
    input.storeId
      ? supabase
        .from("stores")
        .select("id, addresses!store_id!left(latitude, longitude)")
        .eq("id", input.storeId)
        .maybeSingle()
      : supabase
        .from("stores")
        .select("id, addresses!store_id!left(latitude, longitude)")
        .eq("partner_id", input.partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle(),
  ])

  const settings = mapSettingsRow(settingsRow)
  if (!settings.isDeliveryEnabled) {
    return { success: false as const, error: "Entrega desativada para esta loja." }
  }

  const effectiveMaxKm = (settings.maxDeliveryKm != null && settings.maxDeliveryKm > 0)
    ? settings.maxDeliveryKm
    : (settings.includedKm > 0 ? settings.includedKm : null)

  const shouldCalculateDistance = (
    effectiveMaxKm != null ||
    settings.extraKmPrice > 0 ||
    settings.includedKm > 0
  )

  let distanceKm = 0
  if (shouldCalculateDistance) {
    let originCoords = null;
    const storeAddr = Array.isArray(store?.addresses) ? store.addresses[0] : store?.addresses
    if (storeAddr?.latitude != null && storeAddr?.longitude != null) {
      originCoords = { lat: Number(storeAddr.latitude), lng: Number(storeAddr.longitude) };
    }

    if (!originCoords && input.storeId) {
      const { data: directAddr } = await supabase
        .from("addresses")
        .select("latitude, longitude")
        .eq("store_id", input.storeId)
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
        .eq("partner_id", input.partnerId)
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
      if (input.storeId) {
        addrQuery = addrQuery.eq("store_id", input.storeId)
      } else {
        addrQuery = addrQuery.eq("partner_id", input.partnerId)
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

    if (!originCoords) {
      return { success: false as const, error: "Endereço da loja incompleto para calcular entrega por distância." }
    }

    let destinationCoords = input.destinationCoords;
    if (!destinationCoords && input.destinationAddress) {
      destinationCoords = await geocodeAddress(input.destinationAddress)
    }

    if (!destinationCoords) {
      return { success: false as const, error: "Não foi possível encontrar as coordenadas do seu endereço para entrega." }
    }

    const calculatedDistance = calculateDistance(originCoords, destinationCoords)
    if (calculatedDistance == null || Number.isNaN(calculatedDistance)) {
      return { success: false as const, error: "Não foi possível calcular a distância de entrega." }
    }
    distanceKm = Number(calculatedDistance.toFixed(2))
  }

  const rules = (rulesRows || []).map(mapRuleRow)

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

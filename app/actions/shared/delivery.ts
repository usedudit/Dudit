"use server"

import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { calculateDeliveryFee, type DeliveryFeeRule, type DeliverySettings } from "@/lib/delivery/fee"
import { calculateRouteDistanceKm } from "@/lib/delivery/distance"
import { resolveDeliveryPlanCapability } from "@/lib/delivery/plan"

function mapSettingsRow(row: any): DeliverySettings {
  return {
    baseFee: Number(row?.base_fee || 0),
    includedKm: Number(row?.included_km || 0),
    extraKmPrice: Number(row?.extra_km_price || 0),
    maxDeliveryKm: row?.max_delivery_km == null ? null : Number(row.max_delivery_km),
    isDeliveryEnabled: Boolean(row?.is_delivery_enabled ?? true),
  }
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

export async function getPartnerDeliveryConfigAction(partnerId: string) {
  await requireUser()
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()
  const plan = await getPartnerPlan(partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)

  const [{ data: settings }, { data: rules }] = await Promise.all([
    supabase.from("delivery_settings").select("*").eq("partner_id", partnerId).maybeSingle(),
    supabase.from("delivery_fee_rules").select("*").eq("partner_id", partnerId).order("start_time"),
  ])

  const normalizedSettings = mapSettingsRow(settings)
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
  settings: DeliverySettings
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)
  const supabase = await getSupabaseServerClient()
  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)

  if (!capability.deliveryEnabled) {
    return { success: false as const, error: "Seu plano atual não possui recurso de entrega." }
  }

  const normalized: DeliverySettings = {
    baseFee: Math.max(0, Number(input.settings.baseFee || 0)),
    includedKm: capability.advancedEnabled ? Math.max(0, Number(input.settings.includedKm || 0)) : 0,
    extraKmPrice: capability.advancedEnabled ? Math.max(0, Number(input.settings.extraKmPrice || 0)) : 0,
    maxDeliveryKm: capability.advancedEnabled
      ? (input.settings.maxDeliveryKm == null ? null : Math.max(0, Number(input.settings.maxDeliveryKm)))
      : null,
    isDeliveryEnabled: Boolean(input.settings.isDeliveryEnabled),
  }

  const { error } = await supabase.from("delivery_settings").upsert({
    partner_id: input.partnerId,
    base_fee: normalized.baseFee,
    included_km: normalized.includedKm,
    extra_km_price: normalized.extraKmPrice,
    max_delivery_km: normalized.maxDeliveryKm,
    is_delivery_enabled: normalized.isDeliveryEnabled,
    updated_at: new Date().toISOString(),
  })

  if (error) return { success: false as const, error: error.message }
  if (!capability.advancedEnabled) {
    await supabase.from("delivery_fee_rules").delete().eq("partner_id", input.partnerId)
  }
  return { success: true as const }
}

export async function upsertDeliveryFeeRuleAction(input: {
  partnerId: string
  rule: Partial<DeliveryFeeRule> & Pick<DeliveryFeeRule, "startTime" | "endTime" | "type" | "value">
}) {
  await requireUser()
  await requirePartnerAccess(input.partnerId)
  const supabase = await getSupabaseServerClient()
  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)
  if (!capability.advancedEnabled) {
    return { success: false as const, error: "Regras por horário disponíveis no plano Crescer." }
  }

  const payload = {
    id: input.rule.id || undefined,
    partner_id: input.partnerId,
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
  await requirePartnerAccess(partnerId)
  const supabase = await getSupabaseServerClient()
  const { error } = await supabase.from("delivery_fee_rules").delete().eq("partner_id", partnerId).eq("id", ruleId)
  if (error) return { success: false as const, error: error.message }
  return { success: true as const }
}

export async function quoteDeliveryFeeAction(input: {
  partnerId: string
  destinationAddress: string
  currentTimeIso?: string
  freeDeliveryCoupon?: boolean
}) {
  await requireUser()
  const supabase = await getSupabaseServerClient()

  const plan = await getPartnerPlan(input.partnerId)
  const capability = resolveDeliveryPlanCapability(plan.slug)
  if (!capability.deliveryEnabled) {
    return { success: false as const, error: "Entrega não disponível no plano atual." }
  }

  const [{ data: settingsRow }, { data: rulesRows }, { data: store }] = await Promise.all([
    supabase.from("delivery_settings").select("*").eq("partner_id", input.partnerId).maybeSingle(),
    supabase.from("delivery_fee_rules").select("*").eq("partner_id", input.partnerId).eq("is_active", true).order("start_time"),
    supabase
      .from("stores")
      .select("street, number, city, state, zip_code")
      .eq("partner_id", input.partnerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const settings = mapSettingsRow(settingsRow)
  if (!settings.isDeliveryEnabled) {
    return { success: false as const, error: "Entrega desativada para esta loja." }
  }

  const originAddress = [
    [store?.street, store?.number].filter(Boolean).join(", "),
    [store?.city, store?.state].filter(Boolean).join(", "),
    store?.zip_code || "",
  ].filter(Boolean).join(" ")

  const distanceKm = await calculateRouteDistanceKm(originAddress, input.destinationAddress)
  if (distanceKm == null) return { success: false as const, error: "Não foi possível calcular a distância de entrega." }

  const rules = capability.advancedEnabled ? (rulesRows || []).map(mapRuleRow) : []
  const priced = calculateDeliveryFee({
    distanceKm,
    currentTime: input.currentTimeIso ? new Date(input.currentTimeIso) : new Date(),
    settings,
    rules,
    freeDeliveryCoupon: Boolean(input.freeDeliveryCoupon),
  })
  return {
    success: true as const,
    distanceKm,
    fee: priced.fee,
    breakdown: priced.breakdown,
    capability,
  }
}

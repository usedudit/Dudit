"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import type { RecurringListCursor, RecurringPlanItem, RecurringPlanStatus, RecurringFrequencyType } from "@/lib/types/recurring"
import { mapPlanRow } from "@/lib/types/recurring"

const PAGE_SIZE = 20

function encodeCursor(cursor: RecurringListCursor | null): string | null {
  if (!cursor) return null
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

function decodeCursor(raw: string | null | undefined): RecurringListCursor | null {
  if (!raw) return null
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as RecurringListCursor
  } catch {
    return null
  }
}

function validatePlanInput(input: {
  name: string
  frequencyType: RecurringFrequencyType
  frequencyInterval?: number
  startDate: string
  items: RecurringPlanItem[]
}) {
  const name = String(input.name || "").trim()
  if (!name) throw new Error("Nome do plano é obrigatório.")
  if (name.length > 200) throw new Error("Nome deve ter no máximo 200 caracteres.")

  const allowed: RecurringFrequencyType[] = ["daily", "weekly", "monthly", "yearly", "custom"]
  if (!allowed.includes(input.frequencyType)) throw new Error("Frequência inválida.")

  const interval = Math.max(Number(input.frequencyInterval || 1), 1)
  if (!input.startDate) throw new Error("Data de início é obrigatória.")
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Adicione ao menos um produto ou serviço ao plano.")
  }

  for (const item of input.items) {
    if (item.itemType === "product" && !item.productId) throw new Error("Produto inválido no plano.")
    if (item.itemType === "service") {
      if (!item.serviceId) throw new Error("Serviço inválido no plano.")
      if (!item.staffPartnerUserId) throw new Error("Selecione o profissional para cada serviço.")
    }
  }

  return { name, interval }
}

function mapItemsToDb(items: RecurringPlanItem[]) {
  return items.map((item, index) => ({
    item_type: item.itemType,
    product_id: item.itemType === "product" ? item.productId : null,
    variant_id: item.itemType === "product" ? item.variantId || null : null,
    service_id: item.itemType === "service" ? item.serviceId : null,
    quantity: Math.max(Number(item.quantity || 1), 0.001),
    unit_price: item.unitPrice != null ? Number(item.unitPrice) : null,
    staff_partner_user_id: item.itemType === "service" ? item.staffPartnerUserId : null,
    preferred_time: item.itemType === "service" ? item.preferredTime || null : null,
    duration_minutes: item.itemType === "service" ? item.durationMinutes || null : null,
    sort_order: item.sortOrder ?? index,
  }))
}

export async function listRecurringPlansAction(
  partnerId: string,
  options?: { cursor?: string | null; status?: RecurringPlanStatus | "all"; search?: string },
) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "recurring_plans", "view")
    const supabase = await getSupabaseServerClient()
    const cursor = decodeCursor(options?.cursor)
    const search = String(options?.search || "").trim()

    let query = supabase
      .from("recurring_plans")
      .select(`
        *,
        recurring_plan_items(
          id, item_type, product_id, variant_id, service_id, quantity, unit_price,
          staff_partner_user_id, preferred_time, duration_minutes, sort_order,
          products:product_id(id, name, price),
          services:service_id(id, name, price, duration_minutes)
        )
      `)
      .eq("partner_id", partnerId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE + 1)

    if (options?.status && options.status !== "all") {
      query = query.eq("status", options.status)
    }
    if (search) {
      query = query.or(`name.ilike.%${search.replace(/[%_]/g, "")}%,description.ilike.%${search.replace(/[%_]/g, "")}%`)
    }
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`)
    }

    const { data, error } = await query
    if (error) throw error

    const rows = data || []
    const hasMore = rows.length > PAGE_SIZE
    const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows
    const last = items[items.length - 1]

    return {
      success: true,
      data: {
        items: items.map((row) => ({
          ...mapPlanRow(row as Record<string, unknown>),
          items: (row.recurring_plan_items || []).map((item: Record<string, unknown>) => ({
            id: String(item.id),
            planId: String(row.id),
            itemType: item.item_type,
            productId: item.product_id,
            variantId: item.variant_id,
            serviceId: item.service_id,
            quantity: Number(item.quantity),
            unitPrice: item.unit_price != null ? Number(item.unit_price) : null,
            staffPartnerUserId: item.staff_partner_user_id,
            preferredTime: item.preferred_time,
            durationMinutes: item.duration_minutes,
            sortOrder: item.sort_order,
            product: item.products || null,
            service: item.services || null,
          })),
        })),
        nextCursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
        hasMore,
      },
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao listar planos" }
  }
}

export async function createRecurringPlanAction(input: {
  partnerId: string
  name: string
  description?: string | null
  status?: RecurringPlanStatus
  frequencyType: RecurringFrequencyType
  frequencyInterval?: number
  weekdays?: number[] | null
  dayOfMonth?: number | null
  useLastDay?: boolean
  yearMonth?: number | null
  yearDay?: number | null
  startDate: string
  endDate?: string | null
  showInMarketplace?: boolean
  items: RecurringPlanItem[]
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(input.partnerId, "recurring_plans", "manage")
    const { name, interval } = validatePlanInput(input)
    const supabase = await getSupabaseServerClient()

    const { data: plan, error } = await supabase
      .from("recurring_plans")
      .insert({
        partner_id: input.partnerId,
        name,
        description: input.description?.trim() || null,
        status: input.status || "active",
        frequency_type: input.frequencyType,
        frequency_interval: interval,
        weekdays: input.weekdays || null,
        day_of_month: input.dayOfMonth ?? null,
        use_last_day: !!input.useLastDay,
        year_month: input.yearMonth ?? null,
        year_day: input.yearDay ?? null,
        start_date: input.startDate,
        end_date: input.endDate || null,
        show_in_marketplace: input.showInMarketplace !== false,
      })
      .select("*")
      .single()

    if (error) throw error

    const itemsPayload = mapItemsToDb(input.items).map((item) => ({ ...item, plan_id: plan.id }))
    const { error: itemsError } = await supabase.from("recurring_plan_items").insert(itemsPayload)
    if (itemsError) {
      await supabase.from("recurring_plans").delete().eq("id", plan.id)
      throw itemsError
    }

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: null,
      entityType: "recurring_plan",
      entityId: plan.id,
      actionType: "created",
      changeLines: [`criou plano recorrente "${name}".`],
      source: "manual",
    })

    return { success: true, data: mapPlanRow(plan as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao criar plano" }
  }
}

export async function updateRecurringPlanAction(input: {
  partnerId: string
  planId: string
  name?: string
  description?: string | null
  status?: RecurringPlanStatus
  frequencyType?: RecurringFrequencyType
  frequencyInterval?: number
  weekdays?: number[] | null
  dayOfMonth?: number | null
  useLastDay?: boolean
  yearMonth?: number | null
  yearDay?: number | null
  startDate?: string
  endDate?: string | null
  showInMarketplace?: boolean
  items?: RecurringPlanItem[]
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePartnerAccessWithPermission(input.partnerId, "recurring_plans", "manage")
    const supabase = await getSupabaseServerClient()

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name != null) updatePayload.name = String(input.name).trim()
    if (input.description !== undefined) updatePayload.description = input.description?.trim() || null
    if (input.status) updatePayload.status = input.status
    if (input.frequencyType) updatePayload.frequency_type = input.frequencyType
    if (input.frequencyInterval != null) updatePayload.frequency_interval = Math.max(input.frequencyInterval, 1)
    if (input.weekdays !== undefined) updatePayload.weekdays = input.weekdays
    if (input.dayOfMonth !== undefined) updatePayload.day_of_month = input.dayOfMonth
    if (input.useLastDay !== undefined) updatePayload.use_last_day = input.useLastDay
    if (input.yearMonth !== undefined) updatePayload.year_month = input.yearMonth
    if (input.yearDay !== undefined) updatePayload.year_day = input.yearDay
    if (input.startDate) updatePayload.start_date = input.startDate
    if (input.endDate !== undefined) updatePayload.end_date = input.endDate
    if (input.showInMarketplace !== undefined) updatePayload.show_in_marketplace = input.showInMarketplace

    const { data: plan, error } = await supabase
      .from("recurring_plans")
      .update(updatePayload)
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .select("*")
      .single()

    if (error) throw error

    if (input.items) {
      validatePlanInput({
        name: plan.name,
        frequencyType: plan.frequency_type,
        startDate: plan.start_date,
        items: input.items,
      })
      await supabase.from("recurring_plan_items").delete().eq("plan_id", input.planId)
      const itemsPayload = mapItemsToDb(input.items).map((item) => ({ ...item, plan_id: input.planId }))
      const { error: itemsError } = await supabase.from("recurring_plan_items").insert(itemsPayload)
      if (itemsError) throw itemsError
    }

    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: null,
      entityType: "recurring_plan",
      entityId: input.planId,
      actionType: "updated",
      changeLines: [`atualizou plano recorrente "${plan.name}".`],
      source: "manual",
    })

    return { success: true, data: mapPlanRow(plan as Record<string, unknown>) }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao atualizar plano" }
  }
}

export async function getRecurringPlanFormDataAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "recurring_plans", "view")
    const supabase = await getSupabaseServerClient()

    const [productsRes, servicesRes, staffRes] = await Promise.all([
      supabase.from("products").select("id, name, price").eq("partner_id", partnerId).eq("is_active", true).order("name").limit(500),
      supabase.from("services").select("id, name, price, duration_minutes").eq("partner_id", partnerId).eq("is_active", true).order("name").limit(500),
      supabase.from("partner_users").select("id, user_id, role_id").eq("partner_id", partnerId).order("created_at"),
    ])

    const userIds = (staffRes.data || []).map((pu) => pu.user_id).filter(Boolean)
    let profileMap: Record<string, string> = {}
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("user_profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
      for (const p of profiles || []) {
        if (p.full_name) profileMap[p.user_id] = p.full_name
      }
    }

    return {
      success: true,
      data: {
        products: productsRes.data || [],
        services: servicesRes.data || [],
        staff: (staffRes.data || []).map((pu) => ({
          id: pu.id,
          display_name: profileMap[pu.user_id] || "Profissional",
        })),
      },
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar dados" }
  }
}

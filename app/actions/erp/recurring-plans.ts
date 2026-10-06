"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { logAuditEvent } from "@/lib/services/timeline.service"
import type { RecurringListCursor, RecurringPlanItem, RecurringPlanStatus, RecurringFrequencyType, RecurringShippingMode } from "@/lib/types/recurring"
import { mapPlanRow } from "@/lib/types/recurring"
import { sanitizeInput } from "@/lib/input-validator"

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
  const name = sanitizeInput(String(input.name || ""), 150).trim()
  if (!name) throw new Error("Nome do plano é obrigatório.")
  if (name.length > 150) throw new Error("Nome deve ter no máximo 150 caracteres.")

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

const SHIPPING_MODES: RecurringShippingMode[] = ["included", "flat", "quote"]

/**
 * Normaliza a politica de frete do plano. O valor fixo so' existe quando o
 * modo e' "flat"; nos demais modos ele e' zerado para nao vazar lixo.
 */
function normalizeShippingInput(input: {
  shippingMode?: RecurringShippingMode
  shippingFlatAmount?: number
}): { mode: RecurringShippingMode; flatAmount: number } {
  const mode: RecurringShippingMode = input.shippingMode || "included"
  if (!SHIPPING_MODES.includes(mode)) throw new Error("Modo de frete inválido.")

  const raw = Number(input.shippingFlatAmount ?? 0)
  if (!Number.isFinite(raw) || raw < 0) throw new Error("Valor de frete inválido.")
  if (mode === "flat" && raw <= 0) throw new Error("Informe o valor do frete fixo.")

  return { mode, flatAmount: mode === "flat" ? Math.round(raw * 100) / 100 : 0 }
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
  options?: { cursor?: string | null; status?: RecurringPlanStatus | "all"; search?: string; storeId?: string | null },
) {
  try {
    await requirePermission(partnerId, "recurring_plans", "view")
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

    if (options?.storeId) {
      query = query.eq("store_id", options.storeId)
    }

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
        items: items.map((row: any) => ({
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
  images?: string[] | null
  billingMode?: "manual" | "auto_mercado_pago"
  creditExpirationPolicy?: "never" | "end_of_cycle" | "fixed_days"
  creditExpirationDays?: number | null
  shippingMode?: RecurringShippingMode
  shippingFlatAmount?: number
  storeId?: string
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(input.partnerId, "recurring_plans", "manage")
    await requireMinimumPlan(input.partnerId, "escalar")

    // Limite de planos recorrentes ativos (0 fora do Escalar)
    const { checkRecurringPlanCreateLimit } = await import("@/lib/services/recurring/limits")
    const recurringLimitCheck = await checkRecurringPlanCreateLimit(input.partnerId)
    if (!recurringLimitCheck.allowed) {
      return { success: false, error: recurringLimitCheck.message || "Seu plano não permite criar mais planos recorrentes." }
    }

    // Check images limit
    const { checkLimit, increment_usage_counter } = await import("@/lib/services/subscription.service")
    const imagesLimitCheck = await checkLimit(input.partnerId, "images_per_item", (input.images?.length || 0))
    if (!imagesLimitCheck.allowed) {
      return { success: false, error: imagesLimitCheck.message || "Limite de imagens por item atingido." }
    }

    const { name, interval } = validatePlanInput(input)
    const shipping = normalizeShippingInput(input)
    const supabase = await getSupabaseServerClient()

    const { getCurrentPartnerContext } = await import("@/lib/auth/partner-context")
    const context = await getCurrentPartnerContext()
    let storeId: string | null = input.storeId?.trim() || context?.activeStoreId || null
    if (!storeId) {
      const { data: firstStore } = await supabase
        .from("stores")
        .select("id")
        .eq("partner_id", input.partnerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      storeId = firstStore?.id || null
    }

    const { data: plan, error } = await supabase
      .from("recurring_plans")
      .insert({
        partner_id: input.partnerId,
        store_id: storeId,
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
        images: input.images || [],
        billing_mode: input.billingMode || "manual",
        credit_expiration_policy: input.creditExpirationPolicy || "end_of_cycle",
        credit_expiration_days: input.creditExpirationDays ?? null,
        shipping_mode: shipping.mode,
        shipping_flat_amount: shipping.flatAmount,
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

    if (input.images && input.images.length > 0) {
      await increment_usage_counter(input.partnerId, "images_count", input.images.length)
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

const _deleteFromR2 = async (url: string) => {
  if (!url || !url.trim()) return;
  try {
    const { extractKeyFromR2Url, deleteFileFromR2 } = await import("@/lib/r2/server");
    const key = url.startsWith('http') ? extractKeyFromR2Url(url) : url;
    if (key) await deleteFileFromR2(key);
  } catch (e) {
    console.error("Failed to delete image: ", url, e);
  }
};

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
  images?: string[] | null
  billingMode?: "manual" | "auto_mercado_pago"
  creditExpirationPolicy?: "never" | "end_of_cycle" | "fixed_days"
  creditExpirationDays?: number | null
  shippingMode?: RecurringShippingMode
  shippingFlatAmount?: number
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(input.partnerId, "recurring_plans", "manage")
    await requireMinimumPlan(input.partnerId, "escalar")

    // Check images limit
    const { checkLimit, increment_usage_counter, decrement_usage_counter } = await import("@/lib/services/subscription.service")
    if (input.images !== undefined && input.images !== null) {
      const imagesLimitCheck = await checkLimit(input.partnerId, "images_per_item", input.images.length)
      if (!imagesLimitCheck.allowed) {
        return { success: false, error: imagesLimitCheck.message || "Limite de imagens por item atingido." }
      }
    }

    const supabase = await getSupabaseServerClient()

    // Get old plan for images comparison
    const { data: oldPlan } = await supabase
      .from("recurring_plans")
      .select("images")
      .eq("id", input.planId)
      .eq("partner_id", input.partnerId)
      .maybeSingle()

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
    if (input.images !== undefined) updatePayload.images = input.images
    if (input.billingMode) updatePayload.billing_mode = input.billingMode
    if (input.creditExpirationPolicy) updatePayload.credit_expiration_policy = input.creditExpirationPolicy
    if (input.creditExpirationDays !== undefined) updatePayload.credit_expiration_days = input.creditExpirationDays
    if (input.shippingMode !== undefined) {
      const shipping = normalizeShippingInput({
        shippingMode: input.shippingMode,
        shippingFlatAmount: input.shippingFlatAmount,
      })
      updatePayload.shipping_mode = shipping.mode
      updatePayload.shipping_flat_amount = shipping.flatAmount
    }

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

      // Mudou preco/itens: abre a janela de consentimento das assinaturas
      // ativas (cobranca continua no valor antigo ate o cliente responder).
      const { detectPlanPriceChange } = await import("@/lib/services/recurring/price-consent")
      await detectPlanPriceChange(supabase, { planId: input.planId })
    }

    // Process image changes
    if (oldPlan && input.images !== undefined) {
      const oldImages = Array.isArray(oldPlan.images) ? oldPlan.images.filter((img: any) => typeof img === 'string' && img.trim()) : []
      const newImages = input.images || []
      const deletedImages = oldImages.filter((img: string) => !newImages.includes(img))
      const addedImages = newImages.filter((img: string) => !oldImages.includes(img))

      if (deletedImages.length > 0) {
        Promise.all(deletedImages.map((img: string) => _deleteFromR2(img))).catch(console.error)
        await decrement_usage_counter(input.partnerId, "images_count", deletedImages.length)
      }
      if (addedImages.length > 0) {
        await increment_usage_counter(input.partnerId, "images_count", addedImages.length)
      }
    } else if (input.images && input.images.length > 0) {
      await increment_usage_counter(input.partnerId, "images_count", input.images.length)
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
    await requirePermission(partnerId, "recurring_plans", "view")
    const supabase = await getSupabaseServerClient()

    const [productsRes, servicesRes, staffRes] = await Promise.all([
      supabase.from("products").select("id, name, price").eq("partner_id", partnerId).eq("is_active", true).order("name").limit(500),
      supabase.from("services").select("id, name, price, duration_minutes").eq("partner_id", partnerId).eq("is_active", true).order("name").limit(500),
      supabase.from("partner_users").select("id, user_id, role_id").eq("partner_id", partnerId).order("created_at"),
    ])

    const userIds = (staffRes.data || []).map((pu: any) => pu.user_id).filter(Boolean)
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
        staff: (staffRes.data || []).map((pu: any) => ({
          id: pu.id,
          display_name: profileMap[pu.user_id] || "Profissional",
        })),
      },
    }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao carregar dados" }
  }
}

export async function deleteRecurringPlanAction(partnerId: string, planId: string) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(partnerId, "recurring_plans", "manage")
    await requireMinimumPlan(partnerId, "escalar")
    const supabase = await getSupabaseServerClient()

    // 1. Delete items first
    await supabase.from("recurring_plan_items").delete().eq("plan_id", planId)

    // 2. Delete plan
    const { error } = await supabase
      .from("recurring_plans")
      .delete()
      .eq("id", planId)
      .eq("partner_id", partnerId)

    if (error) throw error

    await logAuditEvent({
      partnerId,
      actorUserId: null,
      entityType: "recurring_plan",
      entityId: planId,
      actionType: "deleted",
      changeLines: [`excluiu plano recorrente id "${planId}".`],
      source: "manual",
    })

    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : "Erro ao excluir plano" }
  }
}


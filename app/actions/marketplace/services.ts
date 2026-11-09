"use server"

import { unstable_cache } from "next/cache"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { cache } from "react"
import { sanitizeNotes } from "@/lib/input-validator"
import { resolveService } from "@/lib/store-services"
import { filterMarketplaceVisibleServices } from "@/lib/resolve-marketplace-visibility"
import { getSaoPauloDateComponents } from "@/lib/utils/formatters"
import { startOfDay } from "@/lib/date"
import { isUuid } from "@/lib/utils/short-id"
import { withMpPartnerFields } from "@/lib/services/payments/mercadopago-integration"

// ─── Constants (mirrored from ERP appointments.ts) ─────────────────────────
const DEFAULT_BUSINESS_HOURS = { startHour: 8, startMinute: 0, endHour: 19, endMinute: 0 }
const SLOT_INCREMENT_MINUTES = 15

// ─── Public Service Fetchers ───────────────────────────────────────────────

/**
 * Fetch a single service for the marketplace detail page.
 * Includes partner info (store name, address, avatar, payment methods).
 * No auth required - public data only.
 */
async function _getMarketplaceServiceBase(serviceId: string, storeId?: string | null) {
  if (!serviceId) return null

  const supabase = getAdminClient()

  let query = supabase
    .from("services")
    .select(`
      id, short_id, partner_id, store_id, name, description, price, duration_minutes,
      images, is_active, status, moderation_status, moderation_reason, rating, category_id, subcategory_id, sku, unit,
      show_in_marketplace, tags, price_type, billing_unit, video_url, video_type,
      video_thumbnail, video_duration, video_provider_id, service_type,
      warranty, buffer_minutes, marketplace_category_id, fulfillment_modes,
      payment_requirement, show_price_in_store, promotional_price, technical_details,
      created_at,
      partners!partner_id (
        id,
        user_id,
        is_active,
        erp_disabled,
        is_showcase_active,
        partner_integrations(provider_slug, status, account_id, connected_at, config, metadata),
        order_flow,
        created_at,
        addresses (id, street, number, neighborhood, city, state, zip_code),
        payment_methods (*)
      ),
      service_categories:service_categories!category_id (name),
      marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name)),
      stores!left(
        id, short_id, name, slug, description, logo_url, banner_url,
        phone, opening_hours, gallery,
        is_showcase_active, accept_orders_when_closed, timezone, business_info,
        rating, vendas_totais,
        addresses!store_id!left(city, state, latitude, longitude)
      )
    `)

  if (isUuid(serviceId)) {
    query = query.eq("id", serviceId)
  } else {
    query = query.eq("short_id", serviceId)
  }


  if (storeId) {
    query = query.eq("store_id", storeId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    console.error(`[Service] Fetch error for ${serviceId}:`, error.message)
    return null
  }

  if (!data) {
    return null
  }

  // Validate store visibility if store context is available
  if (storeId && data) {
    const resolvedService = await resolveService(serviceId, storeId, true)
    if (!resolvedService) {
      console.warn(`[Service] ${serviceId} rejeitado pelo resolver (store:${storeId})`)
      return null
    }
    data.price = resolvedService.resolved_price
    data.sku = resolvedService.resolved_sku
    data.is_active = resolvedService.store_is_active
    data.status = resolvedService.store_is_active ? "ativo" : "inativo"
  }

  const rawPartner = Array.isArray(data.partners) ? data.partners[0] : data.partners
  // mp_* status fields are sourced from partner_integrations.
  if (rawPartner) Object.assign(rawPartner, withMpPartnerFields(rawPartner))

  // Merge store data over partner data
  const rawStore: any = Array.isArray(data.stores) ? data.stores[0] : data.stores
  if (rawStore && rawPartner) {
    rawPartner.store_id = rawStore.id
    rawPartner.store_name = rawStore.name
    rawPartner.slug = rawStore.slug || rawPartner.slug || null
    rawPartner.store_description = rawStore.description || rawPartner.store_description
    rawPartner.store_image_url = rawStore.logo_url || rawPartner.store_image_url
    rawPartner.banner_url = rawStore.banner_url || rawPartner.banner_url
    rawPartner.phone = rawStore.phone || rawPartner.phone
    const addr = Array.isArray(rawStore.addresses) ? rawStore.addresses[0] : null
    rawPartner.city = addr?.city || rawStore.city || rawPartner.addresses?.[0]?.city || null
    rawPartner.state = addr?.state || rawStore.state || rawPartner.addresses?.[0]?.state || null
    rawPartner.opening_hours = rawStore.opening_hours || rawPartner.opening_hours
    rawPartner.timezone = rawStore.timezone || rawPartner.timezone || "America/Sao_Paulo"
    rawPartner.latitude = addr?.latitude || rawPartner.latitude
    rawPartner.longitude = addr?.longitude || rawPartner.longitude
    // Recursos do sistema são definidos no parceiro; a loja não os sobrescreve.
    rawPartner.business_info = rawPartner.business_info || rawStore.business_info
    rawPartner.gallery = rawStore.gallery || rawPartner.gallery
    rawPartner.is_showcase_active = rawStore.is_showcase_active !== false
    rawPartner.rating = rawStore.rating ?? rawPartner.rating ?? 0
    rawPartner.vendas_totais = rawStore.vendas_totais ?? rawPartner.vendas_totais ?? 0
  } else if (rawPartner) {
    rawPartner.is_showcase_active = rawPartner.is_showcase_active !== false
  }

  // user_id must never be serialized to a marketplace client.
  if (rawPartner && "user_id" in rawPartner) {
    delete rawPartner.user_id
    delete rawPartner.is_active
    delete rawPartner.erp_disabled
  }

  return data
}

async function _getMarketplaceService(serviceId: string, storeId?: string | null) {
  if (!serviceId) return null
  const storeKey = storeId || "none"
  return unstable_cache(
    async () => _getMarketplaceServiceBase(serviceId, storeId),
    ["marketplace-service-detail", serviceId, storeKey],
    {
      tags: ["marketplace-services", "services", `service-${serviceId}`],
      revalidate: 300,
    }
  )()
}

export const getMarketplaceService = cache(_getMarketplaceService)

/**
 * Fetch the reviews for a specific service.
 */
export async function getServiceReviews(serviceId: string, storeId?: string | null) {
  if (!serviceId) return []
  const storeKey = storeId || "none"
  return unstable_cache(
    async () => {
  const supabase = getAdminClient()
  let resolvedId = serviceId
  if (!isUuid(serviceId)) {
    const { data: srv } = await supabase.from("services").select("id").eq("short_id", serviceId).maybeSingle()
    if (srv?.id) resolvedId = srv.id
  }
  let query = supabase
    .from("reviews")
    .select(`
      id, rating, comment, created_at, user_id, order_id, product_id, service_id, store_id,
      products:product_id(name, images, unit),
      services:service_id(name, images, unit)
    `)
    .eq("service_id", resolvedId)

  if (storeId) {
    query = query.or(`store_id.eq.${storeId},store_id.is.null`)
  }


  const { data: reviewsData, error } = await query
    .order("created_at", { ascending: false })

  if (error || !reviewsData) return []

  const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
  const profilesMap = new Map<string, { full_name: string }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, { full_name: p.full_name })
      })
    }
  }

  const orderIds = Array.from(new Set(reviewsData.map((r: any) => r.order_id).filter(Boolean)))
  let orderItemsMap = new Map<string, { quantity: number | null; variant_name: string | null; variant_options: any }>()

  if (orderIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("order_items")
      .select(`
        id, order_id, quantity, product_id, service_id,
        product_variants(id, variant_name, variant_options)
      `)
      .in("order_id", orderIds)

    if (itemsData) {
      itemsData.forEach((item: any) => {
        const key = `${item.order_id}_${item.product_id || item.service_id}`
        orderItemsMap.set(key, {
          quantity: item.quantity,
          variant_name: item.product_variants?.variant_name || null,
          variant_options: item.product_variants?.variant_options || null,
        })
      })
    }
  }

  return reviewsData.map((r: any) => {
    const itemKey = `${r.order_id}_${r.product_id || r.service_id}`
    const orderItem = orderItemsMap.get(itemKey)
    const product = r.products || null
    const service = r.services || null
    return {
      id: r.id,
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      product_name: product?.name || null,
      service_name: service?.name || null,
      quantity: orderItem?.quantity || null,
      variant_name: orderItem?.variant_name || null,
      variant_options: orderItem?.variant_options || null,
      unit: product?.unit || service?.unit || null,
      products: product ? { name: product.name, images: product.images, unit: product.unit } : null,
      services: service ? { name: service.name, images: service.images, unit: service.unit } : null,
      profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" }
    }
  })
    },
    ["marketplace-service-reviews", serviceId, storeKey],
    {
      tags: ["marketplace-reviews", `service-${serviceId}`],
      revalidate: 300,
    }
  )()
}

/**
 * Fetch staff members (partner_users) for a given store's partner.
 * Used to let the customer pick a professional when booking.
 * No ERP auth - public data only (names and IDs).
 */
export async function getServiceStaffMembers(partnerId: string, storeId?: string) {
  if (!partnerId) return []

  const supabase = getAdminClient()

  // If storeId provided, verify store belongs to partner
  if (storeId) {
    const { data: store } = await supabase
      .from("stores")
      .select("partner_id")
      .eq("id", storeId)
      .single()
    if (store?.partner_id !== partnerId) {
      console.warn(`[getServiceStaffMembers] Store ${storeId} does not belong to partner ${partnerId}`)
    }
  }

  // Get partner owner
  const { data: partner } = await supabase
    .from("partners")
    .select("user_id")
    .eq("id", partnerId)
    .single()

  const ownerUserId = partner?.user_id

  // Get all team members
  const { data: partnerUsers } = await supabase
    .from("partner_users")
    .select("id, user_id, role_id")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true })

  if (!partnerUsers || partnerUsers.length === 0) return []

  // Get display names
  const userIds = partnerUsers.map((pu: any) => pu.user_id)
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, full_name")
    .in("user_id", userIds)

  const profileMap: Record<string, string> = {}
  if (profiles) {
    for (const p of profiles) {
      if (p.full_name) profileMap[p.user_id] = p.full_name
    }
  }

  return partnerUsers.map((pu: any) => ({
    id: String(pu.id),
    name: profileMap[pu.user_id] || "Profissional",
    isOwner: pu.user_id === ownerUserId,
  }))
}

/**
 * Public version of getAvailableTimeSlotsAction.
 * Same algorithm as the ERP version but no ERP auth required.
 * Uses opening_hours from the store if available, otherwise from partner.
 */
export async function getPublicAvailableTimeSlots(
  partnerId: string,
  staffId: string,
  date: string,
  serviceDurationMinutes: number,
  bufferMinutes: number = 0,
  storeId?: string
) {
  try {
    if (!partnerId || !staffId || !date) {
      return { success: false, error: "Parâmetros inválidos", slots: [] }
    }

    const supabase = getAdminClient()

    // Fetch existing appointments for this staff on this date (by store if available, otherwise by partner)
    let apptQuery = supabase
      .from("appointments")
      .select("start_time, end_time, duration_minutes, status, store_id")
      .eq("partner_id", partnerId)
      .eq("staff_partner_user_id", staffId)
      .lte("start_date", date)
      .or(`end_date.gte.${date},end_date.is.null`)
      .order("start_time", { ascending: true })

    const { data: existingAppts, error } = await apptQuery

    if (error) throw error

    // Build occupied time ranges (in minutes from midnight)
    const occupiedRanges: Array<{ start: number; end: number }> = (existingAppts || [])
      .filter((apt: any) =>
        !["cancelado", "cancelled", "canceled"].includes(String(apt.status || "").toLowerCase()) &&
        (!storeId || !apt.store_id || apt.store_id === storeId)
      )
      .map((apt: any) => {
      const [sh, sm] = String(apt.start_time || "").split(":").map(Number)
      const startMin = (sh || 0) * 60 + (sm || 0)

      let endMin: number
      if (apt.end_time) {
        const [eh, em] = String(apt.end_time).split(":").map(Number)
        endMin = (eh || 0) * 60 + (em || 0)
        if (endMin <= startMin) endMin = startMin + Number(apt.duration_minutes || 60)
      } else {
        endMin = startMin + Number(apt.duration_minutes || 60)
      }

      // Add buffer after each appointment
        return { start: startMin, end: endMin + bufferMinutes }
      })

    // Fetch opening hours: store first, then partner
    let rawOpeningHours = null

    if (storeId) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("opening_hours")
        .eq("id", storeId)
        .single()
      rawOpeningHours = storeData?.opening_hours
    }

    if (!rawOpeningHours) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("opening_hours")
        .eq("partner_id", partnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
      rawOpeningHours = storeData?.opening_hours
    }

    // Determine day of the week
    const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    const [year, month, day] = date.split("-").map(Number)
    const dateObj = new Date(year, month - 1, day)
    const dayOfWeek = DAYS_OF_WEEK[dateObj.getDay()]

    const { normalizeOpeningHours, parseTimeToMinutes } = await import("@/lib/utils/opening-hours")
    const normalized = normalizeOpeningHours(rawOpeningHours)
    const daySchedule = normalized[dayOfWeek]

    const slots: string[] = []

    if (daySchedule && daySchedule.enabled) {
      const dayStartMin = parseTimeToMinutes(daySchedule.from)
      let dayEndMin = parseTimeToMinutes(daySchedule.to)
      if (dayEndMin <= dayStartMin) dayEndMin += 24 * 60
      const totalDurationNeeded = serviceDurationMinutes + bufferMinutes

      for (let slotStart = dayStartMin; slotStart + serviceDurationMinutes <= dayEndMin; slotStart += SLOT_INCREMENT_MINUTES) {
        const slotEnd = slotStart + totalDurationNeeded

        // Check if this slot conflicts with any existing appointment
        const hasConflict = occupiedRanges.some(
          (range) => slotStart < range.end && slotEnd > range.start
        )

        if (!hasConflict) {
          const h = Math.floor(slotStart / 60)
          const m = slotStart % 60
          slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)
        }
      }
    }

    const now = new Date()
    const { year: nowYear, month: nowMonth, day: nowDay, hour, minute } = getSaoPauloDateComponents(now)
    const todayStr = `${nowYear}-${String(nowMonth).padStart(2, "0")}-${String(nowDay).padStart(2, "0")}`
    if (date === todayStr) {
      const currentMinutes = hour * 60 + minute
      return {
        success: true,
        slots: slots.filter((slot) => {
          const [h, m] = slot.split(":").map(Number)
          return h * 60 + m > currentMinutes
        })
      }
    }

    return { success: true, slots }
  } catch (error: any) {
    console.error("[PublicSlots] Error:", error?.message)
    return { success: false, error: error?.message || "Erro ao buscar horários", slots: [] }
  }
}

/**
 * Create a public appointment from the marketplace.
 * Requires authenticated user. Creates/links customer automatically.
 */
export async function createPublicAppointment(data: {
  serviceId: string
  partnerId: string
  staffId: string
  staffName: string
  date: string
  time: string
  serviceName: string
  price: number
  durationMinutes: number
  notes?: string
  storeId?: string
}) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "Você precisa estar logado para agendar." }
    }

    const supabase = getAdminClient()

    const { checkLimit, increment_usage_counter } = await import("@/lib/services/subscription.service")
    const bookingLimitCheck = await checkLimit(data.partnerId, "monthly_appointments")
    if (!bookingLimitCheck.allowed) {
      return {
        success: false,
        error: bookingLimitCheck.message || "A agenda atingiu o limite mensal de agendamentos.",
      }
    }

    // Get user profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle()

    const customerName = profile?.full_name || user.email?.split("@")[0] || "Cliente"

    // Ensure customer exists/is updated for this partner
    const { ensureMarketplaceCustomer } = await import("@/lib/services/marketplace-customer")
    const customerId = await ensureMarketplaceCustomer({
      partnerId: data.partnerId,
      name: customerName,
      email: user.email,
      phone: profile?.phone || null,
      cpf: null,
      userId: user.id,
    })

    // Calculate end_time
    const [h, m] = data.time.split(":").map(Number)
    const endMinutes = (h * 60 + m) + data.durationMinutes
    const endH = Math.floor(endMinutes / 60)
    const endM = endMinutes % 60
    const endTime = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`

    // Idempotency guard: reject duplicates within 30 seconds
    const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString()
    let dupQuery = supabase
      .from("appointments")
      .select("id")
      .eq("partner_id", data.partnerId)
      .eq("customer_name", customerName)
      .eq("service_name", data.serviceName)
      .eq("start_date", data.date)
      .eq("start_time", data.time)
      .eq("staff_partner_user_id", data.staffId)
      .gte("created_at", thirtySecondsAgo)
      .limit(1)

    if (data.storeId) {
      dupQuery = dupQuery.eq("store_id", data.storeId)
    }

    const { data: recentDup } = await dupQuery

    if (recentDup && recentDup.length > 0) {
      return { success: false, error: "Agendamento duplicado detectado. Aguarde alguns segundos." }
    }

    // Create the appointment
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .insert({
        partner_id: data.partnerId,
        store_id: data.storeId || null,
        customer_id: customerId,
        customer_name: customerName,
        service_name: data.serviceName,
        start_date: data.date,
        start_time: data.time,
        end_date: data.date,
        end_time: endTime,
        duration_minutes: data.durationMinutes,
        staff_partner_user_id: data.staffId,
        staff_name: data.staffName,
        price: data.price,
        pricing_unit: "Por Serviço",
        notes: sanitizeNotes(data.notes),
        status: "Reservado",
        source: "appointment",
        sales_channel: "online_storefront",
        payment_status: data.price > 0.009 ? "unpaid" : "paid",
      })
      .select("id")
      .single()

    if (aptError) throw aptError

    if (appointment?.id) {
      increment_usage_counter(data.partnerId, "appointments_month_count").catch(console.error)
    }

    // Create receivable (pending) for this appointment if price > 0
    if (data.price > 0.009 && appointment?.id) {
      const ref = `appointment:${appointment.id}:receivable`
      const { resolveMarketplaceOrderFinanceAccountId } = await import("@/app/actions/erp/finance-accounts")
      const financeAccountId = await resolveMarketplaceOrderFinanceAccountId(supabase as any, data.partnerId, false)

      const { data: txData } = await supabase
        .from("transactions")
        .insert({
          partner_id: data.partnerId,
          description: data.serviceName,
          category: "Vendas",
          customer_id: customerId,
          contact_type: "customer",
          amount: data.price,
          due_date: data.date,
          payment_date: null,
          transaction_date: startOfDay(data.date).toISOString(),
          status: "pending",
          notes: null,
          payment_type: "Agendamento",
          original_amount: data.price,
          interest_amount: null,
          fee_amount: 0,
          transaction_type: "income",
          origin: "system",
          reference_note: ref,
          account_id: financeAccountId || null,
          created_by_user_id: user.id,
        })
        .select("id")
        .single()

      if (txData?.id) {
        await supabase
          .from("appointments")
          .update({ receivable_transaction_id: txData.id })
          .eq("id", appointment.id)
      }
    }

    return { success: true, appointmentId: appointment?.id }
  } catch (error: any) {
    console.error("[PublicAppointment] Error:", error?.message)
    return { success: false, error: error?.message || "Erro ao criar agendamento" }
  }
}

export async function validateServiceBookingAvailabilityAction(
  items: Array<{
    partnerId: string
    staffId: string
    date: string
    time: string
    durationMinutes: number
    storeId?: string | null
  }>,
) {
  const { isStaffSlotAvailable } = await import("@/lib/commerce/scheduling-availability")
  const supabase = getAdminClient()

  const partnerIds = [...new Set(items.map((i) => i.partnerId))]
  const { data: stores } = await supabase
    .from("stores")
    .select("id, partner_id, opening_hours")
    .in("partner_id", partnerIds)

  const hoursMap: Record<string, any> = {}
  if (stores) {
    for (const s of stores) {
      hoursMap[`${s.partner_id}:${s.id}`] = s.opening_hours
      if (!hoursMap[s.partner_id]) hoursMap[s.partner_id] = s.opening_hours
    }
  }

  const results: Array<{ available: boolean; staffId: string; date: string; time: string }> = []
  for (const item of items) {
    const ok = await isStaffSlotAvailable(supabase, {
      partnerId: item.partnerId,
      staffId: item.staffId,
      date: item.date,
      startTime: item.time,
      durationMinutes: item.durationMinutes,
      openingHours: hoursMap[`${item.partnerId}:${item.storeId || ''}`] || hoursMap[item.partnerId] || null,
      storeId: item.storeId || null,
    })
    results.push({ available: ok, staffId: item.staffId, date: item.date, time: item.time })
  }
  return results
}

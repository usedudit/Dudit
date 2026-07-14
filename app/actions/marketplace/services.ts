"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/auth/server-user"
import { cache } from "react"
import { sanitizeNotes } from "@/lib/input-validator"
import { getSaoPauloDateComponents } from "@/lib/utils/formatters"
import { startOfDay } from "@/lib/date"

// ─── Constants (mirrored from ERP appointments.ts) ─────────────────────────
const DEFAULT_BUSINESS_HOURS = { startHour: 8, startMinute: 0, endHour: 19, endMinute: 0 }
const SLOT_INCREMENT_MINUTES = 15

// ─── Public Service Fetchers ───────────────────────────────────────────────

/**
 * Fetch a single service for the marketplace detail page.
 * Includes partner info (store name, address, avatar, payment methods).
 * No auth required - public data only.
 */
async function _getMarketplaceService(serviceId: string) {
  if (!serviceId) return null

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("services")
    .select(`
      *,
      partners!partner_id (
        id,
        user_id,
        store_name,
        store_image_url,
        store_description,
        phone,
        rating,
        banner_url,
        banner_moderation_status,
        logo_moderation_status,
        opening_hours,
        mp_user_id,
        mp_public_key,
        vendas_totais,
        created_at,
        addresses (id, street, number, neighborhood, city, state, zip_code),
        payment_methods (*)
      ),
      service_categories:service_categories!category_id (name),
      marketplace_category_id, marketplace_category:marketplace_service_categories!marketplace_category_id(name, parent:marketplace_service_categories!parent_id(name))
    `)
    .eq("id", serviceId)
    .maybeSingle()

  if (error || !data) {
    console.error("[Service] Fetch error:", error?.message)
    return null
  }

  const user = await getCurrentUser()
  const rawPartner = Array.isArray(data.partners) ? data.partners[0] : data.partners
  const partnerId = rawPartner?.id || data.partner_id
  const isOwner = !!(user && rawPartner?.user_id === user.id)
  let isTeamMember = false

  if (user && !isOwner && partnerId) {
    const { data: membership } = await supabase
      .from("partner_users")
      .select("id")
      .eq("partner_id", partnerId)
      .eq("user_id", user.id)
      .maybeSingle()
    isTeamMember = !!membership
  }

  const isPubliclyVisible = data.is_active && data.show_in_marketplace !== false
  if (!isPubliclyVisible && !isOwner && !isTeamMember) {
    return null
  }

  return data
}

export const getMarketplaceService = cache(_getMarketplaceService)

/**
 * Fetch the reviews for a specific service.
 */
export async function getServiceReviews(serviceId: string) {
  const supabase = getAdminClient()
  const { data: reviewsData, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("service_id", serviceId)
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

  return reviewsData.map((r: any) => ({
    ...r,
    profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" }
  }))
}

/**
 * Fetch staff members (partner_users) for a given partner.
 * Used to let the customer pick a professional when booking.
 * No ERP auth - public data only (names and IDs).
 */
export async function getServiceStaffMembers(partnerId: string) {
  if (!partnerId) return []

  const supabase = getAdminClient()

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
 * Uses opening_hours from the partner if available, otherwise DEFAULT_BUSINESS_HOURS.
 */
export async function getPublicAvailableTimeSlots(
  partnerId: string,
  staffId: string,
  date: string,
  serviceDurationMinutes: number,
  bufferMinutes: number = 0
) {
  try {
    if (!partnerId || !staffId || !date) {
      return { success: false, error: "Parâmetros inválidos", slots: [] }
    }

    const supabase = getAdminClient()

    // Fetch existing appointments for this staff on this date
    const { data: existingAppts, error } = await supabase
      .from("appointments")
      .select("start_time, end_time, duration_minutes")
      .eq("partner_id", partnerId)
      .eq("staff_partner_user_id", staffId)
      .eq("start_date", date)
      .neq("status", "Cancelado")
      .order("start_time", { ascending: true })

    if (error) throw error

    // Build occupied time ranges (in minutes from midnight)
    const occupiedRanges: Array<{ start: number; end: number }> = (existingAppts || []).map((apt: any) => {
      const [sh, sm] = String(apt.start_time || "").split(":").map(Number)
      const startMin = (sh || 0) * 60 + (sm || 0)

      let endMin: number
      if (apt.end_time) {
        const [eh, em] = String(apt.end_time).split(":").map(Number)
        endMin = (eh || 0) * 60 + (em || 0)
      } else {
        endMin = startMin + Number(apt.duration_minutes || 60)
      }

      // Add buffer after each appointment
      return { start: startMin, end: endMin + bufferMinutes }
    })

    // Fetch partner opening hours
    const { data: partnerData, error: partnerErr } = await supabase
      .from("partners")
      .select("opening_hours")
      .eq("id", partnerId)
      .single()

    if (partnerErr) throw partnerErr

    const rawOpeningHours = partnerData?.opening_hours

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
      const dayEndMin = parseTimeToMinutes(daySchedule.to)
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
}) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return { success: false, error: "Você precisa estar logado para agendar." }
    }

    const supabase = getAdminClient()

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
    const { data: recentDup } = await supabase
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

    if (recentDup && recentDup.length > 0) {
      return { success: false, error: "Agendamento duplicado detectado. Aguarde alguns segundos." }
    }

    // Create the appointment
    const { data: appointment, error: aptError } = await supabase
      .from("appointments")
      .insert({
        partner_id: data.partnerId,
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
  }>,
) {
  const { isStaffSlotAvailable } = await import("@/lib/commerce/scheduling-availability")
  const supabase = getAdminClient()

  const partnerIds = [...new Set(items.map((i) => i.partnerId))]
  const { data: partners } = await supabase
    .from("partners")
    .select("id, opening_hours")
    .in("id", partnerIds)

  const hoursMap: Record<string, any> = {}
  if (partners) {
    for (const p of partners) {
      hoursMap[p.id] = p.opening_hours
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
      openingHours: hoursMap[item.partnerId] || null,
    })
    results.push({ available: ok, staffId: item.staffId, date: item.date, time: item.time })
  }
  return results
}

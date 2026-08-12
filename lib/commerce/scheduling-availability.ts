import type { SupabaseClient } from "@supabase/supabase-js"
import type { OpeningHoursData } from "@/lib/utils/opening-hours"
import { normalizeOpeningHours, parseTimeToMinutes } from "@/lib/utils/opening-hours"
import { getTodayYmd, getDateComponents } from "@/lib/date"

function timeToMinutes(time: string): number {
  const [h, m] = String(time || "").split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

function getDayOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number)
  const dateObj = new Date(year, month - 1, day)
  return DAYS_OF_WEEK[dateObj.getDay()]
}

/**
 * Revalidates staff slot at booking creation (no cart holds).
 * Returns false if another non-cancelled appointment blocks the window,
 * if the date/time is already in the past, or if outside business hours.
 */
export async function isStaffSlotAvailable(
  supabase: SupabaseClient,
  params: {
    partnerId: string
    staffId: string
    date: string
    startTime: string
    durationMinutes: number
    bufferMinutes?: number
    openingHours?: OpeningHoursData | null
    storeId?: string | null
  },
): Promise<boolean> {
  const buffer = params.bufferMinutes ?? 0
  const slotStart = timeToMinutes(params.startTime)
  const slotEnd = slotStart + params.durationMinutes + buffer

  // Use timezone-aware date/time to avoid UTC vs BRT mismatch on the server
  const today = getTodayYmd()
  const { hour, minute } = getDateComponents(new Date())
  const currentMinutes = hour * 60 + minute

  if (params.date < today || (params.date === today && slotEnd <= currentMinutes)) {
    return false
  }

  if (params.openingHours) {
    const normalized = normalizeOpeningHours(params.openingHours)
    const daySchedule = normalized[getDayOfWeek(params.date)]
    if (!daySchedule?.enabled || !daySchedule.from || !daySchedule.to) {
      return false
    }
    const openMin = parseTimeToMinutes(daySchedule.from)
    let closeMin = parseTimeToMinutes(daySchedule.to)
    if (closeMin <= openMin) closeMin += 24 * 60
    if (slotStart < openMin || slotEnd > closeMin) {
      return false
    }
  }

  let appointmentsQuery = supabase
    .from("appointments")
    .select("start_time, end_time, duration_minutes, status, store_id")
    .eq("partner_id", params.partnerId)
    .eq("staff_partner_user_id", params.staffId)
    .lte("start_date", params.date)
    .or(`end_date.gte.${params.date},end_date.is.null`)

  const { data: existingAppts, error } = await appointmentsQuery

  if (error) return false

  const occupiedRanges = (existingAppts || []).filter((apt: any) =>
    !["cancelado", "cancelled", "canceled"].includes(String(apt.status || "").toLowerCase()) &&
    (!params.storeId || !apt.store_id || apt.store_id === params.storeId)
  ).map((apt: any) => {
    const startMin = timeToMinutes(apt.start_time)
    let endMin: number
    if (apt.end_time) {
      endMin = timeToMinutes(apt.end_time)
      if (endMin <= startMin) endMin = startMin + Number(apt.duration_minutes || 60)
    } else {
      endMin = startMin + Number(apt.duration_minutes || 60)
    }
    return { start: startMin, end: endMin + buffer }
  })

  const hasConflict = occupiedRanges.some(
    (range) => slotStart < range.end && slotEnd > range.start,
  )

  if (hasConflict) return false

  return true
}

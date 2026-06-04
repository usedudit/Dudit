import type { SupabaseClient } from "@supabase/supabase-js"

const DEFAULT_BUSINESS_HOURS = { startHour: 8, startMinute: 0, endHour: 19, endMinute: 0 }
const SLOT_INCREMENT_MINUTES = 15

function timeToMinutes(time: string): number {
  const [h, m] = String(time || "").split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function addMinutesToTime(time: string, minutes: number): string {
  const total = timeToMinutes(time) + minutes
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/**
 * Revalidates staff slot at booking creation (no cart holds).
 * Returns false if another non-cancelled appointment blocks the window.
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
  },
): Promise<boolean> {
  const buffer = params.bufferMinutes ?? 0
  const slotStart = timeToMinutes(params.startTime)
  const slotEnd = slotStart + params.durationMinutes + buffer

  const { data: existingAppts, error } = await supabase
    .from("appointments")
    .select("start_time, end_time, duration_minutes")
    .eq("partner_id", params.partnerId)
    .eq("staff_partner_user_id", params.staffId)
    .eq("start_date", params.date)
    .neq("status", "Cancelado")

  if (error) return false

  const occupiedRanges = (existingAppts || []).map((apt: any) => {
    const startMin = timeToMinutes(apt.start_time)
    let endMin: number
    if (apt.end_time) {
      endMin = timeToMinutes(apt.end_time)
    } else {
      endMin = startMin + Number(apt.duration_minutes || 60)
    }
    return { start: startMin, end: endMin + buffer }
  })

  const hasConflict = occupiedRanges.some(
    (range) => slotStart < range.end && slotEnd > range.start,
  )

  if (hasConflict) return false

  const dayStartMin = DEFAULT_BUSINESS_HOURS.startHour * 60 + DEFAULT_BUSINESS_HOURS.startMinute
  const dayEndMin = DEFAULT_BUSINESS_HOURS.endHour * 60 + DEFAULT_BUSINESS_HOURS.endMinute
  if (slotStart < dayStartMin || slotStart + params.durationMinutes > dayEndMin) {
    return false
  }

  const endTime = addMinutesToTime(params.startTime, params.durationMinutes)
  void endTime

  return true
}

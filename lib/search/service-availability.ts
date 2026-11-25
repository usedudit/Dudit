import type { SupabaseClient } from "@supabase/supabase-js"
import { parseTimeToMinutes, type OpeningHoursData } from "@/lib/utils/opening-hours"
import type { ParsedTimeWindow } from "./intent-parser"
import { extractDistanceKm } from "./proximity-rings"

export type ServiceAvailabilityStatus = "available" | "busy" | "closed" | "consult"

export interface ServiceAvailabilityInfo {
  status: ServiceAvailabilityStatus
  label: string
  availableSlots: string[]
  targetDate: string | null
  periodLabel: string | null
  travelFeeLabel: string | null
  outOfServiceArea: boolean
}

export interface BookedInterval {
  startMinutes: number
  endMinutes: number
}

export interface ServiceAttendanceRule {
  max_service_km?: number | null
  travel_fee_mode?: "free" | "flat" | "per_km" | "tiered" | string | null
  free_travel_km?: number | null
  travel_flat_fee?: number | null
  travel_per_km?: number | null
  enforce_service_area?: boolean | null
}

const MAX_SERVICES_TO_CHECK = 20
const CANCELLED_STATUSES = new Set(["cancelado", "cancelled", "canceled", "no-show", "no_show", "recusado"])
const MIN_LEAD_TIME_MINUTES = 15

function getBrazilNowInfo(now: Date): { todayYmd: string; currentMinutes: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === "year")?.value ?? String(now.getUTCFullYear())
  const month = parts.find((p) => p.type === "month")?.value ?? String(now.getUTCMonth() + 1).padStart(2, "0")
  const day = parts.find((p) => p.type === "day")?.value ?? String(now.getUTCDate()).padStart(2, "0")
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0)
  return {
    todayYmd: `${year}-${month}-${day}`,
    currentMinutes: hour * 60 + minute,
  }
}

function roundUpToInterval(minutes: number, interval: number): number {
  return Math.ceil(minutes / interval) * interval
}

function formatMinutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)))
  const h = String(Math.floor(clamped / 60)).padStart(2, "0")
  const m = String(clamped % 60).padStart(2, "0")
  return `${h}:${m}`
}

function parseSqlTimeToMinutes(raw: string | null | undefined): number {
  if (!raw) return -1
  // Aceita "HH:MM" ou "HH:MM:SS"
  const parts = String(raw).split(":")
  if (parts.length < 2) return -1
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1
  return h * 60 + m
}

/**
 * Calcula taxa de deslocamento e se o serviço atende na distância do comprador.
 */
export function evaluateServiceAttendance(
  service: any,
  rule: ServiceAttendanceRule | null | undefined,
  distanceKm: number | null,
): { travelFeeLabel: string | null; outOfServiceArea: boolean } {
  const modes: string[] = Array.isArray(service?.fulfillment_modes) ? service.fulfillment_modes : []
  const supportsHomeVisit = modes.includes("customer_location")
  const supportsOnSite = modes.includes("on_site")

  if (!supportsHomeVisit) {
    return {
      travelFeeLabel: supportsOnSite ? "Atendimento no local" : null,
      outOfServiceArea: false,
    }
  }

  const maxKm = service?.service_max_km ?? rule?.max_service_km ?? null
  const enforceArea = service?.service_enforce_area ?? rule?.enforce_service_area ?? true

  if (
    enforceArea &&
    distanceKm !== null &&
    maxKm !== null &&
    Number(maxKm) > 0 &&
    distanceKm > Number(maxKm)
  ) {
    return {
      travelFeeLabel: `Atende até ${Math.round(Number(maxKm))} km`,
      outOfServiceArea: true,
    }
  }

  const feeMode = service?.service_travel_fee_mode ?? rule?.travel_fee_mode ?? "free"
  const freeKm = Number(service?.service_free_travel_km ?? rule?.free_travel_km ?? 0)
  const flatFee = Number(service?.service_travel_flat_fee ?? rule?.travel_flat_fee ?? 0)
  const perKm = Number(service?.service_travel_per_km ?? rule?.travel_per_km ?? 0)

  if (feeMode === "free" || (distanceKm !== null && freeKm > 0 && distanceKm <= freeKm)) {
    return { travelFeeLabel: "Atende a domicílio · Deslocamento grátis", outOfServiceArea: false }
  }
  if (feeMode === "flat" && flatFee > 0) {
    return { travelFeeLabel: `Deslocamento R$ ${flatFee.toFixed(0)}`, outOfServiceArea: false }
  }
  if (feeMode === "per_km" && perKm > 0 && distanceKm !== null) {
    const billableKm = Math.max(0, distanceKm - freeKm)
    const fee = Math.round(billableKm * perKm)
    return {
      travelFeeLabel: fee > 0 ? `Deslocamento ~R$ ${fee}` : "Atende a domicílio",
      outOfServiceArea: false,
    }
  }

  return { travelFeeLabel: "Atende a domicílio", outOfServiceArea: false }
}

/**
 * Função pura que calcula horários disponíveis dentro de uma janela (ex: "amanhã de manhã")
 * cruzando `opening_hours` da loja e agendamentos já existentes.
 */
export function computeWindowAvailability(params: {
  openingHours: OpeningHoursData | null | undefined
  bookedIntervals: BookedInterval[]
  timeWindow: ParsedTimeWindow
  durationMinutes?: number | null
  now?: Date
}): Pick<ServiceAvailabilityInfo, "status" | "label" | "availableSlots"> {
  const { openingHours, bookedIntervals, timeWindow } = params
  const duration = Math.max(30, Math.min(180, Number(params.durationMinutes) || 60))
  const now = params.now ?? new Date()

  if (!openingHours || typeof openingHours !== "object") {
    return {
      status: "consult",
      label: `Consultar para ${timeWindow.label}`,
      availableSlots: [],
    }
  }

  const hasAnySchedule = Object.values(openingHours).some((d) => d?.enabled && d.from && d.to)
  if (!hasAnySchedule) {
    return {
      status: "consult",
      label: `Consultar para ${timeWindow.label}`,
      availableSlots: [],
    }
  }

  const daySchedule = openingHours[timeWindow.dayOfWeekKey]
  if (!daySchedule?.enabled || !daySchedule.from || !daySchedule.to) {
    return {
      status: "closed",
      label: `Fechado ${timeWindow.label}`,
      availableSlots: [],
    }
  }

  const openFrom = parseTimeToMinutes(daySchedule.from)
  const openTo = parseTimeToMinutes(daySchedule.to)
  if (openFrom < 0 || openTo < 0 || openTo <= openFrom) {
    return {
      status: "consult",
      label: `Consultar para ${timeWindow.label}`,
      availableSlots: [],
    }
  }

  let windowStart = Math.max(openFrom, timeWindow.startMinutes)
  const windowEnd = Math.min(openTo, timeWindow.endMinutes)

  // Se a data alvo é hoje (horário de Brasília), nunca sugerir horários que já passaram
  const { todayYmd, currentMinutes } = getBrazilNowInfo(now)
  if (timeWindow.targetDate === todayYmd) {
    const earliestToday = roundUpToInterval(currentMinutes + MIN_LEAD_TIME_MINUTES, 30)
    windowStart = Math.max(windowStart, earliestToday)
  }

  if (windowEnd - windowStart < 30) {
    return {
      status: timeWindow.targetDate === todayYmd ? "busy" : "closed",
      label: timeWindow.targetDate === todayYmd
        ? `Sem mais horários ${timeWindow.label}`
        : `Fechado ${timeWindow.label}`,
      availableSlots: [],
    }
  }

  const step = Math.min(60, duration)
  const availableSlots: string[] = []

  for (let slotStart = windowStart; slotStart + duration <= windowEnd; slotStart += step) {
    const slotEnd = slotStart + duration
    const overlaps = bookedIntervals.some(
      (b) => slotStart < b.endMinutes && slotEnd > b.startMinutes,
    )
    if (!overlaps) {
      availableSlots.push(formatMinutesToTime(slotStart))
      if (availableSlots.length >= 3) break
    }
  }

  if (availableSlots.length > 0) {
    return {
      status: "available",
      label: `Disponível ${timeWindow.label}`,
      availableSlots,
    }
  }

  return {
    status: "busy",
    label: `Agenda cheia ${timeWindow.label}`,
    availableSlots: [],
  }
}

const AVAILABILITY_TIER: Record<ServiceAvailabilityStatus, number> = {
  available: 3,
  consult: 2,
  busy: 1,
  closed: 0,
}

/**
 * Enriquece os top 20 serviços retornados pela busca com disponibilidade real
 * (`opening_hours` + `appointments`) e regra de deslocamento (`service_attendance_settings`).
 * Mantém custo de banco O(1) (no máximo 3 queries indexadas em paralelo).
 */
export async function enrichServicesWithAvailability<T extends Record<string, any>>(
  items: T[],
  timeWindow: ParsedTimeWindow | null,
  supabase: SupabaseClient,
): Promise<T[]> {
  if (!Array.isArray(items) || items.length === 0) return items

  const serviceIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.itemType === "servico") {
      serviceIndices.push(i)
      if (serviceIndices.length >= MAX_SERVICES_TO_CHECK) break
    }
  }

  if (serviceIndices.length === 0) return items

  const storeIds = new Set<string>()
  const partnerIds = new Set<string>()

  for (const idx of serviceIndices) {
    const item = items[idx]
    const storeId = item?.store_id || item?.partners?.store_id || item?.stores?.id
    const partnerId = item?.partner_id || item?.partners?.id
    if (storeId) storeIds.add(String(storeId))
    if (partnerId) partnerIds.add(String(partnerId))
  }

  if (storeIds.size === 0 && partnerIds.size === 0) return items

  try {
    const storeIdList = Array.from(storeIds)
    const partnerIdList = Array.from(partnerIds)

    const [storesRes, attendanceRes, appointmentsRes] = await Promise.all([
      storeIdList.length > 0
        ? supabase.from("stores").select("id, opening_hours").in("id", storeIdList)
        : Promise.resolve({ data: [] as any[], error: null }),
      partnerIdList.length > 0
        ? supabase
            .from("service_attendance_settings")
            .select("partner_id, store_id, max_service_km, travel_fee_mode, free_travel_km, travel_flat_fee, travel_per_km, enforce_service_area")
            .in("partner_id", partnerIdList)
        : Promise.resolve({ data: [] as any[], error: null }),
      timeWindow && partnerIdList.length > 0
        ? supabase
            .from("appointments")
            .select("partner_id, store_id, start_time, end_time, status")
            .in("partner_id", partnerIdList)
            .eq("start_date", timeWindow.targetDate)
        : Promise.resolve({ data: [] as any[], error: null }),
    ])

    const openingHoursByStore = new Map<string, OpeningHoursData>()
    for (const s of storesRes.data || []) {
      if (s?.id && s?.opening_hours) {
        openingHoursByStore.set(String(s.id), s.opening_hours as OpeningHoursData)
      }
    }

    const attendanceByStore = new Map<string, ServiceAttendanceRule>()
    const attendanceByPartner = new Map<string, ServiceAttendanceRule>()
    for (const r of attendanceRes.data || []) {
      if (r?.store_id) attendanceByStore.set(String(r.store_id), r)
      else if (r?.partner_id) attendanceByPartner.set(String(r.partner_id), r)
    }

    const bookedByScope = new Map<string, BookedInterval[]>()
    for (const appt of appointmentsRes.data || []) {
      const statusNorm = String(appt?.status || "").trim().toLowerCase()
      if (CANCELLED_STATUSES.has(statusNorm)) continue
      const startMinutes = parseSqlTimeToMinutes(appt?.start_time)
      const endMinutes = parseSqlTimeToMinutes(appt?.end_time)
      if (startMinutes < 0 || endMinutes <= startMinutes) continue

      const keys = [
        appt?.store_id ? `store:${appt.store_id}` : null,
        appt?.partner_id ? `partner:${appt.partner_id}` : null,
      ].filter(Boolean) as string[]

      for (const key of keys) {
        const list = bookedByScope.get(key) || []
        list.push({ startMinutes, endMinutes })
        bookedByScope.set(key, list)
      }
    }

    const cloned = items.map((item) => ({ ...item }))

    for (const idx of serviceIndices) {
      const item = cloned[idx]
      const storeId = item?.store_id || item?.partners?.store_id || item?.stores?.id
      const partnerId = item?.partner_id || item?.partners?.id
      const distanceKm = extractDistanceKm(item)

      const rule =
        (storeId ? attendanceByStore.get(String(storeId)) : undefined) ??
        (partnerId ? attendanceByPartner.get(String(partnerId)) : undefined) ??
        null

      const { travelFeeLabel, outOfServiceArea } = evaluateServiceAttendance(item, rule, distanceKm)

      if (timeWindow) {
        const openingHours = storeId ? openingHoursByStore.get(String(storeId)) : null
        const booked =
          (storeId ? bookedByScope.get(`store:${storeId}`) : undefined) ??
          (partnerId ? bookedByScope.get(`partner:${partnerId}`) : undefined) ??
          []

        const availability = computeWindowAvailability({
          openingHours,
          bookedIntervals: booked,
          timeWindow,
          durationMinutes: item?.duration_minutes,
        })

        ;(item as any)._availability = {
          ...availability,
          targetDate: timeWindow.targetDate,
          periodLabel: timeWindow.label,
          travelFeeLabel,
          outOfServiceArea,
        } satisfies ServiceAvailabilityInfo
      } else if (travelFeeLabel || outOfServiceArea) {
        ;(item as any)._availability = {
          status: "consult",
          label: "Agendamento disponível",
          availableSlots: [],
          targetDate: null,
          periodLabel: null,
          travelFeeLabel,
          outOfServiceArea,
        } satisfies ServiceAvailabilityInfo
      }
    }

    // Quando o usuário pediu uma janela de horário, promove serviços disponíveis e dentro do raio
    if (timeWindow) {
      cloned.sort((a: any, b: any) => {
        if (a.itemType === "servico" && b.itemType === "servico") {
          const outA = a._availability?.outOfServiceArea ? 1 : 0
          const outB = b._availability?.outOfServiceArea ? 1 : 0
          if (outA !== outB) return outA - outB

          const tierA = AVAILABILITY_TIER[(a._availability?.status as ServiceAvailabilityStatus) || "consult"] ?? 2
          const tierB = AVAILABILITY_TIER[(b._availability?.status as ServiceAvailabilityStatus) || "consult"] ?? 2
          if (tierA !== tierB) return tierB - tierA
        }
        return 0
      })
    }

    return cloned
  } catch (err) {
    console.warn("[service-availability] Failed to enrich service availability:", err)
    return items
  }
}

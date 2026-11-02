export const DEFAULT_NO_SHOW_PERIOD_DAYS = 90
export const DEFAULT_STAGNANT_PERIOD_DAYS = 90
export const MIN_NO_SHOWS_TO_ALERT = 2

const DAY_MS = 24 * 60 * 60 * 1000

export function toDateStr(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function subtractDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number)
    const dt = new Date(y || 1970, (m || 1) - 1, d || 1)
    dt.setDate(dt.getDate() - days)
    return toDateStr(dt)
}

export function addDays(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split("-").map(Number)
    const dt = new Date(y || 1970, (m || 1) - 1, d || 1)
    dt.setDate(dt.getDate() + days)
    return toDateStr(dt)
}

export function daysBetween(fromStr: string, toStr: string): number {
    const [y1, m1, d1] = fromStr.split("-").map(Number)
    const [y2, m2, d2] = toStr.split("-").map(Number)
    const dt1 = Date.UTC(y1 || 1970, (m1 || 1) - 1, d1 || 1)
    const dt2 = Date.UTC(y2 || 1970, (m2 || 1) - 1, d2 || 1)
    return Math.max(0, Math.floor((dt2 - dt1) / DAY_MS))
}

function normalizeStatusText(status: string | null | undefined): string {
    return String(status || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
}

export function isPendingConfirmationStatus(status: string | null | undefined): boolean {
    const s = normalizeStatusText(status)
    if (!s) return false
    return (
        s === "aguardando" ||
        s === "reservado" ||
        s === "pending" ||
        s.includes("aguardando") ||
        s.includes("reservad")
    )
}

export function isCompletedStatus(status: string | null | undefined): boolean {
    const s = normalizeStatusText(status)
    if (!s) return false
    return (
        s.includes("conclui") ||
        s.includes("complet") ||
        s.includes("pago") ||
        s.includes("paid")
    )
}

export function isNoShowStatus(status: string | null | undefined): boolean {
    const s = normalizeStatusText(status)
    if (!s) return false
    return (
        s.includes("ausen") ||
        s.includes("missed") ||
        s.includes("no_show") ||
        s.includes("no-show") ||
        s.includes("noshow") ||
        s.includes("faltou") ||
        s === "falta" ||
        s === "nao compareceu"
    )
}

export function isCancelledStatus(status: string | null | undefined): boolean {
    return normalizeStatusText(status).includes("cancel")
}

function customerKey(customerId: string | null | undefined, customerName: string | null | undefined): string {
    if (customerId) return `id:${customerId}`
    return `name:${String(customerName || "").trim().toLowerCase()}`
}

export interface AppointmentRow {
    id: string
    customer_id?: string | null
    customer_name?: string | null
    start_date?: string | null
    status?: string | null
    price?: number | string | null
    source?: string | null
}

export interface NoShowAlert {
    key: string
    customer_id: string | null
    customer_name: string
    absences: number
    last_absence: string
    lost_value: number
    future_appointments: number
}

export interface NoShowCounts {
    absences: number
    clients: number
    lost_value: number
    future_appointments: number
}

export interface NoShowAlertsResult {
    alerts: NoShowAlert[]
    counts: NoShowCounts
    periodDays: number
}

export function evaluateNoShowAlerts(
    pastAppointments: AppointmentRow[],
    futureAppointments: AppointmentRow[] = [],
    options?: { periodDays?: number; minAbsences?: number; today?: string }
): NoShowAlertsResult {
    const periodDays = Math.max(1, Number(options?.periodDays) || DEFAULT_NO_SHOW_PERIOD_DAYS)
    const minAbsences = Math.max(1, Number(options?.minAbsences) || MIN_NO_SHOWS_TO_ALERT)
    const today = options?.today || toDateStr(new Date())
    const cutoff = subtractDays(today, periodDays)

    const groups = new Map<string, NoShowAlert>()

    for (const row of pastAppointments || []) {
        if (row.source === "unavailable") continue
        if (!isNoShowStatus(row.status)) continue
        const startDate = String(row.start_date || "")
        if (!startDate || startDate < cutoff || startDate > today) continue

        const key = customerKey(row.customer_id, row.customer_name)
        const current =
            groups.get(key) ||
            ({
                key,
                customer_id: row.customer_id || null,
                customer_name: String(row.customer_name || "Cliente sem cadastro").trim() || "Cliente sem cadastro",
                absences: 0,
                last_absence: startDate,
                lost_value: 0,
                future_appointments: 0,
            } as NoShowAlert)

        current.absences += 1
        const price = Number(row.price) || 0
        if (price > 0) current.lost_value = Math.round((current.lost_value + price) * 100) / 100
        if (startDate > current.last_absence) current.last_absence = startDate
        if (row.customer_id) current.customer_id = row.customer_id
        groups.set(key, current)
    }

    for (const row of futureAppointments || []) {
        if (row.source === "unavailable") continue
        if (isNoShowStatus(row.status) || isCancelledStatus(row.status)) continue
        const startDate = String(row.start_date || "")
        if (!startDate || startDate <= today) continue

        const key = customerKey(row.customer_id, row.customer_name)
        const group = groups.get(key)
        if (group) group.future_appointments += 1
    }

    const alerts = Array.from(groups.values()).filter((a) => a.absences >= minAbsences)

    alerts.sort((a, b) => b.absences - a.absences || b.lost_value - a.lost_value)

    const counts: NoShowCounts = {
        absences: alerts.reduce((sum, a) => sum + a.absences, 0),
        clients: alerts.length,
        lost_value: Math.round(alerts.reduce((sum, a) => sum + a.lost_value, 0) * 100) / 100,
        future_appointments: alerts.reduce((sum, a) => sum + a.future_appointments, 0),
    }

    return { alerts, counts, periodDays }
}

export interface ServiceRow {
    id: string
    name: string
    price?: number | string | null
    promotional_price?: number | string | null
    duration_minutes?: number | null
    category?: string | null
    images?: string[] | null
    created_at?: string | null
    is_unavailable_type?: boolean | null
}

export interface ServiceUsageRow {
    service_id?: string | null
    service_name?: string | null
    start_date?: string | null
    source?: string | null
    status?: string | null
}

export interface StagnantService {
    id: string
    name: string
    price: number
    promotional_price: number | null
    duration_minutes: number | null
    category: string | null
    images: string[] | null
    created_at: string
    days_stagnant: number
}

export interface StagnantServicesResult {
    services: StagnantService[]
    total: number
    periodDays: number
}

export function evaluateStagnantServices(
    services: ServiceRow[],
    usage: ServiceUsageRow[],
    options?: { periodDays?: number; today?: string }
): StagnantServicesResult {
    const periodDays = Math.max(1, Number(options?.periodDays) || DEFAULT_STAGNANT_PERIOD_DAYS)
    const today = options?.today || toDateStr(new Date())
    const cutoff = subtractDays(today, periodDays)

    const usedIds = new Set<string>()
    const usedNames = new Set<string>()

    for (const row of usage || []) {
        if (row.source === "unavailable") continue
        const startDate = String(row.start_date || "")
        if (!startDate || startDate < cutoff) continue
        if (row.service_id) usedIds.add(row.service_id)
        const name = String(row.service_name || "").trim().toLowerCase()
        if (name) usedNames.add(name)
    }

    const now = Date.now()
    const stagnant: StagnantService[] = []

    for (const service of services || []) {
        if (service.is_unavailable_type === true) continue
        if (!service.created_at) continue
        const createdAt = new Date(service.created_at)
        if (Number.isNaN(createdAt.getTime())) continue
        if (toDateStr(createdAt) > cutoff) continue

        const name = String(service.name || "").trim().toLowerCase()
        if (usedIds.has(service.id) || (name && usedNames.has(name))) continue

        const daysStagnant = Math.max(periodDays, Math.floor((now - createdAt.getTime()) / DAY_MS))

        stagnant.push({
            id: service.id,
            name: service.name,
            price: Number(service.price) || 0,
            promotional_price: service.promotional_price != null ? Number(service.promotional_price) : null,
            duration_minutes: service.duration_minutes ?? null,
            category: service.category || null,
            images: Array.isArray(service.images) ? service.images : null,
            created_at: service.created_at!,
            days_stagnant: daysStagnant,
        })
    }

    stagnant.sort((a, b) => a.created_at.localeCompare(b.created_at))

    return { services: stagnant, total: stagnant.length, periodDays }
}

export interface AppointmentInsightRow extends AppointmentRow {
    service_name?: string | null
    staff_name?: string | null
    start_time?: string | null
    duration_minutes?: number | null
    notes?: string | null
    needs_reschedule?: boolean | null
    phone?: string | null
    customer_avatar?: string | null
}

export interface PendingConfirmationAlert {
    id: string
    customer_id: string | null
    customer_name: string
    customer_avatar: string | null
    service_name: string
    staff_name: string
    start_date: string
    start_time: string
    duration_minutes: number
    price: number
    status: string
    phone?: string | null
}

export interface RescheduleOpportunity {
    id: string
    customer_id: string | null
    customer_name: string
    customer_avatar: string | null
    service_name: string
    staff_name: string
    date: string
    time: string
    price: number
    notes: string | null
    reason: "needs_reschedule" | "cancelled"
    has_future_appointment: boolean
}

export interface RetentionOpportunity {
    key: string
    customer_id: string | null
    customer_name: string
    customer_avatar: string | null
    last_service_name: string
    last_staff_name: string
    last_date: string
    days_since_last: number
    total_completed: number
    total_spent: number
    future_appointments: number
}

export function evaluatePendingConfirmations(
    appointments: AppointmentInsightRow[],
    options?: { today?: string; lookaheadDays?: number }
): PendingConfirmationAlert[] {
    const today = options?.today || toDateStr(new Date())
    const lookaheadDays = Math.max(1, Number(options?.lookaheadDays) || 7)
    const maxDate = addDays(today, lookaheadDays)

    const alerts: PendingConfirmationAlert[] = []

    for (const row of appointments || []) {
        if (row.source === "unavailable") continue
        if (row.needs_reschedule) continue
        const startDate = String(row.start_date || "")
        if (!startDate || startDate < today || startDate > maxDate) continue
        if (!isPendingConfirmationStatus(row.status)) continue

        alerts.push({
            id: String(row.id),
            customer_id: row.customer_id || null,
            customer_name: String(row.customer_name || "Cliente Sem Nome").trim(),
            customer_avatar: row.customer_avatar || null,
            service_name: String(row.service_name || "Serviço").trim(),
            staff_name: String(row.staff_name || "Profissional").trim(),
            start_date: startDate,
            start_time: String(row.start_time || "").slice(0, 5),
            duration_minutes: Number(row.duration_minutes || 0),
            price: Number(row.price || 0),
            status: String(row.status || "Aguardando"),
            phone: row.phone || null,
        })
    }

    alerts.sort((a, b) => a.start_date.localeCompare(b.start_date) || a.start_time.localeCompare(b.start_time))
    return alerts
}

export function evaluateRescheduleOpportunities(
    appointments: AppointmentInsightRow[],
    futureAppointments: AppointmentInsightRow[] = [],
    options?: { today?: string; lookbackDays?: number }
): RescheduleOpportunity[] {
    const today = options?.today || toDateStr(new Date())
    const lookbackDays = Math.max(1, Number(options?.lookbackDays) || 30)
    const cutoff = subtractDays(today, lookbackDays)

    const futureCustomerKeys = new Set<string>()
    for (const row of futureAppointments || []) {
        if (row.source === "unavailable") continue
        if (isCancelledStatus(row.status) || isNoShowStatus(row.status)) continue
        const startDate = String(row.start_date || "")
        if (startDate >= today) {
            futureCustomerKeys.add(customerKey(row.customer_id, row.customer_name))
        }
    }

    const opportunities: RescheduleOpportunity[] = []

    for (const row of appointments || []) {
        if (row.source === "unavailable") continue
        const startDate = String(row.start_date || "")
        if (!startDate) continue

        const isNeedsReschedule = Boolean(row.needs_reschedule)
        const isCancelled = isCancelledStatus(row.status) && startDate >= cutoff && startDate <= today

        if (!isNeedsReschedule && !isCancelled) continue

        const key = customerKey(row.customer_id, row.customer_name)
        const hasFuture = futureCustomerKeys.has(key)

        opportunities.push({
            id: String(row.id),
            customer_id: row.customer_id || null,
            customer_name: String(row.customer_name || "Cliente Sem Nome").trim(),
            customer_avatar: row.customer_avatar || null,
            service_name: String(row.service_name || "Serviço").trim(),
            staff_name: String(row.staff_name || "Profissional").trim(),
            date: startDate,
            time: String(row.start_time || "").slice(0, 5),
            price: Number(row.price || 0),
            notes: row.notes || null,
            reason: isNeedsReschedule ? "needs_reschedule" : "cancelled",
            has_future_appointment: hasFuture,
        })
    }

    opportunities.sort((a, b) => {
        if (a.reason !== b.reason) {
            return a.reason === "needs_reschedule" ? -1 : 1
        }
        return b.date.localeCompare(a.date)
    })

    return opportunities
}

export function evaluateRetentionOpportunities(
    pastAppointments: AppointmentInsightRow[],
    futureAppointments: AppointmentInsightRow[] = [],
    options?: { today?: string; minDaysSinceLast?: number; maxPeriodDays?: number }
): RetentionOpportunity[] {
    const today = options?.today || toDateStr(new Date())
    const minDaysSinceLast = Math.max(1, Number(options?.minDaysSinceLast) || 30)
    const maxPeriodDays = Math.max(minDaysSinceLast, Number(options?.maxPeriodDays) || 180)
    const cutoff = subtractDays(today, maxPeriodDays)
    const thresholdDate = subtractDays(today, minDaysSinceLast)

    const futureCustomerKeys = new Set<string>()
    for (const row of futureAppointments || []) {
        if (row.source === "unavailable") continue
        if (isCancelledStatus(row.status) || isNoShowStatus(row.status)) continue
        const startDate = String(row.start_date || "")
        if (startDate >= today) {
            futureCustomerKeys.add(customerKey(row.customer_id, row.customer_name))
        }
    }

    const groups = new Map<string, RetentionOpportunity>()

    for (const row of pastAppointments || []) {
        if (row.source === "unavailable") continue
        if (!isCompletedStatus(row.status)) continue
        const startDate = String(row.start_date || "")
        if (!startDate || startDate < cutoff || startDate > today) continue

        const key = customerKey(row.customer_id, row.customer_name)
        const price = Number(row.price || 0)

        const existing = groups.get(key)
        if (!existing) {
            groups.set(key, {
                key,
                customer_id: row.customer_id || null,
                customer_name: String(row.customer_name || "Cliente Sem Nome").trim(),
                customer_avatar: row.customer_avatar || null,
                last_service_name: String(row.service_name || "Serviço").trim(),
                last_staff_name: String(row.staff_name || "Profissional").trim(),
                last_date: startDate,
                days_since_last: daysBetween(startDate, today),
                total_completed: 1,
                total_spent: price,
                future_appointments: 0,
            })
        } else {
            existing.total_completed += 1
            existing.total_spent = Math.round((existing.total_spent + price) * 100) / 100
            if (startDate > existing.last_date) {
                existing.last_date = startDate
                existing.last_service_name = String(row.service_name || existing.last_service_name).trim()
                existing.last_staff_name = String(row.staff_name || existing.last_staff_name).trim()
                existing.days_since_last = daysBetween(startDate, today)
            }
            if (row.customer_avatar && !existing.customer_avatar) {
                existing.customer_avatar = row.customer_avatar
            }
        }
    }

    const results: RetentionOpportunity[] = []
    for (const [key, opp] of groups.entries()) {
        if (futureCustomerKeys.has(key)) continue
        if (opp.last_date <= thresholdDate) {
            results.push(opp)
        }
    }

    results.sort((a, b) => b.total_spent - a.total_spent || a.days_since_last - b.days_since_last)
    return results
}

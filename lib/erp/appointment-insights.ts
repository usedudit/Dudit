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

function normalizeStatusText(status: string | null | undefined): string {
    return String(status || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
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

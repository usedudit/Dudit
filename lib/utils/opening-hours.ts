import { getDateComponents, getDefaultTimezone } from "@/lib/date"

export type OpeningHoursData = {
  [day in string]?: {
    enabled: boolean
    from: string
    to: string
  }
}

const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
const DEFAULT_DAY_SCHEDULE = { enabled: false, from: "09:00", to: "18:00" }
const DEFAULT_OPENING_HOURS: OpeningHoursData = {
  monday: { enabled: true, from: "09:00", to: "18:00" },
  tuesday: { enabled: true, from: "09:00", to: "18:00" },
  wednesday: { enabled: true, from: "09:00", to: "18:00" },
  thursday: { enabled: true, from: "09:00", to: "18:00" },
  friday: { enabled: true, from: "09:00", to: "18:00" },
  saturday: { enabled: false, from: "09:00", to: "13:00" },
  sunday: { enabled: false, from: "09:00", to: "13:00" },
}
const DAY_NAMES: Record<string, string> = {
  sunday: "domingo",
  monday: "segunda-feira",
  tuesday: "terça-feira",
  wednesday: "quarta-feira",
  thursday: "quinta-feira",
  friday: "sexta-feira",
  saturday: "sábado",
}

function isValidTimeString(value: unknown): value is string {
  if (typeof value !== "string") return false
  return /^\d{2}:\d{2}$/.test(value)
}

export function normalizeOpeningHours(input: unknown): OpeningHoursData {
  const source = (input && typeof input === "object") ? (input as Record<string, any>) : {}
  const normalized: OpeningHoursData = {}

  for (const day of DAYS_OF_WEEK) {
    const incoming = source[day]
    const fallback = DEFAULT_OPENING_HOURS[day] || DEFAULT_DAY_SCHEDULE
    normalized[day] = {
      enabled: Boolean(incoming?.enabled ?? fallback.enabled),
      from: isValidTimeString(incoming?.from) ? incoming.from : fallback.from,
      to: isValidTimeString(incoming?.to) ? incoming.to : fallback.to,
    }
  }

  return normalized
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return -1;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return -1;
  return h * 60 + m;
}

/**
 * Verifica se uma loja está aberta no momento.
 * Retorna true se não houver horários configurados (considera aberto).
 * Retorna true se o momento atual estiver dentro do intervalo de funcionamento hoje (ou da virada de ontem).
 */
export function isStoreOpen(
  openingHours: OpeningHoursData | null | undefined,
  nowDate: Date = new Date(),
  tz?: string
): boolean {
  if (!openingHours || typeof openingHours !== "object") {
    return true
  }

  const hasAnySchedule = Object.values(openingHours).some(
    (daySchedule) => daySchedule?.enabled && daySchedule.from && daySchedule.to
  )
  if (!hasAnySchedule) {
    return true
  }

  const resolvedTz = tz || getDefaultTimezone()
  const { dayOfWeek: currentDayIndex, hour, minute } = getDateComponents(nowDate, resolvedTz)
  const currentMinutes = hour * 60 + minute

  // 1. Verifica horário de hoje
  const todayKey = DAYS_OF_WEEK[currentDayIndex]
  const todaySchedule = openingHours[todayKey]

  if (todaySchedule?.enabled && todaySchedule.from && todaySchedule.to) {
    const fromMins = parseTimeToMinutes(todaySchedule.from)
    const toMins = parseTimeToMinutes(todaySchedule.to)

    if (fromMins >= 0 && toMins >= 0) {
      if (toMins <= fromMins) {
        // Horário cruza a meia-noite (ex: 18:00 às 02:00)
        if (currentMinutes >= fromMins) {
          return true
        }
      } else {
        // Horário dentro do mesmo dia (ex: 09:00 às 18:00)
        if (currentMinutes >= fromMins && currentMinutes < toMins) {
          return true
        }
      }
    }
  }

  // 2. Verifica se ontem tinha horário que cruzava a meia-noite até hoje
  const yesterdayDayIndex = (currentDayIndex + 6) % 7
  const yesterdayKey = DAYS_OF_WEEK[yesterdayDayIndex]
  const yesterdaySchedule = openingHours[yesterdayKey]

  if (yesterdaySchedule?.enabled && yesterdaySchedule.from && yesterdaySchedule.to) {
    const yFrom = parseTimeToMinutes(yesterdaySchedule.from)
    const yTo = parseTimeToMinutes(yesterdaySchedule.to)

    if (yFrom >= 0 && yTo >= 0 && yTo <= yFrom) {
      if (currentMinutes < yTo) {
        return true
      }
    }
  }

  return false
}

/**
 * Resolve o status de horário de funcionamento de uma loja
 */
export function getOpeningStatus(
  openingHours: OpeningHoursData | null | undefined,
  nowDate: Date = new Date(),
  tz?: string,
): string {
  if (!openingHours || typeof openingHours !== "object") {
    return "Informações de horário não disponíveis";
  }

  const hasAnySchedule = Object.values(openingHours).some(
    (daySchedule) => daySchedule?.enabled && daySchedule.from && daySchedule.to
  )
  if (!hasAnySchedule) {
    return "Informações de horário não disponíveis";
  }

  const resolvedTz = tz || getDefaultTimezone()
  const { dayOfWeek: currentDayIndex, hour, minute } = getDateComponents(nowDate, resolvedTz)
  const currentMinutes = hour * 60 + minute

  // 1. Verifica se está aberto pela virada de ontem
  const yesterdayDayIndex = (currentDayIndex + 6) % 7
  const yesterdayKey = DAYS_OF_WEEK[yesterdayDayIndex]
  const yesterdaySchedule = openingHours[yesterdayKey]
  if (yesterdaySchedule?.enabled && yesterdaySchedule.from && yesterdaySchedule.to) {
    const yFrom = parseTimeToMinutes(yesterdaySchedule.from)
    const yTo = parseTimeToMinutes(yesterdaySchedule.to)
    if (yFrom >= 0 && yTo >= 0 && yTo <= yFrom && currentMinutes < yTo) {
      return `Aberto até ${yesterdaySchedule.to}`
    }
  }

  // 2. Verifica horários válidos hoje
  const todayKey = DAYS_OF_WEEK[currentDayIndex];
  const todaySchedule = openingHours[todayKey];

  if (todaySchedule?.enabled && todaySchedule.from && todaySchedule.to) {
    const fromMins = parseTimeToMinutes(todaySchedule.from);
    let toMins = parseTimeToMinutes(todaySchedule.to);

    // Se a loja fecha no dia seguinte de madrugada (ex: 18:00 - 02:00)
    if (toMins <= fromMins) toMins += 24 * 60;

    if (currentMinutes >= fromMins && currentMinutes < toMins) {
      // Estamos ABERTO
      const closeTime = todaySchedule.to;
      return `Aberto até ${closeTime}`;
    }

    if (currentMinutes < fromMins) {
      // Estamos FECHADO, mas o usuário visualizou antes de abrir HOJE
      return `Fechado - Abre às ${todaySchedule.from}`;
    }
  }

  // Estamos FECHADO para hoje, busca o próximo dia que estará aberto
  for (let i = 1; i <= 7; i++) {
    const nextDayIndex = (currentDayIndex + i) % 7;
    const nextDayKey = DAYS_OF_WEEK[nextDayIndex];
    const nextSchedule = openingHours[nextDayKey];

    if (nextSchedule?.enabled && nextSchedule.from && nextSchedule.to) {
      if (i === 1) {
        return `Fechado - Abre amanhã às ${nextSchedule.from}`;
      } else {
        return `Fechado - Abre ${DAY_NAMES[nextDayKey]} às ${nextSchedule.from}`;
      }
    }
  }

  return "Temporariamente fechado";
}

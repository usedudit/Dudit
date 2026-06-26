export type Period = "daily" | "weekly" | "monthly"

export type CompareMode = "previous-day" | "previous-week" | "previous-month" | "custom" | "none"

export const PERIOD_LABELS: Record<Period, string> = {
  daily: "Hoje",
  weekly: "Últimos 7 dias",
  monthly: "Últimos 30 dias",
}

export const COMPARE_PRESET_LABELS: Record<string, string> = {
  "previous-day": "Dia anterior",
  "previous-week": "Semana anterior",
  "previous-month": "Mês anterior",
  custom: "Período customizado",
  none: "Sem comparação",
}

export const PERIOD_OPTIONS: Period[] = ["daily", "weekly", "monthly"]

export const COMPARE_PRESETS: CompareMode[] = ["previous-day", "previous-week", "previous-month", "custom", "none"]

export function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10)
}

export function getPeriodDateRange(period: Period, today: string) {
  switch (period) {
    case "daily":
      return { from: today, to: today }
    case "weekly":
      return { from: addDays(today, -6), to: today }
    case "monthly":
      return { from: addDays(today, -29), to: today }
  }
}

export function getPeriodDays(period: Period) {
  switch (period) {
    case "daily": return 1
    case "weekly": return 7
    case "monthly": return 30
  }
}

export function getCompareDateRange(
  mode: CompareMode,
  today: string,
  currentFrom: string,
  customFrom?: string,
  customTo?: string,
) {
  if (mode === "none") return null

  if (mode === "custom") {
    if (customFrom && customTo) return { from: customFrom, to: customTo }
    return null
  }

  const currentStart = new Date(currentFrom + "T12:00:00Z")
  let days: number

  switch (mode) {
    case "previous-day": days = 1; break
    case "previous-week": days = 7; break
    case "previous-month": days = 30; break
    default: return null
  }

  const prevEnd = new Date(currentStart)
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
  const prevStart = new Date(prevEnd)
  prevStart.setUTCDate(prevStart.getUTCDate() - days + 1)

  return {
    from: prevStart.toISOString().slice(0, 10),
    to: prevEnd.toISOString().slice(0, 10),
  }
}

export function getCustomMaxDate(currentPeriod: Period, today: string) {
  return addDays(today, -getPeriodDays(currentPeriod))
}

export function compareModeToPeriod(mode: CompareMode): Period | null {
  switch (mode) {
    case "previous-day": return "daily"
    case "previous-week": return "weekly"
    case "previous-month": return "monthly"
    default: return null
  }
}

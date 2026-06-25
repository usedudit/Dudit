export type Period = "daily" | "weekly" | "monthly"

export type CompareMode = "previous" | Period

export const PERIOD_LABELS: Record<Period, string> = {
  daily: "Hoje",
  weekly: "Últimos 7 dias",
  monthly: "Últimos 30 dias",
}

export const COMPARE_LABELS: Record<CompareMode, string> = {
  previous: "Período anterior",
  daily: "Hoje",
  weekly: "Últimos 7 dias",
  monthly: "Últimos 30 dias",
}

export const PERIOD_OPTIONS: Period[] = ["daily", "weekly", "monthly"]
export const COMPARE_OPTIONS: CompareMode[] = ["previous", "daily", "weekly", "monthly"]

export function getPeriodDateRange(period: Period, today: string) {
  const [y, m, d] = today.split("-").map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12))

  let from: Date
  switch (period) {
    case "daily":
      from = new Date(base)
      break
    case "weekly":
      from = new Date(base)
      from.setUTCDate(from.getUTCDate() - 6)
      break
    case "monthly":
      from = new Date(base)
      from.setUTCDate(from.getUTCDate() - 29)
      break
  }

  const toStr = today
  const fromStr = from.toISOString().slice(0, 10)

  return { from: fromStr, to: toStr }
}

export function getCompareDateRange(mode: CompareMode, today: string, currentFrom: string) {
  const [y, m, d] = today.split("-").map(Number)
  const base = new Date(Date.UTC(y, m - 1, d, 12))

  if (mode === "previous") {
    const currentStart = new Date(currentFrom + "T12:00:00Z")
    const daysDiff = Math.round((base.getTime() - currentStart.getTime()) / 86400000) + 1
    const prevEnd = new Date(currentStart)
    prevEnd.setUTCDate(prevEnd.getUTCDate() - 1)
    const prevStart = new Date(prevEnd)
    prevStart.setUTCDate(prevStart.getUTCDate() - daysDiff + 1)
    return { from: prevStart.toISOString().slice(0, 10), to: prevEnd.toISOString().slice(0, 10) }
  }

  const range = getPeriodDateRange(mode as Period, today)
  return { from: range.from, to: range.to }
}

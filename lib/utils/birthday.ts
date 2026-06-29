import { getDateComponents, getDefaultTimezone } from "@/lib/date"

export function getDaysUntilBirthday(birthDateStr: string | null | undefined, tz?: string): number | null {
  if (!birthDateStr) return null
  const ymd = birthDateStr.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null

  const [, bMonth, bDay] = ymd.split("-").map(Number)
  const resolvedTz = tz || getDefaultTimezone()
  const { year: curYear, month: curMonth, day: curDay } = getDateComponents(new Date(), resolvedTz)

  // Create date for birthday in the current year
  const bDayThisYear = new Date(Date.UTC(curYear, bMonth - 1, bDay, 12, 0, 0))
  const todayDate = new Date(Date.UTC(curYear, curMonth - 1, curDay, 12, 0, 0))

  let diffTime = bDayThisYear.getTime() - todayDate.getTime()
  let diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const bDayNextYear = new Date(Date.UTC(curYear + 1, bMonth - 1, bDay, 12, 0, 0))
    diffTime = bDayNextYear.getTime() - todayDate.getTime()
    diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))
  }

  return diffDays
}

export interface BirthdayInfo {
  isToday: boolean
  isUpcoming: boolean
  daysUntil: number
}

export function checkBirthday(birthDateStr: string | null | undefined, tz?: string): BirthdayInfo | null {
  const daysUntil = getDaysUntilBirthday(birthDateStr, tz)
  if (daysUntil === null) return null

  return {
    isToday: daysUntil === 0,
    isUpcoming: daysUntil > 0 && daysUntil <= 7,
    daysUntil,
  }
}

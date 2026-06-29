export function diffCalendarDays(fromYmd: string, toYmd: string): number {
  const [y1, m1, d1] = fromYmd.split("-").map(Number)
  const [y2, m2, d2] = toYmd.split("-").map(Number)
  const ms1 = Date.UTC(y1, m1 - 1, d1)
  const ms2 = Date.UTC(y2, m2 - 1, d2)
  return Math.round((ms2 - ms1) / 86400000)
}

export function addCalendarDays(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split("-").map(Number)
  const utcDate = new Date(Date.UTC(y, m - 1, d))
  utcDate.setUTCDate(utcDate.getUTCDate() + deltaDays)
  const yy = utcDate.getUTCFullYear()
  const mm = String(utcDate.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(utcDate.getUTCDate()).padStart(2, "0")
  return `${yy}-${mm}-${dd}`
}

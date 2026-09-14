import { describe, it, expect } from "vitest"
import {
  getDefaultTimezone,
  parseInTz,
  getDateComponents,
  getTodayYmd,
  startOfDay,
  endOfDay,
  formatDate,
  formatDateTime,
  diffCalendarDays,
  addCalendarDays,
} from "./index"

describe("lib/date helpers", () => {
  it("getDefaultTimezone returns default timezone string", () => {
    const tz = getDefaultTimezone()
    expect(typeof tz).toBe("string")
    expect(tz.length).toBeGreaterThan(0)
  })

  it("parseInTz parses civil date and time in timezone", () => {
    const d = parseInTz("2026-06-29", "14:00", "America/Sao_Paulo")
    expect(d).toBeInstanceOf(Date)
    expect(d.toISOString()).toBe("2026-06-29T17:00:00.000Z")
  })

  it("getDateComponents extracts components correctly", () => {
    const d = new Date("2026-06-29T17:00:00.000Z")
    const comp = getDateComponents(d, "America/Sao_Paulo")
    expect(comp.year).toBe(2026)
    expect(comp.month).toBe(6)
    expect(comp.day).toBe(29)
    expect(comp.hour).toBe(14)
    expect(comp.minute).toBe(0)
  })

  it("formatDate and formatDateTime format properly in timezone", () => {
    const d = new Date("2026-06-29T17:00:00.000Z")
    expect(formatDate(d, "America/Sao_Paulo")).toBe("29/06/2026")
    expect(formatDateTime(d, "America/Sao_Paulo")).toBe("29/06/2026 14:00")
  })

  it("diffCalendarDays and addCalendarDays calculate properly", () => {
    expect(diffCalendarDays("2026-01-01", "2026-01-10")).toBe(9)
    expect(addCalendarDays("2026-01-01", 5)).toBe("2026-01-06")
  })
})

import { describe, it, expect } from "vitest"
import { isStoreOpen, getOpeningStatus, type OpeningHoursData } from "./opening-hours"

describe("isStoreOpen", () => {
  const sampleSchedule: OpeningHoursData = {
    monday: { enabled: true, from: "09:00", to: "18:00" },
    tuesday: { enabled: true, from: "09:00", to: "18:00" },
    wednesday: { enabled: true, from: "09:00", to: "18:00" },
    thursday: { enabled: true, from: "09:00", to: "18:00" },
    friday: { enabled: true, from: "18:00", to: "02:00" }, // cruza a meia-noite (termina sábado 02:00)
    saturday: { enabled: false, from: "09:00", to: "13:00" },
    sunday: { enabled: false, from: "09:00", to: "13:00" },
  }

  it("returns true if no opening hours are defined", () => {
    expect(isStoreOpen(null)).toBe(true)
    expect(isStoreOpen(undefined)).toBe(true)
    expect(isStoreOpen({})).toBe(true)
    expect(isStoreOpen({ monday: { enabled: false, from: "09:00", to: "18:00" } })).toBe(true)
  })

  it("returns true when current time is within business hours (regular day)", () => {
    // Segunda-feira às 14:30 UTC-3 (America/Sao_Paulo)
    const mondayAfternoon = new Date("2026-09-14T14:30:00-03:00")
    expect(isStoreOpen(sampleSchedule, mondayAfternoon, "America/Sao_Paulo")).toBe(true)
  })

  it("returns false when before opening hours", () => {
    // Segunda-feira às 08:30 UTC-3
    const mondayMorning = new Date("2026-09-14T08:30:00-03:00")
    expect(isStoreOpen(sampleSchedule, mondayMorning, "America/Sao_Paulo")).toBe(false)
  })

  it("returns false when after closing hours", () => {
    // Segunda-feira às 19:30 UTC-3
    const mondayNight = new Date("2026-09-14T19:30:00-03:00")
    expect(isStoreOpen(sampleSchedule, mondayNight, "America/Sao_Paulo")).toBe(false)
  })

  it("returns false on closed day (Sunday)", () => {
    // Domingo às 12:00 UTC-3
    const sundayNoon = new Date("2026-09-20T12:00:00-03:00")
    expect(isStoreOpen(sampleSchedule, sundayNoon, "America/Sao_Paulo")).toBe(false)
  })

  it("handles overnight hours correctly on the same evening", () => {
    // Sexta-feira às 23:00 UTC-3
    const fridayNight = new Date("2026-09-18T23:00:00-03:00")
    expect(isStoreOpen(sampleSchedule, fridayNight, "America/Sao_Paulo")).toBe(true)
  })

  it("handles overnight hours correctly after midnight (early next day)", () => {
    // Sábado às 01:30 UTC-3 (ainda aberto da virada de sexta)
    const saturdayEarlyMorning = new Date("2026-09-19T01:30:00-03:00")
    expect(isStoreOpen(sampleSchedule, saturdayEarlyMorning, "America/Sao_Paulo")).toBe(true)
  })

  it("returns false after overnight closing time", () => {
    // Sábado às 03:00 UTC-3 (fechou às 02:00)
    const saturdayLateMorning = new Date("2026-09-19T03:00:00-03:00")
    expect(isStoreOpen(sampleSchedule, saturdayLateMorning, "America/Sao_Paulo")).toBe(false)
  })
})

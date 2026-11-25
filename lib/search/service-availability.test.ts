import { describe, it, expect } from "vitest"
import { computeWindowAvailability, evaluateServiceAttendance } from "./service-availability"
import type { ParsedTimeWindow } from "./intent-parser"

const TOMORROW_MORNING: ParsedTimeWindow = {
  targetDate: "2026-11-26",
  dayOfWeekKey: "thursday",
  period: "morning",
  startMinutes: 8 * 60,
  endMinutes: 12 * 60,
  label: "amanhã de manhã",
}

describe("computeWindowAvailability", () => {
  it("retorna horários livres quando a loja está aberta e há slots sem conflito", () => {
    const res = computeWindowAvailability({
      openingHours: {
        thursday: { enabled: true, from: "08:00", to: "18:00" },
      },
      bookedIntervals: [
        { startMinutes: 8 * 60, endMinutes: 9 * 60 }, // 08:00-09:00 ocupado
      ],
      timeWindow: TOMORROW_MORNING,
      durationMinutes: 60,
    })

    expect(res.status).toBe("available")
    expect(res.availableSlots).toEqual(["09:00", "10:00", "11:00"])
    expect(res.label).toContain("Disponível")
  })

  it("retorna busy quando toda a janela está ocupada", () => {
    const res = computeWindowAvailability({
      openingHours: {
        thursday: { enabled: true, from: "08:00", to: "18:00" },
      },
      bookedIntervals: [
        { startMinutes: 8 * 60, endMinutes: 12 * 60 },
      ],
      timeWindow: TOMORROW_MORNING,
      durationMinutes: 60,
    })

    expect(res.status).toBe("busy")
    expect(res.availableSlots).toEqual([])
  })

  it("retorna closed quando a loja não abre naquele dia", () => {
    const res = computeWindowAvailability({
      openingHours: {
        thursday: { enabled: false, from: "08:00", to: "18:00" },
        friday: { enabled: true, from: "08:00", to: "18:00" },
      },
      bookedIntervals: [],
      timeWindow: TOMORROW_MORNING,
      durationMinutes: 60,
    })

    expect(res.status).toBe("closed")
  })

  it("retorna consult quando a loja não cadastrou opening_hours", () => {
    const res = computeWindowAvailability({
      openingHours: null,
      bookedIntervals: [],
      timeWindow: TOMORROW_MORNING,
    })
    expect(res.status).toBe("consult")
  })

  it("nunca retorna horários passados quando a data alvo é hoje", () => {
    // 25/11/2026 às 14:13 BRT (17:13 UTC)
    const nowAt1413 = new Date("2026-11-25T17:13:00Z")
    const todayAny: ParsedTimeWindow = {
      targetDate: "2026-11-25",
      dayOfWeekKey: "wednesday",
      period: "any",
      startMinutes: 8 * 60,
      endMinutes: 18 * 60,
      label: "hoje",
    }

    const res = computeWindowAvailability({
      openingHours: {
        wednesday: { enabled: true, from: "08:00", to: "18:00" },
      },
      bookedIntervals: [],
      timeWindow: todayAny,
      durationMinutes: 60,
      now: nowAt1413,
    })

    expect(res.status).toBe("available")
    // 14:13 + 15min = 14:28 -> arredonda para 14:30 (nunca 13:00 ou 14:00!)
    expect(res.availableSlots[0]).toBe("14:30")
    expect(res.availableSlots).not.toContain("13:00")
    expect(res.availableSlots).not.toContain("14:00")
  })
})

describe("evaluateServiceAttendance", () => {
  it("identifica quando está fora do raio de atendimento", () => {
    const res = evaluateServiceAttendance(
      { fulfillment_modes: ["customer_location"] },
      { max_service_km: 15, enforce_service_area: true, travel_fee_mode: "free" },
      28,
    )
    expect(res.outOfServiceArea).toBe(true)
    expect(res.travelFeeLabel).toContain("15 km")
  })

  it("calcula deslocamento grátis dentro do raio", () => {
    const res = evaluateServiceAttendance(
      { fulfillment_modes: ["customer_location"] },
      { max_service_km: 20, enforce_service_area: true, travel_fee_mode: "free" },
      6,
    )
    expect(res.outOfServiceArea).toBe(false)
    expect(res.travelFeeLabel).toContain("grátis")
  })
})

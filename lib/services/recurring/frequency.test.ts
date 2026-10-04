import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  computeNextExecutionAt,
  normalizeFrequencyType,
  normalizeFrequencyInterval,
  toMpFrequency,
  type RecurringFrequencyPlan,
} from "./frequency"

function mockClient(rpcResult: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) } as unknown as SupabaseClient
}

const START = "2026-01-15T12:00:00.000Z"
const NOW = new Date("2026-06-10T10:00:00.000Z")

function plan(overrides: Partial<RecurringFrequencyPlan> = {}): RecurringFrequencyPlan {
  return { start_date: START, frequency_interval: 1, ...overrides }
}

describe("normalizeFrequencyType", () => {
  it("aceita o vocabulario do banco", () => {
    expect(normalizeFrequencyType("daily")).toBe("daily")
    expect(normalizeFrequencyType("weekly")).toBe("weekly")
    expect(normalizeFrequencyType("monthly")).toBe("monthly")
    expect(normalizeFrequencyType("yearly")).toBe("yearly")
    expect(normalizeFrequencyType("custom")).toBe("custom")
  })

  it("converte os aliases legados que o codigo antigo usava", () => {
    expect(normalizeFrequencyType("day")).toBe("daily")
    expect(normalizeFrequencyType("week")).toBe("weekly")
    expect(normalizeFrequencyType("month")).toBe("monthly")
    expect(normalizeFrequencyType("year")).toBe("yearly")
  })

  it("cai para monthly quando o valor nao e reconhecido", () => {
    expect(normalizeFrequencyType(undefined)).toBe("monthly")
    expect(normalizeFrequencyType("")).toBe("monthly")
    expect(normalizeFrequencyType("hourly")).toBe("monthly")
  })
})

describe("normalizeFrequencyInterval", () => {
  it("garante intervalo minimo de 1", () => {
    expect(normalizeFrequencyInterval(undefined)).toBe(1)
    expect(normalizeFrequencyInterval(0)).toBe(1)
    expect(normalizeFrequencyInterval(-3)).toBe(1)
    expect(normalizeFrequencyInterval(4)).toBe(4)
  })
})

describe("toMpFrequency", () => {
  it("gera todos os formatos que o Mercado Pago aceita", () => {
    expect(toMpFrequency(plan({ frequency_type: "daily" }))).toEqual({
      frequency: 1,
      frequency_type: "days",
    })
    expect(toMpFrequency(plan({ frequency_type: "weekly", frequency_interval: 2 }))).toEqual({
      frequency: 2,
      frequency_type: "weeks",
    })
    expect(toMpFrequency(plan({ frequency_type: "monthly" }))).toEqual({
      frequency: 1,
      frequency_type: "months",
    })
    expect(toMpFrequency(plan({ frequency_type: "yearly" }))).toEqual({
      frequency: 1,
      frequency_type: "years",
    })
  })

  it("trata 'custom' como dias, como o fallback em memoria", () => {
    expect(toMpFrequency(plan({ frequency_type: "custom", frequency_interval: 10 }))).toEqual({
      frequency: 10,
      frequency_type: "days",
    })
  })

  it("nao emite mais apenas days|months para planos anuais", () => {
    const legacy = toMpFrequency(plan({ frequency_type: "yearly", frequency_interval: 1 }))
    expect(legacy.frequency_type).not.toBe("days")
    expect(legacy.frequency_type).not.toBe("months")
  })
})

describe("computeNextExecutionAt", () => {
  it("usa a RPC quando ela responde", async () => {
    const rpcDate = new Date("2026-07-10T10:00:00.000Z").toISOString()
    const client = mockClient({ data: rpcDate, error: null })

    const result = await computeNextExecutionAt(client, plan({ frequency_type: "monthly" }), NOW)

    expect(result).toBe(rpcDate)
    expect(client.rpc).toHaveBeenCalledWith("recurring_plan_next_execution_at", {
      p_frequency_type: "monthly",
      p_frequency_interval: 1,
      p_current_run: NOW.toISOString(),
      p_start_date: START,
      p_weekdays: null,
      p_day_of_month: null,
      p_use_last_day: false,
      p_year_month: null,
      p_year_day: null,
    })
  })

  it("cai para o calculo em memoria quando a RPC falha", async () => {
    const client = mockClient({ data: null, error: { message: "offline" } })

    const result = await computeNextExecutionAt(client, plan({ frequency_type: "monthly" }), NOW)

    expect(new Date(result).getTime()).toBeGreaterThan(NOW.getTime())
    expect(result).toBe("2026-07-10T10:00:00.000Z")
  })

  it("cai para o calculo em memoria quando a RPC devolve data no passado", async () => {
    const client = mockClient({ data: "2020-01-01T00:00:00.000Z", error: null })

    const result = await computeNextExecutionAt(client, plan({ frequency_type: "monthly" }), NOW)

    expect(new Date(result).getTime()).toBeGreaterThan(NOW.getTime())
  })

  it("trata excecao da RPC sem quebrar", async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error("boom")) } as unknown as SupabaseClient

    const result = await computeNextExecutionAt(client, plan({ frequency_type: "weekly" }), NOW)

    expect(new Date(result).getTime()).toBeGreaterThan(NOW.getTime())
    expect(result).toBe("2026-06-17T10:00:00.000Z")
  })

  it("sempre retorna uma data posterior a currentRun (nunca reagendar para agora)", async () => {
    const dates = [
      plan({ frequency_type: "daily" }),
      plan({ frequency_type: "weekly" }),
      plan({ frequency_type: "monthly" }),
      plan({ frequency_type: "yearly" }),
      plan({ frequency_type: "custom" }),
    ]

    for (const p of dates) {
      const client = mockClient({ data: null, error: { message: "offline" } })
      const result = await computeNextExecutionAt(client, p, NOW)
      expect(new Date(result).getTime()).toBeGreaterThan(NOW.getTime())
    }
  })

  it("usa os aliases legados sem cair no fallback de 30 dias", async () => {
    const client = mockClient({ data: null, error: { message: "offline" } })

    const daily = await computeNextExecutionAt(client, plan({ frequency_type: "day" }), NOW)
    const weekly = await computeNextExecutionAt(client, plan({ frequency_type: "week" }), NOW)
    const monthly = await computeNextExecutionAt(client, plan({ frequency_type: "month" }), NOW)
    const yearly = await computeNextExecutionAt(client, plan({ frequency_type: "year" }), NOW)

    expect(daily).toBe("2026-06-11T10:00:00.000Z")
    expect(weekly).toBe("2026-06-17T10:00:00.000Z")
    expect(monthly).toBe("2026-07-10T10:00:00.000Z")
    expect(yearly).toBe("2027-06-10T10:00:00.000Z")
  })

  it("respeta day_of_month respeitando o limite do mes", async () => {
    const client = mockClient({ data: null, error: { message: "offline" } })

    const result = await computeNextExecutionAt(
      client,
      plan({ frequency_type: "monthly", day_of_month: 31 }),
      NOW,
    )

    // julho tem 31 dias
    expect(result).toBe("2026-07-31T10:00:00.000Z")
  })

  it("usa use_last_day para fechar no ultimo dia do mes", async () => {
    const client = mockClient({ data: null, error: { message: "offline" } })

    const result = await computeNextExecutionAt(
      client,
      plan({ frequency_type: "monthly", use_last_day: true }),
      NOW,
    )

    expect(result).toBe("2026-07-31T10:00:00.000Z")
  })

  it("fallback de custom continua sendo ~30 dias", async () => {
    const client = mockClient({ data: null, error: { message: "offline" } })

    const result = await computeNextExecutionAt(client, plan({ frequency_type: "custom" }), NOW)

    expect(result).toBe("2026-07-10T10:00:00.000Z")
  })
})

import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveAppointmentCustomerIds } from "./appointment-customer-resolution"

type QueryTrace = {
  table: string
  filters: Array<[string, ...unknown[]]>
}

function createSupabaseMock(results: unknown[]) {
  const traces: QueryTrace[] = []
  const from = vi.fn((table: string) => {
    const trace: QueryTrace = { table, filters: [] }
    traces.push(trace)
    const result = results[traces.length - 1] ?? { data: [], error: null }
    const builder: any = {}

    for (const method of ["select", "eq", "in", "or"]) {
      builder[method] = vi.fn((...args: unknown[]) => {
        trace.filters.push([method, ...args])
        return builder
      })
    }
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)

    return builder
  })

  return { client: { from } as unknown as SupabaseClient, from, traces }
}

describe("resolveAppointmentCustomerIds", () => {
  it("deduplicates direct customer IDs and scopes the single lookup to the partner", async () => {
    const customerId = "10000000-0000-4000-8000-000000000001"
    const { client, from, traces } = createSupabaseMock([{ data: [{ id: customerId }], error: null }])

    const resolved = await resolveAppointmentCustomerIds(client, "partner-1", [customerId, customerId])

    expect(resolved.get(customerId)).toBe(customerId)
    expect(from).toHaveBeenCalledTimes(1)
    expect(traces[0].table).toBe("customers")
    expect(traces[0].filters).toContainEqual(["eq", "partner_id", "partner-1"])
    expect(traces[0].filters).toContainEqual(["in", "id", [customerId]])
  })

  it("resolves marketplace buyer IDs with one partner-scoped fallback query", async () => {
    const buyerId = "20000000-0000-4000-8000-000000000002"
    const customerId = "30000000-0000-4000-8000-000000000003"
    const { client, from, traces } = createSupabaseMock([
      { data: [], error: null },
      { data: [{ id: customerId, user_id: buyerId, marketplace_user_id: null }], error: null },
    ])

    const resolved = await resolveAppointmentCustomerIds(client, "partner-2", [buyerId])

    expect(resolved.get(buyerId)).toBe(customerId)
    expect(from).toHaveBeenCalledTimes(2)
    expect(traces.every((trace) => trace.filters.some(([method, field, value]) => method === "eq" && field === "partner_id" && value === "partner-2"))).toBe(true)
    expect(traces[1].filters).toContainEqual(["or", `user_id.in.(${buyerId}),marketplace_user_id.in.(${buyerId})`])
  })

  it("skips database reads for empty and invalid customer IDs", async () => {
    const { client, from } = createSupabaseMock([])

    const resolved = await resolveAppointmentCustomerIds(client, "partner-3", [null, "not-a-uuid", ""])

    expect(resolved.size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })
})

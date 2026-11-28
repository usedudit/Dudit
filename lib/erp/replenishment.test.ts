import { describe, it, expect } from "vitest"
import {
    fetchLowStockProducts,
    getReplenishmentQuantity,
    isLowStockProduct,
} from "./replenishment"

function createFakeAdmin(pages: any[][], errorMessage?: string) {
    const calls: { method: string; args: any[] }[] = []
    let pageIndex = 0

    const builder: any = {}
    for (const method of ["from", "select", "eq", "gt", "order", "or"]) {
        builder[method] = (...args: any[]) => {
            calls.push({ method, args })
            return builder
        }
    }
    builder.range = (from: number, to: number) => {
        calls.push({ method: "range", args: [from, to] })
        if (errorMessage) return Promise.resolve({ data: null, error: { message: errorMessage } })
        return Promise.resolve({ data: pages[pageIndex++] ?? [], error: null })
    }

    return { admin: builder, calls }
}

describe("isLowStockProduct", () => {
    it("marca reposição quando o estoque está abaixo do mínimo", () => {
        expect(isLowStockProduct({ stock_quantity: 0, min_stock: 5 })).toBe(true)
    })

    it("marca reposição quando o estoque está exatamente no mínimo", () => {
        expect(isLowStockProduct({ stock_quantity: 5, min_stock: 5 })).toBe(true)
    })

    it("ignora produto com estoque acima do mínimo", () => {
        // Este era o caso que aparecia na notificação mas não na lista.
        expect(isLowStockProduct({ stock_quantity: 6, min_stock: 5 })).toBe(false)
    })

    it("trata valores nulos/indefinidos como zero", () => {
        expect(isLowStockProduct({ stock_quantity: null, min_stock: 2 })).toBe(true)
        expect(isLowStockProduct({ min_stock: null })).toBe(true)
        expect(isLowStockProduct({ stock_quantity: 3, min_stock: undefined })).toBe(false)
    })

    it("aceita quantidades em string (numeric do Postgres)", () => {
        expect(isLowStockProduct({ stock_quantity: "2.5", min_stock: "10" })).toBe(true)
        expect(isLowStockProduct({ stock_quantity: "10", min_stock: "10" })).toBe(true)
        expect(isLowStockProduct({ stock_quantity: "10.1", min_stock: "10" })).toBe(false)
    })
})

describe("getReplenishmentQuantity", () => {
    it("calcula quanto falta para atingir o mínimo", () => {
        expect(getReplenishmentQuantity({ stock_quantity: 2, min_stock: 10 })).toBe(8)
    })

    it("nunca retorna negativo", () => {
        expect(getReplenishmentQuantity({ stock_quantity: 12, min_stock: 10 })).toBe(0)
    })
})

describe("fetchLowStockProducts", () => {
    it("pagina até o fim e devolve só quem está no/abaixo do mínimo", async () => {
        const { admin, calls } = createFakeAdmin([
            [
                { id: "a", stock_quantity: 1, min_stock: 5 },
                { id: "b", stock_quantity: 9, min_stock: 5 },
            ],
            [{ id: "c", stock_quantity: 0, min_stock: 2 }],
        ])

        const result = await fetchLowStockProducts(admin, {
            partnerId: "p1",
            select: "id, stock_quantity, min_stock",
            pageSize: 2,
        })

        expect(result.map((p) => p.id)).toEqual(["a", "c"])
        const ranges = calls.filter((c) => c.method === "range").map((c) => c.args)
        expect(ranges).toEqual([
            [0, 1],
            [2, 3],
        ])
    })

    it("escopa pela loja ativa (loja + produtos sem loja)", async () => {
        const { admin, calls } = createFakeAdmin([[{ id: "a", stock_quantity: 0, min_stock: 1 }]])

        await fetchLowStockProducts(admin, {
            partnerId: "p1",
            storeId: "store-1",
            select: "id, stock_quantity, min_stock",
        })

        const orCall = calls.find((c) => c.method === "or")
        expect(orCall?.args[0]).toBe("store_id.eq.store-1,store_id.is.null")
    })

    it("não filtra por loja quando não há loja ativa", async () => {
        const { admin, calls } = createFakeAdmin([[{ id: "a", stock_quantity: 0, min_stock: 1 }]])

        await fetchLowStockProducts(admin, {
            partnerId: "p1",
            select: "id, stock_quantity, min_stock",
        })

        expect(calls.some((c) => c.method === "or")).toBe(false)
    })

    it("propaga erro do banco", async () => {
        const { admin } = createFakeAdmin([], "boom")

        await expect(
            fetchLowStockProducts(admin, {
                partnerId: "p1",
                select: "id, stock_quantity, min_stock",
            }),
        ).rejects.toThrow("boom")
    })
})

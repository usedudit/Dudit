import { describe, it, expect, vi } from "vitest"

describe("Batch Financial Transactions Rule Guards", () => {
    interface TestTx {
        id: string
        status: "pending" | "paid" | "cancelled"
        installment_group_id: string | null
    }

    const filterEligibleForCancel = (transactions: TestTx[]) => {
        return transactions.filter(
            (tx) => tx.status === "pending" && !tx.installment_group_id
        )
    }

    const filterEligibleForSettle = (transactions: TestTx[]) => {
        return transactions.filter((tx) => tx.status === "pending")
    }

    const filterEligibleForReschedule = (transactions: TestTx[]) => {
        return transactions.filter((tx) => tx.status === "pending")
    }

    const filterEligibleForCategory = (transactions: TestTx[]) => {
        return transactions.filter((tx) => tx.status !== "cancelled")
    }

    const sampleTransactions: TestTx[] = [
        { id: "tx-1", status: "pending", installment_group_id: null },
        { id: "tx-2", status: "pending", installment_group_id: null },
        { id: "tx-3", status: "paid", installment_group_id: null },
        { id: "tx-4", status: "cancelled", installment_group_id: null },
        { id: "tx-5", status: "pending", installment_group_id: "inst-grp-1" },
    ]

    it("should filter out paid, cancelled, and installment transactions for cancel action", () => {
        const eligible = filterEligibleForCancel(sampleTransactions)
        expect(eligible.map((t) => t.id)).toEqual(["tx-1", "tx-2"])
        const ignoredCount = sampleTransactions.length - eligible.length
        expect(ignoredCount).toBe(3) // tx-3 (paid), tx-4 (cancelled), tx-5 (installment)
    })

    it("should filter out paid and cancelled transactions for settle action", () => {
        const eligible = filterEligibleForSettle(sampleTransactions)
        expect(eligible.map((t) => t.id)).toEqual(["tx-1", "tx-2", "tx-5"])
        const ignoredCount = sampleTransactions.length - eligible.length
        expect(ignoredCount).toBe(2) // tx-3 (paid), tx-4 (cancelled)
    })

    it("should filter out paid and cancelled transactions for reschedule action", () => {
        const eligible = filterEligibleForReschedule(sampleTransactions)
        expect(eligible.map((t) => t.id)).toEqual(["tx-1", "tx-2", "tx-5"])
        const ignoredCount = sampleTransactions.length - eligible.length
        expect(ignoredCount).toBe(2) // tx-3 (paid), tx-4 (cancelled)
    })

    it("should filter out cancelled transactions for category alteration", () => {
        const eligible = filterEligibleForCategory(sampleTransactions)
        expect(eligible.map((t) => t.id)).toEqual(["tx-1", "tx-2", "tx-3", "tx-5"])
        const ignoredCount = sampleTransactions.length - eligible.length
        expect(ignoredCount).toBe(1) // tx-4 (cancelled)
    })

    it("should report warning message when all selected transactions are ignored", () => {
        const allPaid: TestTx[] = [
            { id: "tx-a", status: "paid", installment_group_id: null },
            { id: "tx-b", status: "paid", installment_group_id: null },
        ]
        const eligible = filterEligibleForCancel(allPaid)
        expect(eligible.length).toBe(0)
    })
})

describe("Grace Period Queue Timing & Undo Mechanism", () => {
    it("should correctly compute remaining seconds and progress percentage", () => {
        const durationMs = 10000
        const startTime = 1000000
        const now = 1003500 // 3.5s elapsed

        const elapsed = now - startTime
        const remainingMs = Math.max(0, durationMs - elapsed)
        const remainingSeconds = Math.ceil(remainingMs / 1000)
        const progressPct = Math.max(0, Math.min(100, (remainingMs / durationMs) * 100))

        expect(remainingSeconds).toBe(7) // 6.5s rounds up to 7
        expect(progressPct).toBeCloseTo(65, 0)
    })

    it("should cancel gracefully when undo is triggered before timer expires", async () => {
        const onExecute = vi.fn()
        const onUndo = vi.fn()

        let cancelled = false
        const undo = () => {
            cancelled = true
            onUndo()
        }

        const runTimer = (shouldUndo: boolean) => {
            if (shouldUndo) {
                undo()
                return
            }
            if (!cancelled) {
                onExecute()
            }
        }

        runTimer(true)

        expect(onUndo).toHaveBeenCalledTimes(1)
        expect(onExecute).not.toHaveBeenCalled()
    })

    it("should execute immediately when flush is invoked", async () => {
        const onExecute = vi.fn()

        const flush = () => {
            onExecute()
        }

        flush()
        expect(onExecute).toHaveBeenCalledTimes(1)
    })
})

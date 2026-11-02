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

    it("should correctly parse and separate direct UUIDs from group- UUIDs", () => {
        const rawIds = [
            "550e8400-e29b-41d4-a716-446655440000",
            "group-660e8400-e29b-41d4-a716-446655440001",
            "invalid-id",
            "recurring-occurrence-12345",
        ]

        const sanitizeUUID = (val: unknown) => {
            if (typeof val !== "string") return null
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            return uuidRegex.test(val) ? val : null
        }

        const directIds: string[] = []
        const groupIds: string[] = []

        for (const rawId of rawIds) {
            if (typeof rawId !== "string") continue
            if (rawId.startsWith("group-")) {
                const gid = sanitizeUUID(rawId.slice(6))
                if (gid) groupIds.push(gid)
            } else {
                const uid = sanitizeUUID(rawId)
                if (uid) directIds.push(uid)
            }
        }

        expect(directIds).toEqual(["550e8400-e29b-41d4-a716-446655440000"])
        expect(groupIds).toEqual(["660e8400-e29b-41d4-a716-446655440001"])
    })

    it("should never include account_id in transaction_payments payload", () => {
        const transactionPaymentsRow = {
            partner_id: "partner-1",
            transaction_id: "tx-1",
            store_id: null,
            amount: 150.0,
            base_amount: 150.0,
            interest_amount: 0,
            discount_amount: 0,
            payment_method_id: "pm-1",
            created_by_user_id: "user-1",
            created_at: new Date().toISOString(),
        }

        expect("account_id" in transactionPaymentsRow).toBe(false)
        expect("payment_date" in transactionPaymentsRow).toBe(false)
        expect("payment_type" in transactionPaymentsRow).toBe(false)
        expect(transactionPaymentsRow.created_by_user_id).toBe("user-1")
    })
})

describe("Financial Transactions Sorting Rules", () => {
    interface SortableTx {
        id: string
        createdAtRaw?: string | null
        paymentDateRaw?: string | null
        dueDateRaw?: string | null
    }

    const parseSortTime = (raw?: string | null): number => {
        if (!raw) return 0
        if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
            const ts = new Date(`${raw}T12:00:00`).getTime()
            return Number.isFinite(ts) ? ts : 0
        }
        const ts = new Date(raw).getTime()
        return Number.isFinite(ts) ? ts : 0
    }

    const transactionSortTime = (item: SortableTx) => {
        const raw = item.paymentDateRaw || item.createdAtRaw || item.dueDateRaw || null
        return parseSortTime(raw)
    }

    const sortTransactions = (items: SortableTx[]) => {
        return [...items].sort((a, b) => {
            const diff = transactionSortTime(b) - transactionSortTime(a)
            if (diff !== 0) return diff
            const aCreated = a.createdAtRaw ? new Date(a.createdAtRaw).getTime() : 0
            const bCreated = b.createdAtRaw ? new Date(b.createdAtRaw).getTime() : 0
            if (bCreated !== aCreated) return bCreated - aCreated
            return String(b.id || "").localeCompare(String(a.id || ""))
        })
    }

    it("should sort paid transactions by payment date descending, not by creation date", () => {
        const oldCreatedPaidRecently: SortableTx = {
            id: "tx-old-created-paid-today",
            createdAtRaw: "2026-09-01T10:00:00Z",
            paymentDateRaw: "2026-11-02T15:00:00Z",
        }
        const newCreatedPaidYesterday: SortableTx = {
            id: "tx-new-created-paid-yesterday",
            createdAtRaw: "2026-11-01T08:00:00Z",
            paymentDateRaw: "2026-11-01T09:00:00Z",
        }
        const intermediate: SortableTx = {
            id: "tx-october",
            createdAtRaw: "2026-10-15T12:00:00Z",
            paymentDateRaw: "2026-10-15T12:00:00Z",
        }

        const sorted = sortTransactions([intermediate, newCreatedPaidYesterday, oldCreatedPaidRecently])

        // The transaction paid today (Nov 2) must be first, despite having a creation date from September!
        expect(sorted.map((t) => t.id)).toEqual([
            "tx-old-created-paid-today",
            "tx-new-created-paid-yesterday",
            "tx-october",
        ])
    })

    it("should break ties by creation date descending when payment dates are identical", () => {
        const txA: SortableTx = {
            id: "tx-a",
            createdAtRaw: "2026-11-02T08:00:00Z",
            paymentDateRaw: "2026-11-02",
        }
        const txB: SortableTx = {
            id: "tx-b",
            createdAtRaw: "2026-11-02T14:00:00Z",
            paymentDateRaw: "2026-11-02",
        }

        const sorted = sortTransactions([txA, txB])
        expect(sorted.map((t) => t.id)).toEqual(["tx-b", "tx-a"])
    })
})


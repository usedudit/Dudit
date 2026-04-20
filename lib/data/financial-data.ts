import "server-only"
import { cache } from "react"
import { getFinancialTransactionsAction } from "@/app/actions/erp/transactions"
import type { FinancialTransactionCursor } from "@/lib/services/transactions.types"
import { getFinancialCategoriesAction } from "@/app/actions/erp/financial-category-metadata"
import { getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"
import { generateRecurringOccurrencesAction, getRecurringTransactionsAction } from "@/app/actions/erp/recurring-transactions"
import { getPaymentMethodsAction } from "@/app/actions/payment-methods"

// ============================================================================
// REQUEST-SCOPED DEDUPLICATION LAYER
//
// Each function is wrapped in React `cache()`, which guarantees it runs
// AT MOST ONCE per server request/render cycle. If Next.js renders the same
// component tree multiple times in one request (layout + page, parallel
// segments, etc.), the second call returns the memoized result instantly.
//
// IMPORTANT: This is NOT cross-request caching. Each new HTTP request
// starts with a fresh cache. Data is always fresh.
//
// Instrumentation logs are tagged [DEDUP] so you can grep for them in
// Railway logs to verify deduplication is working.
// ============================================================================

// ── Request ID for tracing ──────────────────────────────────────────────────
// Generates a single request ID per render cycle (also cache()-wrapped).
// If you see the SAME requestId with multiple "EXECUTE" logs, dedup failed.
// If you see the SAME requestId with one EXECUTE and one HIT, dedup works.
const getRequestId = cache(() => {
    const id = Math.random().toString(36).slice(2, 8)
    console.log(`[DEDUP] ══════ New request cycle: req-${id} ══════`)
    return id
})

// ── Transactions ────────────────────────────────────────────────────────────
export const getTransactionsData = cache(
    async (partnerId: string, options?: { cursor?: FinancialTransactionCursor | null }) => {
        const reqId = getRequestId()
        console.log(`[DEDUP] req-${reqId} | getTransactionsData EXECUTE (partnerId=${partnerId.slice(0, 8)})`)
        const t0 = performance.now()
        const result = await getFinancialTransactionsAction(partnerId, options)
        console.log(`[DEDUP] req-${reqId} | getTransactionsData DONE in ${Math.round(performance.now() - t0)}ms`)
        return result
    }
)

// ── Financial Categories ────────────────────────────────────────────────────
export const getCategoriesData = cache(
    async (partnerId: string) => {
        const reqId = getRequestId()
        console.log(`[DEDUP] req-${reqId} | getCategoriesData EXECUTE`)
        const t0 = performance.now()
        const result = await getFinancialCategoriesAction(partnerId)
        console.log(`[DEDUP] req-${reqId} | getCategoriesData DONE in ${Math.round(performance.now() - t0)}ms`)
        return result
    }
)

// ── Finance Accounts ────────────────────────────────────────────────────────
export const getAccountsData = cache(
    async (partnerId: string) => {
        const reqId = getRequestId()
        console.log(`[DEDUP] req-${reqId} | getAccountsData EXECUTE`)
        const t0 = performance.now()
        const result = await getFinanceAccountsAction(partnerId)
        console.log(`[DEDUP] req-${reqId} | getAccountsData DONE in ${Math.round(performance.now() - t0)}ms`)
        return result
    }
)

// ── Recurring Occurrences (expensive: bulk RPC) ─────────────────────────────
export const getRecurringOccurrencesData = cache(
    async (partnerId: string) => {
        const reqId = getRequestId()
        console.log(`[DEDUP] req-${reqId} | getRecurringOccurrencesData EXECUTE`)
        const t0 = performance.now()
        const result = await generateRecurringOccurrencesAction(partnerId)
        console.log(`[DEDUP] req-${reqId} | getRecurringOccurrencesData DONE in ${Math.round(performance.now() - t0)}ms`)
        return result
    }
)

// ── Recurring Templates ─────────────────────────────────────────────────────
export const getRecurringTemplatesData = cache(
    async (partnerId: string) => {
        const reqId = getRequestId()
        console.log(`[DEDUP] req-${reqId} | getRecurringTemplatesData EXECUTE`)
        const t0 = performance.now()
        const result = await getRecurringTransactionsAction(partnerId)
        console.log(`[DEDUP] req-${reqId} | getRecurringTemplatesData DONE in ${Math.round(performance.now() - t0)}ms`)
        return result
    }
)

// ── Payment Methods ─────────────────────────────────────────────────────────
export const getPaymentMethodsData = cache(
    async (partnerId: string) => {
        const reqId = getRequestId()
        console.log(`[DEDUP] req-${reqId} | getPaymentMethodsData EXECUTE`)
        const t0 = performance.now()
        const result = await getPaymentMethodsAction(partnerId)
        console.log(`[DEDUP] req-${reqId} | getPaymentMethodsData DONE in ${Math.round(performance.now() - t0)}ms`)
        return result
    }
)

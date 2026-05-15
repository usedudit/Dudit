"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { getFinanceAccountsAction } from "@/app/actions/erp/finance-accounts"

const FINANCE_ACCOUNTS_KEY = (partnerId: string) => ["erp-finance-accounts", partnerId] as const

/**
 * Shared React Query hook for finance accounts.
 * Eliminates duplicate fetches across CreateOrder, PaymentMethodDialog,
 * FinancialCategoriesPage, and other consumers.
 *
 * Usage:
 *   const { accounts, isLoading, invalidate } = useFinanceAccounts(partnerId)
 *
 * After mutations (create/update/delete), call `invalidate()` to refetch.
 */
export function useFinanceAccounts(partnerId: string) {
    const queryClient = useQueryClient()

    const { data, isLoading, error } = useQuery({
        queryKey: FINANCE_ACCOUNTS_KEY(partnerId),
        queryFn: async () => {
            const res = await getFinanceAccountsAction(partnerId)
            return res
        },
        staleTime: 60_000, // 1 minute - accounts rarely change mid-session
        refetchOnWindowFocus: false,
        enabled: !!partnerId,
    })

    const accounts = (data?.success && data?.data?.accounts) ? data.data.accounts : []

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_KEY(partnerId) })
    }, [queryClient, partnerId])

    /** Direct cache set - use when you already have fresh data (e.g., after create). */
    const setCache = useCallback(
        (freshAccounts: any[]) => {
            queryClient.setQueryData(FINANCE_ACCOUNTS_KEY(partnerId), {
                success: true,
                data: { accounts: freshAccounts },
            })
        },
        [queryClient, partnerId],
    )

    return { accounts, isLoading, error: data && "error" in data ? data.error : null, invalidate, setCache }
}

"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { getPaymentMethodsAction } from "@/app/actions/erp/payment-methods"

const PAYMENT_METHODS_KEY = (partnerId: string) => ["erp-payment-methods", partnerId] as const

/**
 * Shared React Query hook for payment methods.
 * Eliminates duplicate fetches across TransactionsPage, PaymentModal,
 * PaymentMethodsSubPage, and other consumers.
 *
 * Usage:
 *   const { methods, isLoading, invalidate } = usePaymentMethods(partnerId)
 *
 * After mutations (create/update/delete), call `invalidate()` to refetch.
 */
export function usePaymentMethods(partnerId: string) {
    const queryClient = useQueryClient()

    const { data, isLoading, error } = useQuery({
        queryKey: PAYMENT_METHODS_KEY(partnerId),
        queryFn: async () => {
            const res = await getPaymentMethodsAction(partnerId)
            return res
        },
        staleTime: 60_000, // 1 minute — payment methods rarely change mid-session
        refetchOnWindowFocus: false,
        enabled: !!partnerId,
    })

    const methods = data?.methods || []

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: PAYMENT_METHODS_KEY(partnerId) })
    }, [queryClient, partnerId])

    /** Direct cache set — use when you already have fresh data (e.g., from SSR props). */
    const setCache = useCallback(
        (freshMethods: any[]) => {
            queryClient.setQueryData(PAYMENT_METHODS_KEY(partnerId), { methods: freshMethods })
        },
        [queryClient, partnerId],
    )

    return { methods, isLoading, error: data && "error" in data ? data.error : null, invalidate, setCache }
}

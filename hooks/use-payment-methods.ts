"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { getPaymentMethodsAction } from "@/app/actions/erp/payment-methods"
import { useStoreOrNull } from "@/lib/store-context"

const PAYMENT_METHODS_KEY = (partnerId: string, storeKey: string) => ["erp-payment-methods", partnerId, storeKey] as const

function resolveStoreKey(storeId?: string | null): string {
    return storeId || "__global__"
}

export function usePaymentMethods(
    partnerId: string,
    storeId?: string | null,
    options?: { enabled?: boolean },
) {
    const queryClient = useQueryClient()
    const storeContext = useStoreOrNull()

    const effectiveStoreId = storeId ?? storeContext?.selectedStore?.id ?? null
    const storeKey = resolveStoreKey(effectiveStoreId)
    const isEnabled = (options?.enabled ?? true) && Boolean(partnerId && partnerId.trim().length > 0)

    const { data, isLoading, error } = useQuery({
        queryKey: PAYMENT_METHODS_KEY(partnerId, storeKey),
        queryFn: async () => {
            const res = await getPaymentMethodsAction(partnerId, effectiveStoreId)
            return res
        },
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        enabled: isEnabled,
        retry: 1,
    })

    const methods = data?.methods || []

    const invalidate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ["erp-payment-methods", partnerId] })
    }, [queryClient, partnerId])

    const setCache = useCallback(
        (freshMethods: any[]) => {
            queryClient.setQueryData(PAYMENT_METHODS_KEY(partnerId, storeKey), { methods: freshMethods })
        },
        [queryClient, partnerId, storeKey],
    )

    return { methods, isLoading, error: data && "error" in data ? data.error : null, invalidate, setCache }
}

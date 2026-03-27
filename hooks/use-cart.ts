"use client"

import useSWR, { mutate as globalMutate } from "swr"
import { useSupabase } from "@/providers/supabase-provider"
import { getCartItemCountAction } from "@/app/actions/marketplace/cart"

interface CartHookResult {
  cartCount: number
  isLoading: boolean
  mutate: any
}

const cartFetcher = () => getCartItemCountAction()

export function useCart(fallbackData?: number): CartHookResult {
  const { user, isLoading: isAuthLoading, sessionData } = useSupabase()

  // Use sessionData from context if available as higher priority fallback
  const contextCartCount = sessionData?.cart?.length ?? null
  const effectiveFallback = fallbackData !== undefined ? fallbackData : contextCartCount

  const { data, isLoading: isDataLoading, mutate } = useSWR(
    user ? ["cart", user.id] : null,
    cartFetcher,
    {
      fallbackData: effectiveFallback as number,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      // Only revalidate on mount if we have absolutely no data (neither prop nor context)
      revalidateOnMount: effectiveFallback === null,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  return {
    cartCount: typeof data === "number" ? data : 0,
    isLoading: isAuthLoading || isDataLoading,
    mutate
  }
}

/**
 * Call this from any client component to instantly revalidate the cart across the app.
 * E.g., after addToCartAction, removeFromCartAction, updateCartQuantityAction
 */
export function invalidateCartCache() {
  return globalMutate((key: any) => Array.isArray(key) && key[0] === "cart")
}

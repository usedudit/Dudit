"use client"

import { useUserSession, invalidateUserSessionCache } from "@/hooks/use-user-session"

interface CartHookResult {
  cartCount: number
  isLoading: boolean
  mutate: any
}

export function useCart(fallbackData?: number): CartHookResult {
  const { data, isLoading, mutate } = useUserSession()

  return {
    // If a specific component provided fallbackData (e.g., from server props), use it
    // otherwise rely on the unified session cache
    cartCount: fallbackData !== undefined ? fallbackData : (data?.cartCount ?? 0),
    isLoading,
    mutate
  }
}

/**
 * Call this from any client component to instantly revalidate the cart across the app.
 * E.g., after addToCartAction, removeFromCartAction, updateCartQuantityAction
 */
export function invalidateCartCache() {
  return invalidateUserSessionCache()
}

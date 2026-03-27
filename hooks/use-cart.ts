"use client"

import useSWR, { mutate as globalMutate } from "swr"
import { useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"

interface CartHookResult {
  cartCount: number
  isLoading: boolean
  mutate: any
}

export function useCart(fallbackData?: number): CartHookResult {
  const { user, supabase, isLoading: isAuthLoading, sessionData } = useSupabase()

  // Use sessionData from context if available as higher priority fallback
  const contextCartCount = sessionData?.cart?.length ?? null
  const effectiveFallback = fallbackData !== undefined ? fallbackData : contextCartCount

  const fetcher = useCallback(async () => {
    if (!user) return 0
    const { data: cartRes } = await supabase.from("cart_items").select("quantity").eq("user_id", user.id)
    const cartItems = cartRes || []
    return cartItems.reduce((acc: number, item: any) => acc + (item.quantity || 1), 0)
  }, [user, supabase])

  const key = user ? `cart-${user.id}` : null
  const shouldSkipFetch = effectiveFallback !== null && effectiveFallback !== undefined

  const { data, isLoading: isDataLoading, mutate } = useSWR(
    shouldSkipFetch ? null : key,
    fetcher,
    {
      fallbackData: effectiveFallback as number,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: false,
      dedupingInterval: 60000,
      keepPreviousData: true,
    }
  )

  if (shouldSkipFetch) {
    return {
      cartCount: effectiveFallback,
      isLoading: false,
      mutate
    }
  }

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

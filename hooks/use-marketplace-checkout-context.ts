"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  getMarketplaceCheckoutContextAction,
  type MarketplaceCheckoutContextResult,
} from "@/app/actions/marketplace/checkout-context"

type CheckoutContextData = Extract<MarketplaceCheckoutContextResult, { success: true }>

export function useMarketplaceCheckoutContext(params: {
  partnerId: string
  cartItemIds: string[]
  mpConnected?: boolean
  storeId?: string
  enabled?: boolean
  refreshTrigger?: number
}) {
  const [serverData, setServerData] = useState<CheckoutContextData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const overridesRef = useRef<Partial<CheckoutContextData> | null>(null)
  const [, forceRender] = useState(0)

  const cartKey = params.cartItemIds.join(",")

  useEffect(() => {
    if (!params.enabled || !params.partnerId || !params.cartItemIds.length) {
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    getMarketplaceCheckoutContextAction({
      partnerId: params.partnerId,
      cartItemIds: params.cartItemIds,
      mpConnected: params.mpConnected,
      storeId: params.storeId,
    })
      .then((result) => {
        if (!active) return
        if (!result.success) {
          setError(result.error)
          setServerData(null)
        } else {
          overridesRef.current = null
          setServerData(result)
          setError(null)
        }
      })
      .catch(() => {
        if (!active) return
        setError("Não foi possível carregar o checkout.")
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [params.partnerId, cartKey, params.mpConnected, params.storeId, params.enabled, params.refreshTrigger])

  const patchContext = useCallback((patch: Partial<CheckoutContextData>) => {
    overridesRef.current = { ...overridesRef.current, ...patch }
    forceRender((n) => n + 1)
  }, [])

  const checkoutContext = serverData
    ? { ...serverData, ...overridesRef.current } as CheckoutContextData
    : null

  return { checkoutContext, contextError: error, contextLoading: loading, patchContext }
}

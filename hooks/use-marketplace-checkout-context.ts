"use client"

import { useEffect, useState } from "react"
import {
  getMarketplaceCheckoutContextAction,
  type MarketplaceCheckoutContextResult,
} from "@/app/actions/marketplace/checkout-context"

export function useMarketplaceCheckoutContext(params: {
  partnerId: string
  cartItemIds: string[]
  mpConnected?: boolean
  storeId?: string
  enabled?: boolean
  refreshTrigger?: number
}) {
  const [data, setData] = useState<Extract<MarketplaceCheckoutContextResult, { success: true }> | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

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
          setData(null)
        } else {
          setData(result)
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
  }, [params.partnerId, cartKey, params.mpConnected, params.enabled, params.refreshTrigger])

  return { checkoutContext: data, contextError: error, contextLoading: loading }
}

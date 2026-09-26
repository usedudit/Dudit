"use client"

import { useEffect, useState, useCallback } from "react"
import {
  getMarketplaceCheckoutContextAction,
  type MarketplaceCheckoutContextResult,
} from "@/app/actions/marketplace/checkout-context"

type CheckoutContextData = Extract<MarketplaceCheckoutContextResult, { success: true }>

const CHECKOUT_CONTEXT_DEDUP_MS = 5_000

type CachedCheckoutContextRequest = {
  promise: Promise<MarketplaceCheckoutContextResult>
  expiresAt: number
}

// Server Actions are ordinary network requests from the browser, so React's
// request cache and the global SWR configuration do not deduplicate them. Keep
// a very short client-side request cache for identical checkout snapshots. The
// refreshTrigger remains part of the key, so an explicit refresh always gets a
// fresh request.
const checkoutContextRequests = new Map<string, CachedCheckoutContextRequest>()

function getCheckoutContextRequest(input: {
  partnerId: string
  cartItemIds: string[]
  mpConnected?: boolean
  storeId?: string
  refreshTrigger?: number
}) {
  const key = JSON.stringify([
    input.partnerId,
    input.cartItemIds,
    Boolean(input.mpConnected),
    input.storeId || null,
    input.refreshTrigger || 0,
  ])
  const now = Date.now()
  for (const [requestKey, request] of checkoutContextRequests) {
    if (request.expiresAt <= now) checkoutContextRequests.delete(requestKey)
  }
  const cached = checkoutContextRequests.get(key)
  if (cached && cached.expiresAt > now) return cached.promise
  if (cached) checkoutContextRequests.delete(key)

  const promise = getMarketplaceCheckoutContextAction({
    partnerId: input.partnerId,
    cartItemIds: input.cartItemIds,
    mpConnected: input.mpConnected,
    storeId: input.storeId,
  })
  checkoutContextRequests.set(key, { promise, expiresAt: now + CHECKOUT_CONTEXT_DEDUP_MS })
  promise.catch(() => {
    const current = checkoutContextRequests.get(key)
    if (current?.promise === promise) checkoutContextRequests.delete(key)
  })
  return promise
}

export function useMarketplaceCheckoutContext(params: {
  partnerId: string
  cartItemIds: string[]
  mpConnected?: boolean
  storeId?: string
  enabled?: boolean
  refreshTrigger?: number
}) {
  const [data, setData] = useState<CheckoutContextData | null>(null)
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

    getCheckoutContextRequest({
      partnerId: params.partnerId,
      cartItemIds: params.cartItemIds,
      mpConnected: params.mpConnected,
      storeId: params.storeId,
      refreshTrigger: params.refreshTrigger,
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
  }, [params.partnerId, cartKey, params.mpConnected, params.storeId, params.enabled, params.refreshTrigger])

  const patchLines = useCallback((updater: (lines: CheckoutContextData["lines"]) => CheckoutContextData["lines"]) => {
    setData((prev) => {
      if (!prev) return prev
      const newLines = updater(prev.lines)
      return { ...prev, lines: newLines }
    })
  }, [])

  return { checkoutContext: data, contextError: error, contextLoading: loading, patchLines }
}

"use client"

import { useEffect, useState } from "react"

// ─── Global Singleton Cache ─────────────────────────────────────────────────
// Ensures that no matter how many components use useCSRFToken(),
// only ONE fetch is made within the TTL window.

let cachedToken: string | null = null
let cachedAt = 0
let inflightPromise: Promise<string | null> | null = null
const CSRF_TTL = 5 * 60 * 1000 // 5 minutes

function fetchCSRFTokenSingleton(): Promise<string | null> {
  // Return cached token if still valid
  if (cachedToken && Date.now() - cachedAt < CSRF_TTL) {
    return Promise.resolve(cachedToken)
  }

  // Deduplicate concurrent requests - reuse in-flight promise
  if (inflightPromise) return inflightPromise

  inflightPromise = fetch("/api/csrf-token")
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      cachedToken = d?.token ?? null
      cachedAt = Date.now()
      return cachedToken
    })
    .catch(() => cachedToken) // On error, return whatever we had
    .finally(() => {
      inflightPromise = null
    })

  return inflightPromise
}

/**
 * Hook to get CSRF token on the client side.
 * Uses a global singleton cache to avoid duplicate fetches.
 */
export function useCSRFToken(): string | null {
  const [token, setToken] = useState<string | null>(cachedToken)

  useEffect(() => {
    // If we already have a valid cached token, skip the fetch
    if (cachedToken && Date.now() - cachedAt < CSRF_TTL) {
      setToken(cachedToken)
      return
    }

    fetchCSRFTokenSingleton().then((t) => {
      if (t) setToken(t)
    })
  }, [])

  return token
}

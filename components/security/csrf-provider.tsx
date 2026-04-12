"use client"

import { useCSRFToken } from "@/hooks/use-csrf-token"

/**
 * Provider component that ensures CSRF token is available.
 * The hook handles fetching and caching - this component just
 * ensures the token is loaded for children that need it.
 */
export function CSRFProvider({ children }: { children: React.ReactNode }) {
  // Token is automatically fetched and cached by the hook
  useCSRFToken()

  return <>{children}</>
}

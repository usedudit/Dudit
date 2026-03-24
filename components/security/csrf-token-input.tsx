"use client"

import { useCSRFToken } from "@/hooks/use-csrf-token"

/**
 * Hidden input component that automatically includes CSRF token in forms
 * Add this component inside any form that submits to server actions or API routes
 */
export function CSRFTokenInput() {
  const token = useCSRFToken()

  if (!token) {
    return null
  }

  return <input type="hidden" name="csrf_token" value={token} />
}

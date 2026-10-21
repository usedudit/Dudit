"use client"

import { useEffect } from "react"
import { CheckoutErrorScreen } from "@/components/marketplace/checkout/CheckoutErrorScreen"

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Checkout error boundary:", error)
  }, [error])

  return (
    <CheckoutErrorScreen
      message={error?.message || "Erro inesperado"}
      onRetry={reset}
    />
  )
}

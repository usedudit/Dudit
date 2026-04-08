'use client'

import { useEffect } from 'react'

interface OrderStatusSyncProps {
  orderId: string
  status: string
  paymentProvider?: string | null
}

export function OrderStatusSyncOnLoad({ orderId, status, paymentProvider }: OrderStatusSyncProps) {
  useEffect(() => {
    if (status === 'pending' && paymentProvider === "Mercado Pago") {
      const syncOnce = async () => {
        try {
          const response = await fetch('/api/orders/sync-payment-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId }),
          })

          if (response.ok) {
            const data = await response.json()
            console.log('Payment sync result:', data)

            if (data.newStatus === 'paid' || data.paymentStatus === 'approved') {
              console.log('Payment confirmed! Reloading page to show updated status...')
              setTimeout(() => {
                window.location.reload()
              }, 1000)
            }
          }
        } catch (error) {
          console.error('Sync error:', error)
        }
      }

      syncOnce()
    }
  }, [orderId, paymentProvider, status])

  return null
}

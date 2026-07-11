'use client'

import { useEffect, useRef } from 'react'

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

interface BatchOrderStatusSyncProps {
  orders: any[]
}

export function BatchOrderStatusSyncOnLoad({ orders }: BatchOrderStatusSyncProps) {
  const prevKeyRef = useRef("")

  useEffect(() => {
    if (!Array.isArray(orders) || orders.length === 0) return

    const pendingMpOrders = orders.filter(
      (order) =>
        order.situation === "pending" &&
        order.payment_provider === "Mercado Pago" &&
        order.mp_payment_id
    )

    if (pendingMpOrders.length === 0) return

    const key = pendingMpOrders.map((o) => o.id).sort().join(",")
    if (key === prevKeyRef.current) return
    prevKeyRef.current = key

    const syncBatch = async () => {
      try {
        const orderIds = pendingMpOrders.map((o) => o.id)
        const response = await fetch('/api/orders/sync-payment-status-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderIds }),
        })

        if (response.ok) {
          const data = await response.json()
          console.log('Batch payment sync result:', data)

          if (data.updatedCount > 0) {
            console.log('Payment confirmed in batch! Reloading page to show updated status...')
            setTimeout(() => {
              window.location.reload()
            }, 1000)
          }
        }
      } catch (error) {
        console.error('Batch sync error:', error)
      }
    }

    syncBatch()
  }, [orders])

  return null
}

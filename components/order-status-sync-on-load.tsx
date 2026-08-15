'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface OrderStatusSyncProps {
  orderId: string
  status: string
  paymentProvider?: string | null
}

export function OrderStatusSyncOnLoad({ orderId, status, paymentProvider }: OrderStatusSyncProps) {
  const router = useRouter()

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
            if (data.newStatus === 'paid' || data.paymentStatus === 'approved') {
              router.refresh()
            }
          }
        } catch (error) {
          console.error('Sync error:', error)
        }
      }

      syncOnce()
    }
  }, [orderId, paymentProvider, status, router])

  return null
}

interface BatchOrderStatusSyncProps {
  orders: any[]
}

export function BatchOrderStatusSyncOnLoad({ orders }: BatchOrderStatusSyncProps) {
  const router = useRouter()
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
          if (data.updatedCount > 0) {
            router.refresh()
          }
        }
      } catch (error) {
        console.error('Batch sync error:', error)
      }
    }

    syncBatch()
  }, [orders, router])

  return null
}

'use client'

import { useEffect } from 'react'

interface OrderStatusSyncProps {
  orderId: string
  status: string
}

export function OrderStatusSyncOnLoad({ orderId, status }: OrderStatusSyncProps) {
  useEffect(() => {
    // Só sincroniza UMA VEZ quando o componente monta se for pending
    if (status === 'pending') {
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

            // Se foi pago (mesmo que já tenha sido atualizado por webhook antes), recarrega
            if (data.newStatus === 'paid' || data.paymentStatus === 'approved') {
              console.log('✓ Payment confirmed! Reloading page to show updated status...')
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
  }, []) // Vazio para rodar só uma vez ao montar

  return null
}

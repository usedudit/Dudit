import React from "react"
import { formatCurrency } from "@/lib/utils"

export const CompactPaymentStatusAlert = React.memo(
  ({ totalPaid, totalNeed }: { totalPaid: number; totalNeed: number }) => {
    const diff = totalPaid - totalNeed
    const absDiff = Math.abs(diff)

    let bgClass = "bg-gray-100 dark:bg-dark-border/20"
    let textClass = "text-gray-600 dark:text-dark-body"
    let message = ""
    let barClass = "bg-gray-400"

    if (diff < -0.005) {
      bgClass = "bg-red-50 dark:bg-red-900/20"
      textClass = "text-red-600 dark:text-red-400"
      message = `Falta Pagar: ${formatCurrency(absDiff)}`
      barClass = "bg-red-500"
    } else if (diff > 0.005) {
      bgClass = "bg-green-50 dark:bg-green-900/20"
      textClass = "text-green-700 dark:text-green-400"
      message = `Troco: ${formatCurrency(absDiff)}`
      barClass = "bg-green-500"
    } else {
      bgClass = "bg-green-100 dark:bg-green-900/30"
      textClass = "text-green-800 dark:text-green-300"
      message = "Valor total atingido!"
      barClass = "bg-green-600"
    }

    return (
      <div className={`w-full py-3 px-4 mb-4 rounded-lg flex items-center gap-3 transition-colors duration-300 ${bgClass}`}>
        <div className={`w-1 h-4 rounded-full ${barClass}`} />
        <span className={`font-bold text-sm flex-1 ${textClass}`}>{message}</span>
      </div>
    )
  },
)

CompactPaymentStatusAlert.displayName = "CompactPaymentStatusAlert"

import type { ERPTransaction } from "@/lib/services/transactions.types"
import { diffCalendarDaysInSaoPaulo } from "@/lib/utils/formatters"

function isPaidDisplayStatus(status: string): boolean {
  const s = status.toLowerCase()
  return s.includes("pago") || s.includes("recebido")
}

/** Calendar days until due (Brazil) when raw YMD exists; else falls back to server field. */
export function getCalendarDaysUntilDue(transaction: ERPTransaction): number {
  const raw = transaction.dueDateRaw || transaction.occurrenceDate
  if (raw && String(raw).length >= 10) {
    return diffCalendarDaysInSaoPaulo(String(raw).slice(0, 10))
  }
  return transaction.daysUntilDue
}

type Align = "left" | "right"

/**
 * Second line under due date: previstos / pendentes (not paid).
 */
export function DueDateCountdown({
  transaction,
  align = "left",
}: {
  transaction: ERPTransaction
  align?: Align
}) {
  if (isPaidDisplayStatus(transaction.status)) return null

  const days = getCalendarDaysUntilDue(transaction)
  const alignCls = align === "right" ? "text-right block w-full" : ""

  if (days < 0) {
    return <span className={`text-xs font-semibold text-brand-red ${alignCls}`}>Atrasado</span>
  }
  if (days === 0) {
    return <span className={`text-xs font-semibold text-brand-red ${alignCls}`}>Vence hoje</span>
  }
  if (days === 1) {
    return <span className={`text-xs font-semibold text-brand-orange ${alignCls}`}>Vence amanhã</span>
  }
  return (
    <span className={`text-xs font-medium text-brand-inactive-text dark:text-dark-body ${alignCls}`}>
      Faltam {days} dias
    </span>
  )
}

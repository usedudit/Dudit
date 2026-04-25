export type TransactionTab = "Transações" | "Previstos"

/** Stable keyset cursor for paginating transactions (created_at DESC, id DESC). */
export type FinancialTransactionCursor = { createdAt: string; id: string }

export type TransactionStatusVariant = "green" | "red" | "orange" | "gray"

export type LedgerDirection = "in" | "out"

export interface ERPTransaction {
  id: string
  displayId: string
  description: string
  details?: string
  category: string
  contactName: string
  contactType: "cliente" | "fornecedor" | "funcionario" | "outro" | "customer" | "supplier" | "service" | "employee" | "partner" | "other"
  dueDate: string
  dueDateShort: string
  dueDateTime?: string
  dateNote: string
  createdAtDate: string
  createdAtTime: string
  createdAtRaw?: string | null
  daysUntilDue: number
  isOverdue: boolean
  paymentType: string
  status: string
  statusVariant: TransactionStatusVariant
  amount: number
  transactionType: "income" | "expense" | "transfer" | "adjustment" | "refund"
  /** Fluxo de caixa para exibição (+ verde / − vermelho) */
  ledgerDirection: LedgerDirection
  refundKind?: "expense_refund" | "revenue_refund"
  transferGroupId?: string
  referenceNote?: string
  notes?: string

  /* ── Raw DB fields for edit mode ── */
  /** Canonical DB status: "paid" | "pending" */
  rawStatus?: "paid" | "pending" | string
  origin?: "manual" | "system" | "gateway"
  accountId?: string | null
  categoryId?: string | null
  subcategoryId?: string | null
  contactId?: string | null
  customerId?: string | null
  recurringId?: string | null
  paymentMethodId?: string | null
  /** Raw ISO payment_date from DB */
  paymentDateRaw?: string | null
  /** Raw ISO due_date from DB */
  dueDateRaw?: string | null

  /* ── Virtual recurring occurrence fields ── */
  /** True when this item is a virtual recurring occurrence (not yet in DB) */
  isRecurringOccurrence?: boolean
  /** The recurring template ID this occurrence belongs to */
  recurringTemplateId?: string
  /** The exact date of this occurrence (ISO yyyy-MM-dd) */
  occurrenceDate?: string
  installmentGroupId?: string | null
  installmentNumber?: number | null
  installmentGroupDescription?: string | null
  installmentTotalCount?: number | null
  /** Total do installment_groups (contrato) para exibir no cartão do grupo. */
  installmentGroupTotalAmount?: number | null
  isInstallmentGroup?: boolean
  groupRepresentativeTransactionId?: string | null
  installmentPendingCount?: number
  installmentPaidCount?: number
  /** Parcela pendente: saldo em aberto (considera pagamentos parciais em transaction_payments). */
  installmentRemainingAmount?: number
}

export type FinancialTransactionsPageSuccess = {
  items: ERPTransaction[]
  nextCursor: FinancialTransactionCursor | null
  hasMore: boolean
}

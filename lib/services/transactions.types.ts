export type TransactionTab = "Transações" | "Previstos"

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
}

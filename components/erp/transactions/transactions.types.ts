export type TransactionTab = "Todas" | "Entradas" | "Saídas" | "Pendentes" | "Atrasadas"

export type TransactionStatusVariant = "green" | "red" | "orange" | "gray"

export interface ERPTransaction {
  id: string
  displayId: string
  description: string
  details?: string
  category: string
  contactName: string
  contactType: "cliente" | "fornecedor" | "funcionario" | "outro"
  dueDate: string
  dueDateShort: string
  dueDateTime?: string
  dateNote: string
  isOverdue: boolean
  paymentType: string
  status: string
  statusVariant: TransactionStatusVariant
  amount: number
  transactionType: "income" | "expense"
  notes?: string
}

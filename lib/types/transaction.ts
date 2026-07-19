export interface TransactionContact {
    id: string
    partner_id: string
    name: string
    type: "cliente" | "fornecedor" | "funcionario" | "outro" | "customer" | "supplier" | "service" | "employee" | "partner" | "other"
    description: string | null
    store_id: string | null
    created_at: string
    updated_at: string
}

export interface Transaction {
    id: string
    partner_id: string
    description: string
    category: string
    contact_id: string | null
    contact_type: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    amount: number
    due_date: string | null
    payment_date: string | null
    status: string
    notes: string | null
    created_at: string
    updated_at: string
    installment_number: number | null
    total_installments: number | null
    original_amount: number | null
    interest_amount: number
    discount_amount: number
    paid_amount: number
    fee_amount: number
    payment_type: string | null
    transaction_type: "income" | "expense" | "transfer" | "adjustment" | "refund"
}

export interface TransactionInput {
    partner_id: string
    description: string
    category: string
    contact_id?: string | null
    contact_type?: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    amount: number
    due_date?: string | null
    payment_date?: string | null
    status: string
    notes?: string | null
    installment_number?: number | null
    total_installments?: number | null
    original_amount?: number | null
    interest_amount?: number
    discount_amount?: number
    paid_amount?: number
    fee_amount?: number
    payment_type?: string | null
    transaction_type: "income" | "expense" | "transfer" | "adjustment" | "refund"
}

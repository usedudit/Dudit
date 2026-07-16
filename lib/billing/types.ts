export type PurchaseType = 'subscription' | 'addon' | 'marketplace_feature' | 'credit_pack' | 'service' | 'order_payment' | 'future'

export type PurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled' | 'partially_refunded'

export type PaymentStatus = 'pending' | 'processing' | 'approved' | 'rejected' | 'refunded' | 'cancelled' | 'chargeback'

export type PaymentMethodType = 'pix' | 'credit_card' | 'debit_card' | 'boleto' | 'account_money' | 'cash' | 'bank_transfer' | 'other'

export type InvoiceStatus = 'issued' | 'cancelled' | 'refunded'

export type GatewayName = 'mercado_pago' | 'stripe' | 'asaas' | 'pagseguro' | 'manual'

export interface BillingPurchase {
    id: string
    partner_id: string
    user_id: string | null
    purchase_type: PurchaseType
    purchaseable_type: string | null
    purchaseable_id: string | null
    amount: number
    currency: string
    discount_amount: number
    total_amount: number
    status: PurchaseStatus
    gateway: GatewayName
    gateway_payment_id: string | null
    gateway_status: string | null
    subscription_id: string | null
    recurring_subscription_id: string | null
    order_id: string | null
    metadata: Record<string, any>
    description: string | null
    invoice_id: string | null
    created_at: string
    updated_at: string
}

export interface BillingPayment {
    id: string
    purchase_id: string
    amount: number
    currency: string
    fee_amount: number
    net_amount: number
    status: PaymentStatus
    gateway: GatewayName
    gateway_payment_id: string | null
    gateway_status: string | null
    gateway_response: Record<string, any> | null
    payment_method_type: PaymentMethodType | null
    payment_method_details: Record<string, any> | null
    qr_code: string | null
    qr_code_base64: string | null
    boleto_url: string | null
    barcode: string | null
    checkout_url: string | null
    paid_at: string | null
    expires_at: string | null
    refunded_at: string | null
    cancelled_at: string | null
    retry_count: number
    last_retry_at: string | null
    webhook_id: string | null
    webhook_processed_at: string | null
    created_at: string
    updated_at: string
}

export interface BillingInvoice {
    id: string
    purchase_id: string
    partner_id: string
    invoice_number: string
    verification_hash: string
    invoice_data: InvoiceData
    status: InvoiceStatus
    download_count: number
    last_downloaded_at: string | null
    viewed_at: string | null
    created_at: string
    updated_at: string
}

export interface InvoiceData {
    invoice_number: string
    verification_hash: string
    created_at: string
    status: string

    partner: {
        name: string
        document: string
        address: string
        email: string | null
        phone: string | null
        image_url: string | null
    }

    customer: {
        name: string
        document: string | null
        email: string | null
    } | null

    purchase: {
        id: string
        type: string
        description: string | null
        amount: number
        discount_amount: number
        total_amount: number
        currency: string
    }

    items: InvoiceItem[]

    payment: {
        method: string
        method_label: string
        gateway: string
        gateway_label: string
        status: string
        paid_at: string | null
        installments: number | null
    }

    period: {
        start: string | null
        end: string | null
    } | null

    notes: string | null
    footer: string
}

export interface InvoiceItem {
    code: string | null
    name: string
    description: string | null
    quantity: number
    unit_price: number
    total: number
}

export interface CreatePurchaseInput {
    partner_id: string
    user_id?: string | null
    purchase_type: PurchaseType
    purchaseable_type?: string | null
    purchaseable_id?: string | null
    amount: number
    discount_amount?: number
    total_amount: number
    gateway?: GatewayName
    description?: string | null
    metadata?: Record<string, any>
    subscription_id?: string | null
    order_id?: string | null
}

export interface CreatePaymentInput {
    purchase_id: string
    amount: number
    gateway?: GatewayName
    payment_method_type?: PaymentMethodType | null
    checkout_url?: string | null
    expires_at?: string | null
}

export interface PurchaseWithRelations extends BillingPurchase {
    payments?: BillingPayment[]
    invoice?: BillingInvoice | null
    partner_name?: string
    plan_name?: string
}

export interface BillingPageResult<T> {
    data: T[]
    nextCursor: string | null
    hasMore: boolean
}

export interface SortConfig {
    key: string
    direction: "asc" | "desc"
}

export interface BillingPageData {
    data: PurchaseWithRelations[]
    total: number
    page: number
    pageSize: number
}

export interface BillingFilters {
    purchase_type?: PurchaseType | 'all'
    status?: string
    gateway?: string
    partner_id?: string
    search?: string
    date_from?: string
    date_to?: string
}

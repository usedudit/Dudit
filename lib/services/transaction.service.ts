import type { SupabaseClient } from "@supabase/supabase-js"

type PaymentBreakdownEntry = {
    method?: string
    amount?: number
}

interface OrderDataForTransaction {
    order_number: string
    partner_id: string
    total_amount: number
    payment_method: string | null
    payment_provider?: string | null
    payment_breakdown?: PaymentBreakdownEntry[] | null
    payment_date?: string | null
    customer_name?: string | null
    customer_contact_id?: string | null
}

function normalizeMethod(value?: string | null) {
    const m = String(value || "").trim().toLowerCase()
    if (!m) return "desconhecido"
    if (m.includes("pix")) return "pix"
    if (m.includes("boleto") || m.includes("bolbradesco")) return "boleto"
    if (m.includes("cart") || m.includes("credito") || m.includes("débito") || m.includes("debito")) return "cartao"
    if (m.includes("dinheiro")) return "dinheiro"
    return m
}

function normalizePaymentLabel(value?: string | null) {
    const normalized = normalizeMethod(value)
    if (normalized === "pix") return "Pix"
    if (normalized === "boleto") return "Boleto"
    if (normalized === "cartao") return "Cartão"
    if (normalized === "dinheiro") return "Dinheiro"
    return String(value || "Desconhecido")
}

function calculateFee(amount: number, paymentMethod: string | null, paymentProvider?: string | null): number {
    const isMercadoPago = String(paymentProvider || "").toLowerCase().includes("mercado pago")
    if (!isMercadoPago) return 0

    const normalizedMethod = normalizeMethod(paymentMethod)
    if (normalizedMethod === "pix") {
        return Math.round(amount * 0.0099 * 100) / 100
    }
    if (normalizedMethod === "boleto") {
        return 3.5
    }
    return 0
}

async function resolveTransactionContactId(
    supabase: SupabaseClient,
    data: OrderDataForTransaction,
): Promise<string | null> {
    // Para vendas, não usamos transaction_contacts.
    // O cliente deve ser resolvido diretamente de orders/customers na camada de leitura.
    return null
}

async function resolveMercadoPagoAccountId(
    supabase: SupabaseClient,
    partnerId: string,
    paymentProvider?: string | null,
) {
    const isMercadoPago = String(paymentProvider || "").toLowerCase().includes("mercado pago")
    if (!isMercadoPago) return null

    const { data } = await supabase
        .from("finance_accounts")
        .select("id")
        .eq("partner_id", partnerId)
        .ilike("name", "Mercado Pago")
        .limit(1)
        .maybeSingle()

    return data?.id || null
}

function buildEntries(orderData: OrderDataForTransaction): Array<{ method: string; amount: number }> {
    const fromBreakdown = (orderData.payment_breakdown || [])
        .map((entry) => ({
            method: normalizePaymentLabel(entry.method),
            amount: Number(entry.amount || 0),
        }))
        .filter((entry) => entry.amount > 0.009)

    if (fromBreakdown.length > 0) return fromBreakdown

    return [{
        method: normalizePaymentLabel(orderData.payment_method),
        amount: Number(orderData.total_amount || 0),
    }]
}

export async function createTransactionFromOrder(
    supabase: SupabaseClient,
    orderData: OrderDataForTransaction,
): Promise<void> {
    try {
        const now = new Date().toISOString()
        const paymentDate = orderData.payment_date || now
        const entries = buildEntries(orderData)
        const contactId = await resolveTransactionContactId(supabase, orderData)
        const accountId = await resolveMercadoPagoAccountId(supabase, orderData.partner_id, orderData.payment_provider)

        for (const [index, entry] of entries.entries()) {
            const amount = Number(entry.amount || 0)
            if (!(amount > 0.009)) continue

            // Deduplicação por payload principal para evitar repetição em webhook + sync.
            const { data: existing } = await supabase
                .from("transactions")
                .select("id")
                .eq("partner_id", orderData.partner_id)
                .eq("description", orderData.order_number)
                .eq("category", "Vendas")
                .eq("transaction_type", "income")
                .eq("payment_type", entry.method)
                .eq("amount", amount)
                .eq("payment_date", paymentDate)
                .limit(1)
                .maybeSingle()

            if (existing) {
                continue
            }

            const feeAmount = calculateFee(amount, entry.method, orderData.payment_provider)
            const transactionData = {
                partner_id: orderData.partner_id,
                description: orderData.order_number,
                category: "Vendas",
                contact_id: contactId,
                contact_type: "customer",
                amount,
                due_date: paymentDate,
                payment_date: paymentDate,
                status: "paid",
                notes: null,
                installment_number: entries.length > 1 ? (index + 1) : null,
                total_installments: entries.length > 1 ? entries.length : null,
                original_amount: amount,
                interest_amount: null,
                fee_amount: feeAmount,
                payment_type: entry.method,
                transaction_type: "income" as const,
                account_id: accountId,
            }

            const { error } = await supabase.from("transactions").insert(transactionData)
            if (error) {
                console.error(`[TRANSACTION] Erro ao criar transaction do pedido ${orderData.order_number}:`, error.message)
            }
        }
    } catch (err: any) {
        console.error("[TRANSACTION] Erro inesperado ao criar transaction:", err.message)
    }
}

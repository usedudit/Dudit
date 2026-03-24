import type { SupabaseClient } from "@supabase/supabase-js"

interface OrderDataForTransaction {
    order_number: string
    partner_id: string
    total_amount: number
    payment_method: string | null
    payment_date?: string | null
    notes?: string | null
    customer_name?: string | null
}

/**
 * Calcula o fee_amount baseado no método de pagamento (Mercado Pago).
 * - Pix: 0.99% do valor total
 * - Boleto: R$3,49 fixo
 * - Outros: 0
 */
function calculateFee(amount: number, paymentMethod: string | null): number {
    if (!paymentMethod) return 0

    const normalizedMethod = paymentMethod.toLowerCase().trim()

    // Pix via Mercado Pago = 0.99%
    if (normalizedMethod.includes("pix")) {
        return Math.round(amount * 0.0099 * 100) / 100
    }

    // Boleto = R$3,49 fixo
    if (normalizedMethod.includes("boleto") || normalizedMethod.includes("bolbradesco")) {
        return 3.49
    }

    return 0
}

/**
 * Cria uma transaction do tipo "income" a partir de um pedido pago.
 *
 * Esta função é "fire-and-forget": se falhar, loga o erro e NÃO bloqueia
 * o fluxo do pedido. Também verifica duplicatas antes de inserir.
 *
 * @param supabase - Supabase client (pode ser admin ou autenticado)
 * @param orderData - Dados do pedido necessários para a transaction
 */
export async function createTransactionFromOrder(
    supabase: SupabaseClient,
    orderData: OrderDataForTransaction,
): Promise<void> {
    try {
        // Guard: verificar duplicata pelo order_number na description
        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("partner_id", orderData.partner_id)
            .eq("description", orderData.order_number)
            .eq("category", "Vendas")
            .limit(1)
            .maybeSingle()

        if (existing) {
            console.log(`[TRANSACTION] ⚠️ Transaction já existe para pedido ${orderData.order_number}, pulando`)
            return
        }

        const amount = Number(orderData.total_amount)
        const feeAmount = calculateFee(amount, orderData.payment_method)
        const now = new Date().toISOString()

        const transactionData = {
            partner_id: orderData.partner_id,
            description: orderData.order_number,
            category: "Vendas",
            contact_id: null,
            amount: amount,
            due_date: null,
            payment_date: orderData.payment_date || now,
            status: "Recebido",
            notes: orderData.notes || null,
            installment_number: null,
            total_installments: null,
            original_amount: amount,
            interest_amount: 0,
            fee_amount: feeAmount,
            payment_type: orderData.payment_method || "Desconhecido",
            transaction_type: "income" as const,
        }

        const { error } = await supabase.from("transactions").insert(transactionData)

        if (error) {
            console.error(`[TRANSACTION] ❌ Erro ao criar transaction para pedido ${orderData.order_number}:`, error.message)
            return
        }

        console.log(`[TRANSACTION] ✅ Transaction criada para pedido ${orderData.order_number} (fee: R$${feeAmount.toFixed(2)})`)
    } catch (err: any) {
        console.error(`[TRANSACTION] ❌ Erro inesperado ao criar transaction:`, err.message)
    }
}

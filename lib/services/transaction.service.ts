import type { SupabaseClient } from "@supabase/supabase-js"
import type { PaymentBreakdownEntry } from "@/lib/payments/financial-engine"

interface OrderDataForTransaction {
    order_number: string
    partner_id: string
    total_amount: number
    payment_method: string | null
    payment_provider?: string | null
    payment_breakdown?: Partial<PaymentBreakdownEntry>[] | null
    payment_date?: string | null
    customer_name?: string | null
    customer_id?: string | null
    finance_account_id?: string | null
    order_source?: string | null
    reference_note?: string
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

async function resolveDefaultSalesAccountId(
    supabase: SupabaseClient,
    partnerId: string,
): Promise<string | null> {
    const { data: accounts } = await supabase
        .from("finance_accounts")
        .select("id, type, is_default")
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .or("integration_source.is.null,integration_source.neq.mercadopago")
        .order("created_at", { ascending: true })

    if (!accounts || accounts.length === 0) return null
    const bankDefault = accounts.find((a: any) => a.type === "bank" && a.is_default)
    if (bankDefault?.id) return bankDefault.id
    const cashDefault = accounts.find((a: any) => a.type === "cash" && a.is_default)
    if (cashDefault?.id) return cashDefault.id
    const anyBank = accounts.find((a: any) => a.type === "bank")
    if (anyBank?.id) return anyBank.id
    const anyCash = accounts.find((a: any) => a.type === "cash")
    if (anyCash?.id) return anyCash.id
    return (accounts[0] as any)?.id || null
}

async function applyAccountBalanceDelta(
    supabase: SupabaseClient,
    partnerId: string,
    accountId: string | null,
    amount: number,
) {
    if (!accountId || !(amount > 0)) return
    const { error } = await supabase.rpc("apply_account_balance_delta", {
        p_account_id: accountId,
        p_partner_id: partnerId,
        p_delta: Math.round(amount * 100) / 100,
    })
    if (error) {
        console.error("[TRANSACTION] Erro ao atualizar saldo da conta:", error.message)
    }
}

function buildEntries(orderData: OrderDataForTransaction): Array<{ method: string; amount: number; paymentMethodId: string | null; installmentNumber: number }> {
    const fromBreakdown = (orderData.payment_breakdown || [])
        .map((entry) => ({
            method: normalizePaymentLabel(entry.method),
            amount: Number(entry.amount || 0),
            paymentMethodId: entry.paymentMethodId || null,
            installmentNumber: Math.max(1, Math.floor(Number(entry.installmentNumber || 1))),
        }))
        .filter((entry) => entry.amount > 0.009)

    if (fromBreakdown.length > 0) return fromBreakdown

    return [{
        method: normalizePaymentLabel(orderData.payment_method),
        amount: Number(orderData.total_amount || 0),
        paymentMethodId: null,
        installmentNumber: 1,
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
        const explicitAccountId = orderData.finance_account_id || null
        const mercadoPagoAccountId = await resolveMercadoPagoAccountId(supabase, orderData.partner_id, orderData.payment_provider)
        const defaultSalesAccountId = explicitAccountId || mercadoPagoAccountId
            ? null
            : await resolveDefaultSalesAccountId(supabase, orderData.partner_id)
        const accountId = explicitAccountId || mercadoPagoAccountId || defaultSalesAccountId

        // Build deterministic reference_note keys for each entry.
        // Format: "sale-tx:{order_number}:{index}" - unique per entry, stable across retries.
        const entriesWithRef = entries.map((entry, index) => ({
            ...entry,
            referenceNote: orderData.reference_note || `sale-tx:${orderData.order_number}:${index}`,
        }))

        // Batch dedup: single query to find all already-created transactions for this order
        const refNotes = entriesWithRef.map(e => e.referenceNote)
        const { data: existingTxs } = await supabase
            .from("transactions")
            .select("reference_note")
            .eq("partner_id", orderData.partner_id)
            .in("reference_note", refNotes)

        const existingRefs = new Set(
            (existingTxs || []).map((t: any) => String(t.reference_note))
        )

        for (const [index, entry] of entriesWithRef.entries()) {
            const amount = Number(entry.amount || 0)
            if (!(amount > 0.009)) continue

            // Skip if this exact entry was already created (retry/webhook dedup)
            if (existingRefs.has(entry.referenceNote)) continue

            // `payment_breakdown` already carries the net charged amount calculated by checkout.
            // Reapplying payment-method pricing here causes double discount/fee.
            const calculated = { finalAmount: amount, interestAmount: 0, feeAmount: 0 }
            const transactionData = {
                partner_id: orderData.partner_id,
                description: orderData.order_number,
                category: "Vendas",
                contact_id: null,
                contact_type: "customer",
                customer_id: orderData.customer_id || null,
                amount: calculated.finalAmount,
                due_date: null,
                payment_date: paymentDate,
                status: "paid",
                notes: null,
                installment_number: entries.length > 1 ? (index + 1) : null,
                total_installments: entries.length > 1 ? entries.length : null,
                original_amount: amount,
                interest_amount: calculated.interestAmount,
                fee_amount: calculated.feeAmount,
                payment_type: entry.method,
                payment_method_id: entry.paymentMethodId || null,
                transaction_type: "income" as const,
                origin: orderData.order_source || "manual",
                account_id: accountId,
                reference_note: entry.referenceNote,
            }

            const { error } = await supabase.from("transactions").insert(transactionData)
            if (error) {
                console.error(`[TRANSACTION] Erro ao criar transaction do pedido ${orderData.order_number}:`, error.message)
                continue
            }
            await applyAccountBalanceDelta(supabase, orderData.partner_id, accountId, calculated.finalAmount)
        }
    } catch (err: any) {
        console.error("[TRANSACTION] Erro inesperado ao criar transaction:", err.message)
    }
}

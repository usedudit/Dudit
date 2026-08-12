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
    order_id?: string | null
    store_id?: string | null
    mp_payment_id?: string | null
}

type LedgerEntry = {
    method: string
    gross: number
    net: number
    cost: number
    isMercadoPago: boolean
    paymentMethodId: string | null
    installmentNumber: number
    interestAmount: number
    feeAmount: number
    fixedFeeAmount: number
    discountAmount: number
    provider: string | null
    paymentStatus: string | null
    paymentTypeId: string | null
    feeDetails: Array<{ type: string; amount: number; feePayer: string }> | null
}

const round2 = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100

function addMonthsIso(isoDate: string, months: number): string {
    const date = new Date(isoDate)
    date.setMonth(date.getMonth() + months)
    return date.toISOString()
}

function splitNetAmount(total: number, parts: number): number[] {
    if (parts <= 1) return [round2(total)]
    const base = round2(total / parts)
    const last = round2(total - base * (parts - 1))
    return Array.from({ length: parts }, (_, i) => (i === parts - 1 ? last : base))
}

function normalizeOrigin(raw?: string | null): string {
    const allowed = new Set(["manual", "system", "gateway"])
    const value = String(raw || "").trim().toLowerCase()
    if (allowed.has(value)) return value
    return "manual"
}

function normalizeMethod(value?: string | null) {
    const m = String(value || "").trim().toLowerCase()
    if (!m) return "desconhecido"
    if (m.includes("pix")) return "pix"
    if (m.includes("boleto") || m.includes("bolbradesco")) return "boleto"
    if (m.includes("cart") || m.includes("credito") || m.includes("débito") || m.includes("debito")) return "cartao"
    if (m.includes("dinheiro") || m.includes("cash")) return "dinheiro"
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
    if (!accountId || !(Math.abs(amount) > 0.0001)) return
    const { error } = await supabase.rpc("apply_account_balance_delta", {
        p_account_id: accountId,
        p_partner_id: partnerId,
        p_delta: Math.round(amount * 100) / 100,
    })
    if (error) {
        console.error("[TRANSACTION] Erro ao atualizar saldo da conta:", error.message)
    }
}

function buildEntries(orderData: OrderDataForTransaction): LedgerEntry[] {
    const fromBreakdown = (orderData.payment_breakdown || [])
        .map((entry) => {
            const gross = round2(Number(entry.amount ?? entry.effectiveAmount ?? 0))
            const isMercadoPago = String(entry.provider || orderData.payment_provider || "")
                .toLowerCase()
                .includes("mercado pago")
            // MP: amountReceived = líquido recebido (net_received_amount).
            // Manual: netAmount = líquido do financial engine; amountReceived = base.
            const netRaw = isMercadoPago
                ? Number(entry.amountReceived ?? 0)
                : Number(entry.netAmount ?? entry.amountReceived ?? 0)
            const net = netRaw > 0.009 ? round2(netRaw) : gross

            return {
                method: normalizePaymentLabel(entry.method),
                gross,
                net,
                cost: round2(gross - net),
                isMercadoPago,
                paymentMethodId: entry.paymentMethodId || null,
                installmentNumber: Math.min(48, Math.max(1, Math.floor(Number(entry.installmentNumber || 1)))),
                interestAmount: round2(Number(entry.interestAmount || 0)),
                feeAmount: round2(Number(entry.feeAmount || 0)),
                fixedFeeAmount: round2(Number(entry.fixedFeeAmount || 0)),
                discountAmount: entry.adjustmentType === "discount"
                    ? round2(Number(entry.adjustmentAmount || 0))
                    : 0,
                provider: entry.provider || null,
                paymentStatus: entry.paymentStatus || null,
                paymentTypeId: entry.paymentTypeId || null,
                feeDetails: Array.isArray(entry.feeDetails) && entry.feeDetails.length > 0
                    ? entry.feeDetails
                    : null,
            }
        })
        .filter((entry) => entry.gross > 0.009)

    if (fromBreakdown.length > 0) return fromBreakdown

    const gross = round2(Number(orderData.total_amount || 0))
    return [{
        method: normalizePaymentLabel(orderData.payment_method),
        gross,
        net: gross,
        cost: 0,
        isMercadoPago: false,
        paymentMethodId: null,
        installmentNumber: 1,
        interestAmount: 0,
        feeAmount: 0,
        fixedFeeAmount: 0,
        discountAmount: 0,
        provider: null,
        paymentStatus: null,
        paymentTypeId: null,
        feeDetails: null,
    }]
}

function mapMpPaymentStatus(status: string | null | undefined): string {
    const s = String(status || "").toLowerCase()
    if (["approved", "rejected", "refunded", "charged_back", "cancelled", "expired"].includes(s)) return s
    return "pending"
}

/**
 * Camada de gateway (payments): 1 registro por pagamento MP, idempotente por
 * `mp:{partner}:{mp_payment_id}`. Criado no checkout (bruto) e refinado quando
 * o webhook chega com taxas/líquido. Fluxos manuais não geram payments.
 */
async function resolveOrCreatePaymentRow(
    supabase: SupabaseClient,
    orderData: OrderDataForTransaction,
    entries: LedgerEntry[],
): Promise<string | null> {
    const isMercadoPago = String(orderData.payment_provider || "").toLowerCase().includes("mercado pago")
        || entries.some((entry) => entry.isMercadoPago)
    if (!isMercadoPago || !orderData.mp_payment_id) return null

    const idempotencyKey = `mp:${orderData.partner_id}:${orderData.mp_payment_id}`

    const { data: existing } = await supabase
        .from("payments")
        .select("id, provider_status, provider_payment_type")
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle()

    const totalGross = round2(entries.reduce((sum, entry) => sum + entry.gross, 0))
    const totalNet = round2(entries.reduce((sum, entry) => sum + entry.net, 0))
    const totalCost = round2(totalGross - totalNet)
    const maxInstallments = Math.min(48, Math.max(1, ...entries.map((entry) => entry.installmentNumber)))
    const firstWithDetails = entries.find((entry) => entry.feeDetails)?.feeDetails || null
    const firstStatus = entries.find((entry) => entry.paymentStatus)?.paymentStatus || null
    const firstPaymentType = entries.find((entry) => entry.paymentTypeId)?.paymentTypeId || null
    const firstPaymentMethodId = entries.find((entry) => entry.paymentMethodId)?.paymentMethodId || null

    if (existing?.id) {
        if (totalCost > 0.009) {
            const refinedStatus = mapMpPaymentStatus(firstStatus || existing.provider_status)
            const { error } = await supabase
                .from("payments")
                .update({
                    amount: totalGross,
                    base_amount: totalGross,
                    interest_amount: round2(entries.reduce((sum, entry) => sum + entry.interestAmount, 0)),
                    discount_amount: round2(entries.reduce((sum, entry) => sum + entry.discountAmount, 0)),
                    fee_amount: round2(entries.reduce((sum, entry) => sum + entry.feeAmount, 0)),
                    fixed_fee_amount: round2(entries.reduce((sum, entry) => sum + entry.fixedFeeAmount, 0)),
                    net_amount: totalNet,
                    fee_details: firstWithDetails || {},
                    installment_count: maxInstallments,
                    installments_selected: maxInstallments,
                    status: refinedStatus,
                    approved_at: refinedStatus === "approved"
                        ? (orderData.payment_date || new Date().toISOString())
                        : null,
                    provider_status: firstStatus || existing.provider_status,
                    provider_payment_type: firstPaymentType || existing.provider_payment_type,
                })
                .eq("id", existing.id)
            if (error) {
                console.error("[TRANSACTION] Erro ao refinar pagamento gateway:", error.message)
            }
        }
        return existing.id
    }

    const paymentStatus = mapMpPaymentStatus(firstStatus)
    const { data: inserted, error } = await supabase
        .from("payments")
        .insert({
            partner_id: orderData.partner_id,
            store_id: orderData.store_id || null,
            order_id: orderData.order_id || null,
            customer_id: orderData.customer_id || null,
            payment_method_id: firstPaymentMethodId,
            provider: "mercado_pago",
            provider_payment_id: orderData.mp_payment_id,
            provider_status: firstStatus,
            provider_payment_type: firstPaymentType,
            amount: totalGross,
            base_amount: totalGross,
            interest_amount: round2(entries.reduce((sum, entry) => sum + entry.interestAmount, 0)),
            discount_amount: round2(entries.reduce((sum, entry) => sum + entry.discountAmount, 0)),
            fee_amount: round2(entries.reduce((sum, entry) => sum + entry.feeAmount, 0)),
            fixed_fee_amount: round2(entries.reduce((sum, entry) => sum + entry.fixedFeeAmount, 0)),
            net_amount: totalNet,
            fee_details: firstWithDetails || {},
            installment_count: maxInstallments,
            installments_selected: maxInstallments,
            status: paymentStatus,
            amount_refunded: 0,
            approved_at: paymentStatus === "approved"
                ? (orderData.payment_date || new Date().toISOString())
                : null,
            idempotency_key: idempotencyKey,
        })
        .select("id")
        .single()

    if (error) {
        console.error("[TRANSACTION] Erro ao registrar pagamento gateway:", error.message)
        return null
    }
    return inserted?.id || null
}

async function createInstallmentGroupForSale(
    supabase: SupabaseClient,
    orderData: OrderDataForTransaction,
    entry: LedgerEntry,
    accountId: string | null,
    paymentRowId: string | null,
    startDate: string,
): Promise<string | null> {
    try {
        let query = supabase
            .from("installment_groups")
            .select("id")
            .eq("partner_id", orderData.partner_id)
        query = orderData.order_id
            ? query.eq("order_id", orderData.order_id)
            : query.eq("description", orderData.order_number)
        const { data: existingGroup } = await query
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
        if (existingGroup?.id) return existingGroup.id

        const { data: insertedGroup, error } = await supabase
            .from("installment_groups")
            .insert({
                partner_id: orderData.partner_id,
                store_id: orderData.store_id || null,
                description: orderData.order_number,
                total_amount: entry.net,
                installments_count: entry.installmentNumber,
                frequency: "monthly",
                interval: 1,
                interval_value: 1,
                start_date: startDate,
                account_id: accountId,
                payment_method_id: entry.paymentMethodId,
                order_id: orderData.order_id || null,
                payment_id: paymentRowId,
                customer_id: orderData.customer_id || null,
            })
            .select("id")
            .single()

        if (error) {
            console.error(`[TRANSACTION] Erro ao criar grupo de parcelas do pedido ${orderData.order_number}:`, error.message)
            return null
        }
        return insertedGroup?.id || null
    } catch (err: any) {
        console.error("[TRANSACTION] Erro inesperado ao criar grupo de parcelas:", err.message)
        return null
    }
}

/**
 * Upgrade do ledger quando o webhook chega DEPOIS do checkout com dados de
 * taxa/líquido (aprovação instantânea: pix/crédito aprova no checkout com
 * bruto; o webhook refina para líquido). Idempotente: só ajusta quando o
 * settlement ainda está com o valor bruto.
 */
async function refineLedgerEntry(
    supabase: SupabaseClient,
    orderData: OrderDataForTransaction,
    saleEntry: LedgerEntry,
    ctx: {
        recognitionRef: string
        feeRef: string
        settlementRef: string
        installments: number
        existingByNote: Map<string, any>
        accountId: string | null
        paymentRowId: string | null
        recognitionTx: any
    },
): Promise<void> {
    if (!(saleEntry.cost > 0.009)) return

    if (ctx.recognitionTx) {
        const recognitionUpdate: Record<string, unknown> = {
            fee_amount: round2(saleEntry.feeAmount + saleEntry.fixedFeeAmount),
            interest_amount: saleEntry.interestAmount,
        }
        if (ctx.paymentRowId && !ctx.recognitionTx.payment_id) {
            recognitionUpdate.payment_id = ctx.paymentRowId
        }
        await supabase.from("transactions").update(recognitionUpdate).eq("id", ctx.recognitionTx.id)
    }

    if (!ctx.existingByNote.has(ctx.feeRef)) {
        await supabase.from("transactions").insert({
            partner_id: orderData.partner_id,
            store_id: orderData.store_id || null,
            description: orderData.order_number,
            category: "Taxas de Pagamento",
            contact_id: null,
            contact_type: "customer",
            customer_id: orderData.customer_id || null,
            amount: saleEntry.cost,
            original_amount: saleEntry.cost,
            due_date: null,
            payment_date: orderData.payment_date || new Date().toISOString(),
            status: "paid",
            notes: null,
            installment_number: null,
            total_installments: null,
            interest_amount: saleEntry.interestAmount,
            fee_amount: round2(saleEntry.feeAmount + saleEntry.fixedFeeAmount),
            discount_amount: saleEntry.discountAmount,
            payment_type: saleEntry.method,
            payment_method_id: saleEntry.paymentMethodId,
            transaction_type: "expense" as const,
            origin: normalizeOrigin(orderData.order_source),
            account_id: null,
            kind: "fee" as const,
            payment_id: ctx.paymentRowId,
            reference_note: ctx.feeRef,
        })
    }

    if (ctx.installments > 1) {
        const parts = splitNetAmount(saleEntry.net, ctx.installments)
        for (let n = 1; n <= ctx.installments; n++) {
            const settlementTx = ctx.existingByNote.get(`${ctx.settlementRef}:${n}`)
            if (!settlementTx) continue
            const target = parts[n - 1]
            const current = round2(Number(settlementTx.amount || 0))
            if (Math.abs(current - target) > 0.005) {
                await supabase
                    .from("transactions")
                    .update({ amount: target, original_amount: target })
                    .eq("id", settlementTx.id)
            }
        }
    } else {
        const settlementTx = ctx.existingByNote.get(ctx.settlementRef)
        if (settlementTx) {
            const current = round2(Number(settlementTx.amount || 0))
            const stillGross = Math.abs(current - saleEntry.gross) <= 0.005
            if (Math.abs(current - saleEntry.net) > 0.005 && stillGross) {
                await supabase
                    .from("transactions")
                    .update({ amount: saleEntry.net, original_amount: saleEntry.net })
                    .eq("id", settlementTx.id)
                await applyAccountBalanceDelta(supabase, orderData.partner_id, ctx.accountId, -saleEntry.cost)
            }
        }
    }
}

/**
 * Ledger único de venda (Fase 2). Para cada entrada do payment_breakdown:
 *   recognition = DRE bruto (income paid, NÃO move saldo)
 *   fee         = despesa DRE do gateway (expense paid, NÃO move saldo)
 *   settlement  = ÚNICO evento de caixa (valor líquido)
 *                - à vista: 1 settlement paid D+0 (move saldo +net)
 *                - parcelado: installment_groups + N settlements pending
 *                             (contas a receber; liquidadas via settle RPC)
 * Registros legados (reference_note sem sufixo de ledger) nunca são misturados:
 * se o fluxo antigo já processou a entrada, ela é ignorada (zero duplicação).
 * Idempotente por reference_note (retries de webhook/checkout são seguros).
 */
export async function createTransactionFromOrder(
    supabase: SupabaseClient,
    orderData: OrderDataForTransaction,
): Promise<void> {
    try {
        const now = new Date().toISOString()
        const paymentDate = orderData.payment_date || now
        const entries = buildEntries(orderData)
        const explicitAccountId = orderData.finance_account_id || null
        // These are independent reads. When an explicit account is absent,
        // resolve both candidates in parallel and choose the same priority as
        // before once both have returned.
        const mercadoPagoAccountPromise = resolveMercadoPagoAccountId(supabase, orderData.partner_id, orderData.payment_provider)
        const defaultSalesAccountPromise = explicitAccountId
            ? Promise.resolve(null)
            : resolveDefaultSalesAccountId(supabase, orderData.partner_id)
        const [mercadoPagoAccountId, defaultSalesAccountId] = await Promise.all([
            mercadoPagoAccountPromise,
            defaultSalesAccountPromise,
        ])
        const accountId = explicitAccountId || mercadoPagoAccountId || defaultSalesAccountId

        const paymentRowId = await resolveOrCreatePaymentRow(supabase, orderData, entries)

        for (const [index, entry] of entries.entries()) {
            if (!(entry.gross > 0.009)) continue

            const baseRef = orderData.reference_note || `sale-tx:${orderData.order_number}:${index}`
            const recognitionRef = `${baseRef}:recognition`
            const feeRef = `${baseRef}:fee`
            const settlementRef = `${baseRef}:settlement`
            const installments = entry.installmentNumber

            const refNotes = [
                baseRef,
                recognitionRef,
                feeRef,
                settlementRef,
                ...Array.from({ length: installments }, (_, i) => `${settlementRef}:${i + 1}`),
            ]

            const { data: existingTxs } = await supabase
                .from("transactions")
                .select("id, kind, status, amount, original_amount, reference_note, payment_id")
                .eq("partner_id", orderData.partner_id)
                .in("reference_note", refNotes)

            const existingByNote = new Map<string, any>(
                (existingTxs || []).map((tx: any) => [String(tx.reference_note), tx]),
            )

            // Fluxo antigo (legado) já processou esta entrada → não misturar modelos
            if (existingByNote.has(baseRef)) continue

            // Idempotência do ledger: se qualquer linha desta entrada já existe
            // (fee/settlement), a entrada já foi totalmente processada → não duplicar.
            // (Recognition sozinho ainda pode estar no caminho de refine.)
            const hasLedgerEntry = [feeRef, settlementRef, ...Array.from({ length: installments }, (_, i) => `${settlementRef}:${i + 1}`)]
                .some((ref) => existingByNote.has(ref))
            if (hasLedgerEntry) continue

            const recognitionTx = existingByNote.get(recognitionRef)

            if (recognitionTx) {
                // Ledger já criado (ex: aprovação no checkout) → refinar com fees/líquido
                await refineLedgerEntry(supabase, orderData, entry, {
                    recognitionRef,
                    feeRef,
                    settlementRef,
                    installments,
                    existingByNote,
                    accountId,
                    paymentRowId,
                    recognitionTx,
                })
                continue
            }

            // 1) Registro único de liquidação da venda (Fase 2 simplificada)
            // Cria apenas 1 transação por pagamento. Sem vencimento (due_date = null) para vendas pagas à vista.
            if (installments > 1) {
                const groupId = await createInstallmentGroupForSale(
                    supabase,
                    orderData,
                    entry,
                    accountId,
                    paymentRowId,
                    paymentDate,
                )
                const parts = splitNetAmount(entry.net, installments)
                for (let n = 1; n <= installments; n++) {
                    const { error: settleError } = await supabase.from("transactions").insert({
                        partner_id: orderData.partner_id,
                        store_id: orderData.store_id || null,
                        description: orderData.order_number,
                        category: "Vendas",
                        contact_id: null,
                        contact_type: "customer",
                        customer_id: orderData.customer_id || null,
                        amount: parts[n - 1],
                        original_amount: parts[n - 1],
                        due_date: addMonthsIso(paymentDate, n - 1),
                        payment_date: null,
                        status: "pending",
                        notes: null,
                        installment_number: n,
                        total_installments: installments,
                        interest_amount: 0,
                        fee_amount: 0,
                        discount_amount: 0,
                        payment_type: entry.method,
                        payment_method_id: entry.paymentMethodId,
                        transaction_type: "income" as const,
                        origin: normalizeOrigin(orderData.order_source),
                        account_id: accountId,
                        kind: "settlement" as const,
                        payment_id: paymentRowId,
                        installment_group_id: groupId,
                        reference_note: `${settlementRef}:${n}`,
                    })
                    if (settleError) {
                        console.error(`[TRANSACTION] Erro ao criar parcela ${n} do pedido ${orderData.order_number}:`, settleError.message)
                    }
                }
            } else {
                const { error: settleError } = await supabase.from("transactions").insert({
                    partner_id: orderData.partner_id,
                    store_id: orderData.store_id || null,
                    description: orderData.order_number,
                    category: "Vendas",
                    contact_id: null,
                    contact_type: "customer",
                    customer_id: orderData.customer_id || null,
                    amount: entry.gross,
                    original_amount: entry.gross,
                    due_date: null,
                    payment_date: paymentDate,
                    status: "paid",
                    notes: null,
                    installment_number: null,
                    total_installments: null,
                    interest_amount: entry.interestAmount,
                    fee_amount: round2(entry.feeAmount + entry.fixedFeeAmount),
                    discount_amount: entry.discountAmount,
                    payment_type: entry.method,
                    payment_method_id: entry.paymentMethodId,
                    transaction_type: "income" as const,
                    origin: normalizeOrigin(orderData.order_source),
                    account_id: accountId,
                    kind: "settlement" as const,
                    payment_id: paymentRowId,
                    reference_note: settlementRef,
                })
                if (settleError) {
                    console.error(`[TRANSACTION] Erro ao criar liquidação do pedido ${orderData.order_number}:`, settleError.message)
                } else {
                    await applyAccountBalanceDelta(supabase, orderData.partner_id, accountId, entry.net)
                }
            }
        }
    } catch (err: any) {
        console.error("[TRANSACTION] Erro inesperado ao criar transaction:", err.message)
    }
}

export async function syncReceivableForOrder(
    supabase: SupabaseClient,
    orderData: {
        order_number: string
        partner_id: string
        store_id?: string | null
        total_amount: number
        paid_amount: number
        situation: string
        payment_method?: string | null
        customer_id?: string | null
        customer_name?: string | null
        finance_account_id?: string | null
        order_source?: string | null
        due_date?: string | null
    }
): Promise<void> {
    try {
        const total = Math.max(0, Number(orderData.total_amount || 0))
        const paid = Math.max(0, Number(orderData.paid_amount || 0))
        const unpaidBalance = Math.max(0, Math.round((total - paid) * 100) / 100)
        const refNote = `sale-receivable:${orderData.order_number}`

        const { data: existingTx } = await supabase
            .from("transactions")
            .select("id, status, amount")
            .eq("partner_id", orderData.partner_id)
            .eq("reference_note", refNote)
            .maybeSingle()

        if (unpaidBalance <= 0.009 || orderData.situation === "paid" || orderData.situation === "cancelled") {
            if (existingTx && existingTx.status === "pending") {
                await supabase
                    .from("transactions")
                    .delete()
                    .eq("id", existingTx.id)
            }
            return
        }

        const explicitAccountId = orderData.finance_account_id || null
        const defaultSalesAccountId = explicitAccountId
            ? null
            : await resolveDefaultSalesAccountId(supabase, orderData.partner_id)
        const accountId = explicitAccountId || defaultSalesAccountId

        const defaultDueDate = new Date()
        defaultDueDate.setDate(defaultDueDate.getDate() + 30)
        const dueDate = orderData.due_date ? new Date(orderData.due_date).toISOString() : defaultDueDate.toISOString()
        const paymentType = normalizePaymentLabel(orderData.payment_method)

        if (existingTx) {
            if (existingTx.status === "pending") {
                await supabase
                    .from("transactions")
                    .update({
                        amount: unpaidBalance,
                        original_amount: unpaidBalance,
                        due_date: dueDate,
                        customer_id: orderData.customer_id || null,
                        account_id: accountId,
                        store_id: orderData.store_id || null,
                        payment_type: paymentType,
                        kind: "settlement",
                    })
                    .eq("id", existingTx.id)
            }
        } else {
            const transactionData = {
                partner_id: orderData.partner_id,
                store_id: orderData.store_id || null,
                description: orderData.order_number,
                category: "Vendas",
                contact_id: null,
                contact_type: "customer",
                customer_id: orderData.customer_id || null,
                amount: unpaidBalance,
                original_amount: unpaidBalance,
                due_date: dueDate,
                payment_date: null,
                status: "pending",
                notes: null,
                installment_number: null,
                total_installments: null,
                interest_amount: 0,
                fee_amount: 0,
                discount_amount: 0,
                payment_type: paymentType,
                payment_method_id: null,
                transaction_type: "income" as const,
                origin: normalizeOrigin(orderData.order_source),
                account_id: accountId,
                reference_note: refNote,
                kind: "settlement" as const,
            }

            const { error } = await supabase.from("transactions").insert(transactionData)
            if (error) {
                console.error(`[TRANSACTION] Erro ao criar conta a receber do pedido ${orderData.order_number}:`, error.message)
            }
        }
    } catch (err: any) {
        console.error("[TRANSACTION] Erro ao sincronizar conta a receber do pedido:", err.message)
    }
}

// ─── Reconciliação do ledger Fase 2 em refunds/devoluções ───────────────────
// NÃO cria novas transações e NÃO altera recognition/fee/refund existentes:
// apenas cancela ou reduz settlements (kind='settlement') PENDENTES da venda,
// que nunca moveram saldo - por isso não há ajuste de caixa aqui.
// Idempotente por reconcileKey: linhas já reconciliadas (marcadas nas notes)
// são puladas em execuções repetidas.

function isLedgerPendingStatus(status: string | null | undefined): boolean {
    const s = String(status || "").trim().toLowerCase()
    return s === "pending" || s === "pendente"
}

export async function findOrderSettlements(params: {
    supabase: SupabaseClient
    partnerId: string
    orderId?: string | null
    orderNumber?: string | null
}): Promise<any[]> {
    const { supabase } = params
    const paymentIds: string[] = []
    if (params.orderId) {
        const { data: payRows } = await supabase
            .from("payments")
            .select("id")
            .eq("partner_id", params.partnerId)
            .eq("order_id", params.orderId)
        if (payRows?.length) paymentIds.push(...payRows.map((p: any) => p.id))
    }

    let query = supabase
        .from("transactions")
        .select("id, status, amount, original_amount, due_date, installment_group_id, installment_number, reference_note, notes, payment_id")
        .eq("partner_id", params.partnerId)
        .eq("kind", "settlement")

    if (paymentIds.length > 0) query = query.in("payment_id", paymentIds)
    else if (params.orderNumber) query = query.eq("description", params.orderNumber)
    else return []

    const { data } = await query
    return data || []
}

async function auditLedgerReconciliation(params: {
    partnerId: string
    actorUserId?: string | null
    entityId: string
    actionType: string
    changeLines: string[]
    storeId?: string | null
}) {
    try {
        const { logAuditEvent } = await import("./timeline.service")
        await logAuditEvent({
            partnerId: params.partnerId,
            actorUserId: params.actorUserId || null,
            entityType: "transaction",
            entityId: params.entityId,
            actionType: params.actionType,
            changeLines: params.changeLines,
            metadata: { source: "ledger_reconciliation" },
            source: "manual",
            storeId: params.storeId || null,
        } as any)
    } catch (err) {
        console.error("[TRANSACTION] Erro ao registrar audit de reconciliação:", err)
    }
}

/**
 * Cancela todos os settlements PENDENTES da venda (refund integral, troca ou
 * cancelamento de pedido). Parcelas já quitadas NÃO são tocadas - o valor já
 * recebido é coberto pelo evento de refund gerado pelo fluxo existente.
 */
export async function cancelPendingSettlementsForOrder(params: {
    supabase: SupabaseClient
    partnerId: string
    orderId?: string | null
    orderNumber?: string | null
    reason?: string | null
    reconcileKey: string
    actorUserId?: string | null
}): Promise<{ cancelled: number }> {
    try {
        const { supabase } = params
        const settlements = await findOrderSettlements(params)
        const pending = settlements.filter(
            (s: any) => isLedgerPendingStatus(s.status) && !String(s.notes || "").includes(params.reconcileKey),
        )
        if (pending.length === 0) return { cancelled: 0 }

        const now = new Date().toISOString()
        const reason = params.reason ? ` - ${params.reason}` : ""
        let cancelled = 0

        for (const s of pending) {
            const existingNote = String(s.notes || "").trim()
            const { error } = await supabase
                .from("transactions")
                .update({
                    status: "cancelled",
                    notes: existingNote
                        ? `${existingNote} | Cancelado após refund/devolução (${params.reconcileKey})${reason}`
                        : `Cancelado após refund/devolução (${params.reconcileKey}) em ${now}${reason}`,
                })
                .eq("id", s.id)
                .eq("partner_id", params.partnerId)
            if (!error) {
                cancelled += 1
                await auditLedgerReconciliation({
                    partnerId: params.partnerId,
                    actorUserId: params.actorUserId,
                    entityId: s.id,
                    actionType: "cancelled",
                    changeLines: ["Settlement de venda cancelado após refund/devolução."],
                })
            }
        }
        return { cancelled }
    } catch (err: any) {
        console.error("[TRANSACTION] Erro ao cancelar settlements do pedido:", err.message)
        return { cancelled: 0 }
    }
}

/**
 * Refund parcial: reduz o saldo futuro a receber pelas parcelas PENDENTES,
 * começando da parcela mais distante (maior vencimento) para a mais próxima.
 * Parcela que zera é cancelada. Atualiza amount E original_amount para manter
 * a matemática de quitação (recordInstallmentPaymentAction usa original_amount).
 */
export async function reduceFutureSettlementsForRefund(params: {
    supabase: SupabaseClient
    partnerId: string
    orderId?: string | null
    orderNumber?: string | null
    refundAmount: number
    reason?: string | null
    reconcileKey: string
    actorUserId?: string | null
}): Promise<{ reduced: number; cancelled: number }> {
    try {
        const { supabase } = params
        let remaining = round2(Math.max(0, Number(params.refundAmount || 0)))
        if (remaining < 0.009) return { reduced: 0, cancelled: 0 }

        const settlements = await findOrderSettlements(params)
        const pendingAll = settlements.filter((s: any) => isLedgerPendingStatus(s.status))
        const pending = pendingAll
            .filter((s: any) => !String(s.notes || "").includes(params.reconcileKey))
            .sort((a: any, b: any) => {
                const da = a.due_date ? new Date(a.due_date).getTime() : 0
                const db = b.due_date ? new Date(b.due_date).getTime() : 0
                if (db !== da) return db - da
                return Number(b.installment_number || 0) - Number(a.installment_number || 0)
            })
        if (pending.length === 0) return { reduced: 0, cancelled: 0 }

        // Reivindica TODAS as pendentes com a chave ANTES de reduzir: re-execução
        // da mesma chave vira no-op total, mesmo que a primeira execução não tenha
        // tocado em todas as parcelas (evita aplicar o MESMO refund duas vezes em
        // parcelas ainda não marcadas). Chaves diferentes (novos refunds) seguem
        // processando normalmente.
        const now = new Date().toISOString()
        const claimNote = `Reconciliação de refund registrada (${params.reconcileKey})`
        for (const s of pendingAll) {
            const existingNote = String(s.notes || "").trim()
            await supabase
                .from("transactions")
                .update({ notes: existingNote ? `${existingNote} | ${claimNote}` : `${claimNote} em ${now}` })
                .eq("id", s.id)
                .eq("partner_id", params.partnerId)
        }

        const reason = params.reason ? ` - ${params.reason}` : ""
        let reduced = 0
        let cancelled = 0

        for (const s of pending) {
            if (remaining < 0.009) break
            const current = round2(Number(s.amount || 0))
            if (current <= 0.009) continue

            const existingNote = String(s.notes || "").trim()

            if (current <= remaining) {
                remaining = round2(remaining - current)
                const { error } = await supabase
                    .from("transactions")
                    .update({
                        status: "cancelled",
                        notes: existingNote
                            ? `${existingNote} | Parcela cancelada por refund parcial (${params.reconcileKey})${reason}`
                            : `Parcela cancelada por refund parcial (${params.reconcileKey}) em ${now}${reason}`,
                    })
                    .eq("id", s.id)
                    .eq("partner_id", params.partnerId)
                if (!error) {
                    cancelled += 1
                    await auditLedgerReconciliation({
                        partnerId: params.partnerId,
                        actorUserId: params.actorUserId,
                        entityId: s.id,
                        actionType: "cancelled",
                        changeLines: ["Parcela cancelada por refund parcial."],
                    })
                }
            } else {
                const newAmount = round2(current - remaining)
                remaining = 0
                const { error } = await supabase
                    .from("transactions")
                    .update({
                        amount: newAmount,
                        original_amount: newAmount,
                        notes: existingNote
                            ? `${existingNote} | Valor reduzido por refund parcial (${params.reconcileKey})${reason}`
                            : `Valor reduzido por refund parcial (${params.reconcileKey}) em ${now}${reason}`,
                    })
                    .eq("id", s.id)
                    .eq("partner_id", params.partnerId)
                if (!error) {
                    reduced += 1
                    await auditLedgerReconciliation({
                        partnerId: params.partnerId,
                        actorUserId: params.actorUserId,
                        entityId: s.id,
                        actionType: "updated",
                        changeLines: [`Valor da parcela reduzido: R$ ${current.toFixed(2)} → R$ ${newAmount.toFixed(2)}.`],
                    })
                }
            }
        }
        return { reduced, cancelled }
    } catch (err: any) {
        console.error("[TRANSACTION] Erro ao reduzir settlements por refund parcial:", err.message)
        return { reduced: 0, cancelled: 0 }
    }
}

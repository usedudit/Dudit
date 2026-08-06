"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { createAdminClient } from "@/lib/supabase/server"
import type { ERPTransaction, FinancialTransactionCursor, FinancialTransactionsPageSuccess } from "@/lib/services/transactions.types"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
    formatTime,
    formatDateTime,
    formatDayMonth,
    formatBrazilDateFromDbInput,
    diffCalendarDaysInSaoPaulo,
} from "@/lib/utils/formatters"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { startOfDay } from "@/lib/date"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getTransactionHistoryEntries } from "@/lib/services/transaction-history.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateTransactions, revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { requireUser } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { sanitizeNotes } from "@/lib/input-validator"

type DbTransaction = {
    id: string
    description: string
    categoryLabel?: string
    category?: string | null
    original_amount?: number | string | null
    interest_amount?: number | string | null
    discount_amount?: number | string | null
    paid_amount?: number | string | null
    amount: number
    due_date: string | null
    payment_date: string | null
    created_at: string
    status: string
    notes: string | null
    payment_type: string | null
    transaction_type: ERPTransaction["transactionType"]
    contact_id: string | null
    customer_id: string | null
    contact_type: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    transfer_group_id?: string | null
    refund_kind?: "expense_refund" | "revenue_refund" | null
    reference_note?: string | null
    origin?: string | null
    account_id?: string | null
    category_id?: string | null
    subcategory_id?: string | null
    recurring_id?: string | null
    payment_method_id?: string | null
    installment_group_id?: string | null
    installment_number?: number | null
    transaction_contacts?: {
        name: string | null
        type: ERPTransaction["contactType"] | null
    } | null
}

type InstallmentGroupRow = {
    id: string
    description: string
    total_amount: number
    installments_count: number
}

function ledgerDirectionFromRow(t: DbTransaction): ERPTransaction["ledgerDirection"] {
    const tt = t.transaction_type
    const amt = Number(t.amount || 0)
    if (tt === "income") return "in"
    if (tt === "expense") return "out"
    if (tt === "adjustment") return amt >= 0 ? "in" : "out"
    if (tt === "refund") {
        if (t.refund_kind === "expense_refund") return "in"
        if (t.refund_kind === "revenue_refund") return "out"
        return "in"
    }
    if (tt === "transfer") return "in"
    return amt >= 0 ? "in" : "out"
}

function formatDateLabel(value: string) {
    return formatBrazilDateFromDbInput(value, "dayMonthYear")
}

function formatDateShort(value: string) {
    return formatBrazilDateFromDbInput(value, "dayMonth")
}

function toStatusVariant(status: string, isOverdue: boolean): ERPTransaction["statusVariant"] {
    const s = String(status || "").toLowerCase()
    if (isOverdue || s.includes("atras")) return "red"
    if (s.includes("pend")) return "orange"
    if (s.includes("cancel")) return "gray"
    return "green"
}

function toDisplayStatus(
    status: string,
    transactionType: ERPTransaction["transactionType"],
    refundKind?: string | null,
    isOverdue?: boolean,
) {
    const s = String(status || "").toLowerCase().trim()
    if (s === "paid") {
        if (transactionType === "income") return "Recebido"
        if (transactionType === "refund" && refundKind === "expense_refund") return "Recebido"
        return "Pago"
    }
    if (s === "pending" && isOverdue) return "Atrasado"
    if (s === "pending") return "Pendente"
    if (s === "cancelled") return "Cancelado"
    return status || "Pendente"
}

function isLedgerConfirmedStatus(status: string | null | undefined): boolean {
    const s = String(status || "").toLowerCase()
    return ["paid", "pago", "recebido", "confirmed", "confirmado", "efetivado"].includes(s)
}

function isStatusPending(status: string | null | undefined): boolean {
    return String(status || "").toLowerCase() === "pending"
}

function isCancelledStatus(status: string | null | undefined): boolean {
    return String(status || "").toLowerCase().includes("cancel")
}

function buildTransactionUpdateHistoryLines(patch: Partial<CreateManualTransactionInput>): string[] {
    const lines: string[] = []
    if (patch.description !== undefined) lines.push("alterou a descrição.")
    if (patch.amount !== undefined) lines.push("alterou o valor.")
    if (patch.category !== undefined) lines.push("alterou a categoria.")
    if (patch.categoryId !== undefined) lines.push("alterou a categoria.")
    if (patch.subcategoryId !== undefined) lines.push("alterou a subcategoria.")
    if (patch.accountId !== undefined) lines.push("alterou a conta financeira.")
    if (patch.contactId !== undefined) lines.push("alterou o contato.")
    if (patch.customerId !== undefined) lines.push("alterou o cliente vinculado.")
    if (patch.contactType !== undefined) lines.push("alterou o tipo de contato.")
    if (patch.paymentType !== undefined) lines.push("alterou o meio de pagamento.")
    if (patch.paymentMethodId !== undefined) lines.push("alterou o meio de pagamento.")
    if (patch.dueDate !== undefined) lines.push("alterou a data de vencimento.")
    if (patch.paymentDate !== undefined) lines.push("alterou a data de pagamento.")
    if (patch.transactionDate !== undefined) lines.push("alterou a data da transação.")
    if (patch.status !== undefined) lines.push("alterou o status.")
    if (patch.notes !== undefined) lines.push("alterou as observações.")
    if (patch.refundKind !== undefined) lines.push("alterou o tipo de reembolso.")
    if (patch.referenceNote !== undefined) lines.push("alterou a referência.")
    return lines
}

function transactionTypeLabel(tt: string | null | undefined): string {
    switch (String(tt || "").toLowerCase()) {
        case "income":
            return "Receita"
        case "expense":
            return "Despesa"
        case "transfer":
            return "Transferência"
        case "adjustment":
            return "Ajuste"
        case "refund":
            return "Reembolso"
        default:
            return tt || "Transação"
    }
}

function originLabel(origin: string | null | undefined): string {
    const o = String(origin || "").toLowerCase()
    if (o === "system") return "Sistema"
    if (o === "gateway") return "Gateway"
    return "Manual"
}

function contactCardTitleFromType(contactType: string | null | undefined): string {
    const c = String(contactType || "").toLowerCase()
    if (c === "customer" || c === "cliente") return "Cliente"
    if (c === "supplier" || c === "fornecedor") return "Fornecedor"
    if (c === "service") return "Prestador de serviço"
    if (c === "employee" || c === "funcionario") return "Funcionário"
    if (c === "partner") return "Parceiro"
    return "Contato"
}

type ContactCardAddress = {
    street?: string
    number?: string
    complement?: string
    neighborhood?: string
    city?: string
    state?: string
    zipCode?: string
}

async function buildCustomerContactCard(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    customerId: string,
    fallbackName: string,
): Promise<TransactionDetailPayload["contactCard"]> {
    const [{ data: cust }, { data: addresses }] = await Promise.all([
        supabase
            .from("customers")
            .select("id, name, email, phone, image_url")
            .eq("id", customerId)
            .eq("partner_id", partnerId)
            .maybeSingle(),
        supabase
            .from("addresses")
            .select("street, number, complement, neighborhood, city, state, zip_code, address_type, is_default")
            .eq("customer_id", customerId)
            .limit(10),
    ])

    const primary = (addresses || []).find((a: any) => a.address_type === "primary" || a.is_default) || addresses?.[0] || null
    const billing = (addresses || []).find((a: any) => a.address_type === "billing") || null

    const toAddr = (a: any): ContactCardAddress | null =>
        a?.street || a?.city
            ? {
                street: a?.street,
                number: a?.number,
                complement: a?.complement,
                neighborhood: a?.neighborhood,
                city: a?.city,
                state: a?.state,
                zipCode: a?.zip_code,
            }
            : null

    return {
        title: "Cliente",
        id: cust?.id ?? null,
        name: cust?.name || fallbackName,
        email: cust?.email ?? null,
        phone: cust?.phone ?? null,
        image_url: cust?.image_url ?? null,
        address: toAddr(primary),
        billingAddress: toAddr(billing),
        isCustomer: true,
    }
}

async function paymentMethodDisplayLabel(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    methodId: string | null | undefined,
): Promise<string | null> {
    if (!methodId) return null
    const { data } = await supabase
        .from("payment_methods")
        .select("name, payment_type")
        .eq("id", methodId)
        .eq("partner_id", partnerId)
        .maybeSingle()
    if (!data?.name) return null
    return formatPaymentMethodLabel(data.name, data.payment_type)
}

function numFinanceBalance(v: unknown): number {
    if (v === null || v === undefined) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

function isMissingCreatedByUserIdColumnError(error: any): boolean {
    const message = String(error?.message || "").toLowerCase()
    return message.includes("created_by_user_id") && message.includes("transactions")
}

async function insertTransactionsWithOptionalCreator(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    payload: Record<string, unknown> | Record<string, unknown>[],
) {
    const firstTry = await supabase.from("transactions").insert(payload).select("*")
    if (!firstTry.error) return firstTry
    if (!isMissingCreatedByUserIdColumnError(firstTry.error)) return firstTry

    const dropCreator = (row: Record<string, unknown>) => {
        const cloned = { ...row }
        delete cloned.created_by_user_id
        return cloned
    }
    const retriedPayload = Array.isArray(payload) ? payload.map(dropCreator) : dropCreator(payload)
    return await supabase.from("transactions").insert(retriedPayload).select("*")
}

async function applyFinanceAccountBalanceAfterInsert(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    accountId: string | null | undefined,
    row: {
        transaction_type: string
        amount: number | string
        status: string
        refund_kind?: string | null
    },
) {
    if (!accountId) return
    if (!isLedgerConfirmedStatus(row.status)) return
    await applyFinanceAccountBalanceDelta(supabase, partnerId, accountId, {
        transaction_type: row.transaction_type,
        amount: row.amount,
        refund_kind: row.refund_kind,
    })
}

/**
 * Atomic balance update using PostgreSQL RPC with SELECT ... FOR UPDATE.
 * Prevents concurrent balance corruption from race conditions.
 */
async function applyFinanceAccountBalanceDelta(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    accountId: string | null | undefined,
    row: {
        transaction_type: string
        amount: number | string
        refund_kind?: string | null
    },
) {
    if (!accountId) return

    const rawAmt = Number(row.amount || 0)
    if (!Number.isFinite(rawAmt) || rawAmt === 0) return
    let delta = 0
    const tt = row.transaction_type
    if (tt === "income") delta = Math.abs(rawAmt)
    else if (tt === "expense") delta = -Math.abs(rawAmt)
    else if (tt === "adjustment") delta = rawAmt
    else if (tt === "refund") {
        if (row.refund_kind === "expense_refund") delta = Math.abs(rawAmt)
        else if (row.refund_kind === "revenue_refund") delta = -Math.abs(rawAmt)
        else return
    } else return

    delta = Math.round(delta * 100) / 100
    if (delta === 0) return

    // Use atomic RPC with FOR UPDATE locking to prevent race conditions
    const { error: rpcError } = await supabase.rpc("apply_account_balance_delta", {
        p_account_id: accountId,
        p_partner_id: partnerId,
        p_delta: delta,
    })
    if (rpcError) {
        console.error("[transactions] apply_account_balance_delta RPC error:", rpcError.message)
    }
}

const FINANCIAL_TX_LIST_SELECT = `
        id, description, category, amount, original_amount, interest_amount, discount_amount, paid_amount, due_date, payment_date, created_at, status, notes, payment_type, transaction_type, contact_id, customer_id, contact_type, store_id,
        transfer_group_id, refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id, payment_method_id, installment_group_id, installment_number,
        transaction_contacts(name, type)
      `

const FINANCIAL_TX_PAGE_SIZE = 100

/** PostgREST `or=(…)` filter for keyset page after (created_at DESC, id DESC). */
function buildTransactionKeysetOrFilter(cursor: FinancialTransactionCursor): string {
    const ts = cursor.createdAt
    const id = cursor.id
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

export async function getFinancialTransactionsAction(
    partnerId: string,
    options?: { cursor?: FinancialTransactionCursor | null; storeId?: string | null },
): Promise<
    ({ success: true } & FinancialTransactionsPageSuccess) | { success: false; error: string }
> {
    const actionStart = performance.now()
    try {
        const authStart = performance.now()
        await requirePermission(partnerId, "financial", "view")
        // Use admin client after authz check so invited ERP users can read transactions.
        const supabase = createAdminClient()

        const cursor = options?.cursor ?? null
        const storeId = options?.storeId ?? null
        const fetchLimit = FINANCIAL_TX_PAGE_SIZE + 1

        // ── Step 1: Keyset page (created_at DESC, id DESC) ──────────────
        const t1 = performance.now()
        let listQuery = supabase.from("transactions").select(FINANCIAL_TX_LIST_SELECT).eq("partner_id", partnerId)

        if (storeId) {
            listQuery = listQuery.eq("store_id", storeId)
        }

        if (cursor) {
            listQuery = listQuery.or(buildTransactionKeysetOrFilter(cursor))
        }

        const { data, error } = await listQuery
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit)

        if (error) {
            throw error
        }
        const rawRows = (data || []) as unknown as DbTransaction[]
        const hasMore = rawRows.length > FINANCIAL_TX_PAGE_SIZE
        const txs = hasMore ? rawRows.slice(0, FINANCIAL_TX_PAGE_SIZE) : rawRows
        const lastRow = txs[txs.length - 1]
        const nextCursor: FinancialTransactionCursor | null =
            hasMore && lastRow ? { createdAt: lastRow.created_at, id: lastRow.id } : null

        // ── Step 2: Collect all IDs for secondary lookups ───────────────
        const salesOrderNumbers: string[] = []
        const allCustomerIds = new Set<string>()
        const paymentMethodIds = new Set<string>()
        const installmentGroupIds = new Set<string>()

        for (const t of txs) {
            if (t.category === "Vendas" && t.description?.trim()) {
                salesOrderNumbers.push(String(t.description).trim())
            }
            if (t.customer_id) allCustomerIds.add(t.customer_id)
            if (t.payment_method_id) paymentMethodIds.add(t.payment_method_id)
            if (t.installment_group_id) allCustomerIds.add(t.installment_group_id) // will be filtered separately
            if (t.installment_group_id) installmentGroupIds.add(t.installment_group_id)
        }

        // ── Step 3: Parallel secondary lookups ──────────────────────────
        const t2 = performance.now()

        // Orders lookup (for sales transactions)
        const uniqueSaleRefs = [...new Set(salesOrderNumbers)]
        const ordersPromise = uniqueSaleRefs.length > 0
            ? supabase
                .from("orders")
                .select("order_number, buyer_id, customer_name, order_source, payment_provider, payment_method")
                .eq("partner_id", partnerId)
                .in("order_number", uniqueSaleRefs)
                .then((r: any) => r.data || [])
            : Promise.resolve([] as { order_number: string; buyer_id: string | null; customer_name: string | null; order_source: string | null; payment_provider?: string | null; payment_method?: string | null }[])

        const salesPromise = uniqueSaleRefs.length > 0
            ? supabase
                .from("sales")
                .select("sale_number, customer_id")
                .eq("partner_id", partnerId)
                .in("sale_number", uniqueSaleRefs)
                .then((r: any) => r.data || [])
            : Promise.resolve([] as { sale_number: string; customer_id: string | null }[])

        // Payment methods lookup
        const pmIdsArr = [...paymentMethodIds]
        const paymentMethodsPromise = pmIdsArr.length > 0
            ? supabase
                .from("payment_methods")
                .select("id, name, payment_type")
                .eq("partner_id", partnerId)
                .in("id", pmIdsArr)
                .then((r: any) => r.data || [])
            : Promise.resolve([] as { id: string; name: string; payment_type: string | null }[])

        // Installment groups lookup
        const igIdsArr = [...installmentGroupIds]
        const installmentGroupsPromise = igIdsArr.length > 0
            ? supabase
                .from("installment_groups")
                .select("id, description, total_amount, installments_count")
                .eq("partner_id", partnerId)
                .in("id", igIdsArr)
                .then((r: any) => r.data || [])
            : Promise.resolve([] as InstallmentGroupRow[])

        // Compute installment IDs early (only depends on txs, not on batch results)
        const installmentTxIds = txs
            .filter((t) => !!t.installment_group_id)
            .map((t) => t.id)
        const installmentPaymentsPromise = installmentTxIds.length > 0
            ? supabase
                .from("transaction_payments")
                .select("transaction_id, amount, base_amount, interest_amount, discount_amount, payment_method_id")
                .eq("partner_id", partnerId)
                .in("transaction_id", installmentTxIds)
                .then((r: any) => {
                    if (r.error) throw r.error
                    return r.data || []
                })
            : Promise.resolve([] as any[])

        // Accounts lookup
        const accountIdsArr = [...new Set(txs.map(t => t.account_id).filter(Boolean))]
        const accountsPromise = accountIdsArr.length > 0
            ? supabase
                .from("finance_accounts")
                .select("id, name, integration_source")
                .eq("partner_id", partnerId)
                .in("id", accountIdsArr)
                .then((r: any) => r.data || [])
            : Promise.resolve([] as { id: string; name: string; integration_source: string | null }[])

        const [orders, posSales, pmRows, installmentGroups, installmentPayRows, financeAccounts] = await Promise.all([
            ordersPromise,
            salesPromise,
            paymentMethodsPromise,
            installmentGroupsPromise,
            installmentPaymentsPromise,
            accountsPromise,
        ])

        const installmentPaymentsMap = new Map<string, { base: number; cash: number; interest: number; discount: number }>()
        for (const p of installmentPayRows) {
            const tid = String((p as any).transaction_id || "")
            if (!tid) continue
            const pBase = Number((p as any).base_amount ?? (p as any).amount ?? 0)
            const pCash = Number((p as any).amount || 0)
            const pInt = Number((p as any).interest_amount || 0)
            const pDisc = Number((p as any).discount_amount || 0)
            const cur = installmentPaymentsMap.get(tid) || { base: 0, cash: 0, interest: 0, discount: 0 }
            installmentPaymentsMap.set(tid, {
                base: cur.base + pBase,
                cash: cur.cash + pCash,
                interest: cur.interest + pInt,
                discount: cur.discount + pDisc,
            })
        }

        // Build order lookup and collect buyer IDs into the customer set
        const orderByNumber = new Map<string, { buyer_id: string | null; customer_name: string | null; order_source: string | null; payment_provider?: string | null; payment_method?: string | null }>()
        for (const o of orders) {
            orderByNumber.set(String(o.order_number), { buyer_id: o.buyer_id, customer_name: o.customer_name, order_source: o.order_source || null, payment_provider: o.payment_provider, payment_method: o.payment_method })
            if (o.buyer_id) allCustomerIds.add(o.buyer_id)
        }

        const saleByNumber = new Map<string, { customer_id: string | null }>()
        for (const s of posSales) {
            if (s.sale_number) saleByNumber.set(String(s.sale_number), { customer_id: s.customer_id })
            if (s.customer_id) allCustomerIds.add(s.customer_id)
        }

        // Remove installment group IDs that were accidentally added to customer set
        for (const igId of installmentGroupIds) {
            allCustomerIds.delete(igId)
        }

        // Single merged customer lookup (combines buyer IDs + linked customer IDs)
        const customerIds = [...allCustomerIds]
        const customerById = new Map<string, { name: string | null }>()
        if (customerIds.length > 0) {
            const { data: customers } = await supabase
                .from("customers")
                .select("id, name")
                .eq("partner_id", partnerId)
                .in("id", customerIds)
            for (const c of customers || []) customerById.set(c.id, { name: c.name })
        }

        // Build payment method label map
        const paymentMethodLabelById = new Map<string, string>()
        for (const pm of pmRows) {
            const label = formatPaymentMethodLabel(pm.name, pm.payment_type)
            paymentMethodLabelById.set(pm.id, label || "Não informado")
        }

        // Build installment group map
        const installmentGroupById = new Map<string, InstallmentGroupRow>()
        for (const g of installmentGroups) {
            installmentGroupById.set(g.id, g as InstallmentGroupRow)
        }

        const integrationSourceByAccountId = new Map<string, string>()
        for (const fa of financeAccounts) {
            if (fa.integration_source) {
                integrationSourceByAccountId.set(fa.id, fa.integration_source)
            }
        }

        // ── Step 4: Map to ERPTransaction ───────────────────────────────
        const now = new Date()
        const mapped: ERPTransaction[] = txs.map((t) => {
            const dueYmd = t.due_date ? String(t.due_date).slice(0, 10) : null
            const daysDiffVsToday = dueYmd && /^\d{4}-\d{2}-\d{2}$/.test(dueYmd) ? diffCalendarDaysInSaoPaulo(dueYmd) : 0
            const isOverdue = isStatusPending(t.status) && !!dueYmd && daysDiffVsToday < 0
            const daysUntilDue = dueYmd && isStatusPending(t.status) ? daysDiffVsToday : 0
            const dueDateLabel = dueYmd ? formatBrazilDateFromDbInput(dueYmd, "dayMonthYear") : "-"
            const dueDateShortLabel = dueYmd ? formatBrazilDateFromDbInput(dueYmd, "dayMonth") : "-"

            const originalParcel = Math.abs(Number(t.original_amount ?? t.amount ?? 0))
            let installmentRemainingAmount: number | undefined
            let installmentInterestAmount: number | null = null
            let installmentDiscountAmount: number | null = null
            let installmentPaidAmount: number | null = null
            let installmentPaymentType: string | undefined = undefined

            if (t.installment_group_id) {
                const agg = installmentPaymentsMap.get(t.id) || { base: 0, cash: 0, interest: 0, discount: 0 }
                const paidFlagFromStatus = isStatusPaid(t.status)
                const fallbackPaid = paidFlagFromStatus && agg.base <= 0 ? originalParcel : 0
                const principalCleared = Math.max(0, Math.round((agg.base + fallbackPaid) * 100) / 100)

                installmentRemainingAmount = Math.max(0, Math.round((originalParcel - principalCleared) * 100) / 100)
                installmentInterestAmount = Math.round(agg.interest * 100) / 100
                installmentDiscountAmount = Math.round(agg.discount * 100) / 100
                installmentPaidAmount = Math.max(0, Math.round((agg.cash + fallbackPaid) * 100) / 100)

                // Resolve all unique payment methods for this installment
                const txPayments = (installmentPayRows || []).filter((p: any) => p.transaction_id === t.id)
                const pmLabels = txPayments
                    .map((p: any) => p.payment_method_id ? paymentMethodLabelById.get(p.payment_method_id) : null)
                    .filter(Boolean) as string[]

                // Add the transaction's own payment method / payment type as fallback
                const ownLabel = t.payment_method_id
                    ? paymentMethodLabelById.get(t.payment_method_id)
                    : (t.payment_type && t.payment_type !== "Agendamento" ? formatPaymentMethodLabel(t.payment_type, null) : null)
                if (ownLabel) pmLabels.push(ownLabel)

                const uniqueLabels = [...new Set(pmLabels)]
                if (uniqueLabels.length > 0) {
                    installmentPaymentType = uniqueLabels.join(", ")
                }
            }

            const descTrim = t.category === "Vendas" ? String(t.description || "").trim() : ""
            const order = t.category === "Vendas" && descTrim ? orderByNumber.get(descTrim) : null
            const saleRow = t.category === "Vendas" && descTrim ? saleByNumber.get(descTrim) : null
            const customerName = order?.buyer_id ? customerById.get(order.buyer_id)?.name : null
            const fromTxnCustomer = t.customer_id ? customerById.get(t.customer_id)?.name : null
            let salesContactName: string
            if (order) {
                salesContactName =
                    (customerName && String(customerName).trim())
                    || (order.customer_name && String(order.customer_name).trim())
                    || (fromTxnCustomer && String(fromTxnCustomer).trim())
                    || "Consumidor final"
            } else if (saleRow) {
                const saleCust = saleRow.customer_id ? customerById.get(saleRow.customer_id)?.name : null
                salesContactName =
                    (saleCust && String(saleCust).trim())
                    || (fromTxnCustomer && String(fromTxnCustomer).trim())
                    || "Consumidor final"
            } else {
                salesContactName = (fromTxnCustomer && String(fromTxnCustomer).trim()) || "Consumidor final"
            }
            const linkedCustomerName = t.customer_id ? customerById.get(t.customer_id)?.name : null
            const fallbackContact = t.transaction_contacts?.name || "-"
            const manualCustomerName = linkedCustomerName || "Cliente"

            return {
                id: t.id,
                displayId: `TRX-${t.id.slice(0, 8).toUpperCase()}`,
                description: String(t.description || "").trim() || "Transação",
                details: undefined,
                category: String(t.category || "").trim() || "-",
                contactName:
                    t.category === "Vendas"
                        ? salesContactName
                        : t.customer_id
                            ? manualCustomerName
                            : fallbackContact,
                contactType: t.category === "Vendas" ? "customer" : (t.contact_type || t.transaction_contacts?.type || (t.customer_id ? "customer" : "other")),
                dueDate: dueDateLabel,
                dueDateShort: dueDateShortLabel,
                dueDateTime: "",
                dateNote: isOverdue ? "Atrasado" : "-",
                createdAtDate: formatDateLabel(t.created_at || now.toISOString()),
                createdAtTime: formatTime(t.created_at || now.toISOString()),
                createdAtRaw: t.created_at || now.toISOString(),
                daysUntilDue,
                isOverdue,
                originSource: (() => {
                    if (t.payment_type === "Agendamento" || (t.reference_note && t.reference_note.startsWith("appointment:"))) {
                        return "Agendamento";
                    }
                    if (t.category === "Vendas" && order) {
                        const src = String(order.order_source || "Manual").toLowerCase();
                        if (src === "presencial") return "PDV";
                        if (src === "vitrine online") return "Site";
                        if (src === "assinatura") return "Assinatura";
                        if (src === "manual") return "Venda Manual";
                        return order.order_source || "Venda Manual";
                    }
                    const o = String(t.origin || "").toLowerCase();
                    if (o === "system") return "Sistema";
                    if (o === "gateway") return "Gateway";
                    return "Manual";
                })(),
                paymentType: t.installment_group_id && installmentPaymentType
                    ? installmentPaymentType
                    : (() => {
                        let ownLabel = "Não informado";
                        if (t.payment_method_id) {
                            ownLabel = paymentMethodLabelById.get(t.payment_method_id) || "Não informado";
                        } else if (t.payment_type && t.payment_type !== "Agendamento") {
                            ownLabel = formatPaymentMethodLabel(t.payment_type, null) || "Não informado";
                        }

                        // Check if it's Mercado Pago
                        const isMercadoPagoOrder = order && order.payment_provider === "Mercado Pago";
                        const isMercadoPagoAccount = t.account_id && integrationSourceByAccountId.get(t.account_id) === "mercadopago";

                        if (isMercadoPagoOrder || isMercadoPagoAccount) {
                            if (ownLabel.includes("Mercado Pago")) {
                                return ownLabel;
                            }
                            let base = ownLabel;
                            const match = ownLabel.match(/^([^(]+)\(\1\)$/i) || ownLabel.match(/^([^(]+)\s*\(([^)]+)\)$/i);
                            if (match) {
                                base = (match[2] || match[1]).trim();
                            }
                            const baseLower = base.toLowerCase();
                            if (baseLower === "bank_transfer") base = "Pix";
                            else if (baseLower.includes("credit")) base = "Cartão de Crédito";
                            else if (baseLower.includes("debit")) base = "Cartão de Débito";

                            return `Mercado Pago (${base})`;
                        }

                        return ownLabel;
                    })(),
                status: toDisplayStatus(t.status, t.transaction_type, t.refund_kind, isOverdue),
                statusVariant: toStatusVariant(t.status, isOverdue),
                amount: Math.abs(Number(t.amount || 0)),
                originalAmount: t.original_amount !== undefined && t.original_amount !== null ? Math.abs(Number(t.original_amount)) : null,
                interestAmount: t.installment_group_id
                    ? installmentInterestAmount
                    : (t.interest_amount !== undefined && t.interest_amount !== null ? Math.abs(Number(t.interest_amount)) : null),
                discountAmount: t.installment_group_id
                    ? installmentDiscountAmount
                    : (t.discount_amount !== undefined && t.discount_amount !== null ? Math.abs(Number(t.discount_amount)) : null),
                paidAmount: t.installment_group_id
                    ? installmentPaidAmount
                    : (t.paid_amount !== undefined && t.paid_amount !== null ? Math.abs(Number(t.paid_amount)) : null),
                transactionType: t.transaction_type,
                ledgerDirection: ledgerDirectionFromRow(t),
                refundKind: t.refund_kind ?? undefined,
                transferGroupId: t.transfer_group_id ?? undefined,
                referenceNote: t.reference_note ?? undefined,
                notes: t.notes || undefined,
                // Raw DB fields for edit mode & recurring badge
                rawStatus: t.status || "pending",
                origin: (t.origin as ERPTransaction["origin"]) || "manual",
                accountId: t.account_id ?? null,
                categoryId: t.category_id ?? null,
                subcategoryId: t.subcategory_id ?? null,
                contactId: t.contact_id ?? null,
                customerId: t.customer_id ?? null,
                recurringId: t.recurring_id ?? null,
                paymentMethodId: t.payment_method_id ?? null,
                paymentDateRaw: t.payment_date ?? null,
                dueDateRaw: t.due_date ?? null,
                installmentGroupId: t.installment_group_id ?? null,
                installmentNumber: t.installment_number ?? null,
                installmentGroupDescription: t.installment_group_id
                    ? installmentGroupById.get(t.installment_group_id)?.description || null
                    : null,
                installmentTotalCount: t.installment_group_id
                    ? Number(installmentGroupById.get(t.installment_group_id)?.installments_count || 0) || null
                    : null,
                installmentGroupTotalAmount: t.installment_group_id
                    ? Math.abs(
                        Number(
                            (installmentGroupById.get(t.installment_group_id) as { total_amount?: number } | undefined)
                                ?.total_amount ?? 0,
                        ) || 0,
                    ) || null
                    : null,
                ...(installmentRemainingAmount !== undefined ? { installmentRemainingAmount } : {}),
            }
        })

        return { success: true, items: mapped, nextCursor, hasMore }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar transações" }
    }
}

export type CreateManualTransactionInput = {
    id?: string | null
    partnerId: string
    transactionType: "income" | "expense" | "transfer" | "adjustment" | "refund"
    amount: number
    description: string
    category?: string | null
    categoryId?: string | null
    subcategoryId?: string | null
    accountId?: string | null
    contactId?: string | null
    customerId?: string | null
    contactType?: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    paymentType?: string | null
    paymentMethodId?: string | null
    dueDate?: string | null
    paymentDate?: string | null
    transactionDate?: string | null
    status?: "pending" | "paid"
    notes?: string | null
    origin?: "manual" | "system" | "gateway"
    refundKind?: "expense_refund" | "revenue_refund" | null
    referenceNote?: string | null
    installmentGroupId?: string | null
    installmentNumber?: number | null
    storeId?: string | null
}

/** Canonical status check - ALWAYS use DB values, never UI-displayed strings */
function isStatusPaid(status?: string | null): boolean {
    return String(status || "").toLowerCase() === "paid"
}

function isSystemOrGatewayOrigin(origin?: string | null): boolean {
    const o = String(origin || "").toLowerCase()
    return o === "system" || o === "gateway"
}

/** Fields that are NEVER editable on paid/confirmed transactions */
const LOCKED_FIELDS_WHEN_PAID = new Set([
    "amount", "accountId", "account_id", "transactionType", "transaction_type",
    "origin", "paymentType", "payment_type",
])

/** Fields that are NEVER editable on system/gateway transactions */
const LOCKED_FIELDS_SYSTEM_GATEWAY = new Set([
    "amount", "accountId", "account_id", "origin",
])

export async function createManualTransactionAction(input: CreateManualTransactionInput) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        // await requireMinimumPlan(input.partnerId, "crescer")
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        if (input.transactionType === "transfer") {
            throw new Error("Use a ação de transferência para movimentar entre contas.")
        }

        // Input validation hardening
        const description = String(input.description || "").trim()
        if (!description) throw new Error("Descrição é obrigatória.")
        if (description.length > 500) throw new Error("Descrição deve ter no máximo 500 caracteres.")

        const amount = Number(input.amount || 0)
        if (!Number.isFinite(amount)) throw new Error("Valor inválido.")
        if (Math.abs(amount) > 99999999) throw new Error("Valor fora do limite permitido.")

        // Sanitize notes
        const sanitizedNotes = sanitizeNotes(input.notes)

        if (input.transactionType === "adjustment") {
            if (amount === 0) throw new Error("Informe um valor diferente de zero.")
        } else if (input.transactionType === "refund") {
            if (!(amount > 0)) throw new Error("Valor deve ser maior que zero.")
            if (!input.refundKind) throw new Error("Selecione o tipo de reembolso.")
        } else {
            if (!(amount > 0)) throw new Error("Valor deve ser maior que zero.")
        }

        const transactionDate = input.transactionDate || input.paymentDate || input.dueDate || new Date().toISOString()
        const status = input.status || "pending"

        const absAmount = input.transactionType === "adjustment" ? Math.abs(amount) : amount
        const normalizedContactType = String(input.contactType || "").toLowerCase()
        const customerId =
            input.customerId?.trim()
            || ((normalizedContactType === "customer" || normalizedContactType === "cliente") ? (input.contactId?.trim() || null) : null)
            || null
        const contactId = customerId ? null : (input.contactId?.trim() || null)
        const contactTypeResolved = customerId ? "customer" : input.contactType ?? null

        const isVendaIncome =
            String(input.category || "").trim() === "Vendas" && input.transactionType === "income"

        const normalizedCategory = String(input.category || "").trim()
        const payload: Record<string, unknown> = {
            ...(input.id ? { id: input.id } : {}),
            partner_id: input.partnerId,
            store_id: input.storeId || null,
            description: description,
            category: normalizedCategory || null,
            category_id: input.categoryId ?? null,
            subcategory_id: input.subcategoryId ?? null,
            account_id: input.accountId ?? null,
            contact_id: contactId,
            customer_id: customerId,
            contact_type: contactTypeResolved,
            amount: input.transactionType === "adjustment" ? amount : absAmount,
            due_date:
                ["adjustment", "transfer", "refund"].includes(input.transactionType) || isVendaIncome
                    ? null
                    : (input.dueDate || transactionDate),
            payment_date: input.paymentDate ?? null,
            transaction_date: transactionDate,
            status,
            notes: sanitizedNotes,
            payment_type: input.paymentType || null,
            payment_method_id: input.paymentMethodId || null,
            original_amount: absAmount,
            interest_amount: null,
            fee_amount: 0,
            transaction_type: input.transactionType,
            origin: input.origin || "manual",
            refund_kind: input.transactionType === "refund" ? input.refundKind ?? null : null,
            reference_note: input.referenceNote?.trim() || null,
            installment_group_id: input.installmentGroupId || null,
            installment_number: input.installmentNumber ?? null,
            created_by_user_id: userId,
        }

        const inserted = await insertTransactionsWithOptionalCreator(supabase, payload)
        if (inserted.error) throw inserted.error
        const data = (inserted.data || [])[0]
        if (!data) throw new Error("Erro ao criar transação")

        await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, input.accountId, {
            transaction_type: input.transactionType,
            amount: payload.amount as number,
            status: String(status),
            refund_kind: input.refundKind,
        })

        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: userId,
            entityType: "transaction",
            entityId: data.id,
            actionType: "created",
            changeLines: ["criou esta transação."],
            source: "manual",
        })
        await revalidateEntityTimeline("transaction", data.id)

        await revalidateTransactions(input.partnerId)
        return { success: true, data }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao criar transação" }
    }
}

export type CreateTransferPairInput = {
    partnerId: string
    fromAccountId: string
    toAccountId: string
    amount: number
    description?: string | null
    transactionDate: string
    status?: "pending" | "paid"
    paymentMethodId?: string | null
    storeId?: string | null
}

export async function createTransferPairAction(input: CreateTransferPairInput) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        // await requireMinimumPlan(input.partnerId, "crescer")
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const amt = Number(input.amount || 0)
        if (!Number.isFinite(amt) || !(amt > 0)) throw new Error("Valor deve ser maior que zero.")
        if (amt > 99999999) throw new Error("Valor fora do limite permitido.")
        if (!input.fromAccountId || !input.toAccountId) throw new Error("Selecione origem e destino.")
        if (input.fromAccountId === input.toAccountId) throw new Error("Contas devem ser diferentes.")

        const transferGroupId = crypto.randomUUID()
        const idempotencyKey = crypto.randomUUID()
        const datePart = (input.transactionDate || new Date().toISOString()).slice(0, 10)
        const transactionTs = startOfDay(datePart).toISOString()
        const status = input.status || "paid"
        const baseDesc = (input.description && input.description.trim()) || "Transferência entre contas"

        const { data: accounts } = await supabase
            .from("finance_accounts")
            .select("id, name")
            .eq("partner_id", input.partnerId)
            .in("id", [input.fromAccountId, input.toAccountId])

        const nameById = new Map((accounts || []).map((a: { id: string; name: string }) => [a.id, a.name]))
        const fromName = nameById.get(input.fromAccountId) || "Origem"
        const toName = nameById.get(input.toAccountId) || "Destino"

        const storeIdValue = input.storeId || null

        const outRow = {
            partner_id: input.partnerId,
            store_id: storeIdValue,
            description: `${baseDesc} (${fromName} → ${toName}, saída)`,
            category: "Transferência",
            transaction_type: "expense",
            account_id: input.fromAccountId,
            amount: amt,
            due_date: null,
            payment_date: status === "paid" ? transactionTs : null,
            transaction_date: transactionTs,
            status,
            notes: null,
            payment_type: "Transferência",
            original_amount: amt,
            interest_amount: null,
            fee_amount: 0,
            origin: "manual",
            transfer_group_id: transferGroupId,
            contact_id: null,
            contact_type: null,
            customer_id: null,
            category_id: null,
            subcategory_id: null,
        }

        const inRow = {
            partner_id: input.partnerId,
            store_id: storeIdValue,
            description: `${baseDesc} (${fromName} → ${toName}, entrada)`,
            category: "Transferência",
            transaction_type: "income",
            account_id: input.toAccountId,
            amount: amt,
            due_date: null,
            payment_date: status === "paid" ? transactionTs : null,
            transaction_date: transactionTs,
            status,
            notes: null,
            payment_type: "Transferência",
            original_amount: amt,
            interest_amount: null,
            fee_amount: 0,
            origin: "manual",
            transfer_group_id: transferGroupId,
            contact_id: null,
            contact_type: null,
            customer_id: null,
            category_id: null,
            subcategory_id: null,
        }

        const outRowWithCreator = { ...outRow, created_by_user_id: userId, reference_note: `transfer:${idempotencyKey}:out` }
        const inRowWithCreator = { ...inRow, created_by_user_id: userId, reference_note: `transfer:${idempotencyKey}:in` }

        const inserted = await insertTransactionsWithOptionalCreator(supabase, [outRowWithCreator, inRowWithCreator])
        if (inserted.error) throw inserted.error
        const data = inserted.data || []

        if (isLedgerConfirmedStatus(status)) {
            await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, input.fromAccountId, {
                transaction_type: "expense",
                amount: amt,
                status,
            })
            await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, input.toAccountId, {
                transaction_type: "income",
                amount: amt,
                status,
            })
        }

        await Promise.allSettled(
            (data || []).map((row: any) =>
                logAuditEvent({
                    partnerId: input.partnerId,
                    actorUserId: userId,
                    entityType: "transaction",
                    entityId: row.id,
                    actionType: "created",
                    changeLines: ["registrou lançamento de transferência entre contas."],
                    source: "manual",
                })
            )
        )

        await revalidateTransactions(input.partnerId)
        return { success: true, data, transferGroupId }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao criar transferência" }
    }
}

export async function updateManualTransactionAction(
    transactionId: string,
    partnerId: string,
    patch: Partial<CreateManualTransactionInput>,
) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePermission(partnerId, "financial", "edit")
        const supabase = createAdminClient()

        const { data: current, error: currentError } = await supabase
            .from("transactions")
            .select("id, partner_id, status, origin, recurring_id, installment_group_id, category, description, payment_method_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        const isInstallmentTransaction = !!current.installment_group_id
        if (currentError || !current) throw new Error(currentError?.message || "Transação não encontrada.")

        const paid = isStatusPaid(current.status)
        const systemGateway = isSystemOrGatewayOrigin(current.origin)
        const isRecurringSystemPending =
            !!current.recurring_id && systemGateway && !paid
        if (isRecurringSystemPending) {
            throw new Error(
                "Esta linha vem da recorrência. Edite o modelo em A pagar/A receber ou use «Marcar como pago» - não altere este lançamento pendente.",
            )
        }

        // Block irreversible status downgrade: paid → pending
        if (paid && patch.status !== undefined && !isStatusPaid(patch.status)) {
            throw new Error("Não é permitido reverter uma transação confirmada para pendente.")
        }

        // Build payload with strict field-level locking
        const payload: Record<string, unknown> = {}
        const patchKeys = Object.keys(patch) as (keyof CreateManualTransactionInput)[]

        for (const key of patchKeys) {
            // Enforce paid transaction locks
            if (paid && LOCKED_FIELDS_WHEN_PAID.has(key)) {
                throw new Error(`Campo "${key}" não pode ser editado em transação confirmada.`)
            }
            // Enforce system/gateway locks
            if (systemGateway && LOCKED_FIELDS_SYSTEM_GATEWAY.has(key)) {
                throw new Error(`Campo "${key}" não pode ser editado em transação do sistema/gateway.`)
            }
        }

        const isSalesTransaction = String(current.category || "").toLowerCase() === "vendas"
        if (isSalesTransaction && (
            patch.contactId !== undefined ||
            patch.customerId !== undefined ||
            patch.contactType !== undefined
        )) {
            throw new Error("Não é permitido alterar o contato de transações geradas por venda.")
        }

        const ALLOWED_PENDING_KEYS = new Set<keyof CreateManualTransactionInput>([
            "description",
            "categoryId",
            "subcategoryId",
            "accountId",
            "contactId",
            "customerId",
            "contactType",
            "paymentMethodId",
            "dueDate",
            "paymentDate",
            "status",
            "notes",
            "storeId",
        ])
        const ALLOWED_PAID_KEYS = new Set<keyof CreateManualTransactionInput>([
            "description",
            "notes",
        ])
        const ALLOWED_INSTALLMENT_KEYS = new Set<keyof CreateManualTransactionInput>([
            "accountId",
            "paymentMethodId",
            "notes",
        ])

        const allowedKeys = isInstallmentTransaction
            ? ALLOWED_INSTALLMENT_KEYS
            : (paid ? ALLOWED_PAID_KEYS : ALLOWED_PENDING_KEYS)
        for (const key of patchKeys) {
            if (!allowedKeys.has(key)) {
                throw new Error(`Campo "${key}" não pode ser editado quando status é ${paid ? "paid" : "pending"}.`)
            }
        }

        if (isSalesTransaction && patch.paymentMethodId !== undefined) {
            throw new Error("Não é permitido alterar o meio de pagamento de transações geradas por venda.")
        }

        if (isInstallmentTransaction) {
            if (!systemGateway && patch.accountId !== undefined) payload.account_id = patch.accountId
            if (patch.paymentMethodId !== undefined) payload.payment_method_id = patch.paymentMethodId
            if (patch.notes !== undefined) payload.notes = patch.notes
        } else if (paid) {
            if (patch.description !== undefined) payload.description = patch.description?.trim()
            if (patch.notes !== undefined) payload.notes = patch.notes
        } else {
            if (patch.description !== undefined) payload.description = patch.description?.trim()
            if (patch.categoryId !== undefined) payload.category_id = patch.categoryId
            if (patch.subcategoryId !== undefined) payload.subcategory_id = patch.subcategoryId
            if (!systemGateway && patch.accountId !== undefined) payload.account_id = patch.accountId
            if (patch.contactId !== undefined || patch.customerId !== undefined || patch.contactType !== undefined) {
                const nextContactType = patch.contactType ?? null
                const nextCustomerIdRaw = patch.customerId ?? null
                const nextContactIdRaw = patch.contactId ?? null
                const nextCustomerId =
                    nextCustomerIdRaw
                    || ((String(nextContactType || "").toLowerCase() === "customer" || String(nextContactType || "").toLowerCase() === "cliente")
                        ? nextContactIdRaw
                        : null)

                payload.customer_id = nextCustomerId
                payload.contact_id = nextCustomerId ? null : nextContactIdRaw
                payload.contact_type = nextCustomerId ? "customer" : nextContactType
            }
            if (patch.paymentMethodId !== undefined) payload.payment_method_id = patch.paymentMethodId
            if (patch.dueDate !== undefined) payload.due_date = patch.dueDate
            if (patch.paymentDate !== undefined) payload.payment_date = patch.paymentDate
            if (patch.status !== undefined) payload.status = patch.status
            if (patch.notes !== undefined) payload.notes = patch.notes
            if (patch.storeId !== undefined) payload.store_id = patch.storeId
        }

        // NEVER allow these fields to be mutated via patch
        delete payload.origin
        delete payload.recurring_id
        delete payload.transaction_type

        payload.updated_at = new Date().toISOString()

        const { data, error } = await supabase
            .from("transactions")
            .update(payload)
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .select("*")
            .single()
        if (error) throw error

        const historyLines = buildTransactionUpdateHistoryLines(patch)
        if (historyLines.length > 0) {
            await logAuditEvent({
                partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: transactionId,
                actionType: "updated",
                changeLines: historyLines,
                source: "manual",
            })
            await revalidateEntityTimeline("transaction", transactionId)
        }

        await revalidateTransactions(partnerId)
        return { success: true, data }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao atualizar transação" }
    }
}

export async function cancelPendingTransactionAction(input: {
    transactionId: string
    partnerId: string
    reason?: string | null
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        // await requireMinimumPlan(input.partnerId, "crescer")
        const { userId } = await requirePermission(input.partnerId, "financial", "cancel")
        const supabase = createAdminClient()

        const { data: tx, error } = await supabase
            .from("transactions")
            .select("id, partner_id, status, installment_group_id, notes")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (error || !tx) throw new Error(error?.message || "Transação não encontrada.")

        if (String(tx.status || "").toLowerCase() !== "pending") {
            throw new Error("Apenas transações pendentes podem ser canceladas.")
        }
        if (tx.installment_group_id) {
            throw new Error("Parcelas não podem ser canceladas por esta ação.")
        }

        const user = await getCurrentUser()
        const actorName = user?.user_metadata?.full_name?.trim() || user?.email?.trim() || "Usuário"
        const now = new Date()
        const cancelledAt = formatDateTime(now.toISOString()) || now.toLocaleString("pt-BR")
        const reason = String(input.reason || "").trim()
        const cancellationLine = `Cancelado por ${actorName} em ${cancelledAt}${reason ? ` - Motivo: ${reason}` : ""}`
        const previousNotes = String(tx.notes || "").trim()
        const nextNotes = previousNotes ? `${previousNotes}\n${cancellationLine}` : cancellationLine

        const { data: updated, error: updateError } = await supabase
            .from("transactions")
            .update({
                status: "cancelled",
                notes: nextNotes,
                updated_at: now.toISOString(),
            })
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .select("*")
            .single()
        if (updateError) throw updateError

        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: userId,
            entityType: "transaction",
            entityId: input.transactionId,
            actionType: "updated",
            changeLines: [cancellationLine, "alterou o status para cancelado."],
            source: "manual",
        })
        await revalidateEntityTimeline("transaction", input.transactionId)
        await revalidateTransactions(input.partnerId)

        return { success: true as const, data: updated }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao cancelar transação" }
    }
}

/**
 * Fetch a single transaction with all raw DB fields needed for the edit form.
 */
export async function getTransactionForEditAction(transactionId: string, partnerId: string) {
    try {
        await requirePermission(partnerId, "financial", "view")
        const supabase = createAdminClient()

        const { data, error } = await supabase
            .from("transactions")
            .select(`
                id, description, category, amount, due_date, payment_date, created_at,
                status, notes, payment_type, transaction_type, contact_id, customer_id,
                contact_type, transfer_group_id, refund_kind, reference_note, origin,
                account_id, category_id, subcategory_id, recurring_id, transaction_date,
                payment_method_id, installment_group_id, installment_number
            `)
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (error || !data) throw error || new Error("Transação não encontrada.")

        return { success: true as const, data }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao carregar transação" }
    }
}

function addInstallmentDate(anchor: Date, frequency: "daily" | "weekly" | "monthly" | "yearly", interval: number, steps: number): Date {
    const d = new Date(anchor)
    const total = Math.max(1, interval) * Math.max(0, steps)
    if (frequency === "daily") d.setDate(d.getDate() + total)
    else if (frequency === "weekly") d.setDate(d.getDate() + (7 * total))
    else if (frequency === "monthly") d.setMonth(d.getMonth() + total)
    else d.setFullYear(d.getFullYear() + total)
    return d
}

export async function createInstallmentGroupAction(input: {
    partnerId: string
    transactionType: "income" | "expense"
    description: string
    categoryLabel?: string
    totalAmount: number
    installmentsCount: number
    frequency: "daily" | "weekly" | "monthly" | "yearly"
    interval: number
    startDate: string
    categoryId?: string | null
    subcategoryId?: string | null
    accountId?: string | null
    contactId?: string | null
    customerId?: string | null
    contactType?: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    paymentType?: string | null
    paymentMethodId?: string | null
    notes?: string | null
    initialStatus?: "pending" | "paid"
    firstInstallmentPaymentDate?: string | null
    storeId?: string | null
}) {
    try {
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const count = Math.floor(Number(input.installmentsCount) || 0)
        if (!(count >= 1)) throw new Error("Informe a quantidade de parcelas.")
        if (count > 48) throw new Error("Máximo de 48 parcelas.")
        const totalAmount = Number(input.totalAmount || 0)
        if (!(totalAmount > 0)) throw new Error("Valor total deve ser maior que zero.")

        const interval = Math.max(1, Math.floor(Number(input.interval) || 1))
        const startDate = startOfDay(input.startDate)
        if (Number.isNaN(startDate.getTime())) throw new Error("Data inicial inválida.")

        const eachAmount = Math.round((totalAmount / count) * 100) / 100
        const amountDiff = Math.round((totalAmount - (eachAmount * count)) * 100) / 100

        const { data: group, error: groupErr } = await supabase
            .from("installment_groups")
            .insert({
                partner_id: input.partnerId,
                store_id: input.storeId || null,
                description: input.description.trim(),
                total_amount: totalAmount,
                installments_count: count,
                frequency: input.frequency,
                interval: interval,
                interval_value: interval,
                start_date: startDate.toISOString(),
                category_id: input.categoryId || null,
                subcategory_id: input.subcategoryId || null,
                account_id: input.accountId || null,
                contact_id: input.contactId || null,
                payment_method_id: input.paymentMethodId || null,
                created_by_user_id: userId,
            })
            .select("id")
            .single()
        if (groupErr || !group?.id) throw groupErr || new Error("Erro ao criar grupo parcelado.")

        const initialStatus = input.initialStatus === "paid" ? "paid" : "pending"
        const firstInstallmentPaymentDate = input.firstInstallmentPaymentDate || new Date().toISOString()
        const transactionsPayload = Array.from({ length: count }).map((_, index) => {
            const installmentNumber = index + 1
            const due = addInstallmentDate(startDate, input.frequency, interval, index)
            const lineAmount = installmentNumber === count ? Math.round((eachAmount + amountDiff) * 100) / 100 : eachAmount
            const isFirstInstallmentPaid = initialStatus === "paid" && installmentNumber === 1
            return {
                partner_id: input.partnerId,
                store_id: input.storeId || null,
                description: input.description.trim(),
                category: String(input.categoryLabel || "").trim() || null,
                category_id: input.categoryId || null,
                subcategory_id: input.subcategoryId || null,
                account_id: input.accountId || null,
                contact_id: input.customerId ? null : (input.contactId || null),
                customer_id: input.customerId || null,
                contact_type: input.customerId ? "customer" : (input.contactType || null),
                amount: lineAmount,
                due_date: due.toISOString().slice(0, 10),
                payment_date: isFirstInstallmentPaid ? firstInstallmentPaymentDate : null,
                transaction_date: due.toISOString(),
                status: isFirstInstallmentPaid ? "paid" : "pending",
                notes: input.notes ?? null,
                payment_type: input.paymentType || null,
                payment_method_id: input.paymentMethodId || null,
                original_amount: lineAmount,
                interest_amount: null,
                fee_amount: 0,
                transaction_type: input.transactionType,
                origin: "manual",
                installment_group_id: group.id,
                installment_number: installmentNumber,
                created_by_user_id: userId,
            }
        })

        const inserted = await insertTransactionsWithOptionalCreator(supabase, transactionsPayload)
        if (inserted.error) throw inserted.error

        if (initialStatus === "paid" && input.accountId) {
            const firstInstallmentAmount = Number((transactionsPayload[0] as any)?.amount || 0)
            if (firstInstallmentAmount > 0) {
                await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, input.accountId, {
                    transaction_type: input.transactionType,
                    amount: firstInstallmentAmount,
                    status: "paid",
                })
            }
        }

        // Log audit event for the installment group creation
        await Promise.allSettled(
            (inserted.data || []).map((row: any) =>
                logAuditEvent({
                    partnerId: input.partnerId,
                    actorUserId: userId,
                    entityType: "transaction",
                    entityId: row.id,
                    actionType: "created",
                    changeLines: [`criou parcela ${row.installment_number || "?"} do parcelamento.`],
                    source: "manual",
                })
            )
        )

        await revalidateTransactions(input.partnerId)
        return { success: true as const, data: { groupId: group.id, createdCount: (inserted.data || []).length } }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao criar parcelamento" }
    }
}

export async function getInstallmentGroupDetailsAction(input: { partnerId: string; installmentGroupId: string }) {
    try {
        await requirePermission(input.partnerId, "financial", "view")
        const supabase = createAdminClient()

        // PERF: Batch 1 - group metadata + installment transactions (independent reads)
        const [groupResult, rowsResult] = await Promise.all([
            supabase
                .from("installment_groups")
                .select("id, description, total_amount, installments_count")
                .eq("id", input.installmentGroupId)
                .eq("partner_id", input.partnerId)
                .single(),
            supabase
                .from("transactions")
                .select("id, description, amount, original_amount, due_date, payment_date, status, installment_number, payment_method_id, payment_type")
                .eq("partner_id", input.partnerId)
                .eq("installment_group_id", input.installmentGroupId)
                .order("installment_number", { ascending: true }),
        ])
        const { data: group, error: groupErr } = groupResult
        const { data: rows, error: rowsErr } = rowsResult
        if (groupErr || !group) throw groupErr || new Error("Grupo de parcelas não encontrado.")
        if (rowsErr) throw rowsErr

        const transactionIds = (rows || []).map((row: any) => row.id).filter(Boolean)
        const paymentMethodIds = new Set<string>()
        for (const row of rows || []) {
            if ((row as any).payment_method_id) paymentMethodIds.add(String((row as any).payment_method_id))
        }

        // PERF: Batch 2 - payments + payment methods (both depend on rows, independent of each other)
        const [paymentsResult, pmsResult] = await Promise.all([
            transactionIds.length > 0
                ? supabase
                    .from("transaction_payments")
                    .select("transaction_id, amount, base_amount, interest_amount, discount_amount")
                    .eq("partner_id", input.partnerId)
                    .in("transaction_id", transactionIds)
                : Promise.resolve({ data: [] as any[], error: null }),
            paymentMethodIds.size > 0
                ? supabase
                    .from("payment_methods")
                    .select("id, name, payment_type")
                    .eq("partner_id", input.partnerId)
                    .in("id", [...paymentMethodIds])
                : Promise.resolve({ data: [] as any[], error: null }),
        ])
        if (paymentsResult.error) throw paymentsResult.error

        const paymentByTxId = new Map<string, { base: number; cash: number; interest: number; discount: number }>()
        for (const payment of paymentsResult.data || []) {
            const txId = String((payment as any).transaction_id || "")
            const pBase = Number(
                (payment as any).base_amount ?? (payment as any).amount ?? 0,
            )
            const pCash = Number((payment as any).amount || 0)
            const pInt = Number((payment as any).interest_amount || 0)
            const pDisc = Number((payment as any).discount_amount || 0)
            const cur: { base: number; cash: number; interest: number; discount: number } =
                paymentByTxId.get(txId) || { base: 0, cash: 0, interest: 0, discount: 0 }
            paymentByTxId.set(txId, {
                base: cur.base + pBase,
                cash: cur.cash + pCash,
                interest: cur.interest + pInt,
                discount: cur.discount + pDisc,
            })
        }

        const paymentMethodLabelById = new Map<string, string>()
        for (const pm of pmsResult.data || []) {
            paymentMethodLabelById.set(String((pm as any).id), formatPaymentMethodLabel((pm as any).name, (pm as any).payment_type) || "Não informado")
        }

        return {
            success: true as const,
            data: {
                group,
                installments: (rows || []).map(
                    (row: {
                        id: string
                        description: string | null
                        amount: number | string | null
                        original_amount: number | string | null
                        due_date: string | null
                        payment_date: string | null
                        status: string | null
                        installment_number: number | null
                        payment_method_id: string | null
                        payment_type: string | null
                    }) => {
                        const paid = String(row.status || "").toLowerCase() === "paid"
                        const dueYmdRow = row.due_date ? String(row.due_date).slice(0, 10) : ""
                        const overdue =
                            !paid &&
                            !!dueYmdRow &&
                            /^\d{4}-\d{2}-\d{2}$/.test(dueYmdRow) &&
                            diffCalendarDaysInSaoPaulo(dueYmdRow) < 0
                        const original = Math.abs(Number(row.original_amount ?? row.amount ?? 0))
                        const agg = paymentByTxId.get(row.id) || { base: 0, cash: 0, interest: 0, discount: 0 }
                        const fallbackPaid = paid && agg.base <= 0 ? original : 0
                        const paidPrincipal = Math.max(0, Math.round((agg.base + fallbackPaid) * 100) / 100)
                        const paidCash = Math.max(0, Math.round((agg.cash + fallbackPaid) * 100) / 100)
                        const remainingAmount = Math.max(0, Math.round((original - paidPrincipal) * 100) / 100)
                        return {
                            id: row.id,
                            description: row.description,
                            installmentNumber: row.installment_number,
                            originalAmount: original,
                            /** Valor pago (caixa) na parcela = base + juros - desconto em cada registro, soma em amount. */
                            paidAmount: paidCash,
                            interestAmount: Math.round(agg.interest * 100) / 100,
                            discountAmount: Math.round(agg.discount * 100) / 100,
                            principalCleared: paidPrincipal,
                            remainingAmount,
                            dueDate: row.due_date
                                ? formatBrazilDateFromDbInput(String(row.due_date).slice(0, 10), "dayMonthYear")
                                : "-",
                            paymentDate: row.payment_date ? formatDateTime(row.payment_date) : null,
                            paymentMethodId: row.payment_method_id || null,
                            paymentType:
                                (row.payment_method_id ? paymentMethodLabelById.get(String(row.payment_method_id)) : null) ||
                                (row.payment_type ? formatPaymentMethodLabel(row.payment_type, null) : null) ||
                                "Não informado",
                            status: paid || remainingAmount <= 0 ? "paid" : overdue ? "overdue" : "pending",
                        }
                    }),
            },
        }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao carregar detalhe do parcelado" }
    }
}

export async function recordInstallmentPaymentAction(input: {
    partnerId: string
    transactionId: string
    paymentAmount: number
    interestAmount?: number
    discountAmount?: number
    paymentMethodId?: string | null
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .select("id, status, partner_id, store_id, payment_method_id, installment_group_id, installment_number, description, category, category_id, subcategory_id, account_id, contact_id, customer_id, contact_type, payment_type, notes, due_date, original_amount, amount, transaction_type, refund_kind")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (txErr || !tx) throw new Error(txErr?.message || "Parcela não encontrada.")
        if (!tx.installment_group_id) throw new Error("Pagamento parcial é permitido apenas para parcelas.")
        if (!isStatusPending(tx.status)) throw new Error("A parcela já está quitada.")

        // Parcelas de venda (ledger de vendas) já nascem com o método de pagamento
        // fixado pelo gateway (ex: cartão de crédito) — não pode ser alterado.
        const lockedPaymentMethodId = tx.payment_method_id || null
        const effectivePaymentMethodId = lockedPaymentMethodId || input.paymentMethodId || null

        const paymentAmount = Number(input.paymentAmount || 0)
        const interestAmount = Number(input.interestAmount || 0)
        const discountAmount = Number(input.discountAmount || 0)
        if (!Number.isFinite(paymentAmount) || !Number.isFinite(interestAmount) || !Number.isFinite(discountAmount)) {
            throw new Error("Valores de pagamento inválidos.")
        }

        const { data: existingPayments, error: paymentsErr } = await supabase
            .from("transaction_payments")
            .select("amount, base_amount, interest_amount, discount_amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)
        if (paymentsErr) throw paymentsErr

        const originalAmount = Math.abs(Number(tx.original_amount ?? tx.amount ?? 0))
        const paidPrincipalSoFar = (existingPayments || []).reduce(
            (acc: number, row: { amount: number | string | null; base_amount?: number | string | null }) =>
                acc + Number(row.base_amount ?? row.amount ?? 0),
            0,
        )
        const remainingPrincipal = Math.max(0, Math.round((originalAmount - paidPrincipalSoFar) * 100) / 100)

        const baseRequest = Math.max(0, Math.round(paymentAmount * 100) / 100)
        let baseApplied = Math.min(remainingPrincipal, baseRequest)
        baseApplied = Math.round(baseApplied * 100) / 100

        let finalPaid = Math.round((baseApplied + interestAmount - discountAmount) * 100) / 100
        if (finalPaid <= 0) {
            throw new Error("O valor final pago (após juros e desconto) deve ser maior que zero.")
        }

        if (baseApplied < 0.0001 && remainingPrincipal > 0.01) {
            throw new Error("Não é possível abater a parcela sem informar o valor de principal.")
        }

        const fullyPaid = paidPrincipalSoFar + baseApplied + 0.0001 >= originalAmount
        const paidAfter = paidPrincipalSoFar + baseApplied
        const nowIso = new Date().toISOString()
        const idempotencyKey = `installment:${input.transactionId}:${nowIso}:${finalPaid}`

        const { error: insertPaymentErr } = await supabase
            .from("transaction_payments")
            .insert({
                partner_id: input.partnerId,
                transaction_id: input.transactionId,
                store_id: tx.store_id || null,
                amount: finalPaid,
                base_amount: baseApplied,
                interest_amount: interestAmount,
                discount_amount: discountAmount,
                payment_method_id: effectivePaymentMethodId,
                created_by_user_id: userId,
                created_at: nowIso,
                idempotency_key: idempotencyKey,
            })
        if (insertPaymentErr) {
            // Handle unique constraint violation (duplicate payment)
            if ((insertPaymentErr as any).code === "23505") {
                throw new Error("Este pagamento já foi registrado.")
            }
            throw insertPaymentErr
        }

        let resolvedAccountId = tx.account_id
        if (effectivePaymentMethodId) {
            const { data: pm } = await supabase
                .from("payment_methods")
                .select("default_finance_account_id")
                .eq("id", effectivePaymentMethodId)
                .eq("partner_id", input.partnerId)
                .maybeSingle()
            if (pm?.default_finance_account_id) {
                resolvedAccountId = pm.default_finance_account_id
            }
        }

        if (resolvedAccountId) {
            await applyFinanceAccountBalanceDelta(supabase, input.partnerId, resolvedAccountId, {
                transaction_type: tx.transaction_type,
                amount: finalPaid,
                refund_kind: tx.refund_kind,
            })
        }

        const existingInterest = (existingPayments || []).reduce(
            (acc: number, row: any) => acc + Number(row.interest_amount ?? 0), 0
        )
        const totalInterest = existingInterest + interestAmount

        const existingDiscount = (existingPayments || []).reduce(
            (acc: number, row: any) => acc + Number(row.discount_amount ?? 0), 0
        )
        const totalDiscount = existingDiscount + discountAmount

        const existingTotalPaid = (existingPayments || []).reduce(
            (acc: number, row: any) => acc + Number(row.amount ?? 0), 0
        )
        const totalPaidAmount = existingTotalPaid + finalPaid

        const updatePayload: Record<string, unknown> = {
            updated_at: nowIso,
            payment_date: nowIso,
            interest_amount: totalInterest > 0 ? totalInterest : (tx.interest_amount || null),
            discount_amount: totalDiscount > 0 ? totalDiscount : (tx.discount_amount || null),
            paid_amount: totalPaidAmount > 0 ? totalPaidAmount : (tx.paid_amount || null),
        }
        if (resolvedAccountId) {
            updatePayload.account_id = resolvedAccountId
        }
        const installmentNewPmLabel = input.paymentMethodId
            ? await paymentMethodDisplayLabel(supabase, input.partnerId, input.paymentMethodId).catch(() => null)
            : null
        if (input.paymentMethodId !== undefined) {
            updatePayload.payment_method_id = input.paymentMethodId || null
            updatePayload.payment_type = installmentNewPmLabel || null
        }
        if (fullyPaid) {
            updatePayload.status = "paid"
            const existingTotal = (existingPayments || []).reduce(
                (acc: number, row: any) => acc + Number(row.amount ?? 0), 0
            )
            const totalPaid = existingTotal + finalPaid
            if (totalPaid > 0) {
                updatePayload.amount = totalPaid
            }
        }
        const { error: updateErr } = await supabase
            .from("transactions")
            .update(updatePayload)
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
        if (updateErr) throw updateErr

        const installmentDir = tx.transaction_type === "income" ? "recebido" : "pago"
        const installmentPmLabel = installmentNewPmLabel
        let installmentHistoryLine = fullyPaid
            ? `Quitou a parcela - R$ ${finalPaid.toFixed(2)} ${installmentDir}`
            : `Pagamento parcial de R$ ${finalPaid.toFixed(2)} ${installmentDir}`
        if (installmentPmLabel || tx.payment_type) {
            installmentHistoryLine += ` utilizando ${installmentPmLabel || tx.payment_type}`
        }
        if (interestAmount > 0) installmentHistoryLine += ` (Juros: R$ ${interestAmount.toFixed(2)})`
        if (discountAmount > 0) installmentHistoryLine += ` (Desconto: R$ ${discountAmount.toFixed(2)})`

        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: userId,
            entityType: "transaction",
            entityId: input.transactionId,
            actionType: fullyPaid ? "installment_paid" : "installment_partial_paid",
            changeLines: [installmentHistoryLine],
            metadata: fullyPaid
                ? { oldStatus: "Pendente", newStatus: "Pago" }
                : { oldStatus: "Pendente", paidSoFar: totalPaidAmount, remaining: Math.max(0, originalAmount - paidAfter) },
            source: "manual",
        })
        await revalidateEntityTimeline("transaction", input.transactionId)

        await revalidateTransactions(input.partnerId)
        return {
            success: true as const,
            data: {
                originalAmount,
                paidSoFar: paidPrincipalSoFar,
                remainingBefore: remainingPrincipal,
                paidNow: finalPaid,
                principalApplied: baseApplied,
                remainingAfter: Math.max(0, Math.round((originalAmount - paidAfter) * 100) / 100),
                fullyPaid,
            },
        }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao registrar pagamento da parcela" }
    }
}

export async function recordRegularTransactionPaymentAction(input: {
    partnerId: string
    transactionId: string
    paymentAmount: number
    interestAmount?: number
    discountAmount?: number
    paymentMethodId?: string | null
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .select("id, status, partner_id, store_id, description, category, category_id, subcategory_id, account_id, contact_id, customer_id, contact_type, payment_type, notes, due_date, original_amount, amount, transaction_type, refund_kind")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (txErr || !tx) throw new Error(txErr?.message || "Transação não encontrada.")
        if (!isStatusPending(tx.status)) throw new Error("A transação já está quitada.")

        const paymentAmount = Number(input.paymentAmount || 0)
        const interestAmount = Number(input.interestAmount || 0)
        const discountAmount = Number(input.discountAmount || 0)
        if (!Number.isFinite(paymentAmount) || !Number.isFinite(interestAmount) || !Number.isFinite(discountAmount)) {
            throw new Error("Valores de pagamento inválidos.")
        }

        const { data: existingPayments, error: paymentsErr } = await supabase
            .from("transaction_payments")
            .select("amount, base_amount, interest_amount, discount_amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)
        if (paymentsErr) throw paymentsErr

        const originalAmount = Math.abs(Number(tx.original_amount ?? tx.amount ?? 0))
        const paidPrincipalSoFar = (existingPayments || []).reduce(
            (acc: number, row: any) => acc + Number(row.base_amount ?? row.amount ?? 0), 0,
        )
        const remainingPrincipal = Math.max(0, Math.round((originalAmount - paidPrincipalSoFar) * 100) / 100)

        const baseRequest = Math.max(0, Math.round(paymentAmount * 100) / 100)
        let baseApplied = Math.min(remainingPrincipal, baseRequest)
        baseApplied = Math.round(baseApplied * 100) / 100

        let finalPaid = Math.round((baseApplied + interestAmount - discountAmount) * 100) / 100
        if (finalPaid <= 0) {
            throw new Error("O valor final pago (após juros e desconto) deve ser maior que zero.")
        }

        const fullyPaid = paidPrincipalSoFar + baseApplied + 0.0001 >= originalAmount
        const paidAfter = paidPrincipalSoFar + baseApplied
        const nowIso = new Date().toISOString()
        const idempotencyKey = `regular:${input.transactionId}:${nowIso}:${finalPaid}`

        const { error: insertPaymentErr } = await supabase
            .from("transaction_payments")
            .insert({
                partner_id: input.partnerId,
                transaction_id: input.transactionId,
                store_id: tx.store_id || null,
                amount: finalPaid,
                base_amount: baseApplied,
                interest_amount: interestAmount,
                discount_amount: discountAmount,
                payment_method_id: input.paymentMethodId || null,
                created_by_user_id: userId,
                created_at: nowIso,
            })
        if (insertPaymentErr) {
            if ((insertPaymentErr as any).code === "23505") {
                throw new Error("Este pagamento já foi registrado.")
            }
            throw insertPaymentErr
        }

        let resolvedAccountId = tx.account_id
        if (input.paymentMethodId) {
            const { data: pm } = await supabase
                .from("payment_methods")
                .select("default_finance_account_id")
                .eq("id", input.paymentMethodId)
                .eq("partner_id", input.partnerId)
                .maybeSingle()
            if (pm?.default_finance_account_id) {
                resolvedAccountId = pm.default_finance_account_id
            }
        }

        if (resolvedAccountId) {
            await applyFinanceAccountBalanceDelta(supabase, input.partnerId, resolvedAccountId, {
                transaction_type: tx.transaction_type,
                amount: finalPaid,
                refund_kind: tx.refund_kind,
            })
        }

        const pmTypeLabel = input.paymentMethodId
            ? await paymentMethodDisplayLabel(supabase, input.partnerId, input.paymentMethodId)
            : tx.payment_type

        const existingTotalPaid = (existingPayments || []).reduce(
            (acc: number, row: any) => acc + Number(row.amount ?? 0), 0
        )
        const totalPaidAmount = existingTotalPaid + finalPaid

        const updatePayload: Record<string, unknown> = {
            updated_at: nowIso,
            payment_date: nowIso,
            interest_amount: interestAmount > 0 ? interestAmount : (tx.interest_amount || null),
            discount_amount: discountAmount > 0 ? discountAmount : (tx.discount_amount || null),
            paid_amount: totalPaidAmount > 0 ? totalPaidAmount : (tx.paid_amount || null),
        }
        if (resolvedAccountId) {
            updatePayload.account_id = resolvedAccountId
        }
        if (input.paymentMethodId !== undefined) {
            updatePayload.payment_method_id = input.paymentMethodId || null
            updatePayload.payment_type = pmTypeLabel || null
        }
        if (fullyPaid) {
            updatePayload.status = "paid"
            if (totalPaidAmount > 0) {
                updatePayload.amount = totalPaidAmount
            }
        }

        const { error: updateErr } = await supabase
            .from("transactions")
            .update(updatePayload)
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
        if (updateErr) throw updateErr

        const dir = tx.transaction_type === "income" ? "recebido" : "pago"
        const pmLabel = pmTypeLabel || tx.payment_type || ""
        let historyLine = `Pagou R$ ${finalPaid.toFixed(2)}`
        if (pmLabel) historyLine += ` utilizando ${pmLabel}`
        if (interestAmount > 0) historyLine += ` (Juros: R$ ${interestAmount.toFixed(2)})`
        if (discountAmount > 0) historyLine += ` (Desconto: R$ ${discountAmount.toFixed(2)})`
        if (!fullyPaid) historyLine += ` - saldo restante: R$ ${Math.max(0, originalAmount - paidAfter).toFixed(2)}`

        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: userId,
            entityType: "transaction",
            entityId: input.transactionId,
            actionType: fullyPaid ? "paid" : "partial_paid",
            changeLines: [historyLine],
            metadata: fullyPaid
                ? { oldStatus: "Pendente", newStatus: "Pago" }
                : { oldStatus: "Pendente", paidSoFar: totalPaidAmount, remaining: Math.max(0, originalAmount - paidAfter) },
            source: "manual",
        })

        await revalidateEntityTimeline("transaction", input.transactionId)
        await revalidateTransactions(input.partnerId)

        return {
            success: true as const,
            data: {
                originalAmount,
                paidSoFar: paidPrincipalSoFar,
                remainingBefore: remainingPrincipal,
                paidNow: finalPaid,
                principalApplied: baseApplied,
                remainingAfter: Math.max(0, Math.round((originalAmount - paidAfter) * 100) / 100),
                fullyPaid,
            },
        }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao registrar pagamento" }
    }
}

export async function settleInstallmentGroupAction(input: {
    partnerId: string
    installmentGroupId: string
    installmentPayments?: Array<{
        transactionId: string
        paymentAmount: number
        interestAmount?: number
        discountAmount?: number
        paymentMethodId?: string | null
    }>
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()
        const nowIso = new Date().toISOString()

        // Pre-fetch pending transactions to log audit events after successful settlement
        const { data: pendingTxs } = await supabase
            .from("transactions")
            .select("id, payment_method_id")
            .eq("partner_id", input.partnerId)
            .eq("installment_group_id", input.installmentGroupId)
            .neq("status", "paid")

        const txIdsToLog = pendingTxs?.map((t: any) => t.id) || []

        // Parcelas de venda mantêm o método fixado pela venda (ex: cartão de crédito)
        const lockedPmByTx = new Map<string, string>(
            (pendingTxs || [])
                .map((t: any) => [t.id, t.payment_method_id])
                .filter(([, pm]: any[]) => !!pm),
        )
        const sanitizedPayments = (input.installmentPayments || []).map((p) => ({
            ...p,
            paymentMethodId: lockedPmByTx.get(p.transactionId) || p.paymentMethodId || null,
        }))

        // Execute the atomic settlement RPC
        const { data, error } = await supabase.rpc("settle_installment_group", {
            p_partner_id: input.partnerId,
            p_installment_group_id: input.installmentGroupId,
            p_user_id: userId,
            p_custom_payments: sanitizedPayments.length > 0 ? sanitizedPayments : null
        })

        if (error) {
            console.error("[transactions] settle_installment_group RPC failed:", error)
            throw new Error(`Falha na transação atômica de liquidação: ${error.message}`)
        }

        // Log audit events for the transactions that were just settled
        const settleCustomPayments = sanitizedPayments
        if (txIdsToLog.length > 0) {
            await Promise.allSettled(
                txIdsToLog.map((transactionId: string) => {
                    const matchedPayment = settleCustomPayments.find(p => p.transactionId === transactionId)
                    const pAmt = matchedPayment?.paymentAmount || 0
                    const pInt = matchedPayment?.interestAmount || 0
                    const pDisc = matchedPayment?.discountAmount || 0
                    let settleMsg = `Quitou a parcela - R$ ${(pAmt + pInt - pDisc).toFixed(2)}`
                    if (pInt > 0) settleMsg += ` (Juros: R$ ${pInt.toFixed(2)})`
                    if (pDisc > 0) settleMsg += ` (Desconto: R$ ${pDisc.toFixed(2)})`
                    return logAuditEvent({
                        partnerId: input.partnerId,
                        actorUserId: userId,
                        entityType: "transaction",
                        entityId: transactionId,
                        actionType: "settled",
                        changeLines: [settleMsg],
                        metadata: { oldStatus: "Pendente", newStatus: "Pago" },
                        source: "manual",
                    })
                }),
            )
        }

        await revalidateTransactions(input.partnerId)

        return {
            success: true as const,
            data: {
                settledCount: data?.settledCount || 0,
                createdPayments: data?.createdPayments || 0,
                affectedCount: data?.affectedCount || 0
            }
        }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao quitar parcelado" }
    }
}

/**
 * Mark a recurring occurrence as paid.
 * Idempotent: if already paid for this date, returns the existing record.
 * Duplicate-safe: unique index on (recurring_id, due_date) prevents DB-level duplicates.
 */
export async function markRecurringOccurrenceAsPaidAction(input: {
    partnerId: string
    recurringId: string
    occurrenceDate: string // yyyy-MM-dd
    accountId?: string | null
    paymentMethodId?: string | null
    paymentAmount?: number
    interestAmount?: number
    discountAmount?: number
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        // Fetch the recurring template
        const { data: rec, error: recErr } = await supabase
            .from("recurring_transactions")
            .select("*")
            .eq("id", input.recurringId)
            .eq("partner_id", input.partnerId)
            .single()
        if (recErr || !rec) throw new Error("Recorrência não encontrada.")

        const dueDateValue = input.occurrenceDate
        const transactionTs = startOfDay(dueDateValue).toISOString()

        // Idempotent check: if already paid for this date, return existing
        const { data: existing } = await supabase
            .from("transactions")
            .select("id")
            .eq("recurring_id", input.recurringId)
            .eq("due_date", dueDateValue)
            .eq("status", "paid")
            .limit(1)
            .maybeSingle()

        if (existing) {
            return { success: true, data: existing, alreadyPaid: true }
        }

        const paymentAmount = input.paymentAmount !== undefined ? Number(input.paymentAmount) : Number(rec.amount || 0)
        const interestAmount = Number(input.interestAmount || 0)
        const discountAmount = Number(input.discountAmount || 0)
        const finalPaid = Math.round((paymentAmount + interestAmount - discountAmount) * 100) / 100
        if (finalPaid <= 0) {
            throw new Error("O valor final pago (após juros e desconto) deve ser maior que zero.")
        }

        let categoryName: string | null = null
        if (rec.category_id) {
            const { data: cat } = await supabase
                .from("financial_categories")
                .select("name")
                .eq("id", rec.category_id)
                .single()
            if (cat?.name) categoryName = cat.name
        }

        const accountId = input.accountId || rec.account_id || null
        const nowIso = new Date().toISOString()
        const resolvedPmId = input.paymentMethodId || rec.payment_method_id || null
        const paymentTypeLabel = await paymentMethodDisplayLabel(supabase, input.partnerId, resolvedPmId)

        // Check if a pending transaction already exists (from cron) - upgrade it to paid
        const { data: pendingTx } = await supabase
            .from("transactions")
            .select("id, status, account_id")
            .eq("recurring_id", input.recurringId)
            .eq("due_date", dueDateValue)
            .eq("status", "pending")
            .limit(1)
            .maybeSingle()

        if (pendingTx) {
            // Upgrade pending → paid
            const { data: updated, error: updErr } = await supabase
                .from("transactions")
                .update({
                    status: "paid",
                    payment_date: nowIso,
                    account_id: accountId,
                    payment_method_id: resolvedPmId,
                    payment_type: paymentTypeLabel,
                    amount: finalPaid,
                    original_amount: paymentAmount,
                    interest_amount: interestAmount,
                    discount_amount: discountAmount,
                    paid_amount: finalPaid,
                    updated_at: nowIso,
                })
                .eq("id", pendingTx.id)
                .eq("partner_id", input.partnerId)
                .select("*")
                .single()
            if (updErr) throw updErr

            // Insert a payment record for history consistency
            const tpIdempotencyKey = `recurring:${pendingTx.id}:${nowIso}:${finalPaid}`
            await supabase
                .from("transaction_payments")
                .insert({
                    partner_id: input.partnerId,
                    transaction_id: pendingTx.id,
                    store_id: rec.store_id || null,
                    amount: finalPaid,
                    base_amount: paymentAmount,
                    interest_amount: interestAmount,
                    discount_amount: discountAmount,
                    payment_method_id: resolvedPmId,
                    created_by_user_id: userId,
                    created_at: nowIso,
                    idempotency_key: tpIdempotencyKey,
                })

            await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, accountId, {
                transaction_type: rec.type,
                amount: finalPaid,
                status: "paid",
            })
            console.info(
                "[recurring] occurrence_marked_paid",
                JSON.stringify({ recurringId: input.recurringId, occurrenceDate: input.occurrenceDate }),
            )
            let recurringMsg = `Marcou ocorrência recorrente como paga - R$ ${finalPaid.toFixed(2)}`
            if (interestAmount > 0) recurringMsg += ` (Juros: R$ ${interestAmount.toFixed(2)})`
            if (discountAmount > 0) recurringMsg += ` (Desconto: R$ ${discountAmount.toFixed(2)})`
            await logAuditEvent({
                partnerId: input.partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: pendingTx.id,
                actionType: "paid",
                changeLines: [recurringMsg],
                metadata: { oldStatus: "Pendente", newStatus: "Pago" },
                source: "manual",
            })
            await revalidateEntityTimeline("transaction", pendingTx.id)
            await revalidateTransactions(input.partnerId)
            return { success: true, data: updated }
        }

        // Create a fresh paid transaction from recurring template
        const payload = {
            partner_id: input.partnerId,
            store_id: rec.store_id || null,
            description: rec.description,
            category: categoryName,
            category_id: rec.category_id,
            subcategory_id: rec.subcategory_id,
            contact_id: rec.contact_id,
            contact_type: rec.contact_type,
            customer_id: rec.customer_id,
            amount: finalPaid,
            due_date: dueDateValue,
            payment_date: nowIso,
            transaction_date: transactionTs,
            status: "paid",
            notes: null,
            original_amount: paymentAmount,
            interest_amount: interestAmount,
            discount_amount: discountAmount,
            paid_amount: finalPaid,
            fee_amount: 0,
            payment_type: paymentTypeLabel,
            transaction_type: rec.type,
            account_id: accountId,
            origin: "system" as const,
            recurring_id: rec.id,
            payment_method_id: resolvedPmId,
            created_by_user_id: userId,
        }

        const insertRes = await insertTransactionsWithOptionalCreator(supabase, payload)
        const newTx = (insertRes.data || [])[0]
        const insertErr = insertRes.error

        if (insertErr) {
            // Handle unique constraint violation gracefully (idempotent)
            if (insertErr.code === "23505") {
                return { success: true, data: null, alreadyPaid: true }
            }
            throw insertErr
        }

        if (newTx?.id) {
            // Insert a payment record for history consistency
            const tpIdempotencyKey = `recurring:${newTx.id}:${nowIso}:${finalPaid}`
            await supabase
                .from("transaction_payments")
                .insert({
                    partner_id: input.partnerId,
                    transaction_id: newTx.id,
                    store_id: rec.store_id || null,
                    amount: finalPaid,
                    base_amount: paymentAmount,
                    interest_amount: interestAmount,
                    discount_amount: discountAmount,
                    payment_method_id: resolvedPmId,
                    created_by_user_id: userId,
                    created_at: nowIso,
                    idempotency_key: tpIdempotencyKey,
                })
        }

        await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, accountId, {
            transaction_type: rec.type,
            amount: finalPaid,
            status: "paid",
        })

        console.info(
            "[recurring] occurrence_marked_paid",
            JSON.stringify({ recurringId: input.recurringId, occurrenceDate: input.occurrenceDate }),
        )
        if (newTx?.id) {
            let recurringCreatedMsg = `Marcou ocorrência recorrente como paga - R$ ${finalPaid.toFixed(2)}`
            if (interestAmount > 0) recurringCreatedMsg += ` (Juros: R$ ${interestAmount.toFixed(2)})`
            if (discountAmount > 0) recurringCreatedMsg += ` (Desconto: R$ ${discountAmount.toFixed(2)})`
            await logAuditEvent({
                partnerId: input.partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: newTx.id,
                actionType: "created",
                changeLines: [recurringCreatedMsg],
                source: "manual",
            })
            await revalidateEntityTimeline("transaction", newTx.id)
        }
        await revalidateTransactions(input.partnerId)
        return { success: true, data: newTx }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao marcar como pago" }
    }
}

export async function adjustAccountBalanceViaTransactionAction(input: {
    partnerId: string
    accountId: string
    newBalance: number
    description?: string | null
    transactionDateYmd?: string | null
    storeId?: string | null
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const { data: acc, error: accErr } = await supabase
            .from("finance_accounts")
            .select("id, name, current_balance")
            .eq("id", input.accountId)
            .eq("partner_id", input.partnerId)
            .single()
        if (accErr || !acc) throw new Error("Conta não encontrada.")

        const old = numFinanceBalance(acc.current_balance)
        const target = Number(input.newBalance)
        if (!Number.isFinite(target)) throw new Error("Saldo inválido.")

        const delta = Math.round((target - old) * 100) / 100
        if (delta === 0) {
            return { success: true, data: { skipped: true as const } }
        }

        const datePart = (input.transactionDateYmd || new Date().toISOString().slice(0, 10)).slice(0, 10)
        const transactionTs = startOfDay(datePart).toISOString()
        const desc = (input.description && input.description.trim()) || `Ajuste de saldo - ${acc.name}`

        const res = await createManualTransactionAction({
            partnerId: input.partnerId,
            storeId: input.storeId || null,
            transactionType: "adjustment",
            amount: delta,
            description: desc,
            category: "Ajuste de saldo",
            categoryId: null,
            subcategoryId: null,
            accountId: input.accountId,
            contactId: null,
            customerId: null,
            contactType: null,
            paymentType: "Ajuste",
            dueDate: datePart,
            paymentDate: transactionTs,
            transactionDate: transactionTs,
            status: "paid",
            notes: null,
            origin: "manual",
        })

        if (!res.success) throw new Error(res.error || "Erro ao registrar ajuste.")
        return { success: true, data: res.data }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao ajustar saldo" }
    }
}

export async function getTransactionHistoryAction(transactionId: string, partnerId: string) {
    try {
        await requirePermission(partnerId, "financial", "view")
        const entries = await getTransactionHistoryEntries(transactionId, partnerId)
        return { success: true as const, data: entries }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao carregar histórico" }
    }
}

export type TransactionDetailPayload = {
    id: string
    headerTitle: string
    statusLabel: string
    statusVariant: ERPTransaction["statusVariant"]
    transactionType: ERPTransaction["transactionType"]
    isRecurring: boolean
    paymentMethodSubtitle: string
    paymentDateSubtitle: string | null
    creatorName: string
    originLabel: string
    originSource: string
    typeBannerLabel: string
    timeline: {
        step1: { label: string; date: string; time: string; active: boolean }
        step2: { label: string; date: string; time: string; active: boolean; danger: boolean }
    }
    items: Array<{
        id: string
        title: string
        sku: string
        quantity: number
        unitPrice: number
        lineTotal: number
        image: string | null
    }>
    /** Itens só com descrição + valor (pagamentos de parcela / quitação parcelada). */
    transactionItemsCompact?: boolean
    installmentBreakdown?: Array<{
        id: string
        installmentNumber: number
        totalCount: number
        dueDate: string | null
        paymentDate: string | null
        originalAmount: number
        /** Soma de transaction_payments.amount (efetivo de caixa). */
        paidAmount: number
        interestAmount: number
        discountAmount: number
        /** Soma de base_amount (abatimento do principal). */
        principalCleared: number
        remainingAmount?: number
        paymentType: string
        status: "paid" | "pending" | "overdue"
    }>
    /** Quando a transação faz parte de um parcelado: rótulo da data no resumo. */
    paymentDateRowLabel?: string
    /** Total do grupo (installment_groups.total_amount) quando parcelado. */
    installmentGroupTotalAmount?: number | null
    categoryLine: string
    subcategoryLine: string | null
    accountLine: string | null
    dueDateLine: string | null
    paymentDateLine: string | null
    notesLine: string | null
    goalBonusDetails?: {
        goalId: string
        goalName: string
        paidToUserIds: string[]
        paidToUserNames: string[]
        achievedAt: string | null
    } | null
    originalAmount?: number | null
    interestAmount?: number | null
    discountAmount?: number | null
    paidAmount?: number | null
    amount: number
    ledgerDirection: ERPTransaction["ledgerDirection"]
    contactCard: {
        title: string
        name: string
        email: string | null
        phone: string | null
        isCustomer?: boolean
        id?: string | null
        image_url?: string | null
        address?: {
            street?: string
            number?: string
            complement?: string
            neighborhood?: string
            city?: string
            state?: string
            zipCode?: string
        } | null
        billingAddress?: {
            street?: string
            number?: string
            complement?: string
            neighborhood?: string
            city?: string
            state?: string
            zipCode?: string
        } | null
    }
    canEdit: boolean
    /** Quando false, a UI não exibe a linha "Data de vencimento" (ex.: vendas PDV/pedido sem vencimento). */
    showDueDateRow: boolean
    transactionDetailKind?: "default" | "manual_entry" | "transfer"
    transferAccounts?: {
        from: { name: string; type: string } | null
        to: { name: string; type: string } | null
        amount: number
    } | null
    salesSummary?: {
        subtotal: number
        manualDiscount: number
        couponDiscount: number
        paymentMethodDiscount: number
        paymentMethodExtra: number
        deliveryFee: number
        additionalCosts: number
        paymentMethod?: string | null
        paidAmount?: number
        changeAmount?: number
        paymentBreakdown?: Array<{ method: string; amount: number; paymentMethodId?: string | null; installmentNumber?: number }> | null
    } | null
}

export async function getTransactionDetailsAction(
    transactionId: string,
    partnerId: string,
): Promise<{ success: true; data: TransactionDetailPayload } | { success: false; error: string }> {
    try {
        await requirePermission(partnerId, "financial", "view")
        const supabase = createAdminClient()

        let txQuery = await supabase
            .from("transactions")
            .select(
                `
        id, description, category, amount, original_amount, interest_amount, discount_amount, paid_amount, due_date, payment_date, created_at, updated_at, status, notes,
        payment_type, transaction_type, contact_id, customer_id, contact_type, transfer_group_id,
        refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id,
        payment_method_id, transaction_date, created_by_user_id, installment_group_id,
        transaction_contacts(name, type, description)
      `,
            )
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (txQuery.error && isMissingCreatedByUserIdColumnError(txQuery.error)) {
            txQuery = await supabase
                .from("transactions")
                .select(
                    `
        id, description, category, amount, original_amount, interest_amount, discount_amount, paid_amount, due_date, payment_date, created_at, updated_at, status, notes,
        payment_type, transaction_type, contact_id, customer_id, contact_type, transfer_group_id,
        refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id,
        payment_method_id, transaction_date, installment_group_id,
        transaction_contacts(name, type, description)
      `,
                )
                .eq("id", transactionId)
                .eq("partner_id", partnerId)
                .single()
        }

        const t = txQuery.data
        const error = txQuery.error

        if (error || !t) {
            return { success: false, error: "Transação não encontrada." }
        }

        const row = t as any
        const dueYmd = row.due_date ? String(row.due_date).slice(0, 10) : null
        const isOverdue =
            isStatusPending(row.status) &&
            !!dueYmd &&
            /^\d{4}-\d{2}-\d{2}$/.test(dueYmd) &&
            diffCalendarDaysInSaoPaulo(dueYmd) < 0

        const statusLabel = toDisplayStatus(row.status, row.transaction_type, row.refund_kind, isOverdue)
        const statusVariant = toStatusVariant(row.status, isOverdue)
        // PERF: Parallelize 4 independent lookups (was sequential, saving ~200-400ms)
        const t0Detail = performance.now()
        const [paymentSubtitle, creatorName, accountData, subcategoryLine] = await Promise.all([
            // 1. Payment method display label
            row.payment_method_id
                ? paymentMethodDisplayLabel(supabase, partnerId, row.payment_method_id).then(
                    (label) => label || (row.payment_type ? formatPaymentMethodLabel(row.payment_type, null) : "") || "Não informado"
                )
                : Promise.resolve(
                    (row.payment_type ? formatPaymentMethodLabel(row.payment_type, null) : "") || "Não informado"
                ),
            // 2. Creator name
            row.created_by_user_id
                ? supabase
                    .from("user_profiles")
                    .select("full_name")
                    .eq("user_id", row.created_by_user_id)
                    .maybeSingle()
                    .then(({ data: creatorProf }: { data: any }) =>
                        creatorProf?.full_name?.trim() ? creatorProf.full_name.trim() : "Sistema"
                    )
                : Promise.resolve("Sistema"),
            // 3. Account data
            row.account_id
                ? supabase
                    .from("finance_accounts")
                    .select("name, type")
                    .eq("id", row.account_id)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                    .then(({ data: acc }: { data: any }) => ({ name: acc?.name || null, type: acc?.type || null }))
                : Promise.resolve({ name: null as string | null, type: null as string | null }),
            // 4. Subcategory name
            row.subcategory_id
                ? supabase
                    .from("financial_categories")
                    .select("name")
                    .eq("id", row.subcategory_id)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                    .then(({ data: sub }: { data: any }) => sub?.name || null)
                : Promise.resolve(null as string | null),
        ])
        const accountLine = accountData?.name || null
        let finalPaymentSubtitle = paymentSubtitle

        const headerTitle = String(row.description || "").trim() || "Transação"

        const paid = isStatusPaid(row.status)
        const cancelled = isCancelledStatus(row.status)
        const step2Label = cancelled
            ? "Cancelado"
            : row.transaction_type === "refund"
                ? "Reembolsado"
                : paid
                    ? row.transaction_type === "income" ||
                        (row.transaction_type === "refund" && row.refund_kind === "expense_refund")
                        ? "Recebido"
                        : "Pago"
                    : "Pendente"

        const timeline = {
            step1: {
                label: "Criado",
                date: formatDayMonth(row.created_at),
                time: formatTime(row.created_at),
                active: true,
            },
            step2: {
                label: step2Label,
                date:
                    cancelled || !paid
                        ? ""
                        : row.payment_date
                            ? formatDayMonth(row.payment_date)
                            : formatDayMonth(row.created_at),
                time: paid && row.payment_date ? formatTime(row.payment_date) : "",
                active: paid || cancelled,
                danger: cancelled,
            },
        }

        let installmentBreakdown: TransactionDetailPayload["installmentBreakdown"] | undefined = undefined
        let installmentGroupTotalAmount: number | null = null
        let paymentDateRowLabel: TransactionDetailPayload["paymentDateRowLabel"] = "Data da transação"
        let currentTxPaymentAgg: { base: number; cash: number; interest: number; discount: number } | null = null
        if (row.installment_group_id) {
            paymentDateRowLabel = "Data de finalização"
            // PERF: Parallelize group metadata + group transactions (independent reads)
            const [{ data: igGroup }, { data: groupRows }] = await Promise.all([
                supabase
                    .from("installment_groups")
                    .select("total_amount")
                    .eq("id", String(row.installment_group_id))
                    .eq("partner_id", partnerId)
                    .maybeSingle(),
                supabase
                    .from("transactions")
                    .select("id, installment_number, due_date, payment_date, status, amount, original_amount, payment_type")
                    .eq("partner_id", partnerId)
                    .eq("installment_group_id", row.installment_group_id)
                    .order("installment_number", { ascending: true }),
            ])
            if (igGroup && igGroup.total_amount != null) {
                installmentGroupTotalAmount = Math.abs(Number(igGroup.total_amount) || 0) || null
            }
            const txIds = (groupRows || []).map((g: any) => g.id)
            const paymentByTx = new Map<string, { base: number; cash: number; interest: number; discount: number }>()
            let paymentRows: any[] = []
            if (txIds.length > 0) {
                const res = await supabase
                    .from("transaction_payments")
                    .select("transaction_id, amount, base_amount, interest_amount, discount_amount, payment_method_id")
                    .eq("partner_id", partnerId)
                    .in("transaction_id", txIds)
                paymentRows = res.data || []
                for (const p of paymentRows) {
                    const tid = String((p as any).transaction_id || "")
                    const pBase = Number((p as any).base_amount ?? (p as any).amount ?? 0)
                    const pCash = Number((p as any).amount || 0)
                    const pInt = Number((p as any).interest_amount || 0)
                    const pDisc = Number((p as any).discount_amount || 0)
                    const cur = paymentByTx.get(tid) || { base: 0, cash: 0, interest: 0, discount: 0 }
                    paymentByTx.set(tid, {
                        base: cur.base + pBase,
                        cash: cur.cash + pCash,
                        interest: cur.interest + pInt,
                        discount: cur.discount + pDisc,
                    })
                }
            }

            const pmIds = [...new Set(paymentRows.map((p: any) => p.payment_method_id).filter(Boolean) || [])]
            const pmMap = new Map<string, string>()
            if (pmIds.length > 0) {
                const { data: pmData } = await supabase
                    .from("payment_methods")
                    .select("id, name, payment_type")
                    .eq("partner_id", partnerId)
                    .in("id", pmIds)
                for (const pm of pmData || []) {
                    pmMap.set(pm.id, formatPaymentMethodLabel(pm.name, pm.payment_type) || "Não informado")
                }
            }

            const mainTxPayments = paymentRows.filter((p: any) => p.transaction_id === row.id)
            const mainPmLabels = mainTxPayments
                .map((p: any) => p.payment_method_id ? pmMap.get(p.payment_method_id) : null)
                .filter(Boolean) as string[]
            if (paymentSubtitle && paymentSubtitle !== "Não informado") {
                paymentSubtitle.split(",").forEach(s => mainPmLabels.push(s.trim()))
            }
            const uniqueMainLabels = [...new Set(mainPmLabels)].filter(Boolean)
            if (uniqueMainLabels.length > 0) {
                finalPaymentSubtitle = uniqueMainLabels.join(", ")
            }

            currentTxPaymentAgg = paymentByTx.get(row.id) || { base: 0, cash: 0, interest: 0, discount: 0 }
            const totalCount = groupRows?.length || 0
            installmentBreakdown = (groupRows || []).map((g: any) => {
                const original = Math.abs(Number(g.original_amount ?? g.amount ?? 0))
                const agg = paymentByTx.get(String(g.id)) || { base: 0, cash: 0, interest: 0, discount: 0 }
                const paidFlagFromStatus = String(g.status || "").toLowerCase() === "paid"
                const fallbackPaid = paidFlagFromStatus && agg.base <= 0 ? original : 0
                const principalCleared = Math.max(0, Math.round((agg.base + fallbackPaid) * 100) / 100)
                const remainingAmount = Math.max(0, Math.round((original - principalCleared) * 100) / 100)

                const txPayments = (paymentRows || []).filter((p: any) => p.transaction_id === g.id)
                const pmLabels = txPayments
                    .map((p: any) => p.payment_method_id ? pmMap.get(p.payment_method_id) : null)
                    .filter(Boolean) as string[]
                const ownLabel = g.payment_type ? formatPaymentMethodLabel(g.payment_type, null) : null
                if (ownLabel) pmLabels.push(ownLabel)
                const uniqueLabels = [...new Set(pmLabels)]
                const paymentTypeLabel = uniqueLabels.length > 0 ? uniqueLabels.join(", ") : "Não informado"

                const dueYmdInstallment = g.due_date ? String(g.due_date).slice(0, 10) : ""
                const overdue =
                    !paidFlagFromStatus &&
                    principalCleared + 0.0001 < original &&
                    !!dueYmdInstallment &&
                    /^\d{4}-\d{2}-\d{2}$/.test(dueYmdInstallment) &&
                    diffCalendarDaysInSaoPaulo(dueYmdInstallment) < 0
                const paidFlag = paidFlagFromStatus || principalCleared + 0.0001 >= original
                return {
                    id: String(g.id),
                    installmentNumber: Number(g.installment_number || 0),
                    totalCount,
                    dueDate: g.due_date ? formatDateLabel(g.due_date) : null,
                    paymentDate: g.payment_date ? formatDateTime(g.payment_date) : null,
                    originalAmount: original,
                    paidAmount: Math.max(0, Math.round((agg.cash + fallbackPaid) * 100) / 100),
                    interestAmount: Math.round(agg.interest * 100) / 100,
                    discountAmount: Math.round(agg.discount * 100) / 100,
                    principalCleared,
                    remainingAmount,
                    paymentType: paymentTypeLabel,
                    status: (paidFlag ? "paid" : overdue ? "overdue" : "pending") as "paid" | "overdue" | "pending",
                }
            })
            const allInstallmentsPaid = (installmentBreakdown?.length ?? 0) > 0 && installmentBreakdown?.every((i) => i.status === "paid")
            if (allInstallmentsPaid) {
                const latestPayment = (groupRows || [])
                    .map((g: any) => (g.payment_date ? new Date(String(g.payment_date)).getTime() : 0))
                    .reduce((max: number, n: number) => Math.max(max, n), 0)
                timeline.step2 = {
                    label: row.transaction_type === "income" ? "Finalizado (Recebido)" : "Finalizado (Pago)",
                    date: latestPayment ? formatDayMonth(new Date(latestPayment).toISOString()) : timeline.step2.date,
                    time: latestPayment ? formatTime(new Date(latestPayment).toISOString()) : timeline.step2.time,
                    active: true,
                    danger: false,
                }
            }
        }

        let originSource = originLabel(row.origin)
        if (row.payment_type === "Agendamento" || (row.reference_note && row.reference_note.startsWith("appointment:"))) {
            originSource = "Agendamento"
        } else if (String(row.category || "").toLowerCase().includes("comiss")) {
            originSource = "Comissão"
        } else if (row.transaction_type === "refund") {
            originSource = "Reembolso"
        } else if (!!row.recurring_id) {
            originSource = "Assinatura"
        }

        let items: TransactionDetailPayload["items"] = []
        let salesSummary: TransactionDetailPayload["salesSummary"] = null
        let salesOrder: { buyer_id?: string | null; customer_name?: string | null } | null = null
        let posSaleCustomerId: string | null | undefined = undefined

        if (row.category === "Vendas" && row.description) {
            const desc = String(row.description).trim()
            const { data: ord } = await supabase
                .from("orders")
                .select(
                    `
          id,
          order_source,
          buyer_id,
          customer_name,
          total_amount,
          paid_amount,
          payment_method,
          delivery_fee,
          additional_costs,
          discount_value,
          discount_amount,
          payment_method_discount_amount,
          payment_method_extra_amount,
          payment_breakdown,
          order_items (
            id,
            quantity,
            product_price,
            subtotal,
            product_name,
            products ( sku, images )
          )
        `,
                )
                .eq("partner_id", partnerId)
                .eq("order_number", desc)
                .maybeSingle()

            salesOrder = ord as any
            if (ord) {
                const src = String((ord as any).order_source || "Manual").toLowerCase()
                if (src === "presencial") originSource = "PDV"
                else if (src === "vitrine online") originSource = "Site"
                else if (src === "assinatura") originSource = "Assinatura"
                else if (src === "manual") originSource = "Venda Manual"
                else originSource = (ord as any).order_source || "Venda Manual"
            }
            const oi = (ord as any)?.order_items
            if (Array.isArray(oi) && oi.length > 0) {
                items = oi.map((item: any) => {
                    const img =
                        Array.isArray(item.products?.images) && item.products.images[0]
                            ? String(item.products.images[0])
                            : null
                    const qty = Number(item.quantity || 0)
                    const unit = Number(item.product_price || 0)
                    const sub = Number(item.subtotal ?? qty * unit)
                    return {
                        id: String(item.id),
                        title: String(item.product_name || "Item"),
                        sku: String(item.products?.sku || "N/A"),
                        quantity: qty,
                        unitPrice: unit,
                        lineTotal: sub,
                        image: img,
                    }
                })
            }
            if (ord) {
                const subtotal = Number((oi || []).reduce((acc: number, item: any) => {
                    return acc + Number(item?.subtotal ?? Number(item?.quantity || 0) * Number(item?.product_price || 0))
                }, 0))
                const manualDiscount = Math.max(0, Number((ord as any).discount_value || 0))
                const couponDiscount = Math.max(0, Number((ord as any).discount_amount || 0))
                const deliveryFee = Math.max(0, Number((ord as any).delivery_fee || 0))
                const additionalCosts = Math.max(0, Number((ord as any).additional_costs || 0))
                const baseBeforePaymentMethod = Math.max(0, subtotal - manualDiscount - couponDiscount + deliveryFee + additionalCosts)
                const finalTotal = Math.max(0, Number((ord as any).total_amount || 0))

                const dbPaymentMethodDiscount = (ord as any).payment_method_discount_amount != null
                    ? Number((ord as any).payment_method_discount_amount)
                    : null
                const dbPaymentMethodExtra = (ord as any).payment_method_extra_amount != null
                    ? Number((ord as any).payment_method_extra_amount)
                    : null

                const dbBreakdown = Array.isArray((ord as any).payment_breakdown) && (ord as any).payment_breakdown.length > 0
                    ? (ord as any).payment_breakdown.filter((e: any) => e?.method && Number(e?.amount || 0) > 0.009)
                    : null

                const paidAmt = Math.max(0, Number((ord as any).paid_amount || 0))
                const changeAmount = Math.max(0, paidAmt - finalTotal)

                salesSummary = {
                    subtotal,
                    manualDiscount,
                    couponDiscount,
                    paymentMethodDiscount: dbPaymentMethodDiscount !== null
                        ? dbPaymentMethodDiscount
                        : Math.max(0, Math.round((baseBeforePaymentMethod - finalTotal) * 100) / 100),
                    paymentMethodExtra: dbPaymentMethodExtra !== null
                        ? dbPaymentMethodExtra
                        : Math.max(0, Math.round((finalTotal - baseBeforePaymentMethod) * 100) / 100),
                    deliveryFee,
                    additionalCosts,
                    paymentMethod: (ord as any).payment_method || null,
                    paidAmount: paidAmt,
                    changeAmount,
                    paymentBreakdown: dbBreakdown,
                }
            }

            if (items.length === 0) {
                let { data: sale } = await supabase
                    .from("sales")
                    .select(
                        `
            id,
            customer_id,
            sale_number,
            final_amount,
            discount_amount,
            pre_sale_id,
            sale_items (
              id,
              quantity,
              unit_price,
              subtotal,
              product_name,
              products ( sku, images )
            )
          `,
                    )
                    .eq("partner_id", partnerId)
                    .eq("sale_number", desc)
                    .maybeSingle()

                if (!sale && row.reference_note && /^[0-9a-f-]{36}$/i.test(String(row.reference_note))) {
                    const res = await supabase
                        .from("sales")
                        .select(
                            `
              id,
              customer_id,
              sale_number,
              sale_items (
                id,
                quantity,
                unit_price,
                subtotal,
                product_name,
                products ( sku, images )
              )
            `,
                        )
                        .eq("partner_id", partnerId)
                        .eq("id", String(row.reference_note))
                        .maybeSingle()
                    sale = res.data
                }

                if (sale) {
                    posSaleCustomerId = sale.customer_id ?? null
                    const si = (sale as any).sale_items
                    if (Array.isArray(si) && si.length > 0) {
                        items = si.map((item: any) => {
                            const img =
                                Array.isArray(item.products?.images) && item.products.images[0]
                                    ? String(item.products.images[0])
                                    : null
                            const qty = Number(item.quantity || 0)
                            const unit = Number(item.unit_price || 0)
                            const sub = Number(item.subtotal ?? qty * unit)
                            return {
                                id: String(item.id),
                                title: String(item.product_name || "Item"),
                                sku: String(item.products?.sku || "N/A"),
                                quantity: qty,
                                unitPrice: unit,
                                lineTotal: sub,
                                image: img,
                            }
                        })
                    }
                    const { data: preSale } = (sale as any).pre_sale_id
                        ? await supabase
                            .from("pre_sales")
                            .select("shipping_fee, other_costs, discount_amount, coupon_discount_amount")
                            .eq("id", (sale as any).pre_sale_id)
                            .eq("partner_id", partnerId)
                            .limit(1)
                            .maybeSingle()
                        : { data: null as any }
                    const subtotal = Number((si || []).reduce((acc: number, item: any) => {
                        return acc + Number(item?.subtotal ?? Number(item?.quantity || 0) * Number(item?.unit_price || 0))
                    }, 0))
                    const manualDiscount = Math.max(0, Number((preSale as any)?.discount_amount || (sale as any).discount_amount || 0))
                    const couponDiscount = Math.max(0, Number((preSale as any)?.coupon_discount_amount || 0))
                    const deliveryFee = Math.max(0, Number((preSale as any)?.shipping_fee || 0))
                    const additionalCosts = Math.max(0, Number((preSale as any)?.other_costs || 0))
                    const baseBeforePaymentMethod = Math.max(0, subtotal - manualDiscount - couponDiscount + deliveryFee + additionalCosts)
                    const finalTotal = Math.max(0, Number((sale as any).final_amount || 0))
                    salesSummary = {
                        subtotal,
                        manualDiscount,
                        couponDiscount,
                        paymentMethodDiscount: Math.max(0, Math.round((baseBeforePaymentMethod - finalTotal) * 100) / 100),
                        paymentMethodExtra: Math.max(0, Math.round((finalTotal - baseBeforePaymentMethod) * 100) / 100),
                        deliveryFee,
                        additionalCosts,
                    }
                }
            }
        }

        if (items.length === 0) {
            const amt = Math.abs(Number(row.amount || 0))
            items = [
                {
                    id: row.id,
                    title: headerTitle,
                    sku: transactionTypeLabel(row.transaction_type),
                    quantity: 1,
                    unitPrice: amt,
                    lineTotal: amt,
                    image: null,
                },
            ]
        }

        const refNote = String(row.reference_note || "")
        const transactionItemsCompact =
            refNote.startsWith("installment_payment:") || refNote.startsWith("installment_settlement:")
        if (transactionItemsCompact) {
            const amt = Math.abs(Number(row.amount || 0))
            items = [
                {
                    id: row.id,
                    title: String(row.description || "").trim() || "Transação",
                    sku: "",
                    quantity: 1,
                    unitPrice: amt,
                    lineTotal: amt,
                    image: null,
                },
            ]
        }

        let contactCard: TransactionDetailPayload["contactCard"] = {
            title: "Contato",
            name: "-",
            email: null,
            phone: null,
        }

        if (row.category === "Vendas" && row.description && salesOrder) {
            const ord = salesOrder
            if (ord?.buyer_id) {
                contactCard = await buildCustomerContactCard(supabase, partnerId, ord.buyer_id, ord.customer_name || "Cliente")
            } else {
                const nm =
                    (ord?.customer_name && String(ord.customer_name).trim()) || "Consumidor final"
                contactCard = {
                    title: "Cliente",
                    name: nm,
                    email: null,
                    phone: null,
                    isCustomer: true,
                }
            }
        } else if (row.category === "Vendas" && posSaleCustomerId !== undefined) {
            if (posSaleCustomerId) {
                contactCard = await buildCustomerContactCard(supabase, partnerId, posSaleCustomerId, "Cliente")
            } else {
                contactCard = {
                    title: "Cliente",
                    name: "Consumidor final",
                    email: null,
                    phone: null,
                    isCustomer: true,
                }
            }
        } else if (row.customer_id || ((row.contact_type === "customer" || row.contact_type === "cliente") && row.contact_id)) {
            const effectiveCustomerId = row.customer_id || row.contact_id
            contactCard = await buildCustomerContactCard(supabase, partnerId, effectiveCustomerId, "Cliente")
        } else if (row.contact_id && row.transaction_contacts?.name) {
            contactCard = {
                title: contactCardTitleFromType(row.contact_type || row.transaction_contacts?.type),
                name: row.transaction_contacts.name,
                email: null,
                phone: null,
                isCustomer: row.contact_type === "customer" || row.transaction_contacts?.type === "customer",
            }
        }

        const systemGateway = isSystemOrGatewayOrigin(row.origin)
        const lockedRecurring = !!row.recurring_id && systemGateway && !isStatusPaid(row.status)
        const canEdit = !lockedRecurring

        const isManualEntryType =
            String(row.origin || "").toLowerCase() === "manual" &&
            ["income", "expense", "refund", "adjustment"].includes(String(row.transaction_type || "").toLowerCase()) &&
            String(row.category || "").trim() !== "Vendas"

        let transferAccounts: TransactionDetailPayload["transferAccounts"] = null
        if (row.transfer_group_id) {
            // PERF: Embedded join eliminates second query for account metadata
            const { data: transferRows } = await supabase
                .from("transactions")
                .select("id, account_id, transaction_type, amount, finance_accounts!transactions_account_id_fkey(name, type)")
                .eq("partner_id", partnerId)
                .eq("transfer_group_id", row.transfer_group_id)
                .limit(4)
            const rowByType = new Map<string, any>()
            for (const tx of transferRows || []) {
                const txType = String((tx as any).transaction_type || "").toLowerCase()
                if (!rowByType.has(txType)) rowByType.set(txType, tx)
            }
            const fromTx = rowByType.get("expense") || null
            const toTx = rowByType.get("income") || null
            transferAccounts = {
                from: fromTx?.finance_accounts
                    ? { name: String(fromTx.finance_accounts.name || "Conta"), type: String(fromTx.finance_accounts.type || "cash") }
                    : null,
                to: toTx?.finance_accounts
                    ? { name: String(toTx.finance_accounts.name || "Conta"), type: String(toTx.finance_accounts.type || "cash") }
                    : null,
                amount: Math.abs(Number((fromTx || toTx || row).amount || 0)),
            }
        }

        const paymentDateSubtitle = formatDateTime(row.created_at)
        let goalBonusDetails: TransactionDetailPayload["goalBonusDetails"] = null
        if (String(row.reference_note || "").startsWith("goal-bonus:")) {
            const parts = String(row.reference_note || "").split(":")
            const goalId = String(parts[1] || "")
            const paidUserId = String(parts[2] || "")
            if (goalId) {
                const [{ data: goalRow }, { data: progressRows }, { data: users }] = await Promise.all([
                    supabase
                        .from("sales_goals")
                        .select("id, name, assigned_user_ids")
                        .eq("partner_id", partnerId)
                        .eq("id", goalId)
                        .maybeSingle(),
                    supabase
                        .from("sales_goal_progress")
                        .select("user_id, achieved_at")
                        .eq("goal_id", goalId)
                        .eq("user_id", paidUserId)
                        .limit(1),
                    supabase
                        .from("user_profiles")
                        .select("user_id, full_name")
                        .in("user_id", [paidUserId]),
                ])
                goalBonusDetails = {
                    goalId,
                    goalName: String((goalRow as any)?.name || "Meta"),
                    paidToUserIds: paidUserId ? [paidUserId] : [],
                    paidToUserNames: (users || []).map((u: any) => String(u.full_name || "Vendedor")),
                    achievedAt: (progressRows?.[0] as any)?.achieved_at ? formatDateTime((progressRows?.[0] as any).achieved_at) : null,
                }
            }
        }

        let groupOriginalAmount: number | null = null
        let groupInterestAmount: number | null = null
        let groupDiscountAmount: number | null = null
        let groupPaidAmount: number | null = null
        let groupRemainingAmount = 0
        if (row.installment_group_id && installmentBreakdown) {
            groupOriginalAmount = installmentBreakdown.reduce((sum, item) => sum + item.originalAmount, 0)
            groupInterestAmount = installmentBreakdown.reduce((sum, item) => sum + (item.interestAmount || 0), 0)
            groupDiscountAmount = installmentBreakdown.reduce((sum, item) => sum + (item.discountAmount || 0), 0)
            groupPaidAmount = installmentBreakdown.reduce((sum, item) => sum + item.paidAmount, 0)
            groupRemainingAmount = installmentBreakdown.reduce((sum, item) => sum + (item.remainingAmount || 0), 0)
        }

        const showDueDateRow =
            !installmentBreakdown?.length &&
            (String(row.category || "").trim() !== "Vendas" || !!row.due_date) &&
            !transactionItemsCompact &&
            !["adjustment", "transfer"].includes(String(row.transaction_type || "").toLowerCase())

        const detailAmount =
            installmentGroupTotalAmount != null && installmentGroupTotalAmount > 0
                ? installmentGroupTotalAmount
                : Math.abs(Number(row.amount || 0))

        const payload: TransactionDetailPayload = {
            id: row.id,
            headerTitle,
            statusLabel,
            statusVariant,
            transactionType: row.transaction_type,
            isRecurring: !!row.recurring_id,
            paymentMethodSubtitle: finalPaymentSubtitle,
            paymentDateSubtitle,
            creatorName,
            originLabel: originLabel(row.origin),
            originSource,
            typeBannerLabel: transactionTypeLabel(row.transaction_type),
            timeline,
            items,
            transactionItemsCompact,
            installmentBreakdown,
            paymentDateRowLabel: paymentDateRowLabel || "Data da transação",
            installmentGroupTotalAmount: installmentGroupTotalAmount ?? null,
            categoryLine: String(row.category || "").trim() || "-",
            subcategoryLine,
            accountLine,
            dueDateLine: row.due_date ? formatDateLabel(row.due_date) : null,
            paymentDateLine: formatDateTime(row.created_at),
            notesLine: transactionItemsCompact ? null : row.notes ? String(row.notes) : null,
            goalBonusDetails,
            originalAmount: groupOriginalAmount !== null
                ? groupOriginalAmount
                : (row.original_amount ? Math.abs(Number(row.original_amount)) : null),
            interestAmount: groupInterestAmount !== null
                ? groupInterestAmount
                : (currentTxPaymentAgg
                    ? Math.round(currentTxPaymentAgg.interest * 100) / 100
                    : (row.interest_amount ? Math.abs(Number(row.interest_amount)) : null)),
            discountAmount: groupDiscountAmount !== null
                ? groupDiscountAmount
                : (currentTxPaymentAgg
                    ? Math.round(currentTxPaymentAgg.discount * 100) / 100
                    : (row.discount_amount ? Math.abs(Number(row.discount_amount)) : null)),
            paidAmount: groupPaidAmount !== null
                ? groupPaidAmount
                : (currentTxPaymentAgg
                    ? Math.max(0, Math.round((currentTxPaymentAgg.cash + (paid && currentTxPaymentAgg.base <= 0 ? Math.abs(Number(row.original_amount ?? row.amount ?? 0)) : 0)) * 100) / 100)
                    : (row.paid_amount ? Math.abs(Number(row.paid_amount)) : null)),
            amount: groupOriginalAmount !== null
                ? (groupPaidAmount! + groupRemainingAmount)
                : detailAmount,
            ledgerDirection: ledgerDirectionFromRow(row as DbTransaction),
            contactCard,
            canEdit,
            showDueDateRow,
            transactionDetailKind: row.transfer_group_id ? "transfer" : isManualEntryType ? "manual_entry" : "default",
            transferAccounts,
            salesSummary,
        }

        return { success: true, data: payload }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar transação" }
    }
}

export async function searchCustomersForTransaction(query?: string) {
    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        await requirePermission(ctx.partnerId, "financial", "view")
        const supabase = createAdminClient()
        const q = `%${String(query || "").trim()}%`

        let request = supabase
            .from("customers")
            .select("id, name, email")
            .eq("partner_id", ctx.partnerId)
            .order("created_at", { ascending: false })
            .limit(30)

        if (String(query || "").trim()) {
            request = request.or(`name.ilike.${q},email.ilike.${q}`)
        }

        const { data, error } = await request
        if (error) throw error
        return data || []
    } catch {
        return []
    }
}

export async function getTransactionPresignedUploadUrlAction(
    partnerId: string,
    fileName: string,
    fileType: string,
    fileSize: number
): Promise<
    | { success: true; uploadUrl: string; publicUrl: string; key: string }
    | { success: false; error: string }
> {
    try {
        const user = await requireUser()
        await requirePermission(partnerId, "financial", "edit")

        const plan = await getPartnerPlan(partnerId)
        if (plan.slug.toLowerCase() !== "crescer" && plan.slug.toLowerCase() !== "escalar") {
            return { success: false, error: "Upload de documentos não permitido no seu plano. Faça um upgrade!" }
        }

        const { validateUploadRequest } = await import("@/lib/security/file-validator")
        const validation = validateUploadRequest(fileName, fileType, fileSize)
        if (!validation.success) {
            return { success: false, error: validation.error || "Arquivo inválido" }
        }

        const { R2_PREFIXES } = await import("@/lib/r2/config")
        const { generateSignedUploadUrl } = await import("@/lib/r2/server")

        const uploadRes = await generateSignedUploadUrl({
            fileName,
            fileType,
            userId: user.id,
            prefix: R2_PREFIXES.orderAttachments,
            kind: "document",
        })

        return {
            success: true,
            uploadUrl: uploadRes.uploadUrl,
            publicUrl: uploadRes.publicUrl,
            key: uploadRes.key,
        }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao gerar URL de upload" }
    }
}

export async function saveTransactionAttachmentAction(
    partnerId: string,
    transactionId: string,
    fileKey: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    fileHash?: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        await requirePermission(partnerId, "financial", "edit")
        const user = await requireUser()

        const plan = await getPartnerPlan(partnerId)
        if (plan.slug.toLowerCase() !== "crescer" && plan.slug.toLowerCase() !== "escalar") {
            return { success: false, error: "Upload de documentos não permitido no seu plano. Faça um upgrade!" }
        }

        const maxCount = plan.slug.toLowerCase() === "crescer" ? 2 : 5
        const admin = createAdminClient()

        const { count, error: countErr } = await admin
            .from("transaction_attachments")
            .select("id", { count: "exact", head: true })
            .eq("transaction_id", transactionId)

        if (countErr) throw countErr

        if ((count || 0) >= maxCount) {
            return {
                success: false,
                error: `Limite de anexos excedido para o seu plano (${maxCount}). Remova algum para adicionar.`,
            }
        }

        let finalHash = fileHash || ""
        if (!finalHash && fileSize < 5 * 1024 * 1024) {
            try {
                const { getR2ServerConfig } = await import("@/lib/r2/r2-server-config")
                const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3")
                const serverConfig = getR2ServerConfig()
                const s3 = new S3Client({
                    region: "auto",
                    credentials: {
                        accessKeyId: serverConfig.accessKeyId,
                        secretAccessKey: serverConfig.secretAccessKey,
                    },
                    endpoint: `https://${serverConfig.accountId}.r2.cloudflarestorage.com`,
                })
                const obj = await s3.send(new GetObjectCommand({ Bucket: serverConfig.bucketName, Key: fileKey }))
                if (obj.Body) {
                    const bytes = await obj.Body.transformToByteArray()
                    const crypto = await import("crypto")
                    finalHash = crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex")
                }
                s3.destroy()
            } catch (e) {
                console.error("Erro ao calcular hash do R2 no fallback:", e)
            }
        }

        const { data, error } = await admin
            .from("transaction_attachments")
            .insert({
                transaction_id: transactionId,
                file_key: fileKey,
                file_name: fileName,
                file_type: fileType,
                file_size: fileSize,
                uploaded_by: user.id,
                file_hash: finalHash,
            })
            .select("*")
            .single()

        if (error) throw error

        await logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "transaction",
            entityId: transactionId,
            actionType: "attachment_created",
            source: "manual",
            changeLines: [`Anexo adicionado: ${fileName}`],
        })

        return { success: true, data }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao salvar anexo" }
    }
}

export async function deleteTransactionAttachmentAction(
    partnerId: string,
    attachmentId: string,
    transactionId: string
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        await requirePermission(partnerId, "financial", "edit")
        const user = await requireUser()
        const admin = createAdminClient()

        const { data: attachment } = await admin
            .from("transaction_attachments")
            .select("file_key, file_name")
            .eq("id", attachmentId)
            .eq("transaction_id", transactionId)
            .maybeSingle()

        if (!attachment) {
            return { success: false, error: "Anexo não encontrado" }
        }

        const { deleteFileFromR2 } = await import("@/lib/r2/server")
        await deleteFileFromR2(attachment.file_key)

        await admin.from("transaction_attachments").delete().eq("id", attachmentId)

        await logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "transaction",
            entityId: transactionId,
            actionType: "attachment_deleted",
            source: "manual",
            changeLines: [`Anexo removido: ${attachment.file_name || "Documento"}`],
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao deletar anexo" }
    }
}

export async function getTransactionAttachmentsAction(
    transactionId: string
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
    try {
        await requireUser()
        const supabase = await getSupabaseServerClient()

        const { data, error } = await supabase
            .from("transaction_attachments")
            .select("*")
            .eq("transaction_id", transactionId)
            .order("created_at", { ascending: false })

        if (error) throw error

        return { success: true, data: data || [] }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao listar anexos" }
    }
}

export async function getTransactionAttachmentUrlAction(
    transactionId: string,
    fileKey: string,
    partnerId?: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
    try {
        await requireUser()
        if (partnerId) {
            await requirePermission(partnerId, "financial", "view")
        }

        const { generateSignedDownloadUrl } = await import("@/lib/r2/server")
        const downloadUrl = await generateSignedDownloadUrl(fileKey)
        return { success: true, downloadUrl }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao obter URL de download" }
    }
}

export async function updateInstallmentGroupNotesAction(input: {
    partnerId: string
    installmentGroupId: string
    notes: string
}) {
    try {
        const { userId } = await requirePermission(input.partnerId, "financial", "edit")
        const supabase = createAdminClient()
        const { error } = await supabase
            .from("transactions")
            .update({ notes: input.notes?.trim() || null, updated_at: new Date().toISOString() })
            .eq("installment_group_id", input.installmentGroupId)
            .eq("partner_id", input.partnerId)

        if (error) throw error
        await revalidateTransactions(input.partnerId)
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao atualizar observações do parcelado" }
    }
}



"use server"

import { randomUUID } from "crypto"
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
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

async function requireFinancialCapability(partnerId: string, storeId?: string | null) {
    const capabilities = await getPartnerCapabilities(partnerId, { storeId })
    if (!capabilities.hasFinancial) {
        throw new Error("O módulo Financeiro requer o plano Crescer ou superior e deve estar ativo nas configurações.")
    }
}

async function validateTransactionReferences(
    supabase: ReturnType<typeof createAdminClient>,
    partnerId: string,
    storeId: string | null | undefined,
    references: {
        accountId?: string | null
        paymentMethodId?: string | null
        customerId?: string | null
        contactId?: string | null
        contactType?: string | null
        categoryId?: string | null
        subcategoryId?: string | null
    },
    permission: "create" | "edit",
) {
    if (storeId) {
        const { data: store, error } = await supabase
            .from("stores")
            .select("id")
            .eq("id", storeId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (error || !store) throw new Error("Loja inválida para este parceiro.")
        await requireStorePermission(storeId, partnerId, "financial", permission)
    }

    const accountId = sanitizeUUID(references.accountId)
    if (references.accountId && !accountId) throw new Error("Conta financeira inválida.")
    if (accountId) {
        const { data: account } = await supabase
            .from("finance_accounts")
            .select("id, store_id")
            .eq("id", accountId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!account || (account.store_id && account.store_id !== (storeId || null))) {
            throw new Error("Conta financeira fora do parceiro ou da loja selecionada.")
        }
    }

    const paymentMethodId = sanitizeUUID(references.paymentMethodId)
    if (references.paymentMethodId && !paymentMethodId) throw new Error("Forma de pagamento inválida.")
    if (paymentMethodId) {
        const { data: method } = await supabase
            .from("payment_methods")
            .select("id, default_finance_account_id")
            .eq("id", paymentMethodId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!method) throw new Error("Forma de pagamento não encontrada para este parceiro.")
        if (method.default_finance_account_id && method.default_finance_account_id !== accountId) {
            const { data: defaultAccount } = await supabase
                .from("finance_accounts")
                .select("id, store_id")
                .eq("id", method.default_finance_account_id)
                .eq("partner_id", partnerId)
                .maybeSingle()
            if (!defaultAccount || (defaultAccount.store_id && defaultAccount.store_id !== (storeId || null))) {
                throw new Error("Conta padrão da forma de pagamento fora do parceiro ou da loja selecionada.")
            }
        }
    }

    const customerId = sanitizeUUID(references.customerId)
    if (references.customerId && !customerId) throw new Error("Cliente inválido.")
    if (customerId) {
        const { data: customer } = await supabase
            .from("customers")
            .select("id, partner_id")
            .eq("id", customerId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!customer) throw new Error("Cliente não encontrado para este parceiro.")
    }

    const contactId = sanitizeUUID(references.contactId)
    if (references.contactId && !contactId) throw new Error("Contato inválido.")
    if (contactId) {
        const allowedTypes = ["customer", "supplier", "service", "employee", "partner", "other"]
        if (!references.contactType || !allowedTypes.includes(references.contactType)) {
            throw new Error("Tipo de contato inválido.")
        }
        const { data: contact } = await supabase
            .from("transaction_contacts")
            .select("id, store_id")
            .eq("id", contactId)
            .eq("partner_id", partnerId)
            .eq("type", references.contactType)
            .is("deleted_at", null)
            .maybeSingle()
        if (!contact || (contact.store_id && contact.store_id !== (storeId || null))) {
            throw new Error("Contato fora do parceiro ou da loja selecionada.")
        }
    }

    for (const [label, rawId] of [["Categoria", references.categoryId], ["Subcategoria", references.subcategoryId]] as const) {
        const id = sanitizeUUID(rawId)
        if (rawId && !id) throw new Error(`${label} inválida.`)
        if (!id) continue
        const { data: category } = await supabase
            .from("financial_categories")
            .select("id, parent_id")
            .eq("id", id)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!category) throw new Error(`${label} não encontrada para este parceiro.`)
        if (label === "Subcategoria") {
            if (!category.parent_id || category.parent_id !== sanitizeUUID(references.categoryId)) {
                throw new Error("A subcategoria não pertence à categoria selecionada.")
            }
        }
    }
}

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
    const validUuid = sanitizeUUID(methodId)
    if (!validUuid) {
        return formatPaymentMethodLabel(methodId, null)
    }
    const { data } = await supabase
        .from("payment_methods")
        .select("name, payment_type")
        .eq("id", validUuid)
        .eq("partner_id", partnerId)
        .maybeSingle()
    if (!data?.name) return formatPaymentMethodLabel(methodId, null)
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
    const { data: balance, error: rpcError } = await createAdminClient().rpc("apply_account_balance_delta", {
        p_account_id: accountId,
        p_partner_id: partnerId,
        p_delta: delta,
    })
    if (rpcError) {
        console.error("[transactions] apply_account_balance_delta RPC error:", rpcError.message)
        throw new Error(`Falha ao atualizar o saldo da conta financeira: ${rpcError.message}`)
    }
    if (balance == null) {
        throw new Error("Conta financeira não encontrada para este parceiro.")
    }
}

// ─── Histórico de pagamento de parcelas no pedido ────────────────────────────
// Ao pagar uma parcela, além do audit da própria transação, registra no audit
// do PEDIDO uma linha legível: "Recebido R$ 150,00 da parcela 1/10 de um total
// de R$ 1500,00, restante R$ 1350,00" (+ juros/desconto quando houver).

async function getInstallmentGroupPrincipal(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    groupId: string | null,
): Promise<{ total: number; paidPrincipal: number }> {
    if (!groupId) return { total: 0, paidPrincipal: 0 }
    const { data: txs } = await supabase
        .from("transactions")
        .select("id, original_amount")
        .eq("partner_id", partnerId)
        .eq("installment_group_id", groupId)
    const ids = (txs || []).map((t: any) => t.id)
    let paidPrincipal = 0
    if (ids.length > 0) {
        const { data: pays } = await supabase
            .from("transaction_payments")
            .select("base_amount, amount")
            .eq("partner_id", partnerId)
            .in("transaction_id", ids)
        paidPrincipal = (pays || []).reduce((sum: number, p: any) => sum + Number(p.base_amount ?? p.amount ?? 0), 0)
    }
    const total = (txs || []).reduce((sum: number, t: any) => sum + Math.abs(Number(t.original_amount ?? 0)), 0)
    return { total, paidPrincipal }
}

async function resolveOrderIdForSaleTransaction(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    tx: { payment_id?: string | null; description?: string | null },
): Promise<string | null> {
    if (tx.payment_id) {
        const { data: pay } = await supabase
            .from("payments")
            .select("order_id")
            .eq("id", tx.payment_id)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (pay?.order_id) return pay.order_id
    }
    const description = String(tx.description || "").trim()
    if (description) {
        const { data: order } = await supabase
            .from("orders")
            .select("id")
            .eq("partner_id", partnerId)
            .eq("order_number", description)
            .maybeSingle()
        if (order?.id) return order.id
    }
    return null
}

function buildInstallmentPaymentHistoryLine(params: {
    dir: "Recebido" | "Pago"
    finalPaid: number
    installmentNumber?: number | null
    totalInstallments?: number | null
    groupTotal: number
    remaining: number
    interestAmount: number
    discountAmount: number
    methodLabel?: string | null
}): string {
    let line = `${params.dir} R$ ${params.finalPaid.toFixed(2)} da parcela ${params.installmentNumber ?? "?"}/${params.totalInstallments ?? "?"} de um total de R$ ${params.groupTotal.toFixed(2)}, restante R$ ${params.remaining.toFixed(2)}`
    if (params.methodLabel) line += ` utilizando ${params.methodLabel}`
    if (params.interestAmount > 0) line += ` (Juros: R$ ${params.interestAmount.toFixed(2)})`
    if (params.discountAmount > 0) line += ` (Desconto: R$ ${params.discountAmount.toFixed(2)})`
    return line
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
    try {
        await requirePermission(partnerId, "financial", "view")

        const context = await getCurrentPartnerContext()
        if (!context?.partnerId || context.partnerId !== partnerId) {
            throw new Error("Parceiro ativo inválido.")
        }
        const storeId = options?.storeId ?? context.activeStoreId
        if (storeId) await requireStorePermission(storeId, partnerId, "financial", "view")

        const cursor = options?.cursor ?? null

        const result = await getCachedErpPage(
            [
                "erp-transactions-page",
                partnerId,
                storeId || "all-stores",
                cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
                String(FINANCIAL_TX_PAGE_SIZE),
            ],
            [TAGS.transactions(partnerId)],
            async () => {
                // Use admin client after authz check so invited ERP users can read transactions.
                const supabase = createAdminClient()
                const fetchLimit = FINANCIAL_TX_PAGE_SIZE + 1

                // ── Step 1: Keyset page (created_at DESC, id DESC) ──────────────
                let listQuery = supabase.from("transactions").select(FINANCIAL_TX_LIST_SELECT).eq("partner_id", partnerId)

        // Filter out legacy recognition and fee rows to prevent double display of past sales
        listQuery = listQuery.or("kind.is.null,kind.eq.settlement,kind.eq.refund,kind.eq.chargeback")

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
        const pmIdsArr = [...paymentMethodIds].map(sanitizeUUID).filter(Boolean) as string[]
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
                paymentDateDate: t.payment_date ? formatDateLabel(t.payment_date) : null,
                paymentDateTime: t.payment_date && String(t.payment_date).includes("T") ? formatTime(t.payment_date) : null,
                daysUntilDue,
                isOverdue,
                originSource: (() => {
                    if (t.payment_type === "Agendamento" || (t.reference_note && t.reference_note.startsWith("appointment:"))) {
                        return "Agendamento";
                    }
                    if (t.category === "Vendas" && order) {
                        const src = String(order.order_source || "Manual").toLowerCase();
                        if (src === "presencial") return "PDV";
                        if (src === "vitrine online") return "Vitrine online";
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

        return { success: true as const, items: mapped, nextCursor, hasMore }
            },
            30,
        )

        return result
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

        await requireFinancialCapability(input.partnerId, input.storeId)
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        if (!["income", "expense", "adjustment", "refund"].includes(input.transactionType)) {
            throw new Error("Tipo de transação inválido.")
        }
        if (input.status !== undefined && !["pending", "paid"].includes(input.status)) {
            throw new Error("Status de transação inválido.")
        }
        if (input.id || input.installmentGroupId || input.installmentNumber !== undefined) {
            throw new Error("IDs de transação/parcelamento não podem ser definidos nesta ação.")
        }

        if (input.transactionType === "transfer") {
            throw new Error("Use a ação de transferência para movimentar entre contas.")
        }

        // Input validation hardening
        const description = sanitizeInput(String(input.description || ""), 150).trim()
        if (!description) throw new Error("Descrição é obrigatória.")
        if (description.length > 150) throw new Error("Descrição deve ter no máximo 150 caracteres.")

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
        if (input.contactType && !["customer", "supplier", "service", "employee", "partner", "other"].includes(normalizedContactType)) {
            throw new Error("Tipo de contato inválido.")
        }
        if (input.transactionType === "refund" && !["expense_refund", "revenue_refund"].includes(String(input.refundKind))) {
            throw new Error("Tipo de reembolso inválido.")
        }
        const customerId =
            input.customerId?.trim()
            || ((normalizedContactType === "customer" || normalizedContactType === "cliente") ? (input.contactId?.trim() || null) : null)
            || null
        const contactId = customerId ? null : (input.contactId?.trim() || null)
        const contactTypeResolved = customerId ? "customer" : input.contactType ?? null

        const isVendaIncome =
            String(input.category || "").trim() === "Vendas" && input.transactionType === "income"

        const normalizedCategory = String(input.category || "").trim()
        const validPaymentMethodId = sanitizeUUID(input.paymentMethodId)
        const resolvedPaymentType = input.paymentType || (input.paymentMethodId && !validPaymentMethodId ? input.paymentMethodId : null)

        await validateTransactionReferences(supabase, input.partnerId, input.storeId, {
            accountId: input.accountId,
            paymentMethodId: validPaymentMethodId,
            customerId,
            contactId,
            contactType: contactTypeResolved,
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
        }, "create")

        const payload: Record<string, unknown> = {
            partner_id: input.partnerId,
            store_id: input.storeId || null,
            description: description,
            category: normalizedCategory || null,
            category_id: sanitizeUUID(input.categoryId) ?? null,
            subcategory_id: sanitizeUUID(input.subcategoryId) ?? null,
            account_id: sanitizeUUID(input.accountId) ?? null,
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
            payment_type: resolvedPaymentType || null,
            payment_method_id: validPaymentMethodId,
            original_amount: absAmount,
            interest_amount: null,
            fee_amount: 0,
            transaction_type: input.transactionType,
            origin: "manual",
            refund_kind: input.transactionType === "refund" ? input.refundKind ?? null : null,
            reference_note: sanitizeInput(String(input.referenceNote || ""), 150).trim() || null,
            created_by_user_id: userId,
        }

        const atomicInsert = await createAdminClient().rpc("create_manual_financial_transactions_atomic", {
            p_partner_id: input.partnerId,
            p_rows: [payload],
        })
        if (atomicInsert.error) throw atomicInsert.error
        const insertedIds = Array.isArray(atomicInsert.data?.ids) ? atomicInsert.data.ids as string[] : []
        const { data: insertedRows, error: readError } = insertedIds.length
            ? await supabase.from("transactions").select("*").in("id", insertedIds)
            : { data: [], error: new Error("RPC não retornou o lançamento criado.") }
        if (readError) throw readError
        const data = (insertedRows || [])[0]
        if (!data) throw new Error("Erro ao criar transação")

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

        await requireFinancialCapability(input.partnerId, input.storeId)
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
        if (!["pending", "paid"].includes(status)) throw new Error("Status de transferência inválido.")
        const baseDesc = sanitizeInput(String(input.description || ""), 150).trim() || "Transferência entre contas"
        const validPaymentMethodId = sanitizeUUID(input.paymentMethodId)

        const { data: accounts } = await supabase
            .from("finance_accounts")
            .select("id, name, store_id")
            .eq("partner_id", input.partnerId)
            .in("id", [input.fromAccountId, input.toAccountId])

        if (!accounts || accounts.length !== 2) throw new Error("As contas de transferência precisam pertencer a este parceiro.")
        await validateTransactionReferences(supabase, input.partnerId, input.storeId, {
            accountId: input.fromAccountId,
            paymentMethodId: validPaymentMethodId,
        }, "create")
        await validateTransactionReferences(supabase, input.partnerId, input.storeId, {
            accountId: input.toAccountId,
        }, "create")

        const nameById = new Map((accounts || []).map((a: { id: string; name: string }) => [a.id, a.name]))
        const fromName = nameById.get(input.fromAccountId) || "Origem"
        const toName = nameById.get(input.toAccountId) || "Destino"

        const storeIdValue = input.storeId || null

        const resolvedPaymentType = (input.paymentMethodId && !validPaymentMethodId ? input.paymentMethodId : null) || "Transferência"

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
            payment_type: resolvedPaymentType,
            payment_method_id: validPaymentMethodId,
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
            payment_type: resolvedPaymentType,
            payment_method_id: validPaymentMethodId,
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

        const atomicInsert = await createAdminClient().rpc("create_manual_financial_transactions_atomic", {
            p_partner_id: input.partnerId,
            p_rows: [outRowWithCreator, inRowWithCreator],
        })
        if (atomicInsert.error) throw atomicInsert.error
        const insertedIds = Array.isArray(atomicInsert.data?.ids) ? atomicInsert.data.ids as string[] : []
        const { data: insertedRows, error: readError } = insertedIds.length === 2
            ? await supabase.from("transactions").select("*").in("id", insertedIds)
            : { data: [], error: new Error("RPC não retornou as duas linhas da transferência.") }
        if (readError) throw readError
        const data = insertedRows || []
        if (data.length !== 2) throw new Error("Não foi possível confirmar as duas linhas da transferência.")

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

        await requireFinancialCapability(partnerId, patch.storeId)
        const { userId } = await requirePermission(partnerId, "financial", "edit")
        const supabase = createAdminClient()

        const { data: current, error: currentError } = await supabase
            .from("transactions")
            .select("id, partner_id, status, origin, recurring_id, installment_group_id, category, description, payment_method_id, account_id, customer_id, contact_id, contact_type, category_id, subcategory_id, store_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (currentError || !current) throw new Error(currentError?.message || "Transação não encontrada.")
        if (current.store_id) {
            await requireStorePermission(current.store_id, partnerId, "financial", "edit")
        }
        if (patch.storeId && patch.storeId !== current.store_id) {
            await requireStorePermission(patch.storeId, partnerId, "financial", "edit")
        }
        const isInstallmentTransaction = !!current.installment_group_id

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
            if (patch.paymentMethodId !== undefined) {
                const validPmId = sanitizeUUID(patch.paymentMethodId)
                payload.payment_method_id = validPmId
                if (patch.paymentMethodId && !validPmId) {
                    payload.payment_type = patch.paymentMethodId
                }
            }
            if (patch.notes !== undefined) payload.notes = patch.notes
        } else if (paid) {
            if (patch.description !== undefined) payload.description = sanitizeInput(String(patch.description || ""), 150).trim()
            if (patch.notes !== undefined) payload.notes = patch.notes
        } else {
            if (patch.description !== undefined) payload.description = sanitizeInput(String(patch.description || ""), 150).trim()
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
            if (patch.paymentMethodId !== undefined) {
                const validPmId = sanitizeUUID(patch.paymentMethodId)
                payload.payment_method_id = validPmId
                if (patch.paymentMethodId && !validPmId) {
                    payload.payment_type = patch.paymentMethodId
                }
            }
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

        const nextReference = (field: string, currentValue: string | null | undefined) =>
            Object.prototype.hasOwnProperty.call(payload, field) ? payload[field] as string | null : currentValue
        await validateTransactionReferences(
            supabase,
            partnerId,
            nextReference("store_id", current.store_id),
            {
                accountId: nextReference("account_id", current.account_id),
                paymentMethodId: nextReference("payment_method_id", current.payment_method_id),
                customerId: nextReference("customer_id", current.customer_id),
                contactId: nextReference("contact_id", current.contact_id),
                contactType: nextReference("contact_type", current.contact_type),
                categoryId: nextReference("category_id", current.category_id),
                subcategoryId: nextReference("subcategory_id", current.subcategory_id),
            },
            "edit",
        )

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

        await requireFinancialCapability(input.partnerId)
        const { userId } = await requirePermission(input.partnerId, "financial", "cancel")
        const supabase = createAdminClient()

        const { data: tx, error } = await supabase
            .from("transactions")
            .select("id, partner_id, status, installment_group_id, notes, store_id")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (error || !tx) throw new Error(error?.message || "Transação não encontrada.")
        if (tx.store_id) await requireStorePermission(tx.store_id, input.partnerId, "financial", "cancel")

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
                payment_method_id, installment_group_id, installment_number, store_id
            `)
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (error || !data) throw error || new Error("Transação não encontrada.")
        if (data.store_id) await requireStorePermission(data.store_id, partnerId, "financial", "view")

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
        await requireFinancialCapability(input.partnerId, input.storeId)
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const validPaymentMethodId = sanitizeUUID(input.paymentMethodId)
        await validateTransactionReferences(supabase, input.partnerId, input.storeId, {
            accountId: input.accountId,
            paymentMethodId: validPaymentMethodId,
            customerId: input.customerId,
            contactId: input.contactId,
            contactType: input.contactType,
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
        }, "create")

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

        const resolvedPaymentType = input.paymentType || (input.paymentMethodId && !validPaymentMethodId ? input.paymentMethodId : null)

        const initialStatus = input.initialStatus === "paid" ? "paid" : "pending"
        const firstInstallmentPaymentDate = input.firstInstallmentPaymentDate || new Date().toISOString()
        const transactionsPayload = Array.from({ length: count }).map((_, index) => {
            const installmentNumber = index + 1
            const due = addInstallmentDate(startDate, input.frequency, interval, index + 1)
            const lineAmount = installmentNumber === count ? Math.round((eachAmount + amountDiff) * 100) / 100 : eachAmount
            const isFirstInstallmentPaid = initialStatus === "paid" && installmentNumber === 1
            return {
                partner_id: input.partnerId,
                store_id: input.storeId || null,
                description: sanitizeInput(String(input.description || ""), 150).trim(),
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
                payment_type: resolvedPaymentType || null,
                payment_method_id: validPaymentMethodId,
                original_amount: lineAmount,
                interest_amount: null,
                fee_amount: 0,
                transaction_type: input.transactionType,
                origin: "manual",
                installment_number: installmentNumber,
                created_by_user_id: userId,
            }
        })

        const groupDescription = sanitizeInput(String(input.description || ""), 150).trim()
        const atomicCreate = await createAdminClient().rpc("create_installment_group_atomic", {
            p_partner_id: input.partnerId,
            p_user_id: userId,
            p_group: {
                store_id: input.storeId || null,
                description: groupDescription,
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
                payment_method_id: validPaymentMethodId,
            },
            p_rows: transactionsPayload,
        })
        if (atomicCreate.error) throw atomicCreate.error
        const groupId = String(atomicCreate.data?.groupId || "")
        const insertedIds = Array.isArray(atomicCreate.data?.transactionIds)
            ? atomicCreate.data.transactionIds as string[]
            : []
        const { data: insertedRows, error: readError } = insertedIds.length === count
            ? await supabase.from("transactions").select("id, installment_number").in("id", insertedIds)
            : { data: [], error: new Error("RPC não retornou todas as parcelas criadas.") }
        if (readError) throw readError
        if (!groupId || insertedRows?.length !== count) {
            throw new Error("Não foi possível confirmar o grupo e todas as parcelas.")
        }

        // Log audit event for the installment group creation
        await Promise.allSettled(
            (insertedRows || []).map((row: any) =>
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
        return { success: true as const, data: { groupId, createdCount: insertedRows.length } }
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
                .select("id, description, total_amount, installments_count, store_id")
                .eq("id", input.installmentGroupId)
                .eq("partner_id", input.partnerId)
                .single(),
            supabase
                .from("transactions")
                .select("id, description, amount, original_amount, due_date, payment_date, status, installment_number, payment_method_id, payment_type, store_id")
                .eq("partner_id", input.partnerId)
                .eq("installment_group_id", input.installmentGroupId)
                .order("installment_number", { ascending: true }),
        ])
        const { data: group, error: groupErr } = groupResult
        const { data: rows, error: rowsErr } = rowsResult
        if (groupErr || !group) throw groupErr || new Error("Grupo de parcelas não encontrado.")
        if (rowsErr) throw rowsErr
        if (group.store_id) await requireStorePermission(group.store_id, input.partnerId, "financial", "view")
        for (const row of rows || []) {
            if (row.store_id) await requireStorePermission(row.store_id, input.partnerId, "financial", "view")
        }

        const transactionIds = (rows || []).map((row: any) => row.id).filter(Boolean)
        const paymentMethodIds = new Set<string>()
        for (const row of rows || []) {
            if ((row as any).payment_method_id) paymentMethodIds.add(String((row as any).payment_method_id))
        }

        const validPmIds = [...paymentMethodIds].map(sanitizeUUID).filter(Boolean) as string[]

        // PERF: Batch 2 - payments + payment methods (both depend on rows, independent of each other)
        const [paymentsResult, pmsResult] = await Promise.all([
            transactionIds.length > 0
                ? supabase
                    .from("transaction_payments")
                    .select("transaction_id, amount, base_amount, interest_amount, discount_amount")
                    .eq("partner_id", input.partnerId)
                    .in("transaction_id", transactionIds)
                : Promise.resolve({ data: [] as any[], error: null }),
            validPmIds.length > 0
                ? supabase
                    .from("payment_methods")
                    .select("id, name, payment_type")
                    .eq("partner_id", input.partnerId)
                    .in("id", validPmIds)
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
    accountId?: string | null
    idempotencyKey?: string | null
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        await requireFinancialCapability(input.partnerId)
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .select("id, status, partner_id, store_id, payment_method_id, installment_group_id, installment_number, total_installments, description, payment_id, category, category_id, subcategory_id, account_id, contact_id, customer_id, contact_type, payment_type, notes, due_date, original_amount, amount, transaction_type, refund_kind")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (txErr || !tx) throw new Error(txErr?.message || "Parcela não encontrada.")
        if (!tx.installment_group_id) throw new Error("Pagamento parcial é permitido apenas para parcelas.")
        if (tx.store_id) await requireStorePermission(tx.store_id, input.partnerId, "financial", "create")

        // Parcelas de venda (ledger de vendas) já nascem com o método de pagamento
        // fixado pelo gateway (ex: cartão de crédito) - não pode ser alterado.
        const lockedPaymentMethodId = sanitizeUUID(tx.payment_method_id)
        const validPaymentMethodId = sanitizeUUID(input.paymentMethodId)
        const effectivePaymentMethodId = lockedPaymentMethodId || validPaymentMethodId
        const rawMethodName = (typeof input.paymentMethodId === "string" && !validPaymentMethodId) ? input.paymentMethodId : null

        const paymentAmount = Number(input.paymentAmount || 0)
        const interestAmount = Number(input.interestAmount || 0)
        const discountAmount = Number(input.discountAmount || 0)
        if (!Number.isFinite(paymentAmount) || !Number.isFinite(interestAmount) || !Number.isFinite(discountAmount)) {
            throw new Error("Valores de pagamento inválidos.")
        }
        if (interestAmount < 0 || discountAmount < 0) {
            throw new Error("Juros e descontos não podem ser negativos.")
        }

        const { data: existingPayments, error: paymentsErr } = await supabase
            .from("transaction_payments")
            .select("amount, base_amount, interest_amount, discount_amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)
        if (paymentsErr) throw paymentsErr

        let originalAmount = Math.abs(Number(tx.original_amount ?? tx.amount ?? 0))
        let paidPrincipalSoFar = (existingPayments || []).reduce(
            (acc: number, row: { amount: number | string | null; base_amount?: number | string | null }) =>
                acc + Number(row.base_amount ?? row.amount ?? 0),
            0,
        )
        let remainingPrincipal = Math.max(0, Math.round((originalAmount - paidPrincipalSoFar) * 100) / 100)

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

        let fullyPaid = paidPrincipalSoFar + baseApplied + 0.0001 >= originalAmount
        let paidAfter = paidPrincipalSoFar + baseApplied
        const nowIso = new Date().toISOString()
        const requestId = sanitizeUUID(input.idempotencyKey) || randomUUID()
        const idempotencyKey = `txpayment:${input.transactionId}:${requestId}`

        let resolvedAccountId = tx.account_id
        if (input.accountId) {
            resolvedAccountId = input.accountId
        } else if (effectivePaymentMethodId) {
            const { data: pm } = await supabase
                .from("payment_methods")
                .select("default_finance_account_id")
                .eq("id", effectivePaymentMethodId)
                .eq("partner_id", input.partnerId)
                .maybeSingle()
            if (pm?.default_finance_account_id) resolvedAccountId = pm.default_finance_account_id
        }
        const currentLabel = effectivePaymentMethodId
            ? await paymentMethodDisplayLabel(supabase, input.partnerId, effectivePaymentMethodId).catch(() => null)
            : (rawMethodName || null)
        const { data: paymentResult, error: paymentError } = await createAdminClient().rpc("record_transaction_payment_atomic", {
            p_partner_id: input.partnerId,
            p_transaction_id: input.transactionId,
            p_user_id: userId,
            p_payment_amount: paymentAmount,
            p_interest_amount: interestAmount,
            p_discount_amount: discountAmount,
            p_payment_method_id: effectivePaymentMethodId,
            p_payment_type: currentLabel,
            p_account_id: resolvedAccountId,
            p_idempotency_key: idempotencyKey,
            p_require_installment: true,
        })
        if (paymentError || !paymentResult?.success) {
            throw new Error(paymentError?.message || "Não foi possível registrar o pagamento da parcela.")
        }

        originalAmount = Number(paymentResult.originalAmount || originalAmount)
        paidPrincipalSoFar = Number(paymentResult.paidSoFar || 0)
        remainingPrincipal = Number(paymentResult.remainingBefore || 0)
        baseApplied = Number(paymentResult.principalApplied || 0)
        finalPaid = Number(paymentResult.paidNow || 0)
        fullyPaid = Boolean(paymentResult.fullyPaid)
        paidAfter = paidPrincipalSoFar + baseApplied

        // Derive payment_type from ALL transaction_payments (not just the latest)
        // This ensures split payments (e.g. PIX + Dinheiro) show all methods used
        const { data: allPayments } = await supabase
            .from("transaction_payments")
            .select("payment_method_id, amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)

        const allPaymentLabels: string[] = []
        for (const p of allPayments || []) {
            const pmLabel = p.payment_method_id
                ? await paymentMethodDisplayLabel(supabase, input.partnerId, p.payment_method_id).catch(() => null)
                : null
            if (pmLabel) allPaymentLabels.push(pmLabel)
        }
        // Add current payment if not yet in the list
        if (currentLabel && !allPaymentLabels.includes(currentLabel)) {
            allPaymentLabels.push(currentLabel)
        }

        let paymentTypeDisplay = currentLabel || tx.payment_type || null
        if (allPaymentLabels.length > 1) {
            paymentTypeDisplay = [...new Set(allPaymentLabels)].join(", ")
        }
        const totalPaidAmount = (allPayments || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
        const { error: labelUpdateError } = await supabase
            .from("transactions")
            .update({ payment_type: paymentTypeDisplay })
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
        if (labelUpdateError) {
            console.error("[recordInstallmentPaymentAction] Payment committed; display label update failed", labelUpdateError)
        }

        const installmentDir = tx.transaction_type === "income" ? "Recebido" : "Pago"
        const methodLabel = paymentTypeDisplay

        const { total: groupTotal, paidPrincipal: groupPaidPrincipal } = await getInstallmentGroupPrincipal(
            supabase,
            input.partnerId,
            tx.installment_group_id,
        )
        const remainingGroup = Math.max(0, Math.round((groupTotal - groupPaidPrincipal) * 100) / 100)

        const installmentHistoryLine = buildInstallmentPaymentHistoryLine({
            dir: installmentDir,
            finalPaid,
            installmentNumber: tx.installment_number,
            totalInstallments: tx.total_installments,
            groupTotal,
            remaining: remainingGroup,
            interestAmount,
            discountAmount,
            methodLabel,
        })

        if (!paymentResult.alreadyProcessed) {
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

            // Histórico do pedido: o recebimento da parcela também aparece no pedido.
            const orderIdForAudit = await resolveOrderIdForSaleTransaction(supabase, input.partnerId, tx)
            if (orderIdForAudit) {
                await logAuditEvent({
                    partnerId: input.partnerId,
                    actorUserId: userId,
                    entityType: "order",
                    entityId: orderIdForAudit,
                    actionType: fullyPaid ? "installment_paid" : "installment_partial_paid",
                    changeLines: [installmentHistoryLine],
                    metadata: {
                        oldStatus: "Pendente",
                        newStatus: fullyPaid ? "Pago" : "Pago parcialmente",
                        installmentNumber: tx.installment_number,
                        totalInstallments: tx.total_installments,
                        paidNow: finalPaid,
                        interestAmount,
                        discountAmount,
                        remaining: remainingGroup,
                    },
                    source: "manual",
                })
            }
        }
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
    accountId?: string | null
    idempotencyKey?: string | null
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        await requireFinancialCapability(input.partnerId)
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .select("id, status, partner_id, store_id, description, category, category_id, subcategory_id, account_id, contact_id, customer_id, contact_type, payment_type, notes, due_date, original_amount, amount, transaction_type, refund_kind")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (txErr || !tx) throw new Error(txErr?.message || "Transação não encontrada.")
        if (tx.store_id) await requireStorePermission(tx.store_id, input.partnerId, "financial", "create")

        const paymentAmount = Number(input.paymentAmount || 0)
        const interestAmount = Number(input.interestAmount || 0)
        const discountAmount = Number(input.discountAmount || 0)
        if (!Number.isFinite(paymentAmount) || !Number.isFinite(interestAmount) || !Number.isFinite(discountAmount)) {
            throw new Error("Valores de pagamento inválidos.")
        }
        if (interestAmount < 0 || discountAmount < 0) {
            throw new Error("Juros e descontos não podem ser negativos.")
        }

        const { data: existingPayments, error: paymentsErr } = await supabase
            .from("transaction_payments")
            .select("amount, base_amount, interest_amount, discount_amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)
        if (paymentsErr) throw paymentsErr

        let originalAmount = Math.abs(Number(tx.original_amount ?? tx.amount ?? 0))
        let paidPrincipalSoFar = (existingPayments || []).reduce(
            (acc: number, row: any) => acc + Number(row.base_amount ?? row.amount ?? 0), 0,
        )
        let remainingPrincipal = Math.max(0, Math.round((originalAmount - paidPrincipalSoFar) * 100) / 100)

        const baseRequest = Math.max(0, Math.round(paymentAmount * 100) / 100)
        let baseApplied = Math.min(remainingPrincipal, baseRequest)
        baseApplied = Math.round(baseApplied * 100) / 100

        let finalPaid = Math.round((baseApplied + interestAmount - discountAmount) * 100) / 100
        if (finalPaid <= 0) {
            throw new Error("O valor final pago (após juros e desconto) deve ser maior que zero.")
        }

        let fullyPaid = paidPrincipalSoFar + baseApplied + 0.0001 >= originalAmount
        let paidAfter = paidPrincipalSoFar + baseApplied
        const nowIso = new Date().toISOString()
        const requestId = sanitizeUUID(input.idempotencyKey) || randomUUID()
        const idempotencyKey = `txpayment:${input.transactionId}:${requestId}`

        const validPaymentMethodId = sanitizeUUID(input.paymentMethodId)
        const rawMethodName = (typeof input.paymentMethodId === "string" && !validPaymentMethodId) ? input.paymentMethodId : null

        let resolvedAccountId = tx.account_id
        if (input.accountId) {
            resolvedAccountId = input.accountId
        } else if (validPaymentMethodId) {
            const { data: pm } = await supabase
                .from("payment_methods")
                .select("default_finance_account_id")
                .eq("id", validPaymentMethodId)
                .eq("partner_id", input.partnerId)
                .maybeSingle()
            if (pm?.default_finance_account_id) resolvedAccountId = pm.default_finance_account_id
        }
        const pmTypeLabel = validPaymentMethodId
            ? await paymentMethodDisplayLabel(supabase, input.partnerId, validPaymentMethodId).catch(() => null)
            : (rawMethodName || tx.payment_type || null)

        const { data: paymentResult, error: paymentError } = await createAdminClient().rpc("record_transaction_payment_atomic", {
            p_partner_id: input.partnerId,
            p_transaction_id: input.transactionId,
            p_user_id: userId,
            p_payment_amount: paymentAmount,
            p_interest_amount: interestAmount,
            p_discount_amount: discountAmount,
            p_payment_method_id: validPaymentMethodId,
            p_payment_type: pmTypeLabel,
            p_account_id: resolvedAccountId,
            p_idempotency_key: idempotencyKey,
            p_require_installment: false,
        })
        if (paymentError || !paymentResult?.success) {
            throw new Error(paymentError?.message || "Não foi possível registrar o pagamento.")
        }

        originalAmount = Number(paymentResult.originalAmount || originalAmount)
        paidPrincipalSoFar = Number(paymentResult.paidSoFar || 0)
        remainingPrincipal = Number(paymentResult.remainingBefore || 0)
        baseApplied = Number(paymentResult.principalApplied || 0)
        finalPaid = Number(paymentResult.paidNow || 0)
        fullyPaid = Boolean(paymentResult.fullyPaid)
        paidAfter = paidPrincipalSoFar + baseApplied
        const { data: currentPayments } = await supabase
            .from("transaction_payments")
            .select("amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)
        const totalPaidAmount = (currentPayments || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0)
        const settlementTransactionId = paymentResult.settlementTransactionId as string | null

        const dir = tx.transaction_type === "income" ? "recebido" : "pago"
        const pmLabel = pmTypeLabel || tx.payment_type || ""
        let historyLine = `Pagou R$ ${finalPaid.toFixed(2)}`
        if (pmLabel) historyLine += ` utilizando ${pmLabel}`
        if (interestAmount > 0) historyLine += ` (Juros: R$ ${interestAmount.toFixed(2)})`
        if (discountAmount > 0) historyLine += ` (Desconto: R$ ${discountAmount.toFixed(2)})`

        if (!paymentResult.alreadyProcessed && !fullyPaid) {
            const remainingPrincipalAfter = Math.max(0, Math.round((originalAmount - paidAfter) * 100) / 100)
            historyLine += ` - saldo restante: R$ ${remainingPrincipalAfter.toFixed(2)}`
            if (settlementTransactionId) {
                await logAuditEvent({
                    partnerId: input.partnerId,
                    actorUserId: userId,
                    entityType: "transaction",
                    entityId: settlementTransactionId,
                    actionType: "paid",
                    changeLines: [historyLine],
                    metadata: { oldStatus: "Pendente", newStatus: "Pago" },
                    source: "manual",
                })
                await revalidateEntityTimeline("transaction", settlementTransactionId)
            }

            await logAuditEvent({
                partnerId: input.partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: input.transactionId,
                actionType: "partial_paid",
                changeLines: [historyLine],
                metadata: { oldStatus: "Pendente", paidSoFar: totalPaidAmount, remaining: remainingPrincipalAfter },
                source: "manual",
            })
        } else if (!paymentResult.alreadyProcessed) {
            // Pagamento TOTAL (Quitação)
            await logAuditEvent({
                partnerId: input.partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: input.transactionId,
                actionType: "paid",
                changeLines: [historyLine],
                metadata: { oldStatus: "Pendente", newStatus: "Pago" },
                source: "manual",
            })
        }

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
    /** Conta bancária definida pelo usuário na quitação em massa. Quando informada,
     *  sobrescreve a conta resolvida pelo RPC (do método de pagamento). */
    settleAccountId?: string | null
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

        await requireFinancialCapability(input.partnerId)
        const { userId } = await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()
        const nowIso = new Date().toISOString()

        // Pre-fetch pending transactions to log audit events after successful settlement
        const { data: pendingTxs } = await supabase
            .from("transactions")
            .select("id, status, store_id, account_id, payment_method_id, payment_type, installment_number, total_installments, transaction_type, description, payment_id, original_amount")
            .eq("partner_id", input.partnerId)
            .eq("installment_group_id", input.installmentGroupId)
            .neq("status", "paid")

        if (!pendingTxs || pendingTxs.length === 0) {
            return { success: false as const, error: "Nenhuma parcela pendente encontrada para este parceiro." }
        }
        if (pendingTxs.some((tx: any) => String(tx.status || "").toLowerCase() !== "pending")) {
            throw new Error("O grupo contém parcelas que não estão pendentes e não pode ser quitado em lote.")
        }
        for (const payment of input.installmentPayments || []) {
            const paymentAmount = Number(payment.paymentAmount)
            const interestAmount = Number(payment.interestAmount || 0)
            const discountAmount = Number(payment.discountAmount || 0)
            if (!Number.isFinite(paymentAmount) || !Number.isFinite(interestAmount) || !Number.isFinite(discountAmount)) {
                throw new Error("Valores de pagamento do parcelamento são inválidos.")
            }
            if (paymentAmount < 0 || interestAmount < 0 || discountAmount < 0) {
                throw new Error("Pagamento, juros e descontos do parcelamento não podem ser negativos.")
            }
            if (!pendingTxs.some((tx: any) => tx.id === payment.transactionId)) {
                throw new Error("O pagamento informado não pertence a uma parcela pendente deste grupo.")
            }
        }

        const settleAccountId = input.settleAccountId ? sanitizeUUID(input.settleAccountId) : null
        if (input.settleAccountId && !settleAccountId) throw new Error("Conta de liquidação inválida.")
        for (const tx of pendingTxs as any[]) {
            const custom = (input.installmentPayments || []).find((payment) => payment.transactionId === tx.id)
            const requestedMethodId = sanitizeUUID(custom?.paymentMethodId)
            const methodId = requestedMethodId || sanitizeUUID(tx.payment_method_id)
            await validateTransactionReferences(supabase, input.partnerId, tx.store_id, {
                accountId: settleAccountId || tx.account_id,
                paymentMethodId: methodId,
            }, "create")
        }

        const txIdsToLog = pendingTxs?.map((t: any) => t.id) || []

        const sanitizedPayments = (input.installmentPayments || []).map((p) => {
            const validPmId = sanitizeUUID(p.paymentMethodId)
            const rawMethodName = (typeof p.paymentMethodId === "string" && !sanitizeUUID(p.paymentMethodId)) ? p.paymentMethodId : null
            return {
                ...p,
                accountId: settleAccountId,
                paymentMethodId: validPmId,
                rawPaymentType: rawMethodName,
            }
        })

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

        // If raw payment types were provided without a UUID payment_method_id, update payment_type on transactions
        await Promise.allSettled(
            sanitizedPayments
                .filter((p) => p.rawPaymentType && !p.paymentMethodId)
                .map((p) =>
                    supabase
                        .from("transactions")
                        .update({ payment_type: p.rawPaymentType })
                        .eq("id", p.transactionId)
                        .eq("partner_id", input.partnerId)
                )
        )

        // Log audit events for the transactions that were just settled
        const settleCustomPayments = sanitizedPayments

        const { total: groupTotal, paidPrincipal: groupPaidPrincipal } = await getInstallmentGroupPrincipal(
            supabase,
            input.partnerId,
            input.installmentGroupId,
        )
        const remainingGroup = Math.max(0, Math.round((groupTotal - groupPaidPrincipal) * 100) / 100)

        if (txIdsToLog.length > 0) {
            const { data: paidPerTx } = await supabase
                .from("transaction_payments")
                .select("transaction_id, base_amount, amount")
                .eq("partner_id", input.partnerId)
                .in("transaction_id", txIdsToLog)
            const paidPrincipalByTx = new Map<string, number>()
            for (const p of paidPerTx || []) {
                paidPrincipalByTx.set(p.transaction_id, (paidPrincipalByTx.get(p.transaction_id) || 0) + Number(p.base_amount ?? p.amount ?? 0))
            }

            await Promise.allSettled(
                txIdsToLog.map(async (transactionId: string) => {
                    const txRow = (pendingTxs || []).find((t: any) => t.id === transactionId)
                    const matchedPayment = settleCustomPayments.find((p) => p.transactionId === transactionId)
                    const pAmt = matchedPayment?.paymentAmount || 0
                    const pInt = matchedPayment?.interestAmount || 0
                    const pDisc = matchedPayment?.discountAmount || 0
                    const txRemaining = Math.max(
                        0,
                        Math.round((Math.abs(Number(txRow?.original_amount ?? 0)) - (paidPrincipalByTx.get(transactionId) || 0)) * 100) / 100,
                    )
                    const baseApplied = Math.round(Math.min(pAmt || txRemaining, txRemaining) * 100) / 100
                    const finalPaid = Math.round((baseApplied + pInt - pDisc) * 100) / 100

                    const methodLabel = txRow?.payment_method_id && sanitizeUUID(txRow.payment_method_id)
                        ? await paymentMethodDisplayLabel(supabase, input.partnerId, txRow.payment_method_id).catch(() => null)
                        : (matchedPayment?.rawPaymentType || txRow?.payment_type || null)

                    const settleMsg = buildInstallmentPaymentHistoryLine({
                        dir: String(txRow?.transaction_type) === "income" ? "Recebido" : "Pago",
                        finalPaid,
                        installmentNumber: txRow?.installment_number ?? null,
                        totalInstallments: txRow?.total_installments ?? null,
                        groupTotal,
                        remaining: remainingGroup,
                        interestAmount: pInt,
                        discountAmount: pDisc,
                        methodLabel: methodLabel || txRow?.payment_type || null,
                    })

                    await logAuditEvent({
                        partnerId: input.partnerId,
                        actorUserId: userId,
                        entityType: "transaction",
                        entityId: transactionId,
                        actionType: "settled",
                        changeLines: [settleMsg],
                        metadata: { oldStatus: "Pendente", newStatus: "Pago" },
                        source: "manual",
                    })

                    // Histórico do pedido: o recebimento da parcela também aparece no pedido.
                    const orderIdForAudit = await resolveOrderIdForSaleTransaction(supabase, input.partnerId, txRow || {})
                    if (orderIdForAudit) {
                        await logAuditEvent({
                            partnerId: input.partnerId,
                            actorUserId: userId,
                            entityType: "order",
                            entityId: orderIdForAudit,
                            actionType: "settled",
                            changeLines: [settleMsg],
                            metadata: {
                                oldStatus: "Pendente",
                                newStatus: "Pago",
                                installmentNumber: txRow?.installment_number ?? null,
                                totalInstallments: txRow?.total_installments ?? null,
                                paidNow: finalPaid,
                                interestAmount: pInt,
                                discountAmount: pDisc,
                                remaining: remainingGroup,
                            },
                            source: "manual",
                        })
                    }
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

        await requireFinancialCapability(input.partnerId)
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
        if (![paymentAmount, interestAmount, discountAmount].every(Number.isFinite) || interestAmount < 0 || discountAmount < 0) {
            throw new Error("Valores de pagamento inválidos.")
        }
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

        const validRecPmId = sanitizeUUID(rec.payment_method_id)
        const validResolvedPmId = sanitizeUUID(input.paymentMethodId) || validRecPmId
        const rawMethodName = (typeof input.paymentMethodId === "string" && !sanitizeUUID(input.paymentMethodId)) ? input.paymentMethodId : null

        let accountId = input.accountId || rec.account_id || null
        if (!accountId && validResolvedPmId) {
            const { data: pm } = await supabase
                .from("payment_methods")
                .select("default_finance_account_id")
                .eq("id", validResolvedPmId)
                .eq("partner_id", input.partnerId)
                .maybeSingle()
            if (pm?.default_finance_account_id) {
                accountId = pm.default_finance_account_id
            }
        }

        if (!accountId) {
            throw new Error("É obrigatório selecionar uma conta bancária para registrar o pagamento.")
        }

        await validateTransactionReferences(supabase, input.partnerId, rec.store_id, {
            accountId,
            paymentMethodId: validResolvedPmId,
            customerId: rec.customer_id,
            contactId: rec.contact_id,
            contactType: rec.contact_type,
            categoryId: rec.category_id,
            subcategoryId: rec.subcategory_id,
        }, "create")

        const paymentTypeLabel = validResolvedPmId
            ? await paymentMethodDisplayLabel(supabase, input.partnerId, validResolvedPmId)
            : (rawMethodName || null)

        const { data: paymentResult, error: paymentError } = await createAdminClient().rpc(
            "record_recurring_occurrence_payment_atomic",
            {
                p_partner_id: input.partnerId,
                p_recurring_id: input.recurringId,
                p_user_id: userId,
                p_due_date: dueDateValue,
                p_account_id: accountId,
                p_payment_method_id: validResolvedPmId,
                p_payment_type: paymentTypeLabel,
                p_category_name: categoryName,
                p_payment_amount: paymentAmount,
                p_interest_amount: interestAmount,
                p_discount_amount: discountAmount,
                p_transaction_date: transactionTs,
            },
        )
        if (paymentError) throw paymentError
        const transactionId = String(paymentResult?.transactionId || "")
        if (!transactionId) throw new Error("RPC não retornou a ocorrência liquidada.")

        const { data: paidTransaction, error: readError } = await supabase
            .from("transactions")
            .select("*")
            .eq("id", transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (readError) throw readError
        if (paymentResult?.alreadyProcessed) {
            return { success: true, data: paidTransaction, alreadyPaid: true }
        }

        console.info(
            "[recurring] occurrence_marked_paid",
            JSON.stringify({ recurringId: input.recurringId, occurrenceDate: input.occurrenceDate }),
        )
        let recurringCreatedMsg = `Marcou ocorrência recorrente como paga - R$ ${finalPaid.toFixed(2)}`
        if (interestAmount > 0) recurringCreatedMsg += ` (Juros: R$ ${interestAmount.toFixed(2)})`
        if (discountAmount > 0) recurringCreatedMsg += ` (Desconto: R$ ${discountAmount.toFixed(2)})`
        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: userId,
            entityType: "transaction",
            entityId: transactionId,
            actionType: "paid",
            changeLines: [recurringCreatedMsg],
            source: "manual",
        })
        await revalidateEntityTimeline("transaction", transactionId)
        await revalidateTransactions(input.partnerId)
        return { success: true, data: paidTransaction }
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

        await requireFinancialCapability(input.partnerId, input.storeId)
        await requirePermission(input.partnerId, "financial", "create")
        const supabase = createAdminClient()

        await validateTransactionReferences(supabase, input.partnerId, input.storeId, {
            accountId: input.accountId,
        }, "create")

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
        const supabase = createAdminClient()
        const { data: tx, error } = await supabase
            .from("transactions")
            .select("id, store_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (error) throw error
        if (!tx) throw new Error("Transação não encontrada.")
        if (tx.store_id) await requireStorePermission(tx.store_id, partnerId, "financial", "view")
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
    paymentProvider?: string | null
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
        /** payment_method_id UUID (fixo para parcelas de venda) ou null. */
        paymentMethodId?: string | null
        /** Conta financeira já vinculada à transação. */
        accountId?: string | null
        /** Grupo de parcelas ao qual a parcela pertence. */
        installmentGroupId?: string | null
        /** Indica se a parcela provém de um pedido/venda (método travado). */
        isOrderOrigin?: boolean
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

        const txQuery = await getCachedErpPage<any>(
            ["erp-transaction-detail-row", partnerId, transactionId],
            [TAGS.transactions(partnerId), TAGS.transactionHistory(transactionId)],
            async () => {
                const detailClient = createAdminClient()
                let result = await detailClient
                    .from("transactions")
                    .select(
                        `
        id, description, category, amount, original_amount, interest_amount, discount_amount, paid_amount, due_date, payment_date, created_at, updated_at, status, notes, store_id,
        payment_type, transaction_type, contact_id, customer_id, contact_type, transfer_group_id,
        refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id,
        payment_method_id, transaction_date, created_by_user_id, installment_group_id,
        transaction_contacts(name, type, description)
      `,
                    )
                    .eq("id", transactionId)
                    .eq("partner_id", partnerId)
                    .single()
                if (result.error && isMissingCreatedByUserIdColumnError(result.error)) {
                    result = await detailClient
                        .from("transactions")
                        .select(
                            `
        id, description, category, amount, original_amount, interest_amount, discount_amount, paid_amount, due_date, payment_date, created_at, updated_at, status, notes, store_id,
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
                return result
            },
            15,
        )

        const t = txQuery.data
        const error = txQuery.error

        if (error || !t) {
            return { success: false, error: "Transação não encontrada." }
        }

        if ((t as any).store_id) {
            await requireStorePermission((t as any).store_id, partnerId, "financial", "view")
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
                    .select("name, type, integration_source")
                    .eq("id", row.account_id)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                    .then(({ data: acc }: { data: any }) => ({ name: acc?.name || null, type: acc?.type || null, integrationSource: acc?.integration_source || null }))
                : Promise.resolve({ name: null as string | null, type: null as string | null, integrationSource: null as string | null }),
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
                    .select("id, installment_number, due_date, payment_date, status, amount, original_amount, payment_type, payment_method_id")
                    .eq("partner_id", partnerId)
                    .eq("installment_group_id", row.installment_group_id)
                    .order("installment_number", { ascending: true }),
            ])
            if (igGroup && igGroup.total_amount != null) {
                installmentGroupTotalAmount = Math.abs(Number(igGroup.total_amount) || 0) || null
            }
            const groupTxIds = (groupRows || []).map((g: any) => String(g.id))
            const paymentByTx = new Map<string, { base: number; cash: number; interest: number; discount: number }>()
            let paymentRows: any[] = []
            const res = await supabase
                .from("transaction_payments")
                .select("transaction_id, amount, base_amount, interest_amount, discount_amount, payment_method_id")
                .eq("partner_id", partnerId)
                .in("transaction_id", groupTxIds.length > 0 ? groupTxIds : [row.id])
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

            const pmIds = [...new Set(paymentRows.map((p: any) => p.payment_method_id).map(sanitizeUUID).filter(Boolean) as string[])]
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
            // Show ALL parcelas da transação (installment group) in the detail view.
            const groupRowsAll = (groupRows || []).length > 0
                ? groupRows
                : [{
                    id: row.id,
                    installment_number: row.installment_number,
                    due_date: row.due_date,
                    payment_date: row.payment_date,
                    status: row.status,
                    original_amount: row.original_amount,
                    amount: row.amount,
                    payment_type: row.payment_type,
                    payment_method_id: row.payment_method_id,
                }]
            installmentBreakdown = (groupRowsAll as any[]).map((g: any) => {
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
                // Determine whether this installment originates from a sales order (pedido).
                // Sales installments (category "Vendas" with a doc reference) are born with a
                // fixed payment_method_id and are locked from edits.
                const isOrderOrigin = row.category === "Vendas" && !!row.description
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
                    paymentMethodId: g.payment_method_id ? String(g.payment_method_id) : null,
                    accountId: row.account_id ? String(row.account_id) : null,
                    installmentGroupId: row.installment_group_id ? String(row.installment_group_id) : null,
                    isOrderOrigin,
                    status: (paidFlag ? "paid" : overdue ? "overdue" : "pending") as "paid" | "overdue" | "pending",
                }
            })
            const allInstallmentsPaid = (groupRows || []).length > 0 && (groupRows || []).every((g: any) => String(g.status || "").toLowerCase() === "paid")
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
        let salesOrder: { buyer_id?: string | null; customer_name?: string | null; payment_provider?: string | null } | null = null
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
          payment_provider,
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
                else if (src === "vitrine online") originSource = "Vitrine online"
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

        const paymentDateSubtitle = formatDateTime(row.payment_date || row.created_at)
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
            paymentProvider: salesOrder
                ? (salesOrder as any).payment_provider || null
                : (accountData as any)?.integrationSource === "mercadopago" ? "Mercado Pago" : null,
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
            paymentDateLine: formatDateTime(row.payment_date || row.created_at),
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
    transactionId: string,
    fileName: string,
    fileType: string,
    fileSize: number
): Promise<
    | { success: true; uploadUrl: string; publicUrl: string; key: string }
    | { success: false; error: string }
> {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }
        const user = await requireUser()
        await requirePermission(partnerId, "financial", "edit")

        const supabase = await getSupabaseServerClient()
        const { data: transaction } = await supabase
            .from("transactions")
            .select("id, store_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!transaction) return { success: false, error: "Transação não encontrada." }
        if (transaction.store_id) {
            await requireStorePermission(transaction.store_id, partnerId, "financial", "edit")
        }

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
            kind: fileType.startsWith("image/") ? "image" : "document",
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
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }
        await requirePermission(partnerId, "financial", "edit")
        const user = await requireUser()

        const supabase = await getSupabaseServerClient()
        const { data: transaction } = await supabase
            .from("transactions")
            .select("id, partner_id, store_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!transaction) return { success: false, error: "Transação não encontrada." }
        if (transaction.store_id) {
            await requireStorePermission(transaction.store_id, partnerId, "financial", "edit")
        }

        const { R2_PREFIXES } = await import("@/lib/r2/config")
        const { validateKeyOwnership } = await import("@/lib/r2/server")
        const expectedPrefix = `users/${user.id}/${R2_PREFIXES.orderAttachments}`
        if (
            typeof fileKey !== "string" ||
            !validateKeyOwnership(fileKey, user.id) ||
            !fileKey.startsWith(expectedPrefix) ||
            fileKey.includes("..") ||
            fileKey.startsWith("/")
        ) {
            return { success: false, error: "Chave de arquivo inválida para este usuário." }
        }
        const { validateUploadRequest } = await import("@/lib/security/file-validator")
        const validation = validateUploadRequest(fileName, fileType, fileSize)
        if (!validation.success) return { success: false, error: validation.error || "Arquivo inválido." }

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

        // The client-provided size is only a hint. Verify the object that
        // actually landed in R2 before persisting an attachment record.
        const { getR2ServerConfig } = await import("@/lib/r2/r2-server-config")
        const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3")
        const serverConfig = getR2ServerConfig()
        const s3 = new S3Client({
            region: "auto",
            credentials: {
                accessKeyId: serverConfig.accessKeyId,
                secretAccessKey: serverConfig.secretAccessKey,
            },
            endpoint: `https://${serverConfig.accountId}.r2.cloudflarestorage.com`,
        })
        let actualFileSize: number
        try {
            const head = await s3.send(new HeadObjectCommand({ Bucket: serverConfig.bucketName, Key: fileKey }))
            actualFileSize = Number(head.ContentLength)
            if (!Number.isSafeInteger(actualFileSize) || actualFileSize < 1 || head.ContentType !== fileType) {
                return { success: false, error: "O arquivo enviado não corresponde aos dados informados." }
            }
            const actualValidation = validateUploadRequest(fileName, fileType, actualFileSize)
            if (!actualValidation.success) {
                return { success: false, error: actualValidation.error || "Arquivo enviado excede os limites permitidos." }
            }
        } finally {
            s3.destroy()
        }

        let finalHash = fileHash || ""
        if (!finalHash && actualFileSize < 5 * 1024 * 1024) {
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
                file_size: actualFileSize,
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
        const supabase = await getSupabaseServerClient()

        const { data: transaction } = await supabase
            .from("transactions")
            .select("id, partner_id, store_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!transaction) return { success: false, error: "Transação não encontrada." }
        if (transaction.store_id) {
            await requireStorePermission(transaction.store_id, partnerId, "financial", "edit")
        }

        const { data: attachment } = await supabase
            .from("transaction_attachments")
            .select("id, file_key, file_name")
            .eq("id", attachmentId)
            .eq("transaction_id", transactionId)
            .maybeSingle()

        if (!attachment) {
            return { success: false, error: "Anexo não encontrado" }
        }

        const { deleteFileFromR2 } = await import("@/lib/r2/server")
        await deleteFileFromR2(attachment.file_key)

        const admin = createAdminClient()
        await admin.from("transaction_attachments").delete().eq("id", attachmentId).eq("transaction_id", transactionId)

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
    transactionId: string,
    partnerId?: string,
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
    try {
        await requireUser()
        const supabase = await getSupabaseServerClient()

        const { data: transaction } = await supabase
            .from("transactions")
            .select("id, partner_id, store_id")
            .eq("id", transactionId)
            .maybeSingle()
        if (!transaction || (partnerId && transaction.partner_id !== partnerId)) {
            return { success: false, error: "Transação não encontrada." }
        }
        if (transaction.store_id) await requireStorePermission(transaction.store_id, transaction.partner_id, "financial", "view")
        else await requirePermission(transaction.partner_id, "financial", "view")

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
        const supabase = await getSupabaseServerClient()
        const { data: transaction } = await supabase
            .from("transactions")
            .select("id, partner_id, store_id")
            .eq("id", transactionId)
            .maybeSingle()
        if (!transaction || (partnerId && transaction.partner_id !== partnerId)) {
            return { success: false, error: "Transação não encontrada." }
        }

        const { data: attachment } = await supabase
            .from("transaction_attachments")
            .select("id")
            .eq("transaction_id", transactionId)
            .eq("file_key", fileKey)
            .maybeSingle()
        if (!attachment) return { success: false, error: "Anexo não encontrado nesta transação." }

        if (transaction.store_id) await requireStorePermission(transaction.store_id, transaction.partner_id, "financial", "view")
        else await requirePermission(transaction.partner_id, "financial", "view")

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
        await requireFinancialCapability(input.partnerId)
        const { userId } = await requirePermission(input.partnerId, "financial", "edit")
        const supabase = createAdminClient()
        const { data: groupRows, error: lookupError } = await supabase
            .from("transactions")
            .select("id, store_id")
            .eq("installment_group_id", input.installmentGroupId)
            .eq("partner_id", input.partnerId)
        if (lookupError) throw lookupError
        if (!groupRows?.length) throw new Error("Parcelamento não encontrado.")
        for (const row of groupRows) {
            if (row.store_id) {
                await requireStorePermission(row.store_id, input.partnerId, "financial", "edit")
            }
        }
        const { error } = await supabase
            .from("transactions")
            .update({ notes: sanitizeNotes(input.notes), updated_at: new Date().toISOString() })
            .eq("installment_group_id", input.installmentGroupId)
            .eq("partner_id", input.partnerId)

        if (error) throw error
        await revalidateTransactions(input.partnerId)
        return { success: true }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao atualizar observações do parcelado" }
    }
}

export interface BatchFinancialTransactionsPayload {
    partnerId: string
    transactionIds: string[]
    actionType: "cancel" | "settle" | "reschedule" | "category"
    cancelReason?: string
    settleAccountId?: string
    settlePaymentMethodId?: string
    settlePaymentDate?: string
    rescheduleMode?: "add_days" | "fixed_date"
    rescheduleDays?: number
    rescheduleDate?: string
    categoryId?: string
    categoryName?: string
}

export async function updateFinancialTransactionsInBatchAction(input: BatchFinancialTransactionsPayload) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        await requireFinancialCapability(input.partnerId)
        const requiredPerm = input.actionType === "cancel" ? "cancel" : input.actionType === "settle" ? "create" : "edit"
        const { userId } = await requirePermission(input.partnerId, "financial", requiredPerm)
        const user = await getCurrentUser()
        const actorName = user?.user_metadata?.full_name?.trim() || user?.email?.trim() || "Usuário"
        const supabase = createAdminClient()

        if (!input.transactionIds || input.transactionIds.length === 0) {
            return { success: false as const, error: "Nenhuma transação selecionada." }
        }
        if (input.transactionIds.length > 200) {
            return { success: false as const, error: "Selecione no máximo 200 transações por lote." }
        }
        if (new Set(input.transactionIds).size !== input.transactionIds.length) {
            return { success: false as const, error: "A seleção contém IDs repetidos ou inválidos." }
        }
        if (
            input.actionType === "settle" &&
            input.settlePaymentDate !== undefined &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(input.settlePaymentDate) ||
                Number.isNaN(new Date(`${input.settlePaymentDate}T00:00:00.000Z`).getTime()) ||
                new Date(`${input.settlePaymentDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== input.settlePaymentDate)
        ) {
            return { success: false as const, error: "Data de quitação inválida." }
        }

        // Parse IDs: separate direct UUIDs and group- UUIDs
        const directIds: string[] = []
        const groupIds: string[] = []

        for (const rawId of input.transactionIds) {
            if (typeof rawId !== "string") continue
            if (rawId.startsWith("group-")) {
                const gid = sanitizeUUID(rawId.slice(6))
                if (gid) groupIds.push(gid)
            } else {
                const uid = sanitizeUUID(rawId)
                if (uid) directIds.push(uid)
            }
        }

        if (directIds.length === 0 && groupIds.length === 0) {
            return { success: false as const, error: "Nenhuma transação válida selecionada." }
        }
        if (
            directIds.length + groupIds.length !== input.transactionIds.length ||
            new Set(directIds).size !== directIds.length ||
            new Set(groupIds).size !== groupIds.length
        ) {
            return { success: false as const, error: "A seleção contém IDs inválidos ou repetidos." }
        }

        // 1. Fetch current selected transactions
        let query = supabase
            .from("transactions")
            .select("id, partner_id, status, installment_group_id, amount, original_amount, paid_amount, description, account_id, payment_type, payment_method_id, transaction_type, refund_kind, due_date, notes, store_id, category_id, category, updated_at")
            .eq("partner_id", input.partnerId)

        if (directIds.length > 0 && groupIds.length > 0) {
            query = query.or(`id.in.(${directIds.join(",")}),installment_group_id.in.(${groupIds.join(",")})`)
        } else if (directIds.length > 0) {
            query = query.in("id", directIds)
        } else {
            query = query.in("installment_group_id", groupIds)
        }

        const { data: currentRows, error: fetchErr } = await query

        if (fetchErr || !currentRows || currentRows.length === 0) {
            return { success: false as const, error: fetchErr?.message || "Transações não encontradas." }
        }

        let eligibleRows: typeof currentRows = []

        // 2. Filter eligible rows based on actionType (early rule filtering)
        if (input.actionType === "cancel") {
            eligibleRows = currentRows.filter((tx: any) => {
                const isPending = String(tx.status || "").toLowerCase() === "pending"
                const hasNoGroup = !tx.installment_group_id
                return isPending && hasNoGroup
            })
        } else if (input.actionType === "settle") {
            eligibleRows = currentRows.filter((tx: any) => {
                return String(tx.status || "").toLowerCase() === "pending"
            })
        } else if (input.actionType === "reschedule") {
            eligibleRows = currentRows.filter((tx: any) => {
                return String(tx.status || "").toLowerCase() === "pending"
            })
        } else if (input.actionType === "category") {
            eligibleRows = currentRows.filter((tx: any) => {
                return String(tx.status || "").toLowerCase() !== "cancelled"
            })
        }

        const skippedCount = currentRows.length - eligibleRows.length

        if (eligibleRows.length === 0) {
            return {
                success: false as const,
                error: "Nenhuma das transações selecionadas é elegível para esta ação.",
                skippedCount,
                totalCount: currentRows.length,
            }
        }

        // A checagem de parceiro acima não representa o acesso de um membro a
        // cada loja. Faça o preflight de todas as linhas antes de iniciar o lote,
        // para que uma loja sem permissão não deixe um lote parcialmente aplicado.
        const storeAction = input.actionType === "cancel"
            ? "cancel"
            : input.actionType === "settle"
                ? "create"
                : "edit"
        for (const tx of eligibleRows as any[]) {
            if (tx.store_id) {
                await requireStorePermission(tx.store_id, input.partnerId, "financial", storeAction)
            }
        }

        if (input.actionType === "category") {
            const categoryId = sanitizeUUID(input.categoryId)
            if (input.categoryId && !categoryId) throw new Error("Categoria inválida.")
            if (categoryId) {
                const { data: category } = await supabase
                    .from("financial_categories")
                    .select("id")
                    .eq("id", categoryId)
                    .eq("partner_id", input.partnerId)
                    .maybeSingle()
                if (!category) throw new Error("Categoria não encontrada para este parceiro.")
            }
        }

        // Concurrency pool (concurrency: 6)
        const CONCURRENCY = 6
        const now = new Date()
        const nowIso = now.toISOString()
        const formattedDateNow = formatDateTime(nowIso) || now.toLocaleString("pt-BR")
        let queueIndex = 0
        const processingWarnings: string[] = []
        let processedCount = 0

        const processSingleTransaction = async (tx: typeof currentRows[0]) => {
            try {
                if (input.actionType === "cancel") {
                    const reason = String(input.cancelReason || "").trim()
                    const cancellationLine = `Cancelado por ${actorName} em ${formattedDateNow}${reason ? ` - Motivo: ${reason}` : ""}`
                    const prevNotes = String(tx.notes || "").trim()
                    const nextNotes = prevNotes ? `${prevNotes}\n${cancellationLine}` : cancellationLine

                    const { data: updatedRow, error: updErr } = await supabase
                        .from("transactions")
                        .update({
                            status: "cancelled",
                            notes: nextNotes,
                            updated_at: nowIso,
                        })
                        .eq("id", tx.id)
                        .eq("partner_id", input.partnerId)
                        .eq("status", "pending")
                        .eq("updated_at", tx.updated_at)
                        .select("id")
                        .maybeSingle()

                    if (updErr) throw updErr
                    if (!updatedRow) throw new Error("A transação mudou durante o lote e não foi cancelada.")

                    await logAuditEvent({
                        partnerId: input.partnerId,
                        actorUserId: userId,
                        entityType: "transaction",
                        entityId: tx.id,
                        actionType: "updated",
                        changeLines: [cancellationLine, "alterou o status para cancelado."],
                        source: "manual",
                        storeId: tx.store_id || null,
                    })

                } else if (input.actionType === "settle") {
                    const validPmId = sanitizeUUID(input.settlePaymentMethodId)
                    const rawPm = typeof input.settlePaymentMethodId === "string" && !validPmId ? input.settlePaymentMethodId : tx.payment_type

                    let resolvedAccountId = sanitizeUUID(input.settleAccountId) || tx.account_id
                    if (!resolvedAccountId && validPmId) {
                        const { data: pm } = await supabase
                            .from("payment_methods")
                            .select("default_finance_account_id")
                            .eq("id", validPmId)
                            .eq("partner_id", input.partnerId)
                            .maybeSingle()
                        if (pm?.default_finance_account_id) {
                            resolvedAccountId = pm.default_finance_account_id
                        }
                    }
                    if (!resolvedAccountId) {
                        const { data: defaultAcc } = await supabase
                            .from("finance_accounts")
                            .select("id")
                            .eq("partner_id", input.partnerId)
                            .eq("is_active", true)
                            .order("is_default", { ascending: false })
                            .limit(1)
                            .maybeSingle()
                        if (defaultAcc?.id) {
                            resolvedAccountId = defaultAcc.id
                        }
                    }

                    if (!resolvedAccountId) {
                        throw new Error(`Transação "${tx.description || tx.id}": conta bancária não informada.`)
                    }
                    await validateTransactionReferences(supabase, input.partnerId, tx.store_id, {
                        accountId: resolvedAccountId,
                        paymentMethodId: validPmId,
                    }, "edit")
                    const paymentAmount = Math.abs(Number(tx.original_amount ?? tx.amount ?? 0))
                    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
                        throw new Error("Valor pendente inválido para quitação.")
                    }

                    const paymentDate = input.settlePaymentDate || nowIso.slice(0, 10)
                    const requestId = crypto.randomUUID()
                    const idempotencyKey = `txpayment:${tx.id}:${requestId}`
                    const { data: paymentResult, error: paymentError } = await supabase.rpc(
                        "record_transaction_payment_with_date_atomic",
                        {
                            p_partner_id: input.partnerId,
                            p_transaction_id: tx.id,
                            p_user_id: userId,
                            p_payment_amount: paymentAmount,
                            p_interest_amount: 0,
                            p_discount_amount: 0,
                            p_payment_method_id: validPmId || null,
                            p_payment_type: rawPm || tx.payment_type,
                            p_account_id: resolvedAccountId,
                            p_idempotency_key: idempotencyKey,
                            p_require_installment: Boolean(tx.installment_group_id),
                            p_payment_date: paymentDate,
                        },
                    )
                    if (paymentError || !(paymentResult as any)?.success) {
                        throw new Error(paymentError?.message || "Não foi possível quitar a transação de forma segura.")
                    }
                    const paidNow = Number((paymentResult as any).paidNow || 0)

                    await logAuditEvent({
                        partnerId: input.partnerId,
                        actorUserId: userId,
                        entityType: "transaction",
                        entityId: tx.id,
                        actionType: "updated",
                        changeLines: [`Quitado em massa no valor de R$ ${paidNow.toFixed(2)} por ${actorName}`],
                        source: "manual",
                        storeId: tx.store_id || null,
                    })

                } else if (input.actionType === "reschedule") {
                    let nextDueDate: string = nowIso.slice(0, 10)
                    if (input.rescheduleMode === "fixed_date" && input.rescheduleDate) {
                        nextDueDate = input.rescheduleDate
                    } else if (input.rescheduleMode === "add_days" && input.rescheduleDays) {
                        const baseDate = tx.due_date ? new Date(tx.due_date) : new Date()
                        baseDate.setDate(baseDate.getDate() + Number(input.rescheduleDays))
                        nextDueDate = baseDate.toISOString().slice(0, 10)
                    }

                    const { data: updatedRow, error: updErr } = await supabase
                        .from("transactions")
                        .update({
                            due_date: nextDueDate,
                            updated_at: nowIso,
                        })
                        .eq("id", tx.id)
                        .eq("partner_id", input.partnerId)
                        .eq("status", "pending")
                        .eq("updated_at", tx.updated_at)
                        .select("id")
                        .maybeSingle()

                    if (updErr) throw updErr
                    if (!updatedRow) throw new Error("A transação mudou durante o lote e não foi reagendada.")

                    await logAuditEvent({
                        partnerId: input.partnerId,
                        actorUserId: userId,
                        entityType: "transaction",
                        entityId: tx.id,
                        actionType: "updated",
                        changeLines: [`Vencimento prorrogado para ${nextDueDate} por ${actorName}`],
                        source: "manual",
                        storeId: tx.store_id || null,
                    })

                } else if (input.actionType === "category") {
                    const validCatId = sanitizeUUID(input.categoryId)
                    const catName = input.categoryName?.trim() || "Geral"

                    const { data: updatedRow, error: updErr } = await supabase
                        .from("transactions")
                        .update({
                            category_id: validCatId || null,
                            category: catName,
                            updated_at: nowIso,
                        })
                        .eq("id", tx.id)
                        .eq("partner_id", input.partnerId)
                        .eq("status", tx.status)
                        .eq("updated_at", tx.updated_at)
                        .select("id")
                        .maybeSingle()

                    if (updErr) throw updErr
                    if (!updatedRow) throw new Error("A transação mudou durante o lote e a categoria não foi alterada.")

                    await logAuditEvent({
                        partnerId: input.partnerId,
                        actorUserId: userId,
                        entityType: "transaction",
                        entityId: tx.id,
                        actionType: "updated",
                        changeLines: [`Categoria alterada para "${catName}" por ${actorName}`],
                        source: "manual",
                        storeId: tx.store_id || null,
                    })
                }

                processedCount++
            } catch (err: any) {
                console.error(`[batch_financial_tx] Error processing ${tx.id}:`, err)
                processingWarnings.push(`Transação "${tx.description || tx.id}": ${err.message}`)
            }
        }

        const workers = new Array(Math.min(CONCURRENCY, eligibleRows.length)).fill(0).map(async () => {
            while (queueIndex < eligibleRows.length) {
                const idx = queueIndex++
                await processSingleTransaction(eligibleRows[idx])
            }
        })
        await Promise.all(workers)

        await revalidateTransactions(input.partnerId)

        return {
            success: true as const,
            processedCount,
            skippedCount,
            totalCount: currentRows.length,
            warning: processingWarnings.length > 0 ? processingWarnings.join(" | ") : undefined,
        }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao processar transações em massa" }
    }
}



"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import type { ERPTransaction } from "@/lib/services/transactions.types"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { formatTime, formatDateTime, formatDayMonth } from "@/lib/utils/formatters"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getTransactionHistoryEntries } from "@/lib/services/transaction-history.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { revalidateTransactions, revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { sanitizeInput } from "@/lib/input-validator"

type DbTransaction = {
    id: string
    description: string
    categoryLabel?: string
    category: string
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
    const d = new Date(value)
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" })
}

function formatDateShort(value: string) {
    const d = new Date(value)
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "America/Sao_Paulo" })
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

export async function getFinancialTransactionsAction(
    partnerId: string,
    options?: { page?: number; pageSize?: number }
): Promise<{ success: true; data: ERPTransaction[]; totalCount: number } | { success: false; error: string }> {
    const actionStart = performance.now()
    try {
        const authStart = performance.now()
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        console.log(`[PERF] transactions.auth ${Math.round(performance.now() - authStart)}ms`)
        const supabase = await getSupabaseServerClient()

        const page = Math.max(1, options?.page ?? 1)
        const pageSize = options?.pageSize ?? 50
        const offset = (page - 1) * pageSize

        // ── Step 1: Main query with pagination ──────────────────────────
        const t1 = performance.now()
        const { data, error, count } = await supabase
            .from("transactions")
            .select(`
        id, description, category, amount, due_date, payment_date, created_at, status, notes, payment_type, transaction_type, contact_id, customer_id, contact_type,
        transfer_group_id, refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id, payment_method_id, installment_group_id, installment_number,
        transaction_contacts(name, type)
      `, { count: "exact" })
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: false })
            .range(offset, offset + pageSize - 1)

        if (error) throw error
        const txs = (data || []) as unknown as DbTransaction[]
        const totalCount = count ?? 0
        console.log(`[PERF] transactions.query ${Math.round(performance.now() - t1)}ms (${txs.length} rows, total ${totalCount})`)

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
                .select("order_number, buyer_id, customer_name")
                .eq("partner_id", partnerId)
                .in("order_number", uniqueSaleRefs)
                .then((r: any) => r.data || [])
            : Promise.resolve([] as { order_number: string; buyer_id: string | null; customer_name: string | null }[])

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

        const [orders, posSales, pmRows, installmentGroups] = await Promise.all([
            ordersPromise,
            salesPromise,
            paymentMethodsPromise,
            installmentGroupsPromise,
        ])

        // Build order lookup and collect buyer IDs into the customer set
        const orderByNumber = new Map<string, { buyer_id: string | null; customer_name: string | null }>()
        for (const o of orders) {
            orderByNumber.set(String(o.order_number), { buyer_id: o.buyer_id, customer_name: o.customer_name })
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

        console.log(`[PERF] transactions.lookups ${Math.round(performance.now() - t2)}ms`)

        // ── Step 4: Map to ERPTransaction ───────────────────────────────
        const now = new Date()
        const todayYmd = now.toISOString().slice(0, 10)
        const mapped: ERPTransaction[] = txs.map((t) => {
            const baseDate = t.due_date || t.payment_date || t.created_at
            const baseDateObj = new Date(baseDate)
            const dueYmd = t.due_date ? String(t.due_date).slice(0, 10) : null
            const isOverdue = isStatusPending(t.status) && !!dueYmd && dueYmd < todayYmd
            
            const diffTime = baseDateObj.getTime() - now.getTime()
            const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

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
                description: t.category === "Vendas" ? `Venda - ${t.description}` : t.description,
                details: undefined,
                category: t.category || "Outros",
                contactName:
                    t.category === "Vendas"
                        ? salesContactName
                        : t.customer_id
                          ? manualCustomerName
                          : fallbackContact,
                contactType: t.category === "Vendas" ? "customer" : (t.contact_type || t.transaction_contacts?.type || (t.customer_id ? "customer" : "other")),
                dueDate: formatDateLabel(baseDate),
                dueDateShort: formatDateShort(baseDate),
                dueDateTime: "",
                dateNote: isOverdue ? "Atrasado" : "-",
                createdAtDate: formatDateLabel(t.created_at || now.toISOString()),
                createdAtTime: formatTime(t.created_at || now.toISOString()),
                daysUntilDue,
                isOverdue,
                paymentType:
                    (t.payment_method_id && paymentMethodLabelById.get(t.payment_method_id)) ||
                    (t.payment_type ? formatPaymentMethodLabel(t.payment_type, null) : "") ||
                    "Não informado",
                status: toDisplayStatus(t.status, t.transaction_type, t.refund_kind, isOverdue),
                statusVariant: toStatusVariant(t.status, isOverdue),
                amount: Math.abs(Number(t.amount || 0)),
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
            }
        })

        console.log(`[PERF] getFinancialTransactions took ${Math.round(performance.now() - actionStart)}ms (${txs.length} rows, page ${page})`)
        return { success: true, data: mapped, totalCount }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar transações" }
    }
}

export type CreateManualTransactionInput = {
    partnerId: string
    transactionType: "income" | "expense" | "transfer" | "adjustment" | "refund"
    amount: number
    description: string
    category: string
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

        const { userId } = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

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
        const sanitizedNotes = input.notes ? sanitizeInput(String(input.notes), 2000) : null

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
        const customerId = input.customerId?.trim() || null
        const contactId = customerId ? null : input.contactId ?? null
        const contactTypeResolved = customerId ? "customer" : input.contactType ?? null

        const isVendaIncome =
            String(input.category || "").trim() === "Vendas" && input.transactionType === "income"

        const payload: Record<string, unknown> = {
            partner_id: input.partnerId,
            description: description,
            category: input.category || "Outros",
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
}

export async function createTransferPairAction(input: CreateTransferPairInput) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        const amt = Number(input.amount || 0)
        if (!Number.isFinite(amt) || !(amt > 0)) throw new Error("Valor deve ser maior que zero.")
        if (amt > 99999999) throw new Error("Valor fora do limite permitido.")
        if (!input.fromAccountId || !input.toAccountId) throw new Error("Selecione origem e destino.")
        if (input.fromAccountId === input.toAccountId) throw new Error("Contas devem ser diferentes.")

        const transferGroupId = crypto.randomUUID()
        const idempotencyKey = crypto.randomUUID()
        const datePart = (input.transactionDate || new Date().toISOString()).slice(0, 10)
        const transactionTs = new Date(`${datePart}T12:00:00`).toISOString()
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

        const outRow = {
            partner_id: input.partnerId,
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

        await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        const { data: current, error: currentError } = await supabase
            .from("transactions")
            .select("id, partner_id, status, origin, recurring_id, installment_group_id, category, description, payment_method_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (currentError || !current) throw new Error(currentError?.message || "Transação não encontrada.")

        const paid = isStatusPaid(current.status)
        const systemGateway = isSystemOrGatewayOrigin(current.origin)
        const isRecurringSystemPending =
            !!current.recurring_id && systemGateway && !paid
        if (isRecurringSystemPending) {
            throw new Error(
                "Esta linha vem da recorrência. Edite o modelo em Previstos ou use «Marcar como pago» - não altere este lançamento pendente.",
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
            "dueDate",
            "notes",
        ])
        const ALLOWED_PAID_KEYS = new Set<keyof CreateManualTransactionInput>([
            "description",
            "notes",
        ])

        const allowedKeys = paid ? ALLOWED_PAID_KEYS : ALLOWED_PENDING_KEYS
        for (const key of patchKeys) {
            if (!allowedKeys.has(key)) {
                throw new Error(`Campo "${key}" não pode ser editado quando status é ${paid ? "paid" : "pending"}.`)
            }
        }

        if (paid) {
            if (patch.description !== undefined) payload.description = patch.description?.trim()
            if (patch.notes !== undefined) payload.notes = patch.notes
        } else {
            if (patch.description !== undefined) payload.description = patch.description?.trim()
            if (patch.categoryId !== undefined) payload.category_id = patch.categoryId
            if (patch.subcategoryId !== undefined) payload.subcategory_id = patch.subcategoryId
            if (!systemGateway && patch.accountId !== undefined) payload.account_id = patch.accountId
            if (patch.contactId !== undefined) payload.contact_id = patch.contactId
            if (patch.customerId !== undefined) payload.customer_id = patch.customerId
            if (patch.contactType !== undefined) payload.contact_type = patch.contactType
            if (patch.dueDate !== undefined) payload.due_date = patch.dueDate
            if (patch.notes !== undefined) payload.notes = patch.notes
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
            const user = await getCurrentUser()
            await logAuditEvent({
                partnerId,
                actorUserId: user?.id ?? null,
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

/**
 * Fetch a single transaction with all raw DB fields needed for the edit form.
 */
export async function getTransactionForEditAction(transactionId: string, partnerId: string) {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()

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
}) {
    try {
        const { userId } = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        const count = Math.floor(Number(input.installmentsCount) || 0)
        if (!(count >= 1)) throw new Error("Informe a quantidade de parcelas.")
        if (count > 48) throw new Error("Máximo de 48 parcelas.")
        const totalAmount = Number(input.totalAmount || 0)
        if (!(totalAmount > 0)) throw new Error("Valor total deve ser maior que zero.")

        const interval = Math.max(1, Math.floor(Number(input.interval) || 1))
        const startDate = new Date(`${input.startDate}T12:00:00`)
        if (Number.isNaN(startDate.getTime())) throw new Error("Data inicial inválida.")

        const eachAmount = Math.round((totalAmount / count) * 100) / 100
        const amountDiff = Math.round((totalAmount - (eachAmount * count)) * 100) / 100

        const { data: group, error: groupErr } = await supabase
            .from("installment_groups")
            .insert({
                partner_id: input.partnerId,
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

        const transactionsPayload = Array.from({ length: count }).map((_, index) => {
            const installmentNumber = index + 1
            const due = addInstallmentDate(startDate, input.frequency, interval, index)
            const lineAmount = installmentNumber === count ? Math.round((eachAmount + amountDiff) * 100) / 100 : eachAmount
            return {
                partner_id: input.partnerId,
                description: input.description.trim(),
                category: input.categoryLabel || "Parcelado",
                category_id: input.categoryId || null,
                subcategory_id: input.subcategoryId || null,
                account_id: input.accountId || null,
                contact_id: input.customerId ? null : (input.contactId || null),
                customer_id: input.customerId || null,
                contact_type: input.customerId ? "customer" : (input.contactType || null),
                amount: lineAmount,
                due_date: due.toISOString().slice(0, 10),
                payment_date: null,
                transaction_date: due.toISOString(),
                status: "pending",
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

        await revalidateTransactions(input.partnerId)
        return { success: true as const, data: { groupId: group.id, createdCount: (inserted.data || []).length } }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao criar parcelamento" }
    }
}

export async function getInstallmentGroupDetailsAction(input: { partnerId: string; installmentGroupId: string }) {
    try {
        await requirePartnerAccessWithPermission(input.partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()

        const { data: group, error: groupErr } = await supabase
            .from("installment_groups")
            .select("id, description, total_amount, installments_count")
            .eq("id", input.installmentGroupId)
            .eq("partner_id", input.partnerId)
            .single()
        if (groupErr || !group) throw groupErr || new Error("Grupo de parcelas não encontrado.")

        const { data: rows, error: rowsErr } = await supabase
            .from("transactions")
            .select("id, description, amount, original_amount, due_date, payment_date, status, installment_number")
            .eq("partner_id", input.partnerId)
            .eq("installment_group_id", input.installmentGroupId)
            .order("installment_number", { ascending: true })
        if (rowsErr) throw rowsErr

        const transactionIds = (rows || []).map((row: any) => row.id).filter(Boolean)
        const paymentByTxId = new Map<string, number>()
        if (transactionIds.length > 0) {
            const { data: payments, error: paymentsErr } = await supabase
                .from("transaction_payments")
                .select("transaction_id, amount")
                .eq("partner_id", input.partnerId)
                .in("transaction_id", transactionIds)
            if (paymentsErr) throw paymentsErr
            for (const payment of payments || []) {
                const txId = String((payment as any).transaction_id || "")
                const amount = Number((payment as any).amount || 0)
                paymentByTxId.set(txId, (paymentByTxId.get(txId) || 0) + amount)
            }
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
                    }) => {
                    const paid = String(row.status || "").toLowerCase() === "paid"
                    const now = new Date()
                    const due = row.due_date ? new Date(`${row.due_date}T12:00:00`) : null
                    const overdue = !paid && !!due && due.getTime() < now.getTime()
                    const original = Math.abs(Number(row.original_amount ?? row.amount ?? 0))
                    const paymentTotal = paymentByTxId.get(row.id) || 0
                    const paidAmount = Math.min(original, Math.max(0, paymentTotal))
                    const remainingAmount = Math.max(0, original - paidAmount)
                    return {
                        id: row.id,
                        description: row.description,
                        installmentNumber: row.installment_number,
                        originalAmount: original,
                        paidAmount,
                        remainingAmount,
                        dueDate: row.due_date,
                        paymentDate: row.payment_date,
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

        const { userId } = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        const { data: tx, error: txErr } = await supabase
            .from("transactions")
            .select("id, status, partner_id, installment_group_id, original_amount, amount, transaction_type, refund_kind, account_id")
            .eq("id", input.transactionId)
            .eq("partner_id", input.partnerId)
            .single()
        if (txErr || !tx) throw new Error(txErr?.message || "Parcela não encontrada.")
        if (!tx.installment_group_id) throw new Error("Pagamento parcial é permitido apenas para parcelas.")
        if (!isStatusPending(tx.status)) throw new Error("A parcela já está quitada.")

        const paymentAmount = Number(input.paymentAmount || 0)
        const interestAmount = Number(input.interestAmount || 0)
        const discountAmount = Number(input.discountAmount || 0)
        if (!Number.isFinite(paymentAmount) || !Number.isFinite(interestAmount) || !Number.isFinite(discountAmount)) {
            throw new Error("Valores de pagamento inválidos.")
        }
        let finalPaid = Math.round((paymentAmount + interestAmount - discountAmount) * 100) / 100
        if (!(finalPaid > 0)) throw new Error("O valor final pago deve ser maior que zero.")

        const { data: existingPayments, error: paymentsErr } = await supabase
            .from("transaction_payments")
            .select("amount")
            .eq("partner_id", input.partnerId)
            .eq("transaction_id", input.transactionId)
        if (paymentsErr) throw paymentsErr

        const paidSoFar = (existingPayments || []).reduce((acc: number, row: { amount: number | string | null }) => acc + Number(row.amount || 0), 0)
        const originalAmount = Math.abs(Number(tx.original_amount ?? tx.amount ?? 0))
        const remainingAmount = Math.max(0, originalAmount - paidSoFar)

        // Overpayment guard: clamp to remaining amount
        if (finalPaid > remainingAmount + 0.01) {
            finalPaid = Math.round(remainingAmount * 100) / 100
            if (!(finalPaid > 0)) throw new Error("Esta parcela já está totalmente quitada.")
        }

        const paidAfter = paidSoFar + finalPaid
        const fullyPaid = paidAfter + 0.0001 >= originalAmount
        const nowIso = new Date().toISOString()
        const idempotencyKey = `installment:${input.transactionId}:${nowIso}:${finalPaid}`

        const { error: insertPaymentErr } = await supabase
            .from("transaction_payments")
            .insert({
                partner_id: input.partnerId,
                transaction_id: input.transactionId,
                amount: finalPaid,
                payment_method_id: input.paymentMethodId || null,
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

        await applyFinanceAccountBalanceDelta(supabase, input.partnerId, tx.account_id, {
            transaction_type: tx.transaction_type,
            amount: finalPaid,
            refund_kind: tx.refund_kind,
        })

        if (fullyPaid) {
            const { error: updateErr } = await supabase
                .from("transactions")
                .update({
                    status: "paid",
                    payment_date: nowIso,
                    updated_at: nowIso,
                })
                .eq("id", input.transactionId)
                .eq("partner_id", input.partnerId)
            if (updateErr) throw updateErr
        }

        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: userId,
            entityType: "transaction",
            entityId: input.transactionId,
            actionType: "installment_paid",
            changeLines: [
                fullyPaid
                    ? "registrou pagamento e quitou a parcela."
                    : "registrou pagamento parcial da parcela.",
            ],
            source: "manual",
        })
        await revalidateEntityTimeline("transaction", input.transactionId)

        await revalidateTransactions(input.partnerId)
        return {
            success: true as const,
            data: {
                originalAmount,
                paidSoFar,
                remainingBefore: remainingAmount,
                paidNow: finalPaid,
                remainingAfter: Math.max(0, originalAmount - paidAfter),
                fullyPaid,
            },
        }
    } catch (e: any) {
        return { success: false as const, error: e.message || "Erro ao registrar pagamento da parcela" }
    }
}

export async function settleInstallmentGroupAction(input: {
    partnerId: string
    installmentGroupId: string
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()
        const nowIso = new Date().toISOString()

        const { data: txRows, error: txErr } = await supabase
            .from("transactions")
            .select("id, status, amount, original_amount, account_id, transaction_type, refund_kind")
            .eq("partner_id", input.partnerId)
            .eq("installment_group_id", input.installmentGroupId)
        if (txErr) throw txErr
        const rows = txRows || []
        if (rows.length === 0) throw new Error("Nenhuma parcela encontrada para este grupo.")

        const txIds = rows.map((r: any) => r.id)
        const { data: paymentRows, error: paymentErr } = await supabase
            .from("transaction_payments")
            .select("transaction_id, amount")
            .eq("partner_id", input.partnerId)
            .in("transaction_id", txIds)
        if (paymentErr) throw paymentErr

        const paidByTx = new Map<string, number>()
        for (const payment of paymentRows || []) {
            const txId = String((payment as any).transaction_id || "")
            const amount = Number((payment as any).amount || 0)
            paidByTx.set(txId, (paidByTx.get(txId) || 0) + amount)
        }

        const paymentsToInsert: Record<string, unknown>[] = []
        const txIdsToMarkPaid: string[] = []
        let affectedCount = 0

        for (const row of rows as any[]) {
            const original = Math.abs(Number(row.original_amount ?? row.amount ?? 0))
            const paidSoFar = paidByTx.get(row.id) || 0
            const remaining = Math.max(0, Math.round((original - paidSoFar) * 100) / 100)
            const alreadyPaid = String(row.status || "").toLowerCase() === "paid"

            if (remaining <= 0) {
                if (!alreadyPaid) txIdsToMarkPaid.push(row.id)
                continue
            }

            paymentsToInsert.push({
                partner_id: input.partnerId,
                transaction_id: row.id,
                amount: remaining,
                payment_method_id: null,
                created_by_user_id: userId,
                created_at: nowIso,
            })

            await applyFinanceAccountBalanceDelta(supabase, input.partnerId, row.account_id, {
                transaction_type: row.transaction_type,
                amount: remaining,
                refund_kind: row.refund_kind,
            })
            txIdsToMarkPaid.push(row.id)
            affectedCount += 1
        }

        if (paymentsToInsert.length > 0) {
            const { error: insErr } = await supabase.from("transaction_payments").insert(paymentsToInsert)
            if (insErr) throw insErr
        }

        if (txIdsToMarkPaid.length > 0) {
            const { error: updErr } = await supabase
                .from("transactions")
                .update({
                    status: "paid",
                    payment_date: nowIso,
                    updated_at: nowIso,
                })
                .eq("partner_id", input.partnerId)
                .in("id", txIdsToMarkPaid)
            if (updErr) throw updErr
        }

        await Promise.allSettled(
            txIdsToMarkPaid.map((transactionId) =>
                logAuditEvent({
                    partnerId: input.partnerId,
                    actorUserId: userId,
                    entityType: "transaction",
                    entityId: transactionId,
                    actionType: "settled",
                    changeLines: ["quitou esta parcela pelo comando «Quitar tudo»."],
                    source: "manual",
                }),
            ),
        )

        await revalidateTransactions(input.partnerId)
        return { success: true as const, data: { settledCount: txIdsToMarkPaid.length, createdPayments: paymentsToInsert.length, affectedCount } }
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
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        const { userId } = await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        // Fetch the recurring template
        const { data: rec, error: recErr } = await supabase
            .from("recurring_transactions")
            .select("*")
            .eq("id", input.recurringId)
            .eq("partner_id", input.partnerId)
            .single()
        if (recErr || !rec) throw new Error("Recorrência não encontrada.")

        const dueDateValue = input.occurrenceDate
        const transactionTs = new Date(`${dueDateValue}T12:00:00`).toISOString()

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

        let categoryName = "Sem categoria"
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
                    updated_at: nowIso,
                })
                .eq("id", pendingTx.id)
                .eq("partner_id", input.partnerId)
                .select("*")
                .single()
            if (updErr) throw updErr

            await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, accountId, {
                transaction_type: rec.type,
                amount: rec.amount,
                status: "paid",
            })
            console.info(
                "[recurring] occurrence_marked_paid",
                JSON.stringify({ recurringId: input.recurringId, occurrenceDate: input.occurrenceDate }),
            )
            await logAuditEvent({
                partnerId: input.partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: pendingTx.id,
                actionType: "paid",
                changeLines: ["marcou esta ocorrência como paga."],
                source: "manual",
            })
            await revalidateEntityTimeline("transaction", pendingTx.id)
            await revalidateTransactions(input.partnerId)
            return { success: true, data: updated }
        }

        // Create a fresh paid transaction from recurring template
        const payload = {
            partner_id: input.partnerId,
            description: rec.description,
            category: categoryName,
            category_id: rec.category_id,
            subcategory_id: rec.subcategory_id,
            contact_id: rec.contact_id,
            contact_type: rec.contact_type,
            customer_id: rec.customer_id,
            amount: rec.amount,
            due_date: dueDateValue,
            payment_date: nowIso,
            transaction_date: transactionTs,
            status: "paid",
            notes: null,
            original_amount: rec.amount,
            interest_amount: 0,
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

        await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, accountId, {
            transaction_type: rec.type,
            amount: rec.amount,
            status: "paid",
        })

        console.info(
            "[recurring] occurrence_marked_paid",
            JSON.stringify({ recurringId: input.recurringId, occurrenceDate: input.occurrenceDate }),
        )
        if (newTx?.id) {
            await logAuditEvent({
                partnerId: input.partnerId,
                actorUserId: userId,
                entityType: "transaction",
                entityId: newTx.id,
                actionType: "created",
                changeLines: ["marcou esta ocorrência como paga."],
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
}) {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

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
        const transactionTs = new Date(`${datePart}T12:00:00`).toISOString()
        const desc = (input.description && input.description.trim()) || `Ajuste de saldo - ${acc.name}`

        const res = await createManualTransactionAction({
            partnerId: input.partnerId,
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
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
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
    isRecurring: boolean
    paymentMethodSubtitle: string
    paymentDateSubtitle: string | null
    creatorName: string
    originLabel: string
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
    categoryLine: string
    subcategoryLine: string | null
    accountLine: string | null
    dueDateLine: string | null
    paymentDateLine: string | null
    notesLine: string | null
    amount: number
    ledgerDirection: ERPTransaction["ledgerDirection"]
    contactCard: { title: string; name: string; email: string | null; phone: string | null }
    canEdit: boolean
    /** Quando false, a UI não exibe a linha "Data de vencimento" (ex.: vendas PDV/pedido sem vencimento). */
    showDueDateRow: boolean
}

export async function getTransactionDetailsAction(
    transactionId: string,
    partnerId: string,
): Promise<{ success: true; data: TransactionDetailPayload } | { success: false; error: string }> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()

        let txQuery = await supabase
            .from("transactions")
            .select(
                `
        id, description, category, amount, due_date, payment_date, created_at, updated_at, status, notes,
        payment_type, transaction_type, contact_id, customer_id, contact_type, transfer_group_id,
        refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id,
        payment_method_id, transaction_date, created_by_user_id,
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
        id, description, category, amount, due_date, payment_date, created_at, updated_at, status, notes,
        payment_type, transaction_type, contact_id, customer_id, contact_type, transfer_group_id,
        refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id,
        payment_method_id, transaction_date,
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
        const now = new Date()
        const todayYmd = now.toISOString().slice(0, 10)
        const dueYmd = row.due_date ? String(row.due_date).slice(0, 10) : null
        const isOverdue = isStatusPending(row.status) && !!dueYmd && dueYmd < todayYmd

        const statusLabel = toDisplayStatus(row.status, row.transaction_type, row.refund_kind, isOverdue)
        const statusVariant = toStatusVariant(row.status, isOverdue)
        const paymentSubtitle =
            (row.payment_method_id && (await paymentMethodDisplayLabel(supabase, partnerId, row.payment_method_id))) ||
            (row.payment_type ? formatPaymentMethodLabel(row.payment_type, null) : "") ||
            "Não informado"

        let creatorName = "Sistema"
        if (row.created_by_user_id) {
            const { data: creatorProf } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", row.created_by_user_id)
                .maybeSingle()
            if (creatorProf?.full_name?.trim()) creatorName = creatorProf.full_name.trim()
        }

        let accountLine: string | null = null
        if (row.account_id) {
            const { data: acc } = await supabase
                .from("finance_accounts")
                .select("name")
                .eq("id", row.account_id)
                .eq("partner_id", partnerId)
                .maybeSingle()
            accountLine = acc?.name || null
        }

        let subcategoryLine: string | null = null
        if (row.subcategory_id) {
            const { data: sub } = await supabase
                .from("financial_categories")
                .select("name")
                .eq("id", row.subcategory_id)
                .eq("partner_id", partnerId)
                .maybeSingle()
            subcategoryLine = sub?.name || null
        }

        const headerTitle =
            row.category === "Vendas" ? `Venda - ${row.description}` : String(row.description || "").trim() || "Transação"

        const paid = isStatusPaid(row.status)
        const cancelled = isCancelledStatus(row.status)
        const step2Label = cancelled
            ? "Cancelado"
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

        let items: TransactionDetailPayload["items"] = []
        let salesOrder: { buyer_id?: string | null; customer_name?: string | null } | null = null
        let posSaleCustomerId: string | null | undefined = undefined

        if (row.category === "Vendas" && row.description) {
            const desc = String(row.description).trim()
            const { data: ord } = await supabase
                .from("orders")
                .select(
                    `
          id,
          buyer_id,
          customer_name,
          order_items (
            id,
            quantity,
            product_price,
            subtotal,
            product_name,
            sku,
            products ( images )
          )
        `,
                )
                .eq("partner_id", partnerId)
                .eq("order_number", desc)
                .maybeSingle()

            salesOrder = ord as any
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
                        sku: String(item.sku || "N/A"),
                        quantity: qty,
                        unitPrice: unit,
                        lineTotal: sub,
                        image: img,
                    }
                })
            }

            if (items.length === 0) {
                let { data: sale } = await supabase
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

        let contactCard: TransactionDetailPayload["contactCard"] = {
            title: "Contato",
            name: "-",
            email: null,
            phone: null,
        }

        if (row.category === "Vendas" && row.description && salesOrder) {
            const ord = salesOrder
            if (ord?.buyer_id) {
                const { data: cust } = await supabase
                    .from("customers")
                    .select("name, email, phone")
                    .eq("id", ord.buyer_id)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                contactCard = {
                    title: "Cliente",
                    name: cust?.name || ord.customer_name || "Cliente",
                    email: cust?.email ?? null,
                    phone: cust?.phone ?? null,
                }
            } else {
                const nm =
                    (ord?.customer_name && String(ord.customer_name).trim()) || "Consumidor final"
                contactCard = {
                    title: "Cliente",
                    name: nm,
                    email: null,
                    phone: null,
                }
            }
        } else if (row.category === "Vendas" && posSaleCustomerId !== undefined) {
            if (posSaleCustomerId) {
                const { data: cust } = await supabase
                    .from("customers")
                    .select("name, email, phone")
                    .eq("id", posSaleCustomerId)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                contactCard = {
                    title: "Cliente",
                    name: cust?.name || "Cliente",
                    email: cust?.email ?? null,
                    phone: cust?.phone ?? null,
                }
            } else {
                contactCard = {
                    title: "Cliente",
                    name: "Consumidor final",
                    email: null,
                    phone: null,
                }
            }
        } else if (row.customer_id) {
            const { data: cust } = await supabase
                .from("customers")
                .select("name, email, phone")
                .eq("id", row.customer_id)
                .eq("partner_id", partnerId)
                .maybeSingle()
            contactCard = {
                title: "Cliente",
                name: cust?.name || "Cliente",
                email: cust?.email ?? null,
                phone: cust?.phone ?? null,
            }
        } else if (row.contact_id && row.transaction_contacts?.name) {
            contactCard = {
                title: contactCardTitleFromType(row.contact_type || row.transaction_contacts?.type),
                name: row.transaction_contacts.name,
                email: null,
                phone: null,
            }
        }

        const systemGateway = isSystemOrGatewayOrigin(row.origin)
        const lockedRecurring = !!row.recurring_id && systemGateway && !isStatusPaid(row.status)
        const canEdit = !lockedRecurring

        const paymentDateSubtitle = row.payment_date ? formatDateTime(row.payment_date) : null

        const showDueDateRow = String(row.category || "").trim() !== "Vendas" || !!row.due_date

        const payload: TransactionDetailPayload = {
            id: row.id,
            headerTitle,
            statusLabel,
            statusVariant,
            isRecurring: !!row.recurring_id,
            paymentMethodSubtitle: paymentSubtitle,
            paymentDateSubtitle,
            creatorName,
            originLabel: originLabel(row.origin),
            typeBannerLabel: transactionTypeLabel(row.transaction_type),
            timeline,
            items,
            categoryLine: row.category || "Outros",
            subcategoryLine,
            accountLine,
            dueDateLine: row.due_date ? formatDateLabel(row.due_date) : null,
            paymentDateLine: row.payment_date ? formatDateTime(row.payment_date) : null,
            notesLine: row.notes ? String(row.notes) : null,
            amount: Math.abs(Number(row.amount || 0)),
            ledgerDirection: ledgerDirectionFromRow(row as DbTransaction),
            contactCard,
            canEdit,
            showDueDateRow,
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

        await requirePartnerAccessWithPermission(ctx.partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()
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


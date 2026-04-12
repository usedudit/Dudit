"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import type { ERPTransaction } from "@/lib/services/transactions.types"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { formatTime } from "@/lib/utils/formatters"

type DbTransaction = {
    id: string
    description: string
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
    transaction_contacts?: {
        name: string | null
        type: ERPTransaction["contactType"] | null
    } | null
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

function numFinanceBalance(v: unknown): number {
    if (v === null || v === undefined) return 0
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
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

    const rawAmt = Number(row.amount || 0)
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

    const { data: acc, error: fetchErr } = await supabase
        .from("finance_accounts")
        .select("id, current_balance")
        .eq("id", accountId)
        .eq("partner_id", partnerId)
        .single()
    if (fetchErr || !acc) return

    const cur = numFinanceBalance(acc.current_balance)
    const next = Math.round((cur + delta) * 100) / 100
    await supabase
        .from("finance_accounts")
        .update({ current_balance: next, updated_at: new Date().toISOString() })
        .eq("id", accountId)
        .eq("partner_id", partnerId)
}

export async function getFinancialTransactionsAction(partnerId: string): Promise<{ success: true; data: ERPTransaction[] } | { success: false; error: string }> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()

        const { data, error } = await supabase
            .from("transactions")
            .select(`
        id, description, category, amount, due_date, payment_date, created_at, status, notes, payment_type, transaction_type, contact_id, customer_id, contact_type,
        transfer_group_id, refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id,
        transaction_contacts(name, type)
      `)
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: false })

        if (error) throw error
        const txs = (data || []) as unknown as DbTransaction[]

        // Para vendas: resolve cliente direto de orders -> customers (sem transaction_contacts).
        const salesOrderNumbers = Array.from(
            new Set(
                txs
                    .filter((t) => t.category === "Vendas")
                    .map((t) => String(t.description || "").trim())
                    .filter(Boolean),
            ),
        )

        const orderByNumber = new Map<string, { buyer_id: string | null; customer_name: string | null }>()
        if (salesOrderNumbers.length > 0) {
            const { data: orders } = await supabase
                .from("orders")
                .select("order_number, buyer_id, customer_name")
                .eq("partner_id", partnerId)
                .in("order_number", salesOrderNumbers)

            for (const o of orders || []) {
                orderByNumber.set(String(o.order_number), { buyer_id: o.buyer_id, customer_name: o.customer_name })
            }
        }

        const buyerIds = Array.from(
            new Set(
                Array.from(orderByNumber.values())
                    .map((o) => o.buyer_id)
                    .filter(Boolean),
            ),
        ) as string[]

        const customerById = new Map<string, { name: string | null }>()
        if (buyerIds.length > 0) {
            const { data: customers } = await supabase
                .from("customers")
                .select("id, name")
                .eq("partner_id", partnerId)
                .in("id", buyerIds)
            for (const c of customers || []) customerById.set(c.id, { name: c.name })
        }

        const linkedCustomerIds = Array.from(
            new Set(
                txs.map((t) => t.customer_id).filter(Boolean),
            ),
        ) as string[]
        if (linkedCustomerIds.length > 0) {
            const { data: linkedCustomers } = await supabase
                .from("customers")
                .select("id, name")
                .eq("partner_id", partnerId)
                .in("id", linkedCustomerIds)
            for (const c of linkedCustomers || []) {
                if (!customerById.has(c.id)) customerById.set(c.id, { name: c.name })
            }
        }

        const now = new Date()
        const nowTime = now.getTime()
        const mapped: ERPTransaction[] = txs.map((t) => {
            const baseDate = t.due_date || t.payment_date || t.created_at
            const dateObj = new Date(baseDate)
            const isOverdue = String(t.status || "").toLowerCase() !== "paid" && dateObj.getTime() < nowTime
            
            const createdDateObj = t.created_at ? new Date(t.created_at) : now
            const diffTime = dateObj.getTime() - nowTime
            const daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            const order = t.category === "Vendas" ? orderByNumber.get(String(t.description || "").trim()) : null
            const customerName = order?.buyer_id ? customerById.get(order.buyer_id)?.name : null
            const salesContactName = customerName || order?.customer_name || "Cliente"
            const linkedCustomerName = t.customer_id ? customerById.get(t.customer_id)?.name : null
            const fallbackContact = t.transaction_contacts?.name || "—"
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
                paymentType: t.payment_type || "Não informado",
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
            }
        })

        return { success: true, data: mapped }
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
}

/** Canonical status check — ALWAYS use DB values, never UI-displayed strings */
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

        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        if (input.transactionType === "transfer") {
            throw new Error("Use a ação de transferência para movimentar entre contas.")
        }

        if (!input.description?.trim()) throw new Error("Descrição é obrigatória.")
        const amount = Number(input.amount || 0)

        if (input.transactionType === "adjustment") {
            if (!Number.isFinite(amount) || amount === 0) throw new Error("Informe um valor diferente de zero.")
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

        const payload: Record<string, unknown> = {
            partner_id: input.partnerId,
            description: input.description.trim(),
            category: input.category || "Outros",
            category_id: input.categoryId ?? null,
            subcategory_id: input.subcategoryId ?? null,
            account_id: input.accountId ?? null,
            contact_id: contactId,
            customer_id: customerId,
            contact_type: contactTypeResolved,
            amount: input.transactionType === "adjustment" ? amount : absAmount,
            due_date: ["adjustment", "transfer", "refund"].includes(input.transactionType) ? null : (input.dueDate || transactionDate),
            payment_date: input.paymentDate ?? null,
            transaction_date: transactionDate,
            status,
            notes: input.notes ?? null,
            payment_type: input.paymentType || null,
            payment_method_id: input.paymentMethodId || null,
            original_amount: absAmount,
            interest_amount: null,
            fee_amount: 0,
            transaction_type: input.transactionType,
            origin: input.origin || "manual",
            refund_kind: input.transactionType === "refund" ? input.refundKind ?? null : null,
            reference_note: input.referenceNote?.trim() || null,
        }

        const { data, error } = await supabase.from("transactions").insert(payload).select("*").single()
        if (error) throw error

        await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, input.accountId, {
            transaction_type: input.transactionType,
            amount: payload.amount as number,
            status: String(status),
            refund_kind: input.refundKind,
        })

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

        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        const amt = Number(input.amount || 0)
        if (!(amt > 0)) throw new Error("Valor deve ser maior que zero.")
        if (!input.fromAccountId || !input.toAccountId) throw new Error("Selecione origem e destino.")
        if (input.fromAccountId === input.toAccountId) throw new Error("Contas devem ser diferentes.")

        const transferGroupId = crypto.randomUUID()
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

        const { data, error } = await supabase.from("transactions").insert([outRow, inRow]).select("*")
        if (error) throw error

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
            .select("id, partner_id, status, origin, recurring_id")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (currentError || !current) throw new Error(currentError?.message || "Transação não encontrada.")

        const paid = isStatusPaid(current.status)
        const systemGateway = isSystemOrGatewayOrigin(current.origin)

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

        // Pending transactions: allow all editable fields
        // Paid transactions: only description, category, subcategory, notes
        if (paid) {
            if (patch.description !== undefined) payload.description = patch.description?.trim()
            if (patch.category !== undefined) payload.category = patch.category
            if (patch.categoryId !== undefined) payload.category_id = patch.categoryId
            if (patch.subcategoryId !== undefined) payload.subcategory_id = patch.subcategoryId
            if (patch.notes !== undefined) payload.notes = patch.notes
        } else {
            // Pending: all safe fields editable
            if (patch.description !== undefined) payload.description = patch.description?.trim()
            if (patch.amount !== undefined) payload.amount = Number(patch.amount || 0)
            if (patch.category !== undefined) payload.category = patch.category
            if (patch.categoryId !== undefined) payload.category_id = patch.categoryId
            if (patch.subcategoryId !== undefined) payload.subcategory_id = patch.subcategoryId
            if (!systemGateway && patch.accountId !== undefined) payload.account_id = patch.accountId
            if (patch.contactId !== undefined) payload.contact_id = patch.contactId
            if (patch.customerId !== undefined) payload.customer_id = patch.customerId
            if (patch.contactType !== undefined) payload.contact_type = patch.contactType
            if (patch.paymentType !== undefined) payload.payment_type = patch.paymentType
            if (patch.dueDate !== undefined) payload.due_date = patch.dueDate
            if (patch.paymentDate !== undefined) payload.payment_date = patch.paymentDate
            if (patch.transactionDate !== undefined) payload.transaction_date = patch.transactionDate
            if (patch.status !== undefined) payload.status = patch.status
            if (patch.notes !== undefined) payload.notes = patch.notes
            if (patch.refundKind !== undefined) payload.refund_kind = patch.refundKind
            if (patch.referenceNote !== undefined) payload.reference_note = patch.referenceNote
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
                account_id, category_id, subcategory_id, recurring_id, transaction_date
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

        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
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

        // Resolve category name
        let categoryName = "Recorrência"
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

        // Check if a pending transaction already exists (from cron) — upgrade it to paid
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
            payment_type: null as string | null,
            transaction_type: rec.type,
            account_id: accountId,
            origin: "system" as const,
            recurring_id: rec.id,
            payment_method_id: input.paymentMethodId || rec.payment_method_id || null,
        }

        const { data: newTx, error: insertErr } = await supabase
            .from("transactions")
            .insert(payload)
            .select("*")
            .single()

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
        const desc = (input.description && input.description.trim()) || `Ajuste de saldo — ${acc.name}`

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


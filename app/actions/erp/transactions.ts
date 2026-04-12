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
import { createTransactionHistoryEntry, getTransactionHistoryEntries } from "@/lib/services/transaction-history.service"

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
        transfer_group_id, refund_kind, reference_note, origin, account_id, category_id, subcategory_id, recurring_id, payment_method_id,
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

        const paymentMethodIds = Array.from(
            new Set(txs.map((t) => t.payment_method_id).filter(Boolean)),
        ) as string[]
        const paymentMethodLabelById = new Map<string, string>()
        if (paymentMethodIds.length > 0) {
            const { data: pmRows } = await supabase
                .from("payment_methods")
                .select("id, name, payment_type")
                .eq("partner_id", partnerId)
                .in("id", paymentMethodIds)
            for (const pm of pmRows || []) {
                const label = formatPaymentMethodLabel(pm.name, pm.payment_type)
                paymentMethodLabelById.set(pm.id, label || "Não informado")
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

        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

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
            created_by_user_id: user?.id ?? null,
        }

        const { data, error } = await supabase.from("transactions").insert(payload).select("*").single()
        if (error) throw error

        await applyFinanceAccountBalanceAfterInsert(supabase, input.partnerId, input.accountId, {
            transaction_type: input.transactionType,
            amount: payload.amount as number,
            status: String(status),
            refund_kind: input.refundKind,
        })

        try {
            await createTransactionHistoryEntry({
                transactionId: data.id,
                partnerId: input.partnerId,
                actorUserId: user?.id ?? null,
                entryType: "created",
                changeLines: ["criou esta transação."],
            })
        } catch (historyError) {
            console.error("[transactions_history] createManualTransactionAction:", historyError)
        }

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
        const {
            data: { user: transferUser },
        } = await supabase.auth.getUser()

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

        const outRowWithCreator = { ...outRow, created_by_user_id: transferUser?.id ?? null }
        const inRowWithCreator = { ...inRow, created_by_user_id: transferUser?.id ?? null }

        const { data, error } = await supabase.from("transactions").insert([outRowWithCreator, inRowWithCreator]).select("*")
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

        for (const row of data || []) {
            try {
                await createTransactionHistoryEntry({
                    transactionId: row.id,
                    partnerId: input.partnerId,
                    actorUserId: transferUser?.id ?? null,
                    entryType: "created",
                    changeLines: ["registrou lançamento de transferência entre contas."],
                })
            } catch (historyError) {
                console.error("[transactions_history] createTransferPairAction:", historyError)
            }
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
        const isRecurringSystemPending =
            !!current.recurring_id && systemGateway && !paid
        if (isRecurringSystemPending) {
            throw new Error(
                "Esta linha vem da recorrência. Edite o modelo em Previstos ou use «Marcar como pago» - não altere este lançamento pendente.",
            )
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

        const historyLines = buildTransactionUpdateHistoryLines(patch)
        if (historyLines.length > 0) {
            try {
                const user = await getCurrentUser()
                await createTransactionHistoryEntry({
                    transactionId,
                    partnerId,
                    actorUserId: user?.id ?? null,
                    entryType: "updated",
                    changeLines: historyLines,
                })
            } catch (historyError) {
                console.error("[transactions_history] updateManualTransactionAction:", historyError)
            }
        }

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
                payment_method_id
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
        const {
            data: { user: markPaidUser },
        } = await supabase.auth.getUser()

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
            try {
                await createTransactionHistoryEntry({
                    transactionId: pendingTx.id,
                    partnerId: input.partnerId,
                    actorUserId: markPaidUser?.id ?? null,
                    entryType: "updated",
                    changeLines: ["marcou esta ocorrência como paga."],
                })
            } catch (historyError) {
                console.error("[transactions_history] markRecurringOccurrenceAsPaidAction:", historyError)
            }
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
            created_by_user_id: markPaidUser?.id ?? null,
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

        console.info(
            "[recurring] occurrence_marked_paid",
            JSON.stringify({ recurringId: input.recurringId, occurrenceDate: input.occurrenceDate }),
        )
        if (newTx?.id) {
            try {
                await createTransactionHistoryEntry({
                    transactionId: newTx.id,
                    partnerId: input.partnerId,
                    actorUserId: markPaidUser?.id ?? null,
                    entryType: "created",
                    changeLines: ["marcou esta ocorrência como paga."],
                })
            } catch (historyError) {
                console.error("[transactions_history] markRecurringOccurrenceAsPaidAction:", historyError)
            }
        }
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
}

export async function getTransactionDetailsAction(
    transactionId: string,
    partnerId: string,
): Promise<{ success: true; data: TransactionDetailPayload } | { success: false; error: string }> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()

        const { data: t, error } = await supabase
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

        if (error || !t) {
            return { success: false, error: "Transação não encontrada." }
        }

        const row = t as any
        const now = new Date()
        const dueBase = row.due_date || row.payment_date || row.created_at
        const dateObj = new Date(dueBase)
        const isOverdue = String(row.status || "").toLowerCase() !== "paid" && dateObj.getTime() < now.getTime()

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

        if (row.category === "Vendas" && row.description) {
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
                .eq("order_number", String(row.description).trim())
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
            } else if (ord?.customer_name) {
                contactCard = {
                    title: "Cliente",
                    name: ord.customer_name,
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


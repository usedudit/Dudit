"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import type { ERPTransaction } from "@/lib/services/transactions.types"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"

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
    contact_type: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    transaction_contacts?: {
        name: string | null
        type: ERPTransaction["contactType"] | null
        contact_id: string | null
    } | null
}

function formatDateLabel(value: string) {
    const d = new Date(value)
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateShort(value: string) {
    const d = new Date(value)
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

function toStatusVariant(status: string, isOverdue: boolean): ERPTransaction["statusVariant"] {
    const s = String(status || "").toLowerCase()
    if (isOverdue || s.includes("atras")) return "red"
    if (s.includes("pend")) return "orange"
    if (s.includes("cancel")) return "gray"
    return "green"
}

function toDisplayStatus(status: string, transactionType: ERPTransaction["transactionType"]) {
    const s = String(status || "").toLowerCase().trim()
    if (s === "paid") return transactionType === "income" ? "Recebido" : "Pago"
    if (s === "pending") return "Pendente"
    return status || "Pendente"
}

export async function getFinancialTransactionsAction(partnerId: string): Promise<{ success: true; data: ERPTransaction[] } | { success: false; error: string }> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()

        const { data, error } = await supabase
            .from("transactions")
            .select(`
        id, description, category, amount, due_date, payment_date, created_at, status, notes, payment_type, transaction_type, contact_id, contact_type,
        transaction_contacts(name, type, contact_id)
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

        const now = new Date()
        const mapped: ERPTransaction[] = txs.map((t) => {
            const baseDate = t.due_date || t.payment_date || t.created_at
            const dateObj = new Date(baseDate)
            const isOverdue = String(t.status || "").toLowerCase() !== "paid" && dateObj.getTime() < now.getTime()
            const order = t.category === "Vendas" ? orderByNumber.get(String(t.description || "").trim()) : null
            const customerName = order?.buyer_id ? customerById.get(order.buyer_id)?.name : null
            const salesContactName = customerName || order?.customer_name || "Cliente"
            const fallbackContact = t.transaction_contacts?.name || "—"

            return {
                id: t.id,
                displayId: `TRX-${t.id.slice(0, 8).toUpperCase()}`,
                description: t.description,
                details: undefined,
                category: t.category || "Outros",
                contactName: t.category === "Vendas" ? salesContactName : fallbackContact,
        contactType: t.category === "Vendas" ? "customer" : (t.contact_type || t.transaction_contacts?.type || "other"),
                dueDate: formatDateLabel(baseDate),
                dueDateShort: formatDateShort(baseDate),
                dueDateTime: "",
                dateNote: isOverdue ? "Atrasado" : "-",
                isOverdue,
                paymentType: t.payment_type || "Não informado",
                status: toDisplayStatus(t.status, t.transaction_type),
                statusVariant: toStatusVariant(t.status, isOverdue),
                amount: Number(t.amount || 0),
                transactionType: t.transaction_type,
                notes: t.notes || undefined,
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
    contactType?: "customer" | "supplier" | "service" | "employee" | "partner" | "other" | null
    paymentType?: string | null
    dueDate?: string | null
    paymentDate?: string | null
    transactionDate?: string | null
    status?: "pending" | "paid"
    notes?: string | null
    origin?: "manual" | "system" | "gateway"
}

function isBlockedForEdit(status?: string | null, origin?: string | null) {
    const normalizedStatus = String(status || "").toLowerCase()
    const normalizedOrigin = String(origin || "").toLowerCase()
    const isConfirmed = ["paid", "confirmed", "recebido", "pago"].includes(normalizedStatus)
    const isGateway = normalizedOrigin === "gateway"
    return isConfirmed || isGateway
}

export async function createManualTransactionAction(input: CreateManualTransactionInput) {
    try {
        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        if (!input.description?.trim()) throw new Error("Descrição é obrigatória.")
        const amount = Number(input.amount || 0)
        if (!(amount > 0)) throw new Error("Valor deve ser maior que zero.")

        const transactionDate = input.transactionDate || input.paymentDate || input.dueDate || new Date().toISOString()
        const status = input.status || "pending"

        const payload = {
            partner_id: input.partnerId,
            description: input.description.trim(),
            category: input.category || "Outros",
            category_id: input.categoryId ?? null,
            subcategory_id: input.subcategoryId ?? null,
            account_id: input.accountId ?? null,
            contact_id: input.contactId ?? null,
            contact_type: input.contactType ?? null,
            amount,
            due_date: input.dueDate || transactionDate,
            payment_date: input.paymentDate ?? null,
            transaction_date: transactionDate,
            status,
            notes: input.notes ?? null,
            payment_type: input.paymentType || null,
            original_amount: amount,
            interest_amount: null,
            fee_amount: 0,
            transaction_type: input.transactionType,
            origin: input.origin || "manual",
        }

        const { data, error } = await supabase.from("transactions").insert(payload).select("*").single()
        if (error) throw error
        return { success: true, data }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao criar transação" }
    }
}

export async function updateManualTransactionAction(
    transactionId: string,
    partnerId: string,
    patch: Partial<CreateManualTransactionInput>,
) {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
        const supabase = await getSupabaseServerClient()

        const { data: current, error: currentError } = await supabase
            .from("transactions")
            .select("id, partner_id, status, origin")
            .eq("id", transactionId)
            .eq("partner_id", partnerId)
            .single()
        if (currentError || !current) throw new Error(currentError?.message || "Transação não encontrada.")

        if (isBlockedForEdit(current.status, current.origin)) {
            throw new Error("Não é permitido editar transação confirmada ou de gateway.")
        }

        const payload: Record<string, unknown> = {}
        if (patch.description !== undefined) payload.description = patch.description?.trim()
        if (patch.amount !== undefined) payload.amount = Number(patch.amount || 0)
        if (patch.category !== undefined) payload.category = patch.category
        if (patch.categoryId !== undefined) payload.category_id = patch.categoryId
        if (patch.subcategoryId !== undefined) payload.subcategory_id = patch.subcategoryId
        if (patch.accountId !== undefined) payload.account_id = patch.accountId
        if (patch.contactId !== undefined) payload.contact_id = patch.contactId
        if (patch.contactType !== undefined) payload.contact_type = patch.contactType
        if (patch.paymentType !== undefined) payload.payment_type = patch.paymentType
        if (patch.dueDate !== undefined) payload.due_date = patch.dueDate
        if (patch.paymentDate !== undefined) payload.payment_date = patch.paymentDate
        if (patch.transactionDate !== undefined) payload.transaction_date = patch.transactionDate
        if (patch.status !== undefined) payload.status = patch.status
        if (patch.notes !== undefined) payload.notes = patch.notes
        if (patch.transactionType !== undefined) payload.transaction_type = patch.transactionType
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


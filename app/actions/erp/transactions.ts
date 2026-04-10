"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import type { ERPTransaction } from "@/lib/services/transactions.types"

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


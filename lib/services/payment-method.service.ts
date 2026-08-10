import { toCanonicalPaymentType } from "@/lib/payments/payment-method"

type SupabaseLike = any

export type PaymentMethodPickContext = {
    preferDefault?: boolean
    storeId?: string | null
}

export function toPaymentMethodTypeFromLabel(value: string | null | undefined) {
    const normalized = String(value || "").trim().toLowerCase()
    if (!normalized) return null
    if (normalized === "pix") return "pix"
    if (["cartao", "cartão", "card", "credito", "credit_card"].includes(normalized)) return "credit_card"
    if (["debito", "debit_card"].includes(normalized)) return "debit_card"
    if (["dinheiro", "cash"].includes(normalized)) return "cash"
    return toCanonicalPaymentType(normalized)
}

export async function pickBestPaymentMethod(
    supabase: SupabaseLike,
    type: string,
    partnerId: string,
    context: PaymentMethodPickContext = {},
) {
    const canonicalType = toCanonicalPaymentType(type)

    const { data: allMethods } = await supabase
        .from("payment_methods")
        .select("id, partner_id, type, payment_type, is_active, discount_percent, fee_percent, fee_fixed, priority, is_default, name, default_finance_account_id, max_installments, fee_bearer, installment_fee_bearer, store_id, store_ids")
        .eq("partner_id", partnerId)
        .eq("is_active", true)

    if (!allMethods || allMethods.length === 0) return null

    // Filter by store visibility: store_ids IS NULL or store_ids contains context.storeId
    const visibleMethods = allMethods.filter((m: any) => {
        if (!context.storeId) return true
        if (m.store_ids && Array.isArray(m.store_ids) && m.store_ids.length > 0) {
            return m.store_ids.includes(context.storeId)
        }
        if (m.store_id) {
            return m.store_id === context.storeId
        }
        return true // NULL store_ids/store_id = inherited by all stores
    })

    const rows = visibleMethods.filter((m: any) => toCanonicalPaymentType(m.type || m.payment_type) === canonicalType)

    if (rows.length === 0) return null

    rows.sort((a: any, b: any) => {
        const discountDiff = Number(b.discount_percent || 0) - Number(a.discount_percent || 0)
        if (discountDiff !== 0) return discountDiff
        const feeDiff = Number(a.fee_percent || 0) - Number(b.fee_percent || 0)
        if (feeDiff !== 0) return feeDiff
        const priorityDiff = Number(b.priority || 0) - Number(a.priority || 0)
        if (priorityDiff !== 0) return priorityDiff
        if (context.preferDefault) {
            const defaultDiff = Number(Boolean(b.is_default)) - Number(Boolean(a.is_default))
            if (defaultDiff !== 0) return defaultDiff
        }
        return String(a.name || "").localeCompare(String(b.name || ""))
    })

    return rows[0]
}

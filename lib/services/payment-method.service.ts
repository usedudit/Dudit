import { toCanonicalPaymentType } from "@/lib/payments/payment-method"

type SupabaseLike = any

export type PaymentMethodPickContext = {
    preferDefault?: boolean
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
    const { data, error } = await supabase
        .from("payment_methods")
        .select("id, partner_id, type, is_active, discount_percent, fee_percent, fee_fixed, priority, is_default, name, default_finance_account_id")
        .eq("partner_id", partnerId)
        .eq("type", canonicalType)
        .eq("is_active", true)

    if (error) throw new Error(error.message)
    const rows = data || []
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

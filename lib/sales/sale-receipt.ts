import { formatDateTime } from "@/lib/utils"
import { formatPaymentMethodLabel } from "@/lib/payments/payment-method"

export type SaleReceiptFormat = "thermal" | "a4"

export type SaleReceiptItem = {
    index: number
    code: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    totalPrice: number
}

export type SaleReceiptPaymentLine = {
    label: string
    amount: number
}

export type SaleReceiptPartnerHeader = {
    fantasyName: string
    legalName: string
    addressLine: string
    taxIdLine: string
}

export type SaleReceiptReturnPolicyBlock = {
    commercialDeadlineDays: number
    additionalWarrantyDays: number
    message?: string | null
    showBlock: boolean
}

export type SaleReceiptData = {
    customerName: string
    orderNumber: string
    saleDateTime: string
    items: SaleReceiptItem[]
    subtotal: number
    total: number
    change: number
    paymentLines: SaleReceiptPaymentLine[]
    methodDiscount: number
    generalDiscount: number
    couponDiscount: number
    methodFee: number
    methodInterest: number
    shippingFee: number
    otherCosts: number
    sellerName: string
    partner: SaleReceiptPartnerHeader
    primaryColor?: string
    secondaryColor?: string
    partnerAvatar?: string
    returnPolicyBlock?: SaleReceiptReturnPolicyBlock | null
}

export const DEFAULT_RECEIPT_FOOTER_MESSAGE = "* OBRIGADO E VOLTE SEMPRE *"

export const DEFAULT_RECEIPT_ACKNOWLEDGMENT =
    "Recebi a(s) mercadoria(s) acima descrita(s), concordando plenamente com os prazos e condições de garantia."

export function formatReceiptAmount(value: number): string {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value) || 0)
}

function formatTaxId(cnpj?: string | null, cpf?: string | null): string {
    const raw = String(cnpj || cpf || "").replace(/\D/g, "")
    if (!raw) return ""
    if (raw.length === 14) {
        return raw.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
    }
    if (raw.length === 11) {
        return raw.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
    }
    return raw
}

export function buildPartnerTaxIdLine(params: {
    cnpj?: string | null
    cpf?: string | null
    stateRegistration?: string | null
    municipalRegistration?: string | null
    ieIsento?: boolean | null
}): string {
    const parts: string[] = []
    const doc = formatTaxId(params.cnpj, params.cpf)
    if (doc) {
        const label = String(params.cnpj || "").replace(/\D/g, "").length === 14 ? "CNPJ" : "CPF"
        parts.push(`${label}: ${doc}`)
    }
    const ie = params.ieIsento ? "Isento" : params.stateRegistration
    if (ie) parts.push(`IE: ${ie}`)
    if (params.municipalRegistration) parts.push(`IM: ${params.municipalRegistration}`)
    return parts.join("  ")
}

export function mapOrderItemsToReceiptItems(orderItems: any[]): SaleReceiptItem[] {
    return (orderItems || []).map((item, idx) => {
        const qty = Number(item.quantity || 0)
        const unitPrice = Number(item.product_price ?? item.unit_price ?? item.unitPrice ?? 0)
        const subtotal = Number(item.subtotal ?? qty * unitPrice)
        const sku = item.products?.sku || item.product_variants?.sku || item.sku || "00000"
        const name =
            item.product_name ||
            item.custom_name ||
            item.name ||
            item.products?.name ||
            "Item"
        return {
            index: idx + 1,
            code: String(sku).slice(0, 8),
            description: String(name),
            quantity: qty,
            unit: "UN",
            unitPrice,
            totalPrice: subtotal,
        }
    })
}

export function mapCartItemsToReceiptItems(cart: any[]): SaleReceiptItem[] {
    return (cart || []).map((item, idx) => {
        const qty = Number(item.quantity || 0)
        const unitPrice = Number(item.unitPrice || 0)
        return {
            index: idx + 1,
            code: String(item.sku || item.productId || "00000").slice(0, 8),
            description: String(item.name || "Item"),
            quantity: qty,
            unit: "UN",
            unitPrice,
            totalPrice: qty * unitPrice,
        }
    })
}

export function buildPaymentLinesFromOrder(order: any): SaleReceiptPaymentLine[] {
    const breakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
    const filtered = breakdown.filter((e: any) => e?.method && Number(e.amount || 0) > 0.009)
    if (filtered.length > 0) {
        return filtered.map((e: any) => {
            let label = formatPaymentMethodLabel(e.method)
            if (e.method === "cash" && e.wantsChange) {
                label = `Dinheiro (Troco para R$ ${Number(e.payWithAmount || 0).toFixed(2).replace('.', ',')})`
            } else if (e.method === "cash" && e.wantsChange === false) {
                label = "Dinheiro (Valor exato)"
            }
            return {
                label,
                amount: Number(e.amount || 0),
            }
        })
    }
    if (Number(order.paid_amount || 0) > 0.009 && order.payment_method) {
        return [{ label: String(order.payment_method), amount: Number(order.paid_amount || 0) }]
    }
    return []
}

export function buildPaymentLinesFromBreakdown(
    breakdown: Array<{ method?: string; amount?: number; wantsChange?: boolean; payWithAmount?: number }> | undefined,
    fallbackMethod?: string,
    fallbackAmount?: number,
): SaleReceiptPaymentLine[] {
    const filtered = (breakdown || []).filter((e) => e?.method && Number(e.amount || 0) > 0.009)
    if (filtered.length > 0) {
        return filtered.map((e) => {
            let label = formatPaymentMethodLabel(e.method)
            if (e.method === "cash" && e.wantsChange) {
                label = `Dinheiro (Troco para R$ ${Number(e.payWithAmount || 0).toFixed(2).replace('.', ',')})`
            } else if (e.method === "cash" && e.wantsChange === false) {
                label = "Dinheiro (Valor exato)"
            }
            return {
                label,
                amount: Number(e.amount || 0),
            }
        })
    }
    if (fallbackMethod && Number(fallbackAmount || 0) > 0.009) {
        return [{ label: fallbackMethod, amount: Number(fallbackAmount || 0) }]
    }
    return []
}

export function buildSaleReceiptFromOrder(
    order: any,
    partner: SaleReceiptPartnerHeader,
    options?: { sellerName?: string; primaryColor?: string; secondaryColor?: string; partnerAvatar?: string },
): SaleReceiptData {
    const manualDiscount = Math.max(0, Number(order.discount_value || 0))
    const couponDiscount = Math.max(0, Number(order.coupon_discount_amount || 0))
    const methodDiscount = Math.max(0, Number(order.payment_method_discount_amount || 0))
    const methodInterest = Math.max(0, Number(order.payment_method_interest_amount || 0))
    const methodFee = Math.max(0, Number(order.payment_method_fee_amount || 0))
    const methodFixedFee = Math.max(0, Number(order.payment_method_fixed_fee_amount || 0))
    const methodExtra = Math.max(0, methodInterest + methodFee + methodFixedFee)
    const shippingFee = Math.max(0, Number(order.delivery_fee || order.shipping_cost || 0))
    const otherCosts = Math.max(0, Number(order.additional_costs || 0))
    const subtotal =
        Number(order.subtotal_value || 0) > 0
            ? Number(order.subtotal_value || 0)
            : (order.order_items || []).reduce(
                  (acc: number, item: any) =>
                      acc + Number(item.subtotal ?? Number(item.quantity || 0) * Number(item.product_price || 0)),
                  0,
              )
    const total = Number(order.total_amount || 0)
    const paid = Number(order.paid_amount || 0)
    const change = Math.max(0, paid - total)
    const policySnap = order.return_policy_snapshot
    const returnPolicyBlock =
        policySnap && policySnap.receipt_show_policy_block !== false
            ? {
                  commercialDeadlineDays: Number(policySnap?.commercial?.commercial_deadline_days ?? 30),
                  additionalWarrantyDays: Number(policySnap?.commercial?.additional_warranty_days ?? 0),
                  message: policySnap?.receipt_message ?? null,
                  showBlock: true,
              }
            : null

    return {
        customerName: order.customers?.name || order.customer_name || "Consumidor final",
        orderNumber: String(order.order_number || order.id || ""),
        saleDateTime: formatDateTime(order.created_at || order.order_date || new Date()),
        items: mapOrderItemsToReceiptItems(order.order_items || []),
        subtotal,
        total,
        change,
        paymentLines: buildPaymentLinesFromOrder(order),
        methodDiscount,
        generalDiscount: manualDiscount,
        couponDiscount,
        methodFee: methodFee + methodFixedFee,
        methodInterest,
        shippingFee,
        otherCosts,
        sellerName: options?.sellerName || order.seller_name || "Não informado",
        partner,
        primaryColor: options?.primaryColor,
        secondaryColor: options?.secondaryColor,
        partnerAvatar: options?.partnerAvatar,
        returnPolicyBlock,
    }
}

export type SaleReceiptCartSnapshot = {
    cart: any[]
    orderNumber: string
    saleDateTime?: string
    customerName?: string
    subTotal: number
    shippingFee: number
    otherCosts: number
    discountAmount: number
    couponDiscount?: number
    total: number
    totalPaid: number
    change: number
    paymentBreakdown?: Array<{ method?: string; amount?: number }>
    paymentMethod?: string
    methodDiscount?: number
    methodFee?: number
    methodInterest?: number
    sellerName?: string
}

export function buildSaleReceiptFromCartSnapshot(
    snapshot: SaleReceiptCartSnapshot,
    partner: SaleReceiptPartnerHeader,
    options?: { primaryColor?: string; secondaryColor?: string; partnerAvatar?: string },
): SaleReceiptData {
    const couponDiscount = Math.max(0, Number(snapshot.couponDiscount || 0))
    const totalDiscount = Math.max(0, Number(snapshot.discountAmount || 0))
    const generalDiscount = Math.max(0, totalDiscount - couponDiscount)

    return {
        customerName: snapshot.customerName || "Consumidor final",
        orderNumber: snapshot.orderNumber,
        saleDateTime: snapshot.saleDateTime || formatDateTime(new Date()),
        items: mapCartItemsToReceiptItems(snapshot.cart),
        subtotal: Number(snapshot.subTotal || 0),
        total: Number(snapshot.total || 0),
        change: Math.max(0, Number(snapshot.change || 0)),
        paymentLines: buildPaymentLinesFromBreakdown(
            snapshot.paymentBreakdown,
            snapshot.paymentMethod,
            snapshot.totalPaid,
        ),
        methodDiscount: Math.max(0, Number(snapshot.methodDiscount || 0)),
        generalDiscount,
        couponDiscount,
        methodFee: Math.max(0, Number(snapshot.methodFee || 0)),
        methodInterest: Math.max(0, Number(snapshot.methodInterest || 0)),
        shippingFee: Math.max(0, Number(snapshot.shippingFee || 0)),
        otherCosts: Math.max(0, Number(snapshot.otherCosts || 0)),
        sellerName: snapshot.sellerName || "Não informado",
        partner,
        primaryColor: options?.primaryColor,
        secondaryColor: options?.secondaryColor,
        partnerAvatar: options?.partnerAvatar,
    }
}

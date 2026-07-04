"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { formatDateTime } from "@/lib/utils/formatters"
import { formatCurrency } from "@/lib/utils"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { getDeliveryStatusLabel, getPaymentStatusLabel } from "@/lib/orders/status"
import { getOrderHistoryEntries } from "@/lib/services/order-history.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { syncCancelledOrderAppointmentsAndTransactions } from "@/lib/services/sync-cancellation"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidateStockMovements } from "@/lib/utils/revalidation"
import { finalizeOrderInventory, releaseOrderInventory, reserveOrderInventory, shouldDeductInventory } from "@/lib/stock/reservations"
import { validateCoupon, validateCouponById } from "@/lib/services/coupons"
import { calculateOrderPricing } from "@/lib/services/pricing-engine"
import {
    recalculateSplitPaymentFromBaseAmounts,
    toStoredBreakdownAmounts,
    type SplitInputRow,
} from "@/lib/payments/split-breakdown"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { createCommissionExpenseForEntity, reverseCommissionForEntity } from "@/lib/services/commission-ledger.service"
import { applySaleToGoals, reverseSaleFromGoals } from "@/lib/services/sales-goals.service"
import type { PaymentBreakdownEntry } from "@/lib/payments/financial-engine"
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label"


type ERPItemPayload = {
    productId: string | null
    variantId?: string | null
    customName?: string
    quantity: number
    unitPrice: number
    sortOrder: number
}

type ERPOrderPayload = {
    partnerId: string
    customerId?: string
    customerName?: string
    /** When set, enforces at most one ERP order per quote (unique index). */
    sourceQuoteId?: string | null
    salesChannel?: string
    deliveryMethod: 'delivery' | 'pickup'
    financeAccountId: string
    paymentStatus: 'paid' | 'partially_paid' | 'unpaid'
    deliveryStatus: 'not_sent' | 'preparing' | 'sent' | 'delivered' | 'pickup_available' | 'delivery_failed'
    items: ERPItemPayload[]
    subtotal: number
    discountValue: number
    discountType: 'fixed' | 'percentage' | 'coupon'
    couponCode?: string
    couponId?: string | null
    couponDiscountAmount?: number
    shippingCost: number
    additionalCosts: number
    totalAmount: number
    paidAmount?: number
    notes?: string
    paymentMethod: string
    paymentBreakdown?: PaymentBreakdownEntry[]
    address?: {
        zipCode: string
        street: string
        number: string
        complement?: string
        neighborhood: string
        city: string
        state: string
    }
    csrf_token?: string
    paymentProvider?: string | null
    mpPaymentId?: string | null
}

type OrderStockItem = {
    product_id?: string | null
    variant_id?: string | null
    quantity: number
}

function isMissingOrdersIsPosSaleColumnError(error: unknown): boolean {
    const message = String((error as any)?.message || "").toLowerCase()
    return message.includes("is_pos_sale") && message.includes("orders")
}

// P5: cache em memória (por processo) indicando se a coluna orders.is_pos_sale existe.
// Evita que TODA listagem dispare uma 1ª query que sempre falha quando a coluna não
// existe. null = ainda desconhecido; true/false = resultado já detectado.
let ordersHasPosSaleColumn: boolean | null = null

function isMissingOrdersPaymentMethodDeltaColumnsError(error: unknown): boolean {
    const message = String((error as any)?.message || "").toLowerCase()
    return (
        (message.includes("payment_method_discount_amount") || message.includes("payment_method_extra_amount")) &&
        message.includes("orders")
    )
}

function buildOrderSource(salesChannel: string | undefined, deliveryMethod: 'delivery' | 'pickup') {
    const value = salesChannel?.trim()
    if (value) return value
    return deliveryMethod === "pickup" ? "Balcão" : "Entrega"
}

function normalizeOrderNotes(value?: string | null) {
    return (value || "").replace(/\n*Pedido cancelado por:[\s\S]*$/, "").trim()
}

function buildCancelledOrderNotes(params: {
    currentNotes?: string | null
    userName: string
    timestamp: string
    reason?: string
}) {
    const baseNotes = normalizeOrderNotes(params.currentNotes)
    const cancelLine = `Pedido cancelado por: ${params.userName} as ${params.timestamp}${params.reason ? ` - ${params.reason.trim()}` : ""}`
    return [baseNotes, cancelLine].filter(Boolean).join("\n")
}

function normalizePaymentSituation(paymentStatus: ERPOrderPayload["paymentStatus"]) {
    return paymentStatus === "paid"
        ? "paid"
        : paymentStatus === "partially_paid"
            ? "partially_paid"
            : "pending"
}

function clampPaidAmount(value: number, totalAmount: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(value, Math.max(totalAmount, 0)))
}

function resolvePaymentState(params: {
    requestedStatus: ERPOrderPayload["paymentStatus"]
    totalAmount: number
    paidAmount?: number
    fallbackPaidAmount?: number
}) {
    const totalAmount = Math.max(Number(params.totalAmount || 0), 0)
    const requestedPaidAmount = clampPaidAmount(
        Number(params.paidAmount ?? params.fallbackPaidAmount ?? 0),
        totalAmount
    )

    let situation = normalizePaymentSituation(params.requestedStatus)
    let paidAmount = requestedPaidAmount

    if (situation === "paid") {
        if (paidAmount >= totalAmount - 0.005) {
            paidAmount = totalAmount
        } else if (paidAmount > 0.005) {
            situation = "partially_paid"
        } else {
            situation = "pending"
            paidAmount = 0
        }
    } else if (situation === "partially_paid") {
        if (paidAmount >= totalAmount - 0.005) {
            situation = "paid"
            paidAmount = totalAmount
        } else if (paidAmount <= 0.005) {
            situation = "pending"
            paidAmount = 0
        }
    } else {
        paidAmount = 0
    }

    return { situation, paidAmount }
}

function normalizePaymentMethodLabel(value?: string | null) {
    if (!value) return ""
    return formatPaymentMethodLabel(value, null)
}


function sanitizePaymentBreakdown(entries: ERPOrderPayload["paymentBreakdown"]) {
    const normalizedEntries = (entries || [])
        .map((entry) => {
            const amt = Math.max(0, Number(entry?.amount || 0))
            const effectiveAmt = entry?.effectiveAmount != null ? Math.max(0, Number(entry.effectiveAmount)) : amt
            return {
                method: normalizePaymentMethodLabel(entry?.method),
                amount: effectiveAmt,
                amountReceived: Math.max(0, Number(entry?.amountReceived ?? 0)),
                adjustmentType: entry?.adjustmentType || 'none',
                adjustmentPercent: Math.max(0, Number(entry?.adjustmentPercent || 0)),
                adjustmentAmount: Math.max(0, Number(entry?.adjustmentAmount || 0)),
                effectiveAmount: effectiveAmt,
                netAmount: entry?.netAmount != null ? Math.max(0, Number(entry.netAmount)) : effectiveAmt,
                feeBearer: entry?.feeBearer || null,
                paymentMethodId: entry?.paymentMethodId || null,
                installmentNumber: Math.max(1, Math.floor(Number(entry?.installmentNumber || 1))),
            }
        })
        .filter((entry) => entry.method && entry.effectiveAmount > 0.009)

    return normalizedEntries
}

type ApplyPaymentMethodPricingResult =
    | { ok: true; finalTotal: number; feeAmount: number; interestAmount: number; paymentMethodDiscountAmount: number; adjustedBreakdown: PaymentBreakdownEntry[] }
    | { ok: false; error: string }

async function applyPaymentMethodPricingToTotal(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    baseTotal: number,
    paymentBreakdown: PaymentBreakdownEntry[],
    options?: { skipPricing?: boolean },
): Promise<ApplyPaymentMethodPricingResult> {
    const safeBase = Math.max(0, Math.round(Number(baseTotal || 0) * 100) / 100)
    const breakdown = paymentBreakdown || []
    if (options?.skipPricing || breakdown.length === 0) {
        return { ok: true, finalTotal: safeBase, feeAmount: 0, interestAmount: 0, paymentMethodDiscountAmount: 0, adjustedBreakdown: breakdown as PaymentBreakdownEntry[] }
    }

    for (const row of breakdown) {
        if (!row.paymentMethodId) {
            return {
                ok: false,
                error: `Método de pagamento inválido (${row.method || "não informado"}). Selecione um método ativo e tente novamente.`,
            }
        }
    }

    const methodIds = Array.from(new Set(breakdown.map((b) => b.paymentMethodId).filter(Boolean))) as string[]

    const [{ data: methods }, { data: fees }] = await Promise.all([
        methodIds.length > 0
            ? supabase
                .from("payment_methods")
                .select("id, fee_percent, fee_fixed, fee_bearer, discount_percent, max_installments")
                .eq("partner_id", partnerId)
                .eq("is_active", true)
                .in("id", methodIds)
            : Promise.resolve({ data: [] as any[] }),
        methodIds.length > 0
            ? supabase
                .from("payment_method_installment_fees")
                .select("payment_method_id, installment_number, fee_percent")
                .in("payment_method_id", methodIds)
            : Promise.resolve({ data: [] as any[] }),
    ])

    const methodById = new Map<string, any>((methods || []).map((m: any) => [String(m.id), m]))
    const feesByMethod = new Map<string, Array<{ installmentNumber: number; feePercent: number }>>()
    for (const row of fees || []) {
        const key = String((row as any).payment_method_id || "")
        if (!key) continue
        const arr = feesByMethod.get(key) || []
        arr.push({
            installmentNumber: Number((row as any).installment_number || 1),
            feePercent: Number((row as any).fee_percent || 0),
        })
        feesByMethod.set(key, arr)
    }

    const splitRows: SplitInputRow[] = breakdown.map((row) => ({
        method: row.method,
        amount: Math.max(0, Math.round(Number(row.amount || 0) * 100) / 100),
        paymentMethodId: row.paymentMethodId || null,
        installmentNumber: Math.max(1, Math.floor(Number(row.installmentNumber || 1))),
    }))

    const recalculated = recalculateSplitPaymentFromBaseAmounts(
        safeBase,
        splitRows,
        methodById,
        feesByMethod,
    )
    if (!recalculated.ok) {
        return { ok: false, error: recalculated.error }
    }

    const stored = toStoredBreakdownAmounts(recalculated.adjustedRows)
    const adjustedBreakdown: PaymentBreakdownEntry[] = stored.map((s, i) => ({
        method: s.method,
        amount: s.amount,
        paymentMethodId: s.paymentMethodId,
        installmentNumber: splitRows[i]?.installmentNumber || 1,
    }))

    const sumBase = splitRows.reduce((acc, r) => acc + r.amount, 0)
    const isPartial = sumBase < safeBase - 0.005
    const finalTotal = isPartial
        ? Math.max(0, Math.round((safeBase + recalculated.feeAmount + recalculated.interestAmount - recalculated.paymentMethodDiscountAmount) * 100) / 100)
        : recalculated.finalTotal

    return {
        ok: true,
        finalTotal,
        feeAmount: recalculated.feeAmount,
        interestAmount: recalculated.interestAmount,
        paymentMethodDiscountAmount: recalculated.paymentMethodDiscountAmount,
        adjustedBreakdown,
    }
}

function buildPaymentMethodSummary(
    paymentBreakdown: PaymentBreakdownEntry[],
    fallbackMethod?: string | null
) {
    const labels = Array.from(
        new Set(
            paymentBreakdown
                .map((entry) => normalizePaymentMethodLabel(entry.method))
                .filter(Boolean)
        )
    )

    if (labels.length > 0) {
        return labels.join(", ")
    }

    const fallbackLabel = normalizePaymentMethodLabel(fallbackMethod)
    return fallbackLabel || "Não informado"
}

function describeItem(item: { customName?: string | null; product_name?: string | null }) {
    return item.customName?.trim() || item.product_name?.trim() || "item"
}

function normalizeItemMap(items: Array<{
    productId?: string | null
    product_id?: string | null
    variantId?: string | null
    variant_id?: string | null
    customName?: string | null
    product_name?: string | null
    quantity: number
    unitPrice?: number
    product_price?: number
}>) {
    const map = new Map<string, { name: string; quantity: number; unitPrice: number }>()

    for (const item of items) {
        const name = describeItem(item)
        const productId = item.productId || item.product_id || null
        const variantId = item.variantId || item.variant_id || null
        const key = variantId
            ? `variant:${variantId}`
            : productId
                ? `product:${productId}`
                : `custom:${name.toLowerCase()}`
        const quantity = Number(item.quantity || 0)
        const unitPrice = Number(item.unitPrice ?? item.product_price ?? 0)
        const current = map.get(key)

        if (current) {
            current.quantity += quantity
            current.unitPrice = unitPrice
        } else {
            map.set(key, { name, quantity, unitPrice })
        }
    }

    return map
}

function buildItemChangeLines(previousItems: Array<{
    product_id?: string | null
    product_name?: string | null
    quantity: number
    product_price?: number
}>, nextItems: ERPItemPayload[]) {
    const lines: string[] = []
    const previousMap = normalizeItemMap(previousItems)
    const nextMap = normalizeItemMap(nextItems)

    for (const [key, nextItem] of nextMap.entries()) {
        const previousItem = previousMap.get(key)

        if (!previousItem) {
            lines.push(`adicionou ${nextItem.quantity} ${nextItem.name}`)
            continue
        }

        if (previousItem.quantity !== nextItem.quantity) {
            lines.push(`alterou quantidade de ${nextItem.name}: ${previousItem.quantity} -> ${nextItem.quantity}`)
        }

        if (Math.abs(previousItem.unitPrice - nextItem.unitPrice) > 0.009) {
            lines.push(`alterou valor de ${nextItem.name}: ${formatCurrency(previousItem.unitPrice)} -> ${formatCurrency(nextItem.unitPrice)}`)
        }
    }

    for (const [key, previousItem] of previousMap.entries()) {
        if (!nextMap.has(key)) {
            lines.push(`removeu ${previousItem.quantity} ${previousItem.name}`)
        }
    }

    return lines
}

function buildOrderChangeLines(currentOrder: any, payload: ERPOrderPayload) {
    const lines: string[] = []
    const paymentState = resolvePaymentState({
        requestedStatus: payload.paymentStatus,
        totalAmount: payload.totalAmount,
        paidAmount: payload.paidAmount,
        fallbackPaidAmount: Number(currentOrder.paid_amount || 0),
    })
    const nextSituation = paymentState.situation
    const nextOrderSource = buildOrderSource(payload.salesChannel, payload.deliveryMethod)
    const previousNotes = (currentOrder.notes || "").trim()
    const nextNotes = (payload.notes || "").trim()
    const nextDeliveryAddress = payload.deliveryMethod === "delivery" && payload.address
        ? `${payload.address.street}, ${payload.address.number}${payload.address.complement ? ` (${payload.address.complement})` : ""}, ${payload.address.neighborhood}, ${payload.address.city} - ${payload.address.state}, ${payload.address.zipCode}`
        : ""

    lines.push(...buildItemChangeLines(currentOrder.order_items || [], payload.items))

    if ((currentOrder.customer_name || "Consumidor final") !== (payload.customerName || "Consumidor final")) {
        lines.push(`alterou cliente: ${(currentOrder.customer_name || "Consumidor final")} -> ${(payload.customerName || "Consumidor final")}`)
    }

    if ((currentOrder.order_source || "Manual") !== nextOrderSource) {
        lines.push(`alterou canal de venda: ${(currentOrder.order_source || "Manual")} -> ${nextOrderSource}`)
    }

    if ((currentOrder.situation || "pending") !== nextSituation) {
        lines.push(`alterou status de pagamento: ${getPaymentStatusLabel(currentOrder.situation)} -> ${getPaymentStatusLabel(nextSituation)}`)
    }

    if ((currentOrder.delivery_status || "not_sent") !== payload.deliveryStatus) {
        lines.push(`alterou status de entrega: ${getDeliveryStatusLabel(currentOrder.delivery_status)} -> ${getDeliveryStatusLabel(payload.deliveryStatus)}`)
    }

    if ((currentOrder.delivery_type || "pickup") !== payload.deliveryMethod) {
        lines.push(`alterou tipo de entrega: ${currentOrder.delivery_type === "delivery" ? "Entrega" : "Retirada"} -> ${payload.deliveryMethod === "delivery" ? "Entrega" : "Retirada"}`)
    }

    if ((currentOrder.delivery_address || "") !== nextDeliveryAddress) {
        lines.push("alterou endereço de entrega")
    }

    const nextPaymentMethodSummary = buildPaymentMethodSummary(
        sanitizePaymentBreakdown(payload.paymentBreakdown),
        payload.paymentMethod
    )
    if ((currentOrder.finance_account_id || "") !== (payload.financeAccountId || "")) {
        lines.push("alterou conta de recebimento do pedido")
    }

    if ((currentOrder.payment_method || "Não informado") !== nextPaymentMethodSummary) {
        lines.push(`alterou forma de pagamento: ${(currentOrder.payment_method || "Não informado")} -> ${nextPaymentMethodSummary}`)
    }

    if (Math.abs(Number(currentOrder.discount_value || 0) - Number(payload.discountValue || 0)) > 0.009) {
        lines.push(`alterou valor de desconto: ${formatCurrency(currentOrder.discount_value || 0)} -> ${formatCurrency(payload.discountValue || 0)}`)
    }

    if (Math.abs(Number(currentOrder.delivery_fee || 0) - Number(payload.shippingCost || 0)) > 0.009) {
        lines.push(`alterou entrega: ${formatCurrency(currentOrder.delivery_fee || 0)} -> ${formatCurrency(payload.shippingCost || 0)}`)
    }

    if (Math.abs(Number(currentOrder.additional_costs || 0) - Number(payload.additionalCosts || 0)) > 0.009) {
        lines.push(`alterou custos adicionais: ${formatCurrency(currentOrder.additional_costs || 0)} -> ${formatCurrency(payload.additionalCosts || 0)}`)
    }

    if (Math.abs(Number(currentOrder.total_amount || 0) - Number(payload.totalAmount || 0)) > 0.009) {
        lines.push(`alterou valor total: ${formatCurrency(currentOrder.total_amount || 0)} -> ${formatCurrency(payload.totalAmount || 0)}`)
    }

    if (Math.abs(Number(currentOrder.paid_amount || 0) - Number(paymentState.paidAmount || 0)) > 0.009) {
        lines.push(`alterou valor pago: ${formatCurrency(currentOrder.paid_amount || 0)} -> ${formatCurrency(paymentState.paidAmount || 0)}`)
    }

    if (previousNotes !== nextNotes) {
        lines.push("alterou observações internas")
    }

    return lines.filter(Boolean)
}

function sanitizeERPItems(items: ERPItemPayload[]) {
    const sanitizedItems = items.map((item) => ({
        ...item,
        productId: item.productId || null,
        variantId: item.variantId || null,
        customName: item.customName?.trim() || undefined,
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
    }))

    for (const item of sanitizedItems) {
        if (!item.productId && !item.customName) {
            return { error: "Preencha o nome dos itens adicionados manualmente antes de salvar o pedido." as const }
        }

        if (item.quantity <= 0) {
            return { error: "A quantidade de todos os itens deve ser maior que zero." as const }
        }

        if (!item.productId && item.unitPrice <= 0) {
            return { error: "Preencha o preço dos itens adicionados manualmente antes de salvar o pedido." as const }
        }
    }

    return { items: sanitizedItems }
}

async function validateERPItemsStock(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    items: Array<{
        productId?: string | null
        variantId?: string | null
        customName?: string
        quantity: number
    }>
}) {
    const productIds = Array.from(new Set(params.items.map((item) => item.productId).filter(Boolean))) as string[]
    if (productIds.length === 0) return null

    const variantIds = Array.from(new Set(params.items.map((item) => item.variantId).filter(Boolean))) as string[]

    const { data: products, error: productsError } = await params.supabase
        .from("products")
        .select("id, name, stock_available, allow_sell_without_stock")
        .eq("partner_id", params.partnerId)
        .in("id", productIds)

    if (productsError) {
        console.error("[validateERPItemsStock] Products error:", productsError)
        return "Não foi possível validar o estoque dos itens."
    }

    const productMap = new Map<string, { name: string; stock: number; allowSellWithoutStock: boolean }>((products || []).map((product: any) => [
        product.id,
        {
            name: product.name || "Produto",
            stock: Number(product.stock_available ?? 0),
            allowSellWithoutStock: Boolean(product.allow_sell_without_stock),
        },
    ]))

    const variantMap = new Map<string, { name: string; stock: number; productId: string }>()
    if (variantIds.length > 0) {
        const { data: variants, error: variantsError } = await params.supabase
            .from("product_variants")
            .select("id, product_id, variant_name, stock_available")
            .in("id", variantIds)

        if (variantsError) {
            console.error("[validateERPItemsStock] Variants error:", variantsError)
            return "Não foi possível validar o estoque das variações."
        }

        for (const variant of variants || []) {
            variantMap.set(variant.id, {
                name: variant.variant_name || "Variação",
                stock: Number(variant.stock_available ?? 0),
                productId: variant.product_id,
            })
        }
    }

    const requestedMap = new Map<string, {
        quantity: number
        productId: string
        variantId?: string | null
        displayName: string
    }>()

    for (const item of params.items) {
        if (!item.productId) continue
        const key = item.variantId ? `variant:${item.variantId}` : `product:${item.productId}`
        const existing = requestedMap.get(key)
        if (existing) {
            existing.quantity += Number(item.quantity || 0)
            continue
        }

        const productInfo = productMap.get(item.productId)
        const variantInfo = item.variantId ? variantMap.get(item.variantId) : null
        requestedMap.set(key, {
            quantity: Number(item.quantity || 0),
            productId: item.productId,
            variantId: item.variantId || null,
            displayName: variantInfo ? `${productInfo?.name || "Produto"} - ${variantInfo.name}` : (productInfo?.name || item.customName || "Produto"),
        })
    }

    for (const request of requestedMap.values()) {
        const productInfo = productMap.get(request.productId)
        if (!productInfo) {
            return "Um dos produtos do pedido não foi encontrado para validar o estoque."
        }

        if (productInfo.allowSellWithoutStock) continue

        const availableStock = request.variantId
            ? variantMap.get(request.variantId)?.stock
            : productInfo.stock

        if (availableStock === undefined) {
            return `Não foi possível validar o estoque de "${request.displayName}".`
        }

        if (request.quantity > availableStock) {
            return `A quantidade de "${request.displayName}" está maior que o estoque disponível.`
        }
    }

    return null
}

function buildInventoryMovementDelta(previousItems: Array<{
    product_id?: string | null
    variant_id?: string | null
    product_name?: string | null
    quantity: number
}>, nextItems: Array<{
    productId?: string | null
    variantId?: string | null
    customName?: string
    quantity: number
}>) {
    const previousMap = new Map<string, { product_id: string; variant_id: string | null; quantity: number }>()
    const nextMap = new Map<string, { product_id: string; variant_id: string | null; quantity: number }>()

    for (const item of previousItems) {
        if (!item.product_id) continue
        const key = item.variant_id ? `variant:${item.variant_id}` : `product:${item.product_id}`
        const current = previousMap.get(key)
        if (current) {
            current.quantity += Number(item.quantity || 0)
        } else {
            previousMap.set(key, {
                product_id: item.product_id,
                variant_id: item.variant_id || null,
                quantity: Number(item.quantity || 0),
            })
        }
    }

    for (const item of nextItems) {
        if (!item.productId) continue
        const key = item.variantId ? `variant:${item.variantId}` : `product:${item.productId}`
        const current = nextMap.get(key)
        if (current) {
            current.quantity += Number(item.quantity || 0)
        } else {
            nextMap.set(key, {
                product_id: item.productId,
                variant_id: item.variantId || null,
                quantity: Number(item.quantity || 0),
            })
        }
    }

    const outgoing: Array<{ product_id: string; variant_id?: string | null; quantity: number }> = []
    const incoming: Array<{ product_id: string; variant_id?: string | null; quantity: number }> = []

    for (const [key, nextItem] of nextMap.entries()) {
        const previousItem = previousMap.get(key)
        const previousQty = Number(previousItem?.quantity || 0)
        if (nextItem.quantity > previousQty) {
            outgoing.push({
                product_id: nextItem.product_id,
                variant_id: nextItem.variant_id,
                quantity: nextItem.quantity - previousQty,
            })
        }
    }

    for (const [key, previousItem] of previousMap.entries()) {
        const nextItem = nextMap.get(key)
        const nextQty = Number(nextItem?.quantity || 0)
        if (previousItem.quantity > nextQty) {
            incoming.push({
                product_id: previousItem.product_id,
                variant_id: previousItem.variant_id,
                quantity: previousItem.quantity - nextQty,
            })
        }
    }

    return { outgoing, incoming }
}

async function fulfillMarketplaceOrderIfNeeded(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    orderId: string,
) {
    try {
        const { fulfillMarketplaceOrder } = await import("@/lib/services/marketplace-checkout-fulfillment")
        await fulfillMarketplaceOrder(supabase, orderId)
    } catch (error) {
        console.error("[orders_fulfillment] fulfillMarketplaceOrderIfNeeded:", error)
    }
}

async function createFinancialTransactionsForPaidOrder(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, params: {
    orderNumber: string
    partnerId: string
    totalAmount: number
    paymentMethod?: string | null
    paymentProvider?: string | null
    paymentBreakdown?: Array<{ method: string; amount: number; paymentMethodId?: string | null; installmentNumber?: number }> | null
    customerId?: string | null
    customerName?: string | null
    paymentDate?: string | null
    financeAccountId?: string | null
    orderSource?: string | null
}) {
    try {
        const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")
        await createTransactionFromOrder(supabase, {
            order_number: params.orderNumber,
            partner_id: params.partnerId,
            total_amount: params.totalAmount,
            payment_method: params.paymentMethod || null,
            payment_provider: params.paymentProvider || null,
            payment_breakdown: params.paymentBreakdown || null,
            payment_date: params.paymentDate || new Date().toISOString(),
            customer_id: params.customerId || null,
            customer_name: params.customerName || null,
            finance_account_id: params.financeAccountId || null,
            order_source: params.orderSource || "manual",
        })
    } catch (error) {
        console.error("[orders_financial] createFinancialTransactionsForPaidOrder:", error)
    }
}

export async function createFinancialTransactionsForReceivedAmount(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    params: {
        orderId: string
        orderNumber: string
        partnerId: string
        totalAmount: number
        newBreakdown: any[]
        oldBreakdown: any[]
        customerId?: string | null
        customerName?: string | null
        financeAccountId?: string | null
        orderSource?: string | null
    }
) {
    try {
        const { createTransactionFromOrder } = await import("@/lib/services/transaction.service")

        const oldBreakdown = Array.isArray(params.oldBreakdown) ? params.oldBreakdown : []
        const newBreakdown = Array.isArray(params.newBreakdown) ? params.newBreakdown : []

        for (let i = 0; i < newBreakdown.length; i++) {
            const newEntry = newBreakdown[i]
            if (!newEntry?.method) continue

            const newReceived = Number(newEntry.effectiveAmount ?? newEntry.amount ?? newEntry.amountReceived ?? 0)

            const oldEntry = oldBreakdown.find((old: any) => 
                old?.method === newEntry.method && 
                old?.paymentMethodId === newEntry.paymentMethodId
            ) || oldBreakdown[i]

            const oldReceived = oldEntry ? Number(oldEntry.effectiveAmount ?? oldEntry.amount ?? oldEntry.amountReceived ?? 0) : 0
            const delta = newReceived - oldReceived

            if (delta > 0.009) {
                const oldFormatted = oldReceived.toFixed(2)
                const newFormatted = newReceived.toFixed(2)
                const refNote = `sale-tx:${params.orderNumber}:${newEntry.method}:${oldFormatted}_to_${newFormatted}`

                await createTransactionFromOrder(supabase, {
                    order_number: params.orderNumber,
                    partner_id: params.partnerId,
                    total_amount: delta,
                    payment_method: newEntry.method,
                    payment_provider: params.orderSource === "Marketplace" || String(newEntry.method).toLowerCase().includes("mercado pago") ? "Mercado Pago" : null,
                    payment_breakdown: [{
                        method: newEntry.method,
                        amount: delta,
                        paymentMethodId: newEntry.paymentMethodId || null,
                        installmentNumber: newEntry.installmentNumber || 1,
                    }],
                    payment_date: new Date().toISOString(),
                    customer_id: params.customerId || null,
                    customer_name: params.customerName || null,
                    finance_account_id: params.financeAccountId || null,
                    order_source: params.orderSource || "manual",
                    reference_note: refNote,
                })
            }
        }
    } catch (error) {
        console.error("[orders_financial] createFinancialTransactionsForReceivedAmount:", error)
    }
}

async function resolvePartnerUserIdFromUserId(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    partnerId: string,
    userId?: string | null,
) {
    if (!userId) return null
    const { data } = await supabase
        .from("partner_users")
        .select("id")
        .eq("partner_id", partnerId)
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle()
    return data?.id ? String(data.id) : null
}

async function createSellerCommissionForPaidOrder(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    orderId: string
    sellerUserId?: string | null
    saleAmount: number
    accountId?: string | null
    createdByUserId?: string | null
}) {
    const partnerUserId = await resolvePartnerUserIdFromUserId(
        params.supabase,
        params.partnerId,
        params.sellerUserId || null,
    )
    if (!partnerUserId) return

    await createCommissionExpenseForEntity({
        supabase: params.supabase,
        partnerId: params.partnerId,
        partnerUserId,
        role: "seller",
        saleAmount: params.saleAmount,
        entityType: "sale",
        entityId: params.orderId,
        accountId: params.accountId || null,
        createdByUserId: params.createdByUserId || null,
    })

    if (params.sellerUserId) {
        await applySaleToGoals({
            supabase: params.supabase,
            partnerId: params.partnerId,
            sellerUserId: String(params.sellerUserId),
            saleAmount: Number(params.saleAmount || 0),
            createdByUserId: params.createdByUserId || null,
            accountId: params.accountId || null,
        })
    }
}

async function createRefundTransactionForCancelledOrder(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    orderNumber: string
    orderId: string
    customerId?: string | null
    customerName?: string | null
    paidAmount: number
    financeAccountId?: string | null
    createdByUserId?: string | null
}) {
    const paidAmount = Math.max(0, Number(params.paidAmount || 0))
    if (paidAmount <= 0.009) return { success: true as const }
    const financeAccountId = params.financeAccountId || null
    if (!financeAccountId) {
        return {
            error: "Não foi possível gerar o reembolso automático: o pedido não tem conta financeira de origem. Atualize o pedido com a conta correta antes de cancelar.",
        } as const
    }

    const { data: existingRefunds, error: existingRefundsError } = await params.supabase
        .from("transactions")
        .select("id, amount, status")
        .eq("partner_id", params.partnerId)
        .eq("refund_kind", "revenue_refund")
        .eq("reference_note", params.orderId)
        .in("status", ["paid", "partially_paid"])

    if (existingRefundsError) return { error: existingRefundsError.message }

    const alreadyRefundedAmount = (existingRefunds || []).reduce((sum: number, tx: any) => {
        return sum + Math.abs(Number(tx.amount || 0))
    }, 0)
    const refundableAmount = Math.max(0, paidAmount - alreadyRefundedAmount)
    if (refundableAmount <= 0.009) return { success: true as const }

    const transactionContactId = await resolveOrCreateTransactionContactByName({
        supabase: params.supabase,
        partnerId: params.partnerId,
        name: params.customerName,
    })

    const paymentDate = new Date().toISOString()
    const { error } = await params.supabase
        .from("transactions")
        .insert({
            partner_id: params.partnerId,
            description: `Reembolso automático da venda ${params.orderNumber}`,
            category: "Reembolso",
            customer_id: params.customerId || null,
            contact_id: transactionContactId,
            contact_type: "customer",
            amount: refundableAmount,
            due_date: null,
            payment_date: paymentDate,
            transaction_date: paymentDate,
            status: "paid",
            notes: "Gerado automaticamente ao cancelar venda.",
            payment_type: "Reembolso",
            original_amount: refundableAmount,
            interest_amount: null,
            fee_amount: 0,
            transaction_type: "expense",
            origin: "system",
            refund_kind: "revenue_refund",
            reference_note: params.orderId,
            account_id: financeAccountId,
            created_by_user_id: params.createdByUserId || null,
        })

    if (error) return { error: error.message }
    return { success: true as const }
}

async function restoreCancelledOrderInventory(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    items: Array<{ product_id?: string | null; variant_id?: string | null; quantity: number }>
}) {
    const validItems = (params.items || []).filter((item) => item.product_id && Number(item.quantity || 0) > 0)
    for (const item of validItems) {
        const qty = Number(item.quantity || 0)
        if (item.variant_id) {
            const { data: variant, error: variantError } = await params.supabase
                .from("product_variants")
                .select("id, product_id, stock_quantity, stock_available, products!inner(partner_id)")
                .eq("id", item.variant_id)
                .eq("product_id", item.product_id)
                .eq("products.partner_id", params.partnerId)
                .maybeSingle()
            if (variantError) return { error: variantError.message }
            if (!variant?.id) continue

            const { error: updateVariantError } = await params.supabase
                .from("product_variants")
                .update({
                    stock_quantity: Number(variant.stock_quantity || 0) + qty,
                    stock_available: Number(variant.stock_available || 0) + qty,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", variant.id)
            if (updateVariantError) return { error: updateVariantError.message }
            continue
        }

        const { data: product, error: productReadError } = await params.supabase
            .from("products")
            .select("id, stock_quantity, stock_available")
            .eq("id", item.product_id)
            .eq("partner_id", params.partnerId)
            .maybeSingle()
        if (productReadError) return { error: productReadError.message }
        if (!product?.id) continue

        const { error: productError } = await params.supabase
            .from("products")
            .update({
                stock_quantity: Number(product.stock_quantity || 0) + qty,
                stock_available: Number(product.stock_available || 0) + qty,
                updated_at: new Date().toISOString(),
            })
            .eq("id", product.id)
            .eq("partner_id", params.partnerId)
        if (productError) return { error: productError.message }
    }

    return { success: true as const }
}

async function resolveOrCreateTransactionContactByName(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    name?: string | null
}) {
    const normalizedName = String(params.name || "").trim().replace(/\s+/g, " ")
    if (!normalizedName) return null

    const { data: existing, error: existingError } = await params.supabase
        .from("transaction_contacts")
        .select("id")
        .eq("partner_id", params.partnerId)
        .eq("type", "customer")
        .ilike("name", normalizedName)
        .limit(1)
        .maybeSingle()

    if (existingError) {
        console.error("[orders_cancel_refund] failed_to_find_transaction_contact", {
            partnerId: params.partnerId,
            name: normalizedName,
            error: existingError,
        })
        return null
    }

    if (existing?.id) return existing.id

    const { data: created, error: createError } = await params.supabase
        .from("transaction_contacts")
        .insert({
            partner_id: params.partnerId,
            name: normalizedName,
            type: "customer",
        })
        .select("id")
        .maybeSingle()

    if (createError) {
        console.error("[orders_cancel_refund] failed_to_create_transaction_contact", {
            partnerId: params.partnerId,
            name: normalizedName,
            error: createError,
        })
        return null
    }

    return created?.id || null
}

async function createRefundTransactionForCancelledOrderSafe(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    orderNumber: string
    orderId: string
    customerId?: string | null
    customerName?: string | null
    paidAmount: number
    financeAccountId?: string | null
    createdByUserId?: string | null
}) {
    const paidAmount = Math.max(0, Number(params.paidAmount || 0))
    if (paidAmount <= 0.009) return { success: true as const }

    let financeAccountId = params.financeAccountId || null
    if (!financeAccountId) {
        // Fallback 1: Try to query the partner's default active financial account
        const { data: defaultAccount } = await params.supabase
            .from("finance_accounts")
            .select("id")
            .eq("partner_id", params.partnerId)
            .eq("is_default", true)
            .eq("is_active", true)
            .maybeSingle()

        if (defaultAccount?.id) {
            financeAccountId = defaultAccount.id
        }
    }

    if (!financeAccountId) {
        // Fallback 2: Try to query any active financial account for the partner
        const { data: anyAccount } = await params.supabase
            .from("finance_accounts")
            .select("id")
            .eq("partner_id", params.partnerId)
            .eq("is_active", true)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()

        if (anyAccount?.id) {
            financeAccountId = anyAccount.id
        }
    }

    if (!financeAccountId) {
        const message =
            "Não foi possível gerar o reembolso automático: o pedido não tem conta financeira de origem. Atualize o pedido com a conta correta antes de cancelar."
        console.error("[orders_cancel_refund] missing_finance_account", {
            orderId: params.orderId,
            partnerId: params.partnerId,
            paidAmount,
        })
        return { error: message }
    }

    const { data: existingRefunds, error: existingRefundsError } = await params.supabase
        .from("transactions")
        .select("id, amount, status")
        .eq("partner_id", params.partnerId)
        .eq("refund_kind", "revenue_refund")
        .eq("reference_note", params.orderId)
        .in("status", ["paid", "partially_paid"])

    if (existingRefundsError) {
        console.error("[orders_cancel_refund] failed_to_check_existing_refunds", {
            orderId: params.orderId,
            partnerId: params.partnerId,
            error: existingRefundsError,
        })
        return { error: existingRefundsError.message }
    }

    const alreadyRefundedAmount = (existingRefunds || []).reduce((sum: number, tx: any) => {
        return sum + Math.abs(Number(tx.amount || 0))
    }, 0)
    const refundableAmount = Math.max(0, paidAmount - alreadyRefundedAmount)
    if (refundableAmount <= 0.009) return { success: true as const }

    const transactionContactId = await resolveOrCreateTransactionContactByName({
        supabase: params.supabase,
        partnerId: params.partnerId,
        name: params.customerName,
    })

    const paymentDate = new Date().toISOString()
    const refundPayload = {
        partner_id: params.partnerId,
        description: `Reembolso automático da venda ${params.orderNumber}`,
        category: "Reembolso",
        customer_id: params.customerId || null,
        contact_id: transactionContactId,
        contact_type: "customer",
        amount: refundableAmount,
        due_date: null,
        payment_date: paymentDate,
        transaction_date: paymentDate,
        status: "paid",
        notes: "Gerado automaticamente ao cancelar venda.",
        payment_type: "Reembolso",
        original_amount: refundableAmount,
        interest_amount: null,
        fee_amount: 0,
        transaction_type: "refund",
        origin: "system",
        refund_kind: "revenue_refund",
        reference_note: params.orderId,
        account_id: financeAccountId,
        created_by_user_id: params.createdByUserId || null,
    }

    let insertResult = await params.supabase
        .from("transactions")
        .insert(refundPayload)
        .select("id")
        .maybeSingle()

    if (insertResult.error) {
        const message = String(insertResult.error.message || "").toLowerCase()
        if (message.includes("created_by_user_id") && message.includes("transactions")) {
            const fallbackPayload = { ...refundPayload }
            delete (fallbackPayload as Record<string, unknown>).created_by_user_id
            insertResult = await params.supabase
                .from("transactions")
                .insert(fallbackPayload)
                .select("id")
                .maybeSingle()
        }
    }

    if (insertResult.error || !insertResult.data?.id) {
        console.error("[orders_cancel_refund] failed_to_create_refund", {
            orderId: params.orderId,
            orderNumber: params.orderNumber,
            partnerId: params.partnerId,
            financeAccountId,
            paidAmount,
            alreadyRefundedAmount,
            refundableAmount,
            error: insertResult.error,
        })
        return { error: insertResult.error?.message || "Não foi possível gerar o reembolso automático." }
    }

    const { error: balanceError } = await params.supabase.rpc("apply_account_balance_delta", {
        p_account_id: financeAccountId,
        p_partner_id: params.partnerId,
        p_delta: -Math.abs(refundableAmount),
    })

    if (balanceError) {
        console.error("[orders_cancel_refund] failed_to_apply_account_balance_delta", {
            orderId: params.orderId,
            orderNumber: params.orderNumber,
            transactionId: insertResult.data.id,
            partnerId: params.partnerId,
            financeAccountId,
            refundableAmount,
            error: balanceError,
        })
    }

    return { success: true as const }
}

function buildReopenStockErrorMessage(items: OrderStockItem[]) {
    const validItems = (items || []).filter((item) => item.product_id && Number(item.quantity || 0) > 0)
    return validItems.length <= 1
        ? "Estoque insuficiente para o item da venda."
        : "Estoque insuficiente para um ou mais itens."
}

async function createOrderStockMovement(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    orderId: string
    createdBy: string
    type: "in" | "out"
    reason: string
    notes?: string
    items: Array<{ product_id?: string | null; variant_id?: string | null; quantity: number }>
}) {
    const movementItems = params.items
        .filter((item) => item.product_id && Number(item.quantity || 0) > 0)
        .map((item) => ({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            quantity: Number(item.quantity || 0),
        }))

    if (movementItems.length === 0) {
        return { success: true as const }
    }

    const { data: movementRecord, error } = await params.supabase.rpc("create_batch_stock_movement", {
        p_partner_id: params.partnerId,
        p_movement_type: params.type,
        p_reason: params.reason,
        p_notes: params.notes || null,
        p_created_by: params.createdBy,
        p_items: movementItems,
    })

    if (error) {
        console.error("[orders_stock_movement] create_batch_stock_movement_failed", {
            partnerId: params.partnerId,
            orderId: params.orderId,
            type: params.type,
            reason: params.reason,
            items: movementItems,
            error,
        })
        return { error: error.message }
    }

    const movementId = (movementRecord as any)?.id
    if (movementId) {
        const { error: linkError } = await params.supabase
            .from("stock_movements")
            .update({
                order_id: params.orderId,
                reference_name: `Pedido: ${params.orderId}`,
            })
            .eq("id", movementId)

        if (linkError) {
            console.error("[orders_stock_movement] failed_to_link_order", {
                partnerId: params.partnerId,
                orderId: params.orderId,
                movementId,
                error: linkError,
            })
        }
    }

    revalidateStockMovements(params.partnerId)

    for (const item of movementItems) {
        if (item.product_id) {
            await invalidateProductCache(item.product_id, params.partnerId, "update", { silent: true })
        }
    }

    return { success: true as const }
}

async function invalidateInventoryItems(partnerId: string, items: Array<{ product_id?: string | null }>) {
    const productIds = Array.from(
        new Set(items.map((item) => item.product_id).filter(Boolean))
    ) as string[]

    for (const productId of productIds) {
        await invalidateProductCache(productId, partnerId, "update", { silent: true })
    }
}

async function resolveOrderPreparationEstimate(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    items: Array<{ productId?: string | null }>
    deliveryMethod: "delivery" | "pickup"
}) {
    const productIds = Array.from(
        new Set(params.items.map((item) => item.productId).filter(Boolean))
    ) as string[]
    if (productIds.length === 0) return null

    const [{ data: products }, { data: partner }] = await Promise.all([
        params.supabase
            .from("products")
            .select("id, availability_value, availability_unit")
            .eq("partner_id", params.partnerId)
            .in("id", productIds),
        params.supabase
            .from("partners")
            .select("opening_hours")
            .eq("id", params.partnerId)
            .maybeSingle(),
    ])

    const estimate = computeOrderPreparationEstimate({
        products: (products || []).map((product: any) => ({
            availability_value: Number(product.availability_value || 0),
            availability_unit: product.availability_unit || "Minutos",
        })),
        openingHours: (partner as any)?.opening_hours || null,
        pickupWindowMinutes: 30,
        deliveryTimeEstimateMinutes: 0,
    })

    if (!estimate) return null
    return {
        preparation_time_minutes: estimate.preparationTimeMinutes,
        estimated_ready_at: estimate.readyAt.toISOString(),
        pickup_window_start: estimate.pickupWindowStart.toISOString(),
        pickup_window_end: estimate.pickupWindowEnd.toISOString(),
        estimated_delivery_at: params.deliveryMethod === "delivery" ? estimate.estimatedDeliveryAt.toISOString() : null,
    }
}

export async function createERPOrderAction(data: ERPOrderPayload) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)

    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    const partnerId = data.partnerId
    await requirePermission(partnerId, "orders", "create")

    // Validate discount permission if a discount is being applied
    if (data.discountValue > 0 || data.couponCode) {
        await requirePermission(partnerId, "orders", "can_apply_discount")
    }

    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(data.csrf_token)
    if (!csrfValidation.valid) return { error: csrfValidation.error || "Token CSRF inválido" }

    const limitCheck = await checkLimit(partnerId, "monthly_orders")
    if (!limitCheck.allowed) return { error: limitCheck.message || "Limite mensal atingido." }

    const supabase = createAdminClient()
    const sanitizedItemsResult = sanitizeERPItems(data.items)
    if ("error" in sanitizedItemsResult) return { error: sanitizedItemsResult.error }
    const sanitizedItems = sanitizedItemsResult.items
    const stockValidationError = await validateERPItemsStock({
        supabase,
        partnerId,
        items: sanitizedItems,
    })
    if (stockValidationError) return { error: stockValidationError }
    const sanitizedPaymentBreakdown = sanitizePaymentBreakdown(data.paymentBreakdown)
    const { data: financeAccount } = data.financeAccountId ? await supabase
        .from("finance_accounts")
        .select("id")
        .eq("id", data.financeAccountId)
        .eq("partner_id", partnerId)
        .limit(1)
        .maybeSingle() : { data: null }
    if (data.financeAccountId && !financeAccount?.id) {
        return { error: "Conta de recebimento inválida para esta venda." }
    }

    if (Number(data.totalAmount || 0) <= 0) {
        return { error: "A venda não pode ser salva com valor total zerado." }
    }

    let couponIdToSave: string | null = data.couponId || null
    let couponDiscountAmount = Math.max(0, Number(data.couponDiscountAmount || 0))
    let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null
    if (data.couponCode?.trim()) {
        const couponValidation = await validateCoupon({
            partnerId,
            code: data.couponCode,
            customerId: data.customerId || null,
            subtotal: Number(data.subtotal || 0),
            shippingCost: Number(data.shippingCost || 0),
            items: sanitizedItems.map((item) => ({ productId: item.productId || null })),
        })
        if (!couponValidation.valid) return { error: couponValidation.errorMessage || "Cupom inválido." }
        couponIdToSave = couponValidation.couponId || null
        couponDiscountAmount = Number(couponValidation.discountAmount || 0)
        couponPricingData = couponValidation.pricingCoupon || null
    } else if (couponIdToSave) {
        // Re-validate existing coupon by ID
        const couponValidation = await validateCouponById(couponIdToSave, {
            partnerId,
            customerId: data.customerId || null,
            subtotal: Number(data.subtotal || 0),
            shippingCost: Number(data.shippingCost || 0),
            items: sanitizedItems.map((item) => ({ productId: item.productId || null })),
        })
        if (couponValidation.valid) {
            couponDiscountAmount = Number(couponValidation.discountAmount || 0)
            couponPricingData = couponValidation.pricingCoupon || null
        } else {
            // Coupon no longer valid - clear it silently
            couponIdToSave = null
            couponDiscountAmount = 0
        }
    }

    // ── Server-side pricing recalculation ────────────────────────────────
    const { listActivePromotionsForMarketplaceAction, filterRawPromotionsByGiftStock, buildGiftOrderItems } = await import("@/app/actions/shared/promotions")
    const rawPromotions = await listActivePromotionsForMarketplaceAction(partnerId, data.customerId || null)
    const filteredPromotions = await filterRawPromotionsByGiftStock(rawPromotions, supabase)

    const pricingResult = calculateOrderPricing({
        items: sanitizedItems.map((item) => ({
            productId: item.productId || null,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
        })),
        shippingCost: Number(data.shippingCost || 0),
        additionalCosts: Number(data.additionalCosts || 0),
        manualDiscount: (data.discountValue > 0 && data.discountType !== "coupon") ? { type: data.discountType as "fixed" | "percentage", value: data.discountValue } : null,
        coupon: couponPricingData,
        promotions: filteredPromotions,
    })

    const giftIds = pricingResult.appliedGiftProductIds || []
    const giftItems = await buildGiftOrderItems(supabase, giftIds, filteredPromotions)

    // Override client-sent values with server-computed ones
    couponDiscountAmount = pricingResult.couponDiscountAmount
    const serverComputedTotal = pricingResult.finalTotal
    const serverShippingCost = pricingResult.shipping
    const breakdownTotal = sanitizedPaymentBreakdown.reduce((s, e) => s + e.amount, 0)
    const hasBreakdown = sanitizedPaymentBreakdown.length > 0
    const finalTotal = hasBreakdown ? breakdownTotal : serverComputedTotal
    // Usa o subtotal original do pedido como base do desconto do método,
    // em vez do serverComputedTotal (que pode incluir brindes/promoções).
    const discountBase = hasBreakdown ? Math.max(0, Number(data.subtotal || 0) || serverComputedTotal) : serverComputedTotal
    const paymentMethodDiscountAmount = Math.max(0, discountBase - finalTotal)
    const paymentMethodExtraAmount = Math.max(0, finalTotal - discountBase)
    let serverTotalAmount = finalTotal
    const adjustedPaymentBreakdown = sanitizedPaymentBreakdown
    const paymentMethodSummary = buildPaymentMethodSummary(adjustedPaymentBreakdown, data.paymentMethod)
    const paymentState = resolvePaymentState({
        requestedStatus: data.paymentStatus,
        totalAmount: serverTotalAmount,
        paidAmount: data.paidAmount,
    })

    let deliveryAddressStr = ""
    if (data.deliveryMethod === "delivery" && data.address) {
        const { street, number, neighborhood, city, state, zipCode, complement } = data.address
        deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
    }

    const preparationEstimate = await resolveOrderPreparationEstimate({
        supabase,
        partnerId,
        items: sanitizedItems,
        deliveryMethod: data.deliveryMethod,
    })

    const orderInsertPayload: Record<string, unknown> = {
        partner_id: partnerId,
        buyer_id: data.customerId || null,
        customer_name: data.customerName || null,
        source_quote_id: data.sourceQuoteId || null,
        order_source: buildOrderSource(data.salesChannel, data.deliveryMethod),
        delivery_type: data.deliveryMethod,
        situation: paymentState.situation,
        delivery_status: data.deliveryStatus,
        total_amount: serverTotalAmount,
        paid_amount: paymentState.paidAmount,
        discount_value: data.discountValue,
        discount_type: data.discountType,
        discount_amount: couponDiscountAmount,
        payment_method_discount_amount: paymentMethodDiscountAmount,
        payment_method_extra_amount: paymentMethodExtraAmount,
        coupon_id: couponIdToSave,
        delivery_fee: serverShippingCost,
        additional_costs: data.additionalCosts,
        notes: data.notes || null,
        payment_method: paymentMethodSummary,
        payment_breakdown: adjustedPaymentBreakdown,
        payment_provider: data.paymentProvider || null,
        mp_payment_id: data.mpPaymentId || null,
        delivery_address: deliveryAddressStr || null,
        finance_account_id: data.financeAccountId,
        created_by: user.id,
        pricing_version: pricingResult.pricingVersion,
        ...(preparationEstimate || {}),
    }

    let orderInsertResult = await supabase
        .from("orders")
        .insert(orderInsertPayload)
        .select()
        .single()

    if (orderInsertResult.error && isMissingOrdersPaymentMethodDeltaColumnsError(orderInsertResult.error)) {
        const fallbackInsertPayload = { ...orderInsertPayload }
        delete (fallbackInsertPayload as any).payment_method_discount_amount
        delete (fallbackInsertPayload as any).payment_method_extra_amount
        orderInsertResult = await supabase
            .from("orders")
            .insert(fallbackInsertPayload)
            .select()
            .single()
    }

    const order = orderInsertResult.data
    const orderError = orderInsertResult.error
    if (orderError) return { error: orderError.message }

    const giftItemsToInsert = giftItems.map((item, idx) => ({
        order_id: order.id,
        product_id: item.product_id,
        variant_id: null,
        product_name: item.product_name,
        product_price: 0,
        quantity: 1,
        subtotal: 0,
        sort_order: sanitizedItems.length + idx + 1,
        is_gift: true,
        original_price: item.original_price,
        is_promotional: true,
        promotion_id: item.promotion_id,
    }))
    const itemsToInsert = [
        ...sanitizedItems.map(item => ({
            order_id: order.id,
            product_id: item.productId,
            variant_id: item.variantId || null,
            product_name: item.customName || "Item manual",
            product_price: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.unitPrice * item.quantity,
            sort_order: item.sortOrder,
            is_gift: false,
            original_price: null,
            is_promotional: false,
            promotion_id: null,
        })),
        ...giftItemsToInsert
    ]

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
    if (itemsError) {
        await supabase.from("orders").delete().eq("id", order.id)
        return { error: itemsError.message }
    }

    const stockItems = [
        ...sanitizedItems
            .filter(item => item.productId)
            .map((item) => ({
                product_id: item.productId,
                variant_id: item.variantId || null,
                quantity: item.quantity,
            })),
        ...giftItems
            .filter(item => item.product_id)
            .map((item) => ({
                product_id: item.product_id,
                variant_id: null,
                quantity: 1,
            }))
    ]

    const reserveResult = await reserveOrderInventory({
        client: supabase,
        partnerId,
        orderId: order.id,
        items: stockItems,
    })

    if ("error" in reserveResult) {
        await supabase.from("order_items").delete().eq("order_id", order.id)
        await supabase.from("orders").delete().eq("id", order.id)
        return { error: reserveResult.error }
    }

    if (shouldDeductInventory(data.deliveryStatus)) {
        const finalizeResult = await finalizeOrderInventory({
            client: supabase,
            partnerId,
            orderId: order.id,
            createdBy: user.id,
            reason: "Venda de Produtos",
            notes: data.notes?.trim() || undefined,
            items: stockItems,
        })

        if ("error" in finalizeResult) {
            await releaseOrderInventory({
                client: supabase,
                partnerId,
                orderId: order.id,
                items: stockItems,
            })
            await supabase.from("order_items").delete().eq("order_id", order.id)
            await supabase.from("orders").delete().eq("id", order.id)
            return { error: finalizeResult.error }
        }

        await supabase
            .from("orders")
            .update({ inventory_deducted: true })
            .eq("id", order.id)
            .eq("partner_id", partnerId)
    }

    await logAuditEvent({
        partnerId,
        actorUserId: user.id,
        entityType: "order",
        entityId: order.id,
        actionType: "created",
        changeLines: ["criou venda"],
        source: "manual",
    })

    const skippedGifts = filteredPromotions.filter(
        (p) => p.giftUnavailable && pricingResult.appliedPromotionIds.includes(p.id)
    )
    for (const promo of skippedGifts) {
        await logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "order",
            entityId: order.id,
            actionType: "created",
            changeLines: [`Brinde da campanha "${promo.name}" temporariamente indisponível (sem estoque).`],
            source: "manual",
        })
    }

    await increment_usage_counter(partnerId, "orders_month_count")

    if (couponIdToSave) {
        const adminClient = createAdminClient()
        await adminClient.from("coupon_usages").upsert(
            {
                coupon_id: couponIdToSave,
                customer_id: data.customerId || null,
                order_id: order.id,
            },
            { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
        )
    }

    if (paymentState.paidAmount > 0.009) {
        await createFinancialTransactionsForReceivedAmount(supabase, {
            orderId: order.id,
            orderNumber: order.order_number,
            partnerId,
            totalAmount: Number(order.total_amount || 0),
            newBreakdown: adjustedPaymentBreakdown,
            oldBreakdown: [],
            customerId: order.customer_id || order.buyer_id || null,
            customerName: order.customer_name,
            financeAccountId: order.finance_account_id || data.financeAccountId,
            orderSource: order.order_source || "manual",
        })
    }

    if (paymentState.situation === "paid") {
        await fulfillMarketplaceOrderIfNeeded(supabase, order.id)
        await createSellerCommissionForPaidOrder({
            supabase,
            partnerId,
            orderId: order.id,
            sellerUserId: user.id,
            saleAmount: Number(order.total_amount || 0),
            accountId: order.finance_account_id || data.financeAccountId,
            createdByUserId: user.id,
        })
    }

    // Sync payment status to linked appointments
    if (paymentState.situation === "paid" || paymentState.situation === "partially_paid" || paymentState.situation === "pending") {
        await supabase
            .from("appointments")
            .update({ payment_status: paymentState.situation })
            .eq("marketplace_order_id", order.id)
            .eq("partner_id", partnerId)
    }

    await invalidateInventoryItems(partnerId, stockItems)
    await revalidateOrders(partnerId)

    import("@/lib/services/notification-automation.service")
        .then(({ onOrderStatusChanged }) =>
            onOrderStatusChanged(
                { ...order, partner_id: partnerId },
                paymentState.situation,
                order.delivery_status,
                "manual",
            ),
        )
        .catch(console.error)

    return { success: true, orderId: order.id, orderNumber: order.order_number }
}

export async function getOrderDetailsAction(orderId: string, partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    await requirePermission(partnerId, "orders", "view")
    const supabase = createAdminClient()
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)

    const orderQuery = supabase
        .from("orders")
        .select(`
            *,
            order_items(*, products(id, name, sku, images, stock_quantity, stock_available, allow_sell_without_stock, unit), product_variants(id, variant_name, sku, stock_quantity, stock_available), services(id, name, images)),
            stores(name),
            coupons(*),
            appointments(*),
            return_requests!order_id(id, status, approved_resolution, desired_resolution, refund_amount)
        `)
        .eq("partner_id", partnerId)

    if (isUuid) {
        orderQuery.eq("id", orderId)
    } else {
        orderQuery.eq("order_number", orderId)
    }

    const { data, error } = await orderQuery.maybeSingle()

    if (error) return { error: error.message }
    if (data) {
        // P3: resolve cliente e vendedor em paralelo (consultas independentes entre si)
        // em vez de sequencialmente, reduzindo round-trips na abertura do detalhe.
        const resolveCustomer = async () => {
            if (!data.buyer_id) return null
            const { data: customerData } = await supabase
                .from("customers")
                .select("id, name, email, phone, addresses(*)")
                .or(`id.eq.${data.buyer_id},user_id.eq.${data.buyer_id}`)
                .eq("partner_id", partnerId)
                .maybeSingle()
            if (customerData) return customerData

            try {
                const { data: authUserRes } = await supabase.auth.admin.getUserById(data.buyer_id)
                const authUser = authUserRes?.user
                if (authUser) {
                    const email = authUser.email
                    const phone = authUser.phone

                    if (email || phone) {
                        let query = supabase
                            .from("customers")
                            .select("id, name, email, phone, addresses(*)")
                            .eq("partner_id", partnerId)

                        if (email && phone) {
                            query = query.or(`email.eq.${email},phone.eq.${phone}`)
                        } else if (email) {
                            query = query.eq("email", email)
                        } else if (phone) {
                            query = query.eq("phone", phone)
                        }

                        const { data: matchedCustomers } = await query.limit(1)
                        if (matchedCustomers && matchedCustomers.length > 0) {
                            const matched = matchedCustomers[0]
                            // Link customer to user_id for faster future queries
                            await supabase
                                .from("customers")
                                .update({ user_id: data.buyer_id })
                                .eq("id", matched.id)
                            return {
                                ...matched,
                                user_id: data.buyer_id,
                            }
                        }
                    }

                    // Fallback to auth user info if no customer record exists under this partner yet
                    return {
                        id: data.buyer_id,
                        name: data.customer_name || authUser.user_metadata?.full_name || "Cliente Marketplace",
                        email: email || null,
                        phone: phone || null,
                        addresses: [],
                    }
                }
            } catch (err) {
                console.error("Error looking up customer for marketplace order:", err)
            }
            return null
        }

        const resolveSellerName = async () => {
            if (!data.created_by) return null
            const { data: sellerProfile } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", data.created_by)
                .single()
            return sellerProfile?.full_name || null
        }

        const [customers, sellerName] = await Promise.all([resolveCustomer(), resolveSellerName()])

        const subtotalValue = Number((data.order_items || []).reduce((acc: number, item: any) => {
            return acc + Number(item?.subtotal ?? (Number(item?.quantity || 0) * Number(item?.product_price || 0)))
        }, 0))
        const manualDiscount = Math.max(0, Number((data as any).discount_value || 0))
        const couponDiscount = Math.max(0, Number((data as any).discount_amount || 0))
        const shippingCost = Math.max(0, Number((data as any).delivery_fee || (data as any).shipping_cost || 0))
        const additionalCosts = Math.max(0, Number((data as any).additional_costs || 0))
        const baseBeforePaymentMethod = Math.max(0, subtotalValue - manualDiscount - couponDiscount + shippingCost + additionalCosts)
        const finalTotal = Math.max(0, Number((data as any).total_amount || 0))
        const paymentMethodDiscountAmount = Math.max(0, Math.round((baseBeforePaymentMethod - finalTotal) * 100) / 100)
        const paymentMethodExtraAmount = Math.max(0, Math.round((finalTotal - baseBeforePaymentMethod) * 100) / 100)

        const isRefunded = Array.isArray(data.return_requests) && data.return_requests.some((req: any) => {
            const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(req.status)
            const isRefundResolution = req.approved_resolution === "refund" || (!req.approved_resolution && req.desired_resolution === "refund")
            const hasRefundValue = Number(req.refund_amount || 0) > 0
            return isApprovedOrResolved && (isRefundResolution || hasRefundValue)
        })
        const refundedAmount = Array.isArray(data.return_requests)
            ? data.return_requests.reduce((sum: number, req: any) => {
                const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(req.status)
                const isRefundResolution = req.approved_resolution === "refund" || (!req.approved_resolution && req.desired_resolution === "refund")
                const hasRefundValue = Number(req.refund_amount || 0) > 0
                if (isApprovedOrResolved && (isRefundResolution || hasRefundValue)) {
                    return sum + Number(req.refund_amount || 0)
                }
                return sum
            }, 0)
            : 0

        return {
            success: true,
            data: {
                ...data,
                customers,
                seller_name: sellerName,
                subtotal_value: subtotalValue,
                coupon_discount_amount: couponDiscount,
                payment_method_discount_amount: paymentMethodDiscountAmount,
                payment_method_extra_amount: paymentMethodExtraAmount,
                is_refunded: isRefunded,
                refunded_amount: refundedAmount,
            },
        }
    }

    const saleQuery = supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("partner_id", partnerId)

    if (isUuid) {
        saleQuery.eq("id", orderId)
    } else {
        saleQuery.eq("sale_number", orderId)
    }

    const { data: sale, error: saleError } = await saleQuery.maybeSingle()

    if (saleError || !sale) return { error: "Pedido não encontrado" }

    // P3: cliente, vendedor e pre_sale são independentes - resolve em paralelo.
    const [customers, saleSellerName, saleDraft] = await Promise.all([
        sale.customer_id
            ? supabase
                .from("customers")
                .select("id, name, email, phone, addresses(*)")
                .eq("id", sale.customer_id)
                .single()
                .then((res: any) => res.data)
            : Promise.resolve(null),
        (sale as any).finalized_by_user_id
            ? supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", (sale as any).finalized_by_user_id)
                .single()
                .then((res: any) => res.data?.full_name || null)
            : Promise.resolve(null),
        supabase
            .from("pre_sales")
            .select("shipping_fee, other_costs, discount_amount, coupon_discount_amount")
            .eq("id", sale.pre_sale_id)
            .eq("partner_id", partnerId)
            .limit(1)
            .maybeSingle()
            .then((res: any) => res.data),
    ])

    const shippingCost = Number(saleDraft?.shipping_fee || 0)
    const otherCosts = Number((saleDraft as any)?.other_costs || 0)
    const manualDiscount = Number((saleDraft as any)?.discount_amount || sale.discount_amount || 0)
    const couponDiscount = Number((saleDraft as any)?.coupon_discount_amount || 0)
    const subtotalValue = Number((sale.sale_items || []).reduce((acc: number, it: any) => {
        return acc + Number(it?.subtotal ?? Number(it?.quantity || 0) * Number(it?.unit_price || 0))
    }, 0))
    const baseBeforePaymentMethod = Math.max(0, subtotalValue - Math.max(0, manualDiscount) - Math.max(0, couponDiscount) + Math.max(0, shippingCost) + Math.max(0, otherCosts))
    const finalTotal = Math.max(0, Number(sale.final_amount || 0))
    const paymentMethodDiscountAmount = Math.max(0, Math.round((baseBeforePaymentMethod - finalTotal) * 100) / 100)
    const paymentMethodExtraAmount = Math.max(0, Math.round((finalTotal - baseBeforePaymentMethod) * 100) / 100)
    const ref =
        (sale.sale_number && String(sale.sale_number).trim()) ||
        String(sale.id || "").replace(/-/g, "").slice(0, 8).toUpperCase()
    const situation =
        sale.status === "paid" || sale.payment_status === "paid"
            ? "paid"
            : sale.payment_status === "partially_paid"
                ? "partially_paid"
                : "pending"

    const orderLike = {
        id: sale.id,
        order_number: ref,
        order_source: "Presencial",
        situation,
        delivery_status: (sale as any).delivery_status || (shippingCost > 0 ? "preparing" : "delivered"),
        delivery_type: shippingCost > 0 ? "delivery" : "pickup",
        total_amount: Number(sale.final_amount || 0),
        paid_amount: Number(sale.paid_amount || 0),
        discount_value: Math.max(0, manualDiscount),
        coupon_discount_amount: Math.max(0, couponDiscount),
        delivery_fee: shippingCost,
        additional_costs: otherCosts,
        subtotal_value: subtotalValue,
        payment_method_discount_amount: paymentMethodDiscountAmount,
        payment_method_extra_amount: paymentMethodExtraAmount,
        notes: sale.notes,
        created_at: sale.created_at,
        order_date: sale.created_at,
        order_items: (sale.sale_items || []).map((it: any) => ({
            id: it.id,
            product_name: it.product_name,
            product_price: Number(it.unit_price || 0),
            quantity: Number(it.quantity || 0),
            subtotal: Number(it.subtotal ?? Number(it.quantity) * Number(it.unit_price)),
            sku: "-",
            image: null,
            product_id: it.product_id,
            variant_id: it.variant_id,
        })),
        buyer_id: sale.customer_id,
        customer_name: customers?.name || "Consumidor final",
        customers,
        seller_name: saleSellerName,
        is_pos_sale: true,
        payment_method: null,
        payment_breakdown: [],
        mp_payment_id: null,
    }

    return { success: true, data: orderLike }
}

export async function getOrderHistoryAction(orderId: string, partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    await requirePermission(partnerId, "orders", "view")

    const supabase = createAdminClient()
    const { data: saleRow } = await supabase
        .from("sales")
        .select("id")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle()
    if (saleRow?.id) return { success: true, data: [] as any[] }

    const entries = await getOrderHistoryEntries(orderId, partnerId)
    return { success: true, data: entries }
}

export async function updateERPOrderAction(orderId: string, data: ERPOrderPayload) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)

    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    const { roleId } = await requirePermission(data.partnerId, "orders", "edit")

    // Validate discount permission if a discount is being applied
    if (data.discountValue > 0 || data.couponCode) {
        await requirePermission(data.partnerId, "orders", "can_apply_discount")
    }

    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(data.csrf_token)
    if (!csrfValidation.valid) return { error: csrfValidation.error || "Token CSRF inválido" }

    const supabase = createAdminClient()
    const sanitizedItemsResult = sanitizeERPItems(data.items)
    if ("error" in sanitizedItemsResult) return { error: sanitizedItemsResult.error }
    const sanitizedItems = sanitizedItemsResult.items
    const { data: currentOrder, error: currentOrderError } = await supabase
        .from("orders")
        .select(`
            id,
            order_number,
            partner_id,
            customer_name,
            order_source,
            delivery_type,
            situation,
            delivery_status,
            total_amount,
            paid_amount,
            discount_value,
            delivery_fee,
            additional_costs,
            notes,
            payment_method,
            payment_breakdown,
            payment_provider,
            mp_payment_id,
            finance_account_id,
            delivery_address,
            inventory_deducted,
            created_by,
            order_items(product_id, variant_id, product_name, quantity, product_price)
        `)
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)
        .single()

    if (currentOrderError || !currentOrder) return { error: currentOrderError?.message || "Pedido não encontrado" }

    // Enforce role-based and status-based editing locks
    const isPaidOrder = currentOrder.situation === 'paid' || currentOrder.situation === 'partially_paid'
    const isDeliveredOrder = currentOrder.delivery_status === 'delivered'

    if (roleId === "delivery") {
        return { error: "Entregadores não têm permissão para editar pedidos." }
    }

    // Check if items changed
    const currentItems = currentOrder.order_items || []
    const hasItemsChanged = currentItems.length !== sanitizedItems.length ||
        sanitizedItems.some((itemA: any, idx: number) => {
            const itemB = currentItems[idx]
            if (!itemB) return true
            return itemA.productId !== itemB.product_id ||
                itemA.variantId !== itemB.variant_id ||
                itemA.quantity !== itemB.quantity ||
                Math.abs((itemA.unitPrice || 0) - (itemB.product_price || 0)) > 0.009
        })

    // Check if address changed
    let deliveryAddressStr = ""
    if (data.deliveryMethod === "delivery" && data.address?.street && data.address.number) {
        const { street, number, neighborhood, city, state, zipCode, complement } = data.address
        deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
    }
    const hasAddressChanged = deliveryAddressStr !== (currentOrder.delivery_address || "")

    // Check if financial / general settings changed
    const hasFinancialChanged = Math.abs(Number(currentOrder.total_amount || 0) - Number(data.totalAmount || 0)) > 0.009 ||
        Math.abs(Number(currentOrder.discount_value || 0) - Number(data.discountValue || 0)) > 0.009 ||
        Math.abs(Number(currentOrder.delivery_fee || 0) - Number(data.shippingCost || 0)) > 0.009 ||
        Math.abs(Number(currentOrder.additional_costs || 0) - Number(data.additionalCosts || 0)) > 0.009 ||
        data.financeAccountId !== currentOrder.finance_account_id ||
        data.salesChannel !== currentOrder.order_source ||
        data.deliveryMethod !== currentOrder.delivery_type ||
        data.customerName !== currentOrder.customer_name ||
        data.paymentStatus !== currentOrder.situation

    const hasGeneralChanged = hasItemsChanged || hasAddressChanged || hasFinancialChanged

    if (isPaidOrder) {
        if (isDeliveredOrder) {
            // Paid and delivered: only observations (notes) can change.
            // If anything else changed, block it.
            const hasDeliveryChanged = data.deliveryStatus !== currentOrder.delivery_status
            if (hasGeneralChanged || hasDeliveryChanged) {
                return { error: "Não é permitido alterar dados após a entrega do pedido pago." }
            }
        } else {
            // Paid but not delivered: items, values, client details, address details are locked.
            if (hasGeneralChanged) {
                return { error: "Não é permitido alterar itens, valores ou dados do cliente após o pagamento do pedido." }
            }
        }
    }

    // ── Coupon validation and promotions fetch for updates ─────────────────────────────────────
    let couponIdToSave: string | null = data.couponId || null
    let couponDiscountAmount = Math.max(0, Number(data.couponDiscountAmount || 0))
    let couponPricingData: import("@/lib/services/pricing-engine").PricingCoupon | null = null

    if (data.couponCode?.trim()) {
        const couponValidation = await validateCoupon({
            partnerId: data.partnerId,
            code: data.couponCode,
            customerId: data.customerId || null,
            subtotal: Number(data.subtotal || 0),
            shippingCost: Number(data.shippingCost || 0),
            items: sanitizedItems.map((item) => ({ productId: item.productId || null })),
        })
        if (couponValidation.valid) {
            couponIdToSave = couponValidation.couponId || null
            couponDiscountAmount = Number(couponValidation.discountAmount || 0)
            couponPricingData = couponValidation.pricingCoupon || null
        } else {
            couponIdToSave = null
            couponDiscountAmount = 0
        }
    } else if (couponIdToSave) {
        const couponValidation = await validateCouponById(couponIdToSave, {
            partnerId: data.partnerId,
            customerId: data.customerId || null,
            subtotal: Number(data.subtotal || 0),
            shippingCost: Number(data.shippingCost || 0),
            items: sanitizedItems.map((item) => ({ productId: item.productId || null })),
        })
        if (couponValidation.valid) {
            couponDiscountAmount = Number(couponValidation.discountAmount || 0)
            couponPricingData = couponValidation.pricingCoupon || null
        } else {
            couponIdToSave = null
            couponDiscountAmount = 0
        }
    }

    const { listActivePromotionsForMarketplaceAction, filterRawPromotionsByGiftStock, buildGiftOrderItems } = await import("@/app/actions/shared/promotions")
    const rawPromotions = await listActivePromotionsForMarketplaceAction(data.partnerId, data.customerId || null)
    const filteredPromotions = await filterRawPromotionsByGiftStock(rawPromotions, supabase)

    const updatePricingResult = calculateOrderPricing({
        items: sanitizedItems.map((item) => ({
            productId: item.productId || null,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
        })),
        shippingCost: Number(data.shippingCost || 0),
        additionalCosts: Number(data.additionalCosts || 0),
        manualDiscount: (data.discountValue > 0 && data.discountType !== "coupon") ? { type: data.discountType as "fixed" | "percentage", value: data.discountValue } : null,
        coupon: couponPricingData,
        promotions: filteredPromotions,
    })

    const giftIds = updatePricingResult.appliedGiftProductIds || []
    const giftItems = await buildGiftOrderItems(supabase, giftIds, filteredPromotions)

    const nextItemsForDelta = [
        ...sanitizedItems,
        ...giftItems.map((item) => ({
            productId: item.product_id,
            variantId: item.variant_id,
            customName: item.product_name,
            quantity: item.quantity,
        })),
    ]

    const delta = buildInventoryMovementDelta(currentOrder.order_items || [], nextItemsForDelta)
    const stockItemsToValidate = currentOrder.inventory_deducted
        ? delta.outgoing.map((item) => ({
            productId: item.product_id,
            variantId: item.variant_id || null,
            quantity: item.quantity,
        }))
        : nextItemsForDelta
    const stockValidationError = await validateERPItemsStock({
        supabase,
        partnerId: data.partnerId,
        items: stockItemsToValidate,
    })
    if (stockValidationError) return { error: stockValidationError }
    const sanitizedPaymentBreakdown = sanitizePaymentBreakdown(data.paymentBreakdown)
    const { data: financeAccount } = data.financeAccountId ? await supabase
        .from("finance_accounts")
        .select("id")
        .eq("id", data.financeAccountId)
        .eq("partner_id", data.partnerId)
        .limit(1)
        .maybeSingle() : { data: null }
    if (data.financeAccountId && !financeAccount?.id) {
        return { error: "Conta de recebimento inválida para esta venda." }
    }

    if (Number(data.totalAmount || 0) <= 0) {
        return { error: "A venda não pode ser salva com valor total zerado." }
    }

    // Reuse the already declared deliveryAddressStr variable
    if (data.deliveryMethod === "delivery" && data.address?.street && data.address.number) {
        const { street, number, neighborhood, city, state, zipCode, complement } = data.address
        deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
    }
    const preparationEstimate = await resolveOrderPreparationEstimate({
        supabase,
        partnerId: data.partnerId,
        items: sanitizedItems,
        deliveryMethod: data.deliveryMethod,
    })

    const changeLines = buildOrderChangeLines(currentOrder, { ...data, items: sanitizedItems })
    if (changeLines.length === 0) {
        return { success: true, noChanges: true }
    }



    couponDiscountAmount = updatePricingResult.couponDiscountAmount
    let updateServerTotal = updatePricingResult.finalTotal
    const updateBreakdownTotal = sanitizedPaymentBreakdown.reduce((s, e) => s + e.amount, 0)
    const hasUpdateBreakdown = sanitizedPaymentBreakdown.length > 0
    const updateFinalTotal = hasUpdateBreakdown ? updateBreakdownTotal : updateServerTotal
    const updatePaymentMethodDiscountAmount = Math.max(0, updateServerTotal - updateFinalTotal)
    const updatePaymentMethodExtraAmount = Math.max(0, updateFinalTotal - updateServerTotal)
    updateServerTotal = updateFinalTotal
    const adjustedPaymentBreakdown = sanitizedPaymentBreakdown
    const paymentMethodSummary = buildPaymentMethodSummary(adjustedPaymentBreakdown, data.paymentMethod)
    const paymentState = resolvePaymentState({
        requestedStatus: data.paymentStatus,
        totalAmount: updateServerTotal,
        paidAmount: data.paidAmount,
        fallbackPaidAmount: Number(currentOrder.paid_amount || 0),
    })
    const updateServerShipping = updatePricingResult.shipping

    const orderUpdatePayload: Record<string, unknown> = {
        buyer_id: data.customerId || null,
        customer_name: data.customerName || null,
        order_source: buildOrderSource(data.salesChannel, data.deliveryMethod),
        delivery_type: data.deliveryMethod,
        situation: paymentState.situation,
        delivery_status: data.deliveryStatus,
        total_amount: updateServerTotal,
        paid_amount: paymentState.paidAmount,
        discount_value: data.discountValue,
        discount_type: data.discountType,
        coupon_id: couponIdToSave,
        discount_amount: couponDiscountAmount,
        payment_method_discount_amount: updatePaymentMethodDiscountAmount,
        payment_method_extra_amount: updatePaymentMethodExtraAmount,
        delivery_fee: updateServerShipping,
        additional_costs: data.additionalCosts,
        notes: data.notes || null,
        payment_method: paymentMethodSummary,
        payment_breakdown: adjustedPaymentBreakdown,
        finance_account_id: data.financeAccountId,
        payment_provider: data.paymentProvider !== undefined ? data.paymentProvider : ((currentOrder as any).payment_provider || null),
        mp_payment_id: data.mpPaymentId !== undefined ? data.mpPaymentId : ((currentOrder as any).mp_payment_id || null),
        ...(deliveryAddressStr ? { delivery_address: deliveryAddressStr } : {}),
        ...(preparationEstimate || {}),
    }

    let orderUpdateResult = await supabase
        .from("orders")
        .update(orderUpdatePayload)
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)

    if (orderUpdateResult.error && isMissingOrdersPaymentMethodDeltaColumnsError(orderUpdateResult.error)) {
        const fallbackUpdatePayload = { ...orderUpdatePayload }
        delete (fallbackUpdatePayload as any).payment_method_discount_amount
        delete (fallbackUpdatePayload as any).payment_method_extra_amount
        orderUpdateResult = await supabase
            .from("orders")
            .update(fallbackUpdatePayload)
            .eq("id", orderId)
            .eq("partner_id", data.partnerId)
    }

    const orderError = orderUpdateResult.error
    if (orderError) return { error: orderError.message }

    if (paymentState.paidAmount > (currentOrder.paid_amount || 0) + 0.009) {
        await createFinancialTransactionsForReceivedAmount(supabase, {
            orderId: orderId,
            orderNumber: currentOrder.order_number || orderId,
            partnerId: data.partnerId,
            totalAmount: Number(updateServerTotal || 0),
            newBreakdown: adjustedPaymentBreakdown,
            oldBreakdown: currentOrder.payment_breakdown || [],
            customerId: data.customerId || null,
            customerName: data.customerName || null,
            financeAccountId: data.financeAccountId,
            orderSource: currentOrder.order_source || "manual",
        })
    }

    if (currentOrder.situation !== "paid" && paymentState.situation === "paid") {
        await fulfillMarketplaceOrderIfNeeded(supabase, orderId)
        await createSellerCommissionForPaidOrder({
            supabase,
            partnerId: data.partnerId,
            orderId,
            sellerUserId: currentOrder.created_by || null,
            saleAmount: Number(updateServerTotal || 0),
            accountId: data.financeAccountId,
            createdByUserId: user.id,
        })
    }

    // Sync payment status to linked appointments
    if (paymentState.situation === "paid" || paymentState.situation === "partially_paid" || paymentState.situation === "pending") {
        await supabase
            .from("appointments")
            .update({ payment_status: paymentState.situation })
            .eq("marketplace_order_id", orderId)
            .eq("partner_id", data.partnerId)
    }

    await supabase.from("order_items").delete().eq("order_id", orderId)

    const giftItemsToInsert = giftItems.map((item, idx) => ({
        order_id: orderId,
        product_id: item.product_id,
        variant_id: null,
        product_name: item.product_name,
        product_price: 0,
        quantity: 1,
        subtotal: 0,
        sort_order: sanitizedItems.length + idx + 1,
        is_gift: true,
        original_price: item.original_price,
        is_promotional: true,
        promotion_id: item.promotion_id,
    }))
    const itemsToInsert = [
        ...sanitizedItems.map(item => ({
            order_id: orderId,
            product_id: item.productId,
            variant_id: item.variantId || null,
            product_name: item.customName || "Item manual",
            product_price: item.unitPrice,
            quantity: item.quantity,
            subtotal: item.unitPrice * item.quantity,
            sort_order: item.sortOrder,
            is_gift: false,
            original_price: null,
            is_promotional: false,
            promotion_id: null,
        })),
        ...giftItemsToInsert
    ]

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
    if (itemsError) return { error: itemsError.message }

    const stockItems = [
        ...sanitizedItems
            .filter(item => item.productId)
            .map((item) => ({
                product_id: item.productId,
                variant_id: item.variantId || null,
                quantity: item.quantity,
            })),
        ...giftItems
            .filter(item => item.product_id)
            .map((item) => ({
                product_id: item.product_id,
                variant_id: null,
                quantity: 1,
            }))
    ]

    if (currentOrder.inventory_deducted) {
        if (delta.incoming.length > 0) {
            const movementResult = await createOrderStockMovement({
                supabase,
                partnerId: data.partnerId,
                orderId,
                createdBy: user.id,
                type: "in",
                reason: "Edicao de pedido",
                notes: data.notes?.trim() || undefined,
                items: delta.incoming,
            })

            if ("error" in movementResult) return { error: movementResult.error }
        }

        if (delta.outgoing.length > 0) {
            const movementResult = await createOrderStockMovement({
                supabase,
                partnerId: data.partnerId,
                orderId,
                createdBy: user.id,
                type: "out",
                reason: "Edicao de pedido",
                notes: data.notes?.trim() || undefined,
                items: delta.outgoing,
            })

            if ("error" in movementResult) return { error: movementResult.error }
        }
    } else {
        if (delta.incoming.length > 0) {
            const releaseResult = await releaseOrderInventory({
                client: supabase,
                partnerId: data.partnerId,
                orderId,
                items: delta.incoming,
            })

            if ("error" in releaseResult) return { error: releaseResult.error }
        }

        if (delta.outgoing.length > 0) {
            const reserveResult = await reserveOrderInventory({
                client: supabase,
                partnerId: data.partnerId,
                orderId,
                items: delta.outgoing,
            })

            if ("error" in reserveResult) return { error: reserveResult.error }
        }

        if (delta.incoming.length === 0 && delta.outgoing.length === 0 && stockItems.length > 0) {
            const reserveResult = await reserveOrderInventory({
                client: supabase,
                partnerId: data.partnerId,
                orderId,
                items: stockItems,
            })

            if ("error" in reserveResult) return { error: reserveResult.error }
        }

        if (shouldDeductInventory(data.deliveryStatus)) {
            const finalizeResult = await finalizeOrderInventory({
                client: supabase,
                partnerId: data.partnerId,
                orderId,
                createdBy: user.id,
                reason: "Venda de Produtos",
                notes: data.notes?.trim() || undefined,
                items: stockItems,
            })

            if ("error" in finalizeResult) return { error: finalizeResult.error }

            await supabase
                .from("orders")
                .update({ inventory_deducted: true })
                .eq("id", orderId)
                .eq("partner_id", data.partnerId)
        }
    }

    await logAuditEvent({
        partnerId: data.partnerId,
        actorUserId: user.id,
        entityType: "order",
        entityId: orderId,
        actionType: "updated",
        changeLines: changeLines,
        metadata: {
            ...(currentOrder.situation !== paymentState.situation
                ? {
                    oldStatus: getPaymentStatusLabel(currentOrder.situation),
                    newStatus: getPaymentStatusLabel(paymentState.situation),
                    statusScope: "payment",
                }
                : currentOrder.delivery_status !== data.deliveryStatus
                    ? {
                        oldStatus: getDeliveryStatusLabel(currentOrder.delivery_status),
                        newStatus: getDeliveryStatusLabel(data.deliveryStatus),
                        statusScope: "delivery",
                    }
                    : {}),
        },
        source: "manual",
    })

    const skippedGifts = filteredPromotions.filter(
        (p) => p.giftUnavailable && updatePricingResult.appliedPromotionIds.includes(p.id)
    )
    for (const promo of skippedGifts) {
        await logAuditEvent({
            partnerId: data.partnerId,
            actorUserId: user.id,
            entityType: "order",
            entityId: orderId,
            actionType: "updated",
            changeLines: [`Brinde da campanha "${promo.name}" temporariamente indisponível (sem estoque).`],
            source: "manual",
        })
    }

    await invalidateInventoryItems(data.partnerId, stockItems)
    await revalidateOrders(data.partnerId)

    const notifyOrder = { ...currentOrder, partner_id: data.partnerId, id: orderId }
    const notifySituation =
        paymentState.situation !== currentOrder.situation ? paymentState.situation : undefined
    const notifyDelivery =
        data.deliveryStatus !== currentOrder.delivery_status ? data.deliveryStatus : undefined

    import("@/lib/services/whatsapp-automation.service")
        .then(({ onOrderStatusChanged }) =>
            onOrderStatusChanged(notifyOrder, notifySituation, notifyDelivery),
        )
        .catch(console.error)

    import("@/lib/services/notification-automation.service")
        .then(({ onOrderStatusChanged }) =>
            onOrderStatusChanged(notifyOrder, notifySituation, notifyDelivery, "manual"),
        )
        .catch(console.error)

    return { success: true }
}

export async function deleteOrdersInBatchAction(orderIds: string[], partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    await requirePermission(partnerId, "orders", "delete")
    const supabase = createAdminClient()

    await supabase.from("order_items").delete().in("order_id", orderIds)

    const { error } = await supabase.from("orders").delete().in("id", orderIds).eq("partner_id", partnerId)

    if (error) return { error: error.message }

    await revalidateOrders(partnerId)
    return { success: true }
}

export async function updateOrderNotesAction(input: {
    orderId: string
    partnerId: string
    notes: string
}) {
    const user = await requireUser()
    if (!user) return { success: false as const, error: "Não autenticado" }

    await requirePermission(input.partnerId, "orders", "edit")
    const supabase = createAdminClient()

    const { data: currentOrder, error: currentOrderError } = await supabase
        .from("orders")
        .select("id, notes")
        .eq("id", input.orderId)
        .eq("partner_id", input.partnerId)
        .maybeSingle()

    if (currentOrderError || !currentOrder?.id) {
        return { success: false as const, error: currentOrderError?.message || "Pedido nÃ£o encontrado." }
    }

    const cleanNotes = String(input.notes || "").trim()
    const cancelNote = (String(currentOrder.notes || "").match(/Pedido cancelado por:[\s\S]*$/)?.[0] || "").trim()
    const nextNotes = [cleanNotes, cancelNote].filter(Boolean).join("\n").trim() || null

    const { error: updateError } = await supabase
        .from("orders")
        .update({ notes: nextNotes })
        .eq("id", input.orderId)
        .eq("partner_id", input.partnerId)

    if (updateError) {
        console.error("[orders_notes] failed_to_update_order_notes", {
            orderId: input.orderId,
            partnerId: input.partnerId,
            error: updateError,
        })
        return { success: false as const, error: updateError.message }
    }

    try {
        await logAuditEvent({
            partnerId: input.partnerId,
            actorUserId: user.id,
            entityType: "order",
            entityId: input.orderId,
            actionType: "updated",
            changeLines: ["alterou as observações do pedido."],
            source: "manual",
        })
    } catch (historyError) {
        console.error("[orders_notes] audit_log_failed", historyError)
    }

    await revalidateOrders(input.partnerId)
    return { success: true as const }
}

export async function updateOrdersStatusInBatchAction(payload: {
    orderIds: string[]
    partnerId: string
    actionType: 'payment_status' | 'delivery_status' | 'cancel'
    statusValue?: string
    cancelReason?: string
    restoreStock?: boolean
    generateAutomaticRefund?: boolean
    userName?: string
    changeReason?: string
    paidAmount?: number
    paymentBreakdown?: any[]
    mpPaymentId?: string
}) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    const runtimeActionType = String((payload as { actionType?: string }).actionType || "")
    if (!["payment_status", "delivery_status", "cancel"].includes(runtimeActionType)) {
        return { error: "Ação inválida para pedidos." }
    }

    await requirePermission(
        payload.partnerId,
        "orders",
        payload.actionType === "cancel" ? "cancel" : "edit"
    )
    const supabase = createAdminClient()

    const { data: currentOrders } = await supabase
        .from("orders")
        .select("id, order_number, situation, delivery_status, notes, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, finance_account_id, buyer_id, customer_name, customer_id, previous_situation_before_cancel, stock_restored_on_cancel, inventory_deducted, created_by, order_items(product_id, variant_id, quantity)")
        .in("id", payload.orderIds)
        .eq("partner_id", payload.partnerId)
    const overallWarnings: string[] = []
    if (!currentOrders || currentOrders.length === 0) {
        return { error: "Nenhum pedido válido foi encontrado para processar." }
    }

    if (payload.actionType === "cancel") {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .single()

        const effectiveUserName = profile?.full_name || payload.userName || "Usuario"
        const processingWarnings: string[] = []
        let processedCount = 0

        // P2: Pré-carrega o mapa user_id -> partner_user_id de TODOS os vendedores
        // dos pedidos em UMA única query, evitando N+1 (1 SELECT por pedido no loop).
        const sellerPartnerUserIdMap = new Map<string, string>()
        const creatorUserIds = Array.from(
            new Set(
                (currentOrders || [])
                    .map((o: any) => o.created_by)
                    .filter((id: any): id is string => Boolean(id)),
            ),
        )
        if (creatorUserIds.length > 0) {
            const { data: partnerUsersRows } = await supabase
                .from("partner_users")
                .select("id, user_id")
                .eq("partner_id", payload.partnerId)
                .in("user_id", creatorUserIds)
            for (const row of partnerUsersRows || []) {
                if (row.user_id && row.id) {
                    sellerPartnerUserIdMap.set(String(row.user_id), String(row.id))
                }
            }
        }

        for (const order of currentOrders || []) {
            if (payload.actionType === "cancel") {
                if (order.situation === "cancelled") continue

                const nextNotes = buildCancelledOrderNotes({
                    currentNotes: order.notes,
                    userName: effectiveUserName,
                    timestamp: formatDateTime(new Date()),
                    reason: payload.cancelReason?.trim(),
                })

                const shouldRestoreStockWithMovement = Boolean(
                    payload.restoreStock && (
                        order.inventory_deducted ||
                        shouldDeductInventory(order.delivery_status || null)
                    )
                )
                const stockWasRestoredOnCancel = shouldRestoreStockWithMovement
                const { error } = await supabase
                    .from("orders")
                    .update({
                        situation: "cancelled",
                        previous_situation_before_cancel: order.situation || "pending",
                        stock_restored_on_cancel: stockWasRestoredOnCancel,
                        notes: nextNotes || null,
                    })
                    .eq("id", order.id)
                    .eq("partner_id", payload.partnerId)

                if (error) {
                    processingWarnings.push(`Pedido ${order.order_number || order.id}: falha ao cancelar (${error.message})`)
                    continue
                }
                processedCount += 1
                await syncCancelledOrderAppointmentsAndTransactions(supabase, order.id)

                if (stockWasRestoredOnCancel) {
                    const restoreResult = await createOrderStockMovement({
                        supabase,
                        partnerId: payload.partnerId,
                        orderId: order.id,
                        createdBy: user.id,
                        type: "in",
                        reason: "Cancelamento de pedido",
                        notes: nextNotes || undefined,
                        items: order.order_items || [],
                    })

                    if ("error" in restoreResult) {
                        console.error("[orders_cancel_stock] failed_to_restore_stock_movement", { orderId: order.id, orderNumber: order.order_number, partnerId: payload.partnerId, restoreStock: payload.restoreStock, inventoryDeducted: order.inventory_deducted, deliveryStatus: order.delivery_status, error: restoreResult.error })
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: cancelado, mas não foi possível restaurar estoque (${restoreResult.error})`)
                    }
                } else if (!order.inventory_deducted) {
                    const releaseResult = await releaseOrderInventory({
                        client: supabase,
                        partnerId: payload.partnerId,
                        orderId: order.id,
                        items: order.order_items || [],
                    })

                    if ("error" in releaseResult) {
                        console.error("[orders_cancel_stock] failed_to_release_stock_reservation", { orderId: order.id, orderNumber: order.order_number, partnerId: payload.partnerId, error: releaseResult.error })
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: cancelado, mas não foi possível liberar reserva de estoque (${releaseResult.error})`)
                    }
                }

                if (payload.generateAutomaticRefund) {
                    const refundAmount = Math.max(0, Number(order.paid_amount || 0))
                    if (refundAmount > 0.009) {
                        const refundResult = await createRefundTransactionForCancelledOrderSafe({
                            supabase,
                            partnerId: payload.partnerId,
                            orderNumber: order.order_number || order.id,
                            orderId: order.id,
                            customerId: order.customer_id || order.buyer_id || null,
                            customerName: order.customer_name || null,
                            paidAmount: refundAmount,
                            financeAccountId: order.finance_account_id || null,
                            createdByUserId: user.id,
                        })

                        if ("error" in refundResult) {
                            console.error("[orders_cancel_refund] failed_to_generate_automatic_refund", { orderId: order.id, orderNumber: order.order_number, partnerId: payload.partnerId, refundAmount, financeAccountId: order.finance_account_id || null, error: refundResult.error })
                            processingWarnings.push(`Pedido ${order.order_number || order.id}: cancelado, mas não foi possível gerar reembolso (${refundResult.error})`)
                        }
                    }
                }

                const sellerPartnerUserId = order.created_by
                    ? sellerPartnerUserIdMap.get(String(order.created_by)) ?? null
                    : null
                if (sellerPartnerUserId) {
                    await reverseCommissionForEntity({
                        supabase,
                        partnerId: payload.partnerId,
                        entityType: "sale",
                        entityId: order.id,
                        partnerUserId: sellerPartnerUserId,
                        accountId: order.finance_account_id || null,
                        createdByUserId: user.id,
                    })
                }

                if (order.created_by) {
                    await reverseSaleFromGoals({
                        supabase,
                        partnerId: payload.partnerId,
                        sellerUserId: String(order.created_by),
                        saleAmount: Number(order.total_amount || 0),
                        createdByUserId: user.id,
                        accountId: order.finance_account_id || null,
                    })
                }
            }

            if (false) {
                if (order.situation !== "cancelled") continue

                const restoredSituation = order.previous_situation_before_cancel || "pending"
                const shouldReverseStock = Boolean(order.stock_restored_on_cancel)
                const orderItems = (order.order_items || []) as OrderStockItem[]

                if (shouldReverseStock) {
                    const stockValidationError = await validateERPItemsStock({
                        supabase,
                        partnerId: payload.partnerId,
                        items: orderItems.map((item) => ({
                            productId: item.product_id || null,
                            variantId: item.variant_id || null,
                            quantity: Number(item.quantity || 0),
                        })),
                    })

                    if (stockValidationError) {
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: não foi possível reabrir por estoque insuficiente`)
                        continue
                    }
                }

                const { error } = await supabase
                    .from("orders")
                    .update({
                        situation: restoredSituation,
                        previous_situation_before_cancel: null,
                        stock_restored_on_cancel: false,
                        notes: normalizeOrderNotes(order.notes) || null,
                    })
                    .eq("id", order.id)
                    .eq("partner_id", payload.partnerId)

                if (error) {
                    processingWarnings.push(`Pedido ${order.order_number || order.id}: falha ao reabrir (${error.message})`)
                    continue
                }
                processedCount += 1

                if (shouldReverseStock) {
                    const movementResult = await createOrderStockMovement({
                        supabase,
                        partnerId: payload.partnerId,
                        orderId: order.id,
                        createdBy: user.id,
                        type: "out",
                        reason: "Reabertura de pedido",
                        items: order.order_items || [],
                    })

                    if ("error" in movementResult) {
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: reaberto, mas não foi possível remover itens novamente do estoque (${movementResult.error})`)
                    }
                } else if (!order.inventory_deducted) {
                    const reserveResult = await reserveOrderInventory({
                        client: supabase,
                        partnerId: payload.partnerId,
                        orderId: order.id,
                        items: order.order_items || [],
                    })

                    if ("error" in reserveResult) {
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: reaberto, mas não foi possível reservar estoque (${reserveResult.error})`)
                    }
                }
            }
        }

        try {
            await Promise.all(
                (currentOrders || []).map((order: { id: string; situation: string | null; previous_situation_before_cancel?: string | null; stock_restored_on_cancel?: boolean | null; inventory_deducted?: boolean | null }) => {
                    const lines: string[] = []

                    if (payload.actionType === "cancel") {
                        lines.push("cancelou o pedido")
                        if (payload.cancelReason?.trim()) {
                            lines.push(`informou motivo do cancelamento: ${payload.cancelReason.trim()}`)
                        }
                        if (payload.restoreStock && order.inventory_deducted) {
                            lines.push("restaurou o estoque dos itens do pedido")
                        } else if (!order.stock_restored_on_cancel) {
                            lines.push("liberou a reserva de estoque dos itens do pedido")
                        }
                        if (payload.generateAutomaticRefund && Number((order as any).paid_amount || 0) > 0.009) {
                            lines.push("gerou reembolso automático no financeiro")
                        }
                    }

                    if (false) {
                        lines.push(`reabriu o pedido e restaurou o status para ${getPaymentStatusLabel(order.previous_situation_before_cancel || "pending")}`)
                        if (order.stock_restored_on_cancel) {
                            lines.push("removeu novamente os itens do estoque")
                        } else {
                            lines.push("reservou novamente o estoque dos itens do pedido")
                        }
                    }

                    return logAuditEvent({
                        partnerId: payload.partnerId,
                        actorUserId: user.id,
                        entityType: "order",
                        entityId: order.id,
                        actionType: payload.actionType,
                        changeLines: lines,
                        metadata: {
                            oldStatus: getPaymentStatusLabel(order.situation),
                            newStatus: "Cancelado",
                            statusScope: "payment",
                        },
                        source: "manual",
                    })
                })
            )
        } catch (historyError) {
            console.error("[orders_history] updateOrdersStatusInBatchAction:", historyError)
        }

        await invalidateInventoryItems(
            payload.partnerId,
            (currentOrders || []).flatMap((order: any) => order.order_items || [])
        )
        await revalidateOrders(payload.partnerId)
        if (processedCount === 0) {
            return { error: payload.actionType === "cancel" ? "Nenhum pedido foi cancelado." : "Nenhum pedido foi reaberto." }
        }
        if (processingWarnings.length > 0) {
            return { success: true, warning: processingWarnings.join(" | ") }
        }
        return { success: true }
    }

    const paymentStatusMap: Record<string, ERPOrderPayload["paymentStatus"]> = {
        pending: "unpaid",
        unpaid: "unpaid",
        paid: "paid",
        partially_paid: "partially_paid",
    }

    if (payload.actionType === "payment_status") {
        const requestedStatus = paymentStatusMap[payload.statusValue || ""]
        if (!requestedStatus) {
            return { error: "Status de pagamento invalido para atualizacao em massa." }
        }

        const paymentWarnings: string[] = []
        let paymentProcessedCount = 0
        for (const order of currentOrders || []) {
            if (order.situation === "cancelled") {
                paymentWarnings.push(`Pedido ${order.order_number || order.id}: está cancelado e não pode ter o pagamento alterado.`)
                continue
            }
            if (order.situation === "paid") {
                paymentWarnings.push(`Pedido ${order.order_number || order.id}: já está pago e não pode ter o pagamento alterado.`)
                continue
            }
            const paymentState = resolvePaymentState({
                requestedStatus,
                totalAmount: Number(order.total_amount || 0),
                paidAmount: payload.paidAmount !== undefined ? payload.paidAmount : undefined,
                fallbackPaidAmount:
                    requestedStatus === "paid"
                        ? Number(order.total_amount || 0)
                        : requestedStatus === "partially_paid"
                            ? Number(order.paid_amount || 0)
                            : 0,
            })

            const { error } = await supabase
                .from("orders")
                .update({
                    situation: paymentState.situation,
                    paid_amount: paymentState.paidAmount,
                    ...(payload.paymentBreakdown ? { payment_breakdown: payload.paymentBreakdown } : {}),
                    ...(payload.mpPaymentId ? { mp_payment_id: payload.mpPaymentId } : {}),
                })
                .eq("id", order.id)
                .eq("partner_id", payload.partnerId)

            if (error) return { error: error.message }
            paymentProcessedCount += 1

            if (paymentState.paidAmount > (order.paid_amount || 0) + 0.009) {
                const oldBreakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []
                const newBreakdown = payload.paymentBreakdown || (
                    paymentState.situation === "paid"
                        ? [{ method: order.payment_method || "Dinheiro", amount: order.total_amount, amountReceived: order.total_amount }]
                        : [{ method: order.payment_method || "Dinheiro", amount: order.total_amount, amountReceived: paymentState.paidAmount }]
                )
                await createFinancialTransactionsForReceivedAmount(supabase, {
                    orderId: order.id,
                    orderNumber: order.order_number || order.id,
                    partnerId: payload.partnerId,
                    totalAmount: Number(order.total_amount || 0),
                    newBreakdown,
                    oldBreakdown,
                    customerId: order.customer_id || order.buyer_id || null,
                    customerName: order.customer_name || null,
                    financeAccountId: order.finance_account_id || null,
                    orderSource: order.order_source || "manual",
                })
            }

            if (order.situation !== "paid" && paymentState.situation === "paid") {
                await fulfillMarketplaceOrderIfNeeded(supabase, order.id)
                await createSellerCommissionForPaidOrder({
                    supabase,
                    partnerId: payload.partnerId,
                    orderId: order.id,
                    sellerUserId: order.created_by || null,
                    saleAmount: Number(order.total_amount || 0),
                    accountId: order.finance_account_id || null,
                    createdByUserId: user.id,
                })
            }
        }
        if (paymentProcessedCount === 0) {
            return { error: "Nenhum pedido elegível para alteração de pagamento." }
        }
        overallWarnings.push(...paymentWarnings)
    }

    if (payload.actionType === "delivery_status") {
        const allowedDeliveryStatuses = new Set([
            "not_sent",
            "preparing",
            "sent",
            "delivered",
            "pickup_available",
            "delivery_failed",
        ])

        if (!payload.statusValue || !allowedDeliveryStatuses.has(payload.statusValue)) {
            return { error: "Status de envio invalido para atualizacao em massa." }
        }

        const deliveryWarnings: string[] = []
        let deliveryProcessedCount = 0

        // P4: separa os pedidos elegíveis em dois grupos para evitar N UPDATEs sequenciais:
        // - finalizeOrders: precisam finalizar o estoque antes do update (efeito colateral, loop individual)
        // - simpleOrders: apenas mudança de status idêntica -> um único UPDATE em massa via .in()
        const eligibleDeliveryOrders: any[] = []
        for (const order of currentOrders || []) {
            if (order.situation === "cancelled") {
                deliveryWarnings.push(`Pedido ${order.order_number || order.id}: está cancelado e não pode ter o status de entrega alterado.`)
                continue
            }
            if (order.delivery_status === "delivered") {
                deliveryWarnings.push(`Pedido ${order.order_number || order.id}: já está entregue e não pode ter o status de entrega alterado.`)
                continue
            }
            eligibleDeliveryOrders.push(order)
        }

        const finalizeDeliveryOrders = eligibleDeliveryOrders.filter(
            (order) => !order.inventory_deducted && shouldDeductInventory(payload.statusValue),
        )
        const simpleDeliveryOrders = eligibleDeliveryOrders.filter(
            (order) => !(!order.inventory_deducted && shouldDeductInventory(payload.statusValue)),
        )

        // Pedidos com efeito colateral: finaliza estoque e atualiza individualmente (marca inventory_deducted).
        for (const order of finalizeDeliveryOrders) {
            const finalizeResult = await finalizeOrderInventory({
                client: supabase,
                partnerId: payload.partnerId,
                orderId: order.id,
                createdBy: user.id,
                reason: "Venda de Produtos",
                notes: normalizeOrderNotes(order.notes) || undefined,
                items: order.order_items || [],
            })

            if ("error" in finalizeResult) return { error: finalizeResult.error }

            const { error } = await supabase
                .from("orders")
                .update({
                    delivery_status: payload.statusValue,
                    inventory_deducted: true,
                })
                .eq("id", order.id)
                .eq("partner_id", payload.partnerId)

            if (error) return { error: error.message }
            deliveryProcessedCount += 1
        }

        // Pedidos simples (mesmo valor de status, sem efeito colateral): um único UPDATE em massa.
        if (simpleDeliveryOrders.length > 0) {
            const { error } = await supabase
                .from("orders")
                .update({ delivery_status: payload.statusValue })
                .in("id", simpleDeliveryOrders.map((order) => order.id))
                .eq("partner_id", payload.partnerId)

            if (error) return { error: error.message }
            deliveryProcessedCount += simpleDeliveryOrders.length
        }

        if (deliveryProcessedCount === 0) {
            return { error: "Nenhum pedido elegível para alteração de entrega." }
        }
        overallWarnings.push(...deliveryWarnings)
    }

    try {
        await Promise.all(
            (currentOrders || []).map((order: { id: string; situation: string | null; delivery_status: string | null; total_amount?: number | null; paid_amount?: number | null }) => {
                const lines: string[] = []

                if (payload.actionType === "payment_status") {
                    if (order.situation === "cancelled") return Promise.resolve()
                    const requestedStatus = paymentStatusMap[payload.statusValue || ""]

                    if (requestedStatus) {
                        const nextPaymentState = resolvePaymentState({
                            requestedStatus,
                            totalAmount: Number(order.total_amount || 0),
                            paidAmount: payload.paidAmount !== undefined ? payload.paidAmount : undefined,
                            fallbackPaidAmount:
                                requestedStatus === "paid"
                                    ? Number(order.total_amount || 0)
                                    : requestedStatus === "partially_paid"
                                        ? Number(order.paid_amount || 0)
                                        : 0,
                        })

                        if (order.situation !== nextPaymentState.situation) {
                            let line = `alterou status de pagamento: ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(nextPaymentState.situation)}`
                            if (payload.paidAmount !== undefined) {
                                line += ` (Valor pago informado: ${formatCurrency(payload.paidAmount)})`
                            }
                            lines.push(line)
                        }
                    }
                }

                if (payload.actionType === "delivery_status" && payload.statusValue && order.delivery_status !== payload.statusValue) {
                    if (order.situation === "cancelled") return Promise.resolve()
                    let line = `alterou status de entrega: ${getDeliveryStatusLabel(order.delivery_status)} -> ${getDeliveryStatusLabel(payload.statusValue)}`
                    if (payload.changeReason?.trim()) {
                        line += ` (Motivo da alteração: ${payload.changeReason.trim()})`
                    }
                    lines.push(line)
                }

                if (lines.length === 0) return Promise.resolve()

                const metadata =
                    payload.actionType === "payment_status" && lines.length > 0
                        ? (() => {
                            const requestedStatus = paymentStatusMap[payload.statusValue || ""]
                            if (!requestedStatus) return null
                            const nextPaymentState = resolvePaymentState({
                                requestedStatus,
                                totalAmount: Number(order.total_amount || 0),
                                paidAmount: payload.paidAmount !== undefined ? payload.paidAmount : undefined,
                                fallbackPaidAmount:
                                    requestedStatus === "paid"
                                        ? Number(order.total_amount || 0)
                                        : requestedStatus === "partially_paid"
                                            ? Number(order.paid_amount || 0)
                                            : 0,
                            })
                            return {
                                oldStatus: getPaymentStatusLabel(order.situation),
                                newStatus: getPaymentStatusLabel(nextPaymentState.situation),
                                statusScope: "payment",
                            }
                        })()
                        : payload.actionType === "delivery_status" && payload.statusValue
                            ? {
                                oldStatus: getDeliveryStatusLabel(order.delivery_status),
                                newStatus: getDeliveryStatusLabel(payload.statusValue),
                                statusScope: "delivery",
                            }
                            : null

                return logAuditEvent({
                    partnerId: payload.partnerId,
                    actorUserId: user.id,
                    entityType: "order",
                    entityId: order.id,
                    actionType: payload.actionType,
                    changeLines: lines,
                    metadata,
                    source: "manual",
                })
            })
        )
    } catch (historyError) {
        console.error("[orders_history] updateOrdersStatusInBatchAction:", historyError)
    }

    await invalidateInventoryItems(
        payload.partnerId,
        (currentOrders || []).flatMap((order: any) => order.order_items || [])
    )
    await revalidateOrders(payload.partnerId)

    const dispatchOrderStatusSideEffects = async () => {
        const [{ onOrderStatusChanged: onWhatsappOrder }, { onOrderStatusChanged: onNotifyOrder }] =
            await Promise.all([
                import("@/lib/services/whatsapp-automation.service"),
                import("@/lib/services/notification-automation.service"),
            ])

        for (const order of currentOrders || []) {
            const orderPayload = { ...order, partner_id: payload.partnerId }
            if (payload.actionType === "payment_status" && payload.statusValue) {
                const paymentStatusMap: Record<string, string> = {
                    paid: "paid",
                    pending: "pending",
                    partially_paid: "partially_paid",
                }
                const situation = paymentStatusMap[payload.statusValue] || payload.statusValue
                onWhatsappOrder(orderPayload, situation).catch(console.error)
                onNotifyOrder(orderPayload, situation, undefined, "manual").catch(console.error)
            }
            if (payload.actionType === "delivery_status" && payload.statusValue) {
                onWhatsappOrder(orderPayload, undefined, payload.statusValue).catch(console.error)
                onNotifyOrder(orderPayload, undefined, payload.statusValue, "manual").catch(console.error)
            }
        }
    }

    dispatchOrderStatusSideEffects().catch(console.error)

    if (overallWarnings.length > 0) {
        return { success: true, warning: overallWarnings.join(" | ") }
    }
    return { success: true }
}

export type ERPOrderListCursor = { createdAt: string; id: string }

function buildOrdersKeysetOrFilter(cursor: ERPOrderListCursor): string {
    const ts = cursor.createdAt
    const id = cursor.id
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_ORDERS_PAGE_SIZE = 100

export async function getERPOrdersPageAction(
    partnerId: string,
    options?: { cursor?: ERPOrderListCursor | null; limit?: number },
): Promise<
    | { success: true; items: any[]; nextCursor: ERPOrderListCursor | null; hasMore: boolean }
    | { success: false; error: string }
> {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }
        await requirePermission(partnerId, "orders", "view")

        const supabase = createAdminClient()
        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_ORDERS_PAGE_SIZE))))
        const fetchLimit = limit + 1

        const baseSelect = `
                id,
                order_number,
                mp_payment_id,
                customer_name,
                buyer_id,
                total_amount,
                paid_amount,
                situation,
                previous_situation_before_cancel,
                delivery_status,
                delivery_type,
                order_source,
                created_at,
                stores(name),
                return_requests!order_id(id, status, approved_resolution, desired_resolution, refund_amount),
                order_items(quantity, product_id, variant_id, service_id, line_type),
                payment_method,
                payment_breakdown
            `

        const selectWithPosSale = `
                ${baseSelect},
                is_pos_sale
            `

        const selectWithoutPosSale = baseSelect

        const buildQuery = (selectClause: string) => {
            let query = supabase
                .from("orders")
                .select(selectClause)
                .eq("partner_id", partnerId)

            if (cursor) {
                query = query.or(buildOrdersKeysetOrFilter(cursor))
            }

            return query
                .order("created_at", { ascending: false })
                .order("id", { ascending: false })
                .limit(fetchLimit)
        }

        // P5: usa o resultado da detecção em cache para escolher o select correto de
        // primeira, sem depender de tentativa-e-erro a cada request. Só faz o fallback
        // (e custa 2 queries) na primeira vez que a coluna ausente é detectada.
        let queryResult = await buildQuery(
            ordersHasPosSaleColumn === false ? selectWithoutPosSale : selectWithPosSale,
        )
        if (queryResult.error && isMissingOrdersIsPosSaleColumnError(queryResult.error)) {
            ordersHasPosSaleColumn = false
            queryResult = await buildQuery(selectWithoutPosSale)
        } else if (!queryResult.error && ordersHasPosSaleColumn === null) {
            ordersHasPosSaleColumn = true
        }

        const { data, error } = queryResult

        if (error) throw error

        const rows = data || []
        const hasMore = rows.length > limit
        const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => ({
            ...row,
            is_pos_sale: Boolean(row?.is_pos_sale),
            quantity: Number(row?.quantity || 0) || (Array.isArray(row?.order_items)
                ? row.order_items.reduce((sum: number, item: any) => sum + Number(item?.quantity || 0), 0)
                : 0),
            return_count: Array.isArray(row?.return_requests) ? row.return_requests.length : 0,
            is_refunded: Array.isArray(row?.return_requests) && row.return_requests.some((req: any) => {
                const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(req.status)
                const isRefundResolution = req.approved_resolution === "refund" || (!req.approved_resolution && req.desired_resolution === "refund")
                const hasRefundValue = Number(req.refund_amount || 0) > 0
                return isApprovedOrResolved && (isRefundResolution || hasRefundValue)
            }),
            refunded_amount: Array.isArray(row?.return_requests)
                ? row.return_requests.reduce((sum: number, req: any) => {
                    const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(req.status)
                    const isRefundResolution = req.approved_resolution === "refund" || (!req.approved_resolution && req.desired_resolution === "refund")
                    const hasRefundValue = Number(req.refund_amount || 0) > 0
                    if (isApprovedOrResolved && (isRefundResolution || hasRefundValue)) {
                        return sum + Number(req.refund_amount || 0)
                    }
                    return sum
                }, 0)
                : 0,
            // Backward-compatible field used by UI, with fallback when column doesn't exist in DB
            order_date: row?.order_date || row?.created_at || null,
        }))
        const last = items[items.length - 1]
        const nextCursor: ERPOrderListCursor | null =
            hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

        return { success: true, items, nextCursor, hasMore }
    } catch (e: any) {
        return { success: false, error: e?.message || "Erro ao carregar pedidos" }
    }
}

export async function confirmAppointmentOrderPaymentAction(payload: {
    orderId: string
    partnerId: string
    paymentStatus: "paid" | "partially_paid" | "unpaid"
    paidAmount: number
    paymentMethod: string
    paymentBreakdown?: Array<{
        method: string
        amount: number
        paymentMethodId?: string | null
        installmentNumber?: number
    }>
    paymentProvider?: string | null
    mpPaymentId?: string | null
    financeAccountId?: string | null
    notes?: string
    servicePrice?: number
    serviceName?: string
    serviceId?: string | null
    categoryId?: string | null
}) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }
        await requirePermission(payload.partnerId, "orders", "edit")

        const supabase = await getSupabaseServerClient()

        const { data: order, error: orderErr } = await supabase
            .from("orders")
            .select("*")
            .eq("id", payload.orderId)
            .eq("partner_id", payload.partnerId)
            .single()

        if (orderErr || !order) {
            throw new Error("Pedido não encontrado")
        }

        let orderPrice = Number(order.total_amount || 0)
        if (payload.servicePrice !== undefined) {
            orderPrice = Number(payload.servicePrice || 0)

            // Delete existing non-gift service items then recreate individual items
            await supabase
                .from("order_items")
                .delete()
                .eq("order_id", payload.orderId)
                .neq("is_gift", true)

            const svcNames = String(payload.serviceName || "Serviço").split(',').map((s: string) => s.trim()).filter(Boolean)
            const svcCount = svcNames.length
            const svcUnitPrice = svcCount > 1 ? Math.round((orderPrice / svcCount) * 100) / 100 : orderPrice
            const serviceItems = svcNames.map((name: string) => ({
                order_id: payload.orderId,
                product_id: null,
                variant_id: null,
                product_name: name,
                product_price: svcUnitPrice,
                quantity: 1,
                subtotal: svcUnitPrice,
                line_type: "service_booking",
                service_id: payload.serviceId || null,
                is_gift: false,
                original_price: null,
                is_promotional: false,
                promotion_id: null,
            }))
            await supabase.from("order_items").insert(serviceItems)
        }

        const breakdownTotal = (payload.paymentBreakdown || []).reduce((s, e) => s + Number(e.amount || 0), 0)
        const hasBreakdown = (payload.paymentBreakdown || []).length > 0
        const finalTotal = hasBreakdown ? breakdownTotal : orderPrice
        const paymentMethodDiscountAmount = Math.max(0, orderPrice - finalTotal)
        const paymentMethodExtraAmount = Math.max(0, finalTotal - orderPrice)
        const totalAmountToSave = finalTotal

        const paymentState = resolvePaymentState({
            requestedStatus: payload.paymentStatus,
            totalAmount: totalAmountToSave,
            paidAmount: payload.paidAmount,
            fallbackPaidAmount: Number(order.paid_amount || 0),
        })

        const nextSituation = paymentState.situation
        const nextPaidAmount = paymentState.paidAmount

        const updatePayload: any = {
            situation: nextSituation,
            paid_amount: nextPaidAmount,
            payment_method: payload.paymentMethod,
            payment_breakdown: payload.paymentBreakdown || null,
            payment_provider: payload.paymentProvider || null,
            mp_payment_id: payload.mpPaymentId || null,
            finance_account_id: payload.financeAccountId || null,
            total_amount: totalAmountToSave,
            payment_method_discount_amount: paymentMethodDiscountAmount,
            payment_method_extra_amount: paymentMethodExtraAmount,
        }

        if (payload.notes !== undefined) {
            updatePayload.notes = payload.notes
        }

        const { error: updateError } = await supabase
            .from("orders")
            .update(updatePayload)
            .eq("id", payload.orderId)
            .eq("partner_id", payload.partnerId)

        if (updateError) throw updateError

        const changeLines = [
            `confirmou pagamento via checkout: status ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(nextSituation)}`,
            `valor pago: ${formatCurrency(order.paid_amount || 0)} -> ${formatCurrency(nextPaidAmount)}`
        ]
        await logAuditEvent({
            partnerId: payload.partnerId,
            actorUserId: user.id,
            entityType: "order",
            entityId: payload.orderId,
            actionType: "updated",
            changeLines,
            metadata: { oldSituation: order.situation, newSituation: nextSituation, paidAmount: nextPaidAmount }
        })

        if (nextSituation === "paid") {
            await createFinancialTransactionsForPaidOrder(supabase, {
                orderNumber: order.order_number,
                partnerId: payload.partnerId,
                totalAmount: totalAmountToSave,
                paymentMethod: payload.paymentMethod,
                paymentProvider: payload.paymentProvider,
                paymentBreakdown: payload.paymentBreakdown,
                customerId: order.customer_id || order.buyer_id || null,
                customerName: order.customer_name,
                paymentDate: new Date().toISOString(),
                financeAccountId: payload.financeAccountId,
                orderSource: order.order_source || "manual",
            })

            await fulfillMarketplaceOrderIfNeeded(supabase, payload.orderId)

            await createSellerCommissionForPaidOrder({
                supabase,
                partnerId: payload.partnerId,
                orderId: payload.orderId,
                sellerUserId: order.created_by || user.id,
                saleAmount: totalAmountToSave,
                accountId: payload.financeAccountId,
                createdByUserId: user.id,
            })
        }


        const { data: linkedAppointment } = await supabase
            .from("appointments")
            .select("id, status")
            .eq("marketplace_order_id", payload.orderId)
            .eq("partner_id", payload.partnerId)
            .maybeSingle()

        if (linkedAppointment) {
            await supabase
                .from("appointments")
                .update({
                    payment_status: nextSituation === "paid" ? "paid" : "partially_paid",
                    paid_amount: nextPaidAmount,
                })
                .eq("id", linkedAppointment.id)
                .eq("partner_id", payload.partnerId)
        }

        await revalidateOrders(payload.partnerId)

        if (order.situation !== nextSituation) {
            const notifyOrder = { ...order, partner_id: payload.partnerId }
            import("@/lib/services/whatsapp-automation.service")
                .then(({ onOrderStatusChanged }) => onOrderStatusChanged(notifyOrder, nextSituation))
                .catch(console.error)
            import("@/lib/services/notification-automation.service")
                .then(({ onOrderStatusChanged }) => onOrderStatusChanged(notifyOrder, nextSituation, undefined, "manual"))
                .catch(console.error)
        }

        return { success: true, orderNumber: order.order_number }
    } catch (e: any) {
        return { success: false, error: e?.message || "Erro ao processar pagamento" }
    }
}

export async function getAppointmentOrderNumberAction(orderId: string, partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return null
        await requirePermission(partnerId, "orders", "view")
        const supabase = await getSupabaseServerClient()
        const { data } = await supabase
            .from("orders")
            .select("order_number")
            .eq("id", orderId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        return data?.order_number || null
    } catch {
        return null
    }
}

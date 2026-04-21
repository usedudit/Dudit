"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { formatDateTime } from "@/lib/utils/formatters"
import { formatCurrency } from "@/lib/utils"
import { requireUser, requirePartnerAccess } from "@/lib/auth/authorization"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { getDeliveryStatusLabel, getPaymentStatusLabel } from "@/lib/orders/status"
import { getOrderHistoryEntries } from "@/lib/services/order-history.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidateStockMovements } from "@/lib/utils/revalidation"
import {
    finalizeOrderInventory,
    releaseOrderInventory,
    reserveOrderInventory,
    shouldDeductInventory,
} from "@/lib/stock/reservations"

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
    discountType: 'fixed' | 'percentage'
    shippingCost: number
    additionalCosts: number
    totalAmount: number
    paidAmount?: number
    notes?: string
    paymentMethod: string
    paymentBreakdown?: Array<{
        method: string
        amount: number
    }>
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
}

type OrderStockItem = {
    product_id?: string | null
    variant_id?: string | null
    quantity: number
}

type PaymentBreakdownEntry = {
    method: string
    amount: number
}

function isMissingOrdersIsPosSaleColumnError(error: unknown): boolean {
    const message = String((error as any)?.message || "").toLowerCase()
    return message.includes("is_pos_sale") && message.includes("orders")
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
        if (paidAmount >= totalAmount - 0.009) {
            paidAmount = totalAmount
        } else if (paidAmount > 0.009) {
            situation = "partially_paid"
        } else {
            situation = "pending"
            paidAmount = 0
        }
    } else if (situation === "partially_paid") {
        if (paidAmount >= totalAmount - 0.009) {
            situation = "paid"
            paidAmount = totalAmount
        } else if (paidAmount <= 0.009) {
            situation = "pending"
            paidAmount = 0
        }
    } else {
        paidAmount = 0
    }

    return { situation, paidAmount }
}

function normalizePaymentMethodLabel(value?: string | null) {
    const normalized = String(value || "").trim().toLowerCase()
    if (!normalized) return ""
    if (normalized === "dinheiro") return "Dinheiro"
    if (normalized === "pix") return "Pix"
    if (normalized === "cartao" || normalized === "cartão") return "Cartão"
    if (normalized === "pendente") return "Pendente"
    return String(value || "").trim()
}

function sanitizePaymentBreakdown(entries: ERPOrderPayload["paymentBreakdown"]) {
    const normalizedEntries = (entries || [])
        .map((entry) => ({
            method: normalizePaymentMethodLabel(entry?.method),
            amount: Math.max(0, Number(entry?.amount || 0)),
        }))
        .filter((entry) => entry.method && entry.amount > 0.009)

    return normalizedEntries
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

    if (Math.abs(Number(currentOrder.shipping_cost || 0) - Number(payload.shippingCost || 0)) > 0.009) {
        lines.push(`alterou frete: ${formatCurrency(currentOrder.shipping_cost || 0)} -> ${formatCurrency(payload.shippingCost || 0)}`)
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

async function createFinancialTransactionsForPaidOrder(supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>, params: {
    orderNumber: string
    partnerId: string
    totalAmount: number
    paymentMethod?: string | null
    paymentProvider?: string | null
    paymentBreakdown?: Array<{ method: string; amount: number }> | null
    customerId?: string | null
    customerName?: string | null
    paymentDate?: string | null
    financeAccountId?: string | null
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
            customer_contact_id: params.customerId || null,
            customer_name: params.customerName || null,
            finance_account_id: params.financeAccountId || null,
        })
    } catch (error) {
        console.error("[orders_financial] createFinancialTransactionsForPaidOrder:", error)
    }
}

async function createRefundTransactionForCancelledOrder(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    orderNumber: string
    orderId: string
    customerId?: string | null
    paidAmount: number
    financeAccountId?: string | null
    createdByUserId?: string | null
}) {
    const paidAmount = Math.max(0, Number(params.paidAmount || 0))
    if (paidAmount <= 0.009) return { success: true as const }
    if (!params.financeAccountId) {
        return { error: "Não foi possível gerar o reembolso automático porque a venda não possui conta financeira vinculada." as const }
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

    const paymentDate = new Date().toISOString()
    const { error } = await params.supabase
        .from("transactions")
        .insert({
            partner_id: params.partnerId,
            description: `Reembolso automático da venda ${params.orderNumber}`,
            category: "Reembolso",
            customer_id: params.customerId || null,
            contact_id: null,
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
            origin: "order_cancel",
            refund_kind: "revenue_refund",
            reference_note: params.orderId,
            account_id: params.financeAccountId,
            created_by_user_id: params.createdByUserId || null,
        })

    if (error) return { error: error.message }
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

    if (error) return { error: error.message }

    const movementId = (movementRecord as any)?.id
    if (movementId) {
        await params.supabase
            .from("stock_movements")
            .update({
                order_id: params.orderId,
                reference_name: `Pedido: ${params.orderId}`,
            })
            .eq("id", movementId)
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

export async function createERPOrderAction(data: ERPOrderPayload) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)

    const user = await requireUser()
    if (!user) return { error: "NÃ£o autenticado" }

    const partnerId = data.partnerId
    await requirePartnerAccess(partnerId)

    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(data.csrf_token)
    if (!csrfValidation.valid) return { error: csrfValidation.error || "Token CSRF invÃ¡lido" }

    const limitCheck = await checkLimit(partnerId, "orders_per_month")
    if (!limitCheck.allowed) return { error: limitCheck.message || "Limite mensal atingido." }

    const supabase = await getSupabaseServerClient()
    const sanitizedItemsResult = sanitizeERPItems(data.items)
    if ("error" in sanitizedItemsResult) return { error: sanitizedItemsResult.error }
    const sanitizedItems = sanitizedItemsResult.items
    const stockValidationError = await validateERPItemsStock({
        supabase,
        partnerId,
        items: sanitizedItems,
    })
    if (stockValidationError) return { error: stockValidationError }
    const paymentState = resolvePaymentState({
        requestedStatus: data.paymentStatus,
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount,
    })
    const sanitizedPaymentBreakdown = sanitizePaymentBreakdown(data.paymentBreakdown)
    const paymentMethodSummary = buildPaymentMethodSummary(sanitizedPaymentBreakdown, data.paymentMethod)
    if (!data.financeAccountId) {
        return { error: "Selecione a conta de recebimento da venda." }
    }
    const { data: financeAccount } = await supabase
        .from("finance_accounts")
        .select("id")
        .eq("id", data.financeAccountId)
        .eq("partner_id", partnerId)
        .limit(1)
        .maybeSingle()
    if (!financeAccount?.id) {
        return { error: "Conta de recebimento inválida para esta venda." }
    }

    if (Number(data.totalAmount || 0) <= 0) {
        return { error: "A venda não pode ser salva com valor total zerado." }
    }

    let deliveryAddressStr = ""
    if (data.deliveryMethod === "delivery" && data.address) {
        const { street, number, neighborhood, city, state, zipCode, complement } = data.address
        deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
    }

    const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
            partner_id: partnerId,
            buyer_id: data.customerId || null,
            customer_name: data.customerName || null,
            source_quote_id: data.sourceQuoteId || null,
            order_source: buildOrderSource(data.salesChannel, data.deliveryMethod),
            delivery_type: data.deliveryMethod,
            situation: paymentState.situation,
            delivery_status: data.deliveryStatus,
            total_amount: data.totalAmount,
            paid_amount: paymentState.paidAmount,
            discount_value: data.discountValue,
            discount_type: data.discountType,
            shipping_cost: data.shippingCost,
            additional_costs: data.additionalCosts,
            notes: data.notes || null,
            payment_method: paymentMethodSummary,
            payment_breakdown: sanitizedPaymentBreakdown,
            payment_provider: null,
            delivery_address: deliveryAddressStr || null,
            finance_account_id: data.financeAccountId,
            created_by: user.id
        })
        .select()
        .single()

    if (orderError) return { error: orderError.message }

    const itemsToInsert = sanitizedItems.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId || null,
        product_name: item.customName || "Item manual",
        product_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        sort_order: item.sortOrder
    }))

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
    if (itemsError) {
        await supabase.from("orders").delete().eq("id", order.id)
        return { error: itemsError.message }
    }

    const stockItems = sanitizedItems.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
    }))

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
            reason: "Venda de Produto",
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

    increment_usage_counter(partnerId, "orders_month_count").catch(console.error)

    if (paymentState.situation === "paid") {
        await createFinancialTransactionsForPaidOrder(supabase, {
            orderNumber: order.order_number,
            partnerId,
            totalAmount: Number(order.total_amount || 0),
            paymentMethod: paymentMethodSummary,
            paymentProvider: order.payment_provider,
            paymentBreakdown: sanitizedPaymentBreakdown,
            customerId: order.buyer_id,
            customerName: order.customer_name,
            paymentDate: new Date().toISOString(),
            financeAccountId: order.finance_account_id || data.financeAccountId,
        })
    }

    await invalidateInventoryItems(partnerId, stockItems)
    await revalidateOrders(partnerId)

    return { success: true, orderId: order.id, orderNumber: order.order_number }
}

export async function getOrderDetailsAction(orderId: string, partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "NÃ£o autenticado" }

    await requirePartnerAccess(partnerId)
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
        .from("orders")
        .select(`
            *,
            order_items(*, products(id, name, sku, images, stock_quantity, stock_available, allow_sell_without_stock), product_variants(id, variant_name, sku, stock_quantity, stock_available)),
            stores(name)
        `)
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle()

    if (error) return { error: error.message }
    if (data) {
        let customers = null
        if (data.buyer_id) {
            const { data: customerData } = await supabase
                .from("customers")
                .select("id, name, email, phone, addresses(*)")
                .eq("id", data.buyer_id)
                .single()
            customers = customerData
        }

        let sellerName: string | null = null
        if (data.created_by) {
            const { data: sellerProfile } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", data.created_by)
                .single()
            sellerName = sellerProfile?.full_name || null
        }

        return { success: true, data: { ...data, customers, seller_name: sellerName } }
    }

    const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .maybeSingle()

    if (saleError || !sale) return { error: "Pedido nÃ£o encontrado" }

    let customers = null
    if (sale.customer_id) {
        const { data: customerData } = await supabase
            .from("customers")
            .select("id, name, email, phone, addresses(*)")
            .eq("id", sale.customer_id)
            .single()
        customers = customerData
    }

    let saleSellerName: string | null = null
    if ((sale as any).finalized_by_user_id) {
        const { data: sellerProfile } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", (sale as any).finalized_by_user_id)
            .single()
        saleSellerName = sellerProfile?.full_name || null
    }

    const { data: saleDraft } = await supabase
        .from("pre_sales")
        .select("shipping_fee")
        .eq("id", sale.pre_sale_id)
        .eq("partner_id", partnerId)
        .limit(1)
        .maybeSingle()

    const shippingCost = Number(saleDraft?.shipping_fee || 0)
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
        discount_value: Number(sale.discount_amount || 0),
        shipping_cost: shippingCost,
        additional_costs: 0,
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
    if (!user) return { error: "NÃ£o autenticado" }

    await requirePartnerAccess(partnerId)

    const supabase = await getSupabaseServerClient()
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
    if (!user) return { error: "NÃ£o autenticado" }

    await requirePartnerAccess(data.partnerId)

    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(data.csrf_token)
    if (!csrfValidation.valid) return { error: csrfValidation.error || "Token CSRF invÃ¡lido" }

    const supabase = await getSupabaseServerClient()
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
            shipping_cost,
            additional_costs,
            notes,
            payment_method,
            payment_breakdown,
            finance_account_id,
            delivery_address,
            inventory_deducted,
            created_by,
            order_items(product_id, variant_id, product_name, quantity, product_price)
        `)
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)
        .single()

    if (currentOrderError || !currentOrder) return { error: currentOrderError?.message || "Pedido nÃ£o encontrado" }
    const delta = buildInventoryMovementDelta(currentOrder.order_items || [], sanitizedItems)
    const stockItemsToValidate = currentOrder.inventory_deducted
        ? delta.outgoing.map((item) => ({
            productId: item.product_id,
            variantId: item.variant_id || null,
            quantity: item.quantity,
        }))
        : sanitizedItems
    const stockValidationError = await validateERPItemsStock({
        supabase,
        partnerId: data.partnerId,
        items: stockItemsToValidate,
    })
    if (stockValidationError) return { error: stockValidationError }
    const paymentState = resolvePaymentState({
        requestedStatus: data.paymentStatus,
        totalAmount: data.totalAmount,
        paidAmount: data.paidAmount,
        fallbackPaidAmount: Number(currentOrder.paid_amount || 0),
    })
    const sanitizedPaymentBreakdown = sanitizePaymentBreakdown(data.paymentBreakdown)
    const paymentMethodSummary = buildPaymentMethodSummary(sanitizedPaymentBreakdown, data.paymentMethod)
    if (!data.financeAccountId) {
        return { error: "Selecione a conta de recebimento da venda." }
    }
    const { data: financeAccount } = await supabase
        .from("finance_accounts")
        .select("id")
        .eq("id", data.financeAccountId)
        .eq("partner_id", data.partnerId)
        .limit(1)
        .maybeSingle()
    if (!financeAccount?.id) {
        return { error: "Conta de recebimento inválida para esta venda." }
    }

    if (Number(data.totalAmount || 0) <= 0) {
        return { error: "A venda não pode ser salva com valor total zerado." }
    }

    let deliveryAddressStr = ""
    if (data.deliveryMethod === "delivery" && data.address?.street && data.address.number) {
        const { street, number, neighborhood, city, state, zipCode, complement } = data.address
        deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
    }

    const changeLines = buildOrderChangeLines(currentOrder, { ...data, items: sanitizedItems })
    if (changeLines.length === 0) {
        return { success: true, noChanges: true }
    }

    const { error: orderError } = await supabase
        .from("orders")
        .update({
            buyer_id: data.customerId || null,
            customer_name: data.customerName || null,
            order_source: buildOrderSource(data.salesChannel, data.deliveryMethod),
            delivery_type: data.deliveryMethod,
            situation: paymentState.situation,
            delivery_status: data.deliveryStatus,
            total_amount: data.totalAmount,
            paid_amount: paymentState.paidAmount,
            discount_value: data.discountValue,
            discount_type: data.discountType,
            shipping_cost: data.shippingCost,
            additional_costs: data.additionalCosts,
            notes: data.notes || null,
            payment_method: paymentMethodSummary,
            payment_breakdown: sanitizedPaymentBreakdown,
            finance_account_id: data.financeAccountId,
            payment_provider: null,
            ...(deliveryAddressStr ? { delivery_address: deliveryAddressStr } : {})
        })
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)

    if (orderError) return { error: orderError.message }

    if (currentOrder.situation !== "paid" && paymentState.situation === "paid") {
        await createFinancialTransactionsForPaidOrder(supabase, {
            orderNumber: currentOrder.order_number || orderId,
            partnerId: data.partnerId,
            totalAmount: Number(data.totalAmount || 0),
            paymentMethod: paymentMethodSummary,
            paymentProvider: null,
            paymentBreakdown: sanitizedPaymentBreakdown,
            customerId: data.customerId || null,
            customerName: data.customerName || null,
            paymentDate: new Date().toISOString(),
            financeAccountId: data.financeAccountId,
        })
    }

    await supabase.from("order_items").delete().eq("order_id", orderId)

    const itemsToInsert = sanitizedItems.map(item => ({
        order_id: orderId,
        product_id: item.productId,
        variant_id: item.variantId || null,
        product_name: item.customName || "Item manual",
        product_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        sort_order: item.sortOrder
    }))

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
    if (itemsError) return { error: itemsError.message }

    const stockItems = sanitizedItems.map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
    }))

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
        changeLines,
        source: "manual",
    })

    await invalidateInventoryItems(data.partnerId, stockItems)
    await revalidateOrders(data.partnerId)
    return { success: true }
}

export async function deleteOrdersInBatchAction(orderIds: string[], partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "NÃ£o autenticado" }

    await requirePartnerAccess(partnerId)
    const supabase = await getSupabaseServerClient()

    await supabase.from("order_items").delete().in("order_id", orderIds)

    const { error } = await supabase.from("orders").delete().in("id", orderIds).eq("partner_id", partnerId)

    if (error) return { error: error.message }

    await revalidateOrders(partnerId)
    return { success: true }
}

export async function updateOrdersStatusInBatchAction(payload: {
    orderIds: string[]
    partnerId: string
    actionType: 'payment_status' | 'delivery_status' | 'cancel' | 'reopen'
    statusValue?: string
    cancelReason?: string
    restoreStock?: boolean
    generateAutomaticRefund?: boolean
    userName?: string
}) {
    const user = await requireUser()
    if (!user) return { error: "Nao autenticado" }

    await requirePartnerAccess(payload.partnerId)
    const supabase = await getSupabaseServerClient()

    const { data: currentOrders } = await supabase
        .from("orders")
        .select("id, order_number, situation, delivery_status, notes, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, finance_account_id, buyer_id, customer_name, previous_situation_before_cancel, stock_restored_on_cancel, inventory_deducted, order_items(product_id, variant_id, quantity)")
        .in("id", payload.orderIds)
        .eq("partner_id", payload.partnerId)
    const overallWarnings: string[] = []
    if (!currentOrders || currentOrders.length === 0) {
        return { error: "Nenhum pedido válido foi encontrado para processar." }
    }

    if (payload.actionType === "cancel" || payload.actionType === "reopen") {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .single()

        const effectiveUserName = profile?.full_name || payload.userName || "Usuario"
        const processingWarnings: string[] = []
        let processedCount = 0

        for (const order of currentOrders || []) {
            if (payload.actionType === "cancel") {
                if (order.situation === "cancelled") continue

                const nextNotes = buildCancelledOrderNotes({
                    currentNotes: order.notes,
                    userName: effectiveUserName,
                    timestamp: formatDateTime(new Date()),
                    reason: payload.cancelReason?.trim(),
                })

                const stockWasRestoredOnCancel = Boolean(payload.restoreStock && order.inventory_deducted)
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

                if (order.inventory_deducted && stockWasRestoredOnCancel) {
                    const movementResult = await createOrderStockMovement({
                        supabase,
                        partnerId: payload.partnerId,
                        orderId: order.id,
                        createdBy: user.id,
                        type: "in",
                        reason: "Cancelamento de Pedido",
                        notes: payload.cancelReason?.trim() || undefined,
                        items: order.order_items || [],
                    })

                    if ("error" in movementResult) {
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: cancelado, mas não foi possível restaurar estoque (${movementResult.error})`)
                    }
                } else if (!order.inventory_deducted) {
                    const releaseResult = await releaseOrderInventory({
                        client: supabase,
                        partnerId: payload.partnerId,
                        orderId: order.id,
                        items: order.order_items || [],
                    })

                    if ("error" in releaseResult) {
                        processingWarnings.push(`Pedido ${order.order_number || order.id}: cancelado, mas não foi possível liberar reserva de estoque (${releaseResult.error})`)
                    }
                }

                if (payload.generateAutomaticRefund) {
                    const refundAmount = Math.max(0, Number(order.paid_amount || 0))
                    if (refundAmount > 0.009) {
                        const refundResult = await createRefundTransactionForCancelledOrder({
                            supabase,
                            partnerId: payload.partnerId,
                            orderNumber: order.order_number || order.id,
                            orderId: order.id,
                            customerId: order.buyer_id || null,
                            paidAmount: refundAmount,
                            financeAccountId: order.finance_account_id || null,
                            createdByUserId: user.id,
                        })

                        if ("error" in refundResult) {
                            processingWarnings.push(`Pedido ${order.order_number || order.id}: cancelado, mas não foi possível gerar reembolso (${refundResult.error})`)
                        }
                    }
                }
            }

            if (payload.actionType === "reopen") {
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
                (currentOrders || []).map((order: { id: string; previous_situation_before_cancel?: string | null; stock_restored_on_cancel?: boolean | null; inventory_deducted?: boolean | null }) => {
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

                    if (payload.actionType === "reopen") {
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
            if (order.situation === "paid") {
                paymentWarnings.push(`Pedido ${order.order_number || order.id}: já está pago e não pode ter o pagamento alterado.`)
                continue
            }
            const paymentState = resolvePaymentState({
                requestedStatus,
                totalAmount: Number(order.total_amount || 0),
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
                })
                .eq("id", order.id)
                .eq("partner_id", payload.partnerId)

            if (error) return { error: error.message }
            paymentProcessedCount += 1

            if (order.situation !== "paid" && paymentState.situation === "paid") {
                await createFinancialTransactionsForPaidOrder(supabase, {
                    orderNumber: order.order_number || order.id,
                    partnerId: payload.partnerId,
                    totalAmount: Number(order.total_amount || 0),
                    paymentMethod: order.payment_method || null,
                    paymentProvider: order.payment_provider || null,
                    paymentBreakdown: order.payment_breakdown || null,
                    customerId: order.buyer_id || null,
                    customerName: order.customer_name || null,
                    paymentDate: new Date().toISOString(),
                    financeAccountId: order.finance_account_id || null,
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
        for (const order of currentOrders || []) {
            if (order.delivery_status === "delivered") {
                deliveryWarnings.push(`Pedido ${order.order_number || order.id}: já está entregue e não pode ter o status de entrega alterado.`)
                continue
            }
            const shouldFinalizeNow = !order.inventory_deducted && shouldDeductInventory(payload.statusValue)

            const { error } = await supabase
                .from("orders")
                .update({
                    delivery_status: payload.statusValue,
                    ...(shouldFinalizeNow ? { inventory_deducted: true } : {}),
                })
                .eq("id", order.id)
                .eq("partner_id", payload.partnerId)

            if (error) return { error: error.message }
            deliveryProcessedCount += 1

            if (shouldFinalizeNow) {
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
            }
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
                    const requestedStatus = paymentStatusMap[payload.statusValue || ""]

                    if (requestedStatus) {
                        const nextPaymentState = resolvePaymentState({
                            requestedStatus,
                            totalAmount: Number(order.total_amount || 0),
                            fallbackPaidAmount:
                                requestedStatus === "paid"
                                    ? Number(order.total_amount || 0)
                                    : requestedStatus === "partially_paid"
                                        ? Number(order.paid_amount || 0)
                                        : 0,
                        })

                        if (order.situation !== nextPaymentState.situation) {
                            lines.push(`alterou status de pagamento: ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(nextPaymentState.situation)}`)
                        }
                    }
                }

                if (payload.actionType === "delivery_status" && payload.statusValue && order.delivery_status !== payload.statusValue) {
                    lines.push(`alterou status de entrega: ${getDeliveryStatusLabel(order.delivery_status)} -> ${getDeliveryStatusLabel(payload.statusValue)}`)
                }

                if (lines.length === 0) return Promise.resolve()

                return logAuditEvent({
                    partnerId: payload.partnerId,
                    actorUserId: user.id,
                    entityType: "order",
                    entityId: order.id,
                    actionType: payload.actionType,
                    changeLines: lines,
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
        await requirePartnerAccess(partnerId)

        const supabase = await getSupabaseServerClient()
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
                order_source,
                created_at,
                stores(name),
                order_items(quantity)
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

        let queryResult = await buildQuery(selectWithPosSale)
        if (queryResult.error && isMissingOrdersIsPosSaleColumnError(queryResult.error)) {
            queryResult = await buildQuery(selectWithoutPosSale)
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
            // Backward-compatible field used by UI, with fallback when column doesn't exist in DB.
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

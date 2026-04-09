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
import { createOrderHistoryEntry, getOrderHistoryEntries } from "@/lib/services/order-history.service"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidateStockMovements } from "@/lib/utils/revalidation"

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
    salesChannel?: string
    deliveryMethod: 'delivery' | 'pickup'
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

function buildOrderSource(salesChannel: string | undefined, deliveryMethod: 'delivery' | 'pickup') {
    const value = salesChannel?.trim()
    if (value) return value
    return deliveryMethod === "pickup" ? "Balcão" : "Entrega"
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

    if ((currentOrder.payment_method || "Não informado") !== (payload.paymentMethod || "Não informado")) {
        lines.push(`alterou forma de pagamento: ${(currentOrder.payment_method || "Não informado")} -> ${(payload.paymentMethod || "Não informado")}`)
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
        .select("id, name, stock_quantity, allow_sell_without_stock")
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
            stock: Number(product.stock_quantity || 0),
            allowSellWithoutStock: Boolean(product.allow_sell_without_stock),
        },
    ]))

    const variantMap = new Map<string, { name: string; stock: number; productId: string }>()
    if (variantIds.length > 0) {
        const { data: variants, error: variantsError } = await params.supabase
            .from("product_variants")
            .select("id, product_id, variant_name, stock_quantity")
            .in("id", variantIds)

        if (variantsError) {
            console.error("[validateERPItemsStock] Variants error:", variantsError)
            return "Não foi possível validar o estoque das variações."
        }

        for (const variant of variants || []) {
            variantMap.set(variant.id, {
                name: variant.variant_name || "Variação",
                stock: Number(variant.stock_quantity || 0),
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
            payment_method: data.paymentMethod,
            payment_provider: data.paymentMethod,
            delivery_address: deliveryAddressStr || null,
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

    const stockMovementResult = await createOrderStockMovement({
        supabase,
        partnerId,
        orderId: order.id,
        createdBy: user.id,
        type: "out",
        reason: "Venda ERP",
        notes: "Baixa de estoque ao criar pedido no ERP",
        items: sanitizedItems.map((item) => ({
            product_id: item.productId,
            variant_id: item.variantId || null,
            quantity: item.quantity,
        })),
    })

    if ("error" in stockMovementResult) {
        await supabase.from("order_items").delete().eq("order_id", order.id)
        await supabase.from("orders").delete().eq("id", order.id)
        return { error: stockMovementResult.error }
    }

    await supabase
        .from("orders")
        .update({ inventory_deducted: true })
        .eq("id", order.id)
        .eq("partner_id", partnerId)

    try {
        const historyLines = [
            "criou venda",
        ]

        await createOrderHistoryEntry({
            orderId: order.id,
            partnerId,
            actorUserId: user.id,
            entryType: "created",
            changeLines: historyLines,
        })
    } catch (historyError) {
        console.error("[orders_history] createERPOrderAction:", historyError)
    }

    increment_usage_counter(partnerId, "orders_month_count").catch(console.error)

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
            order_items(*, products(id, name, sku, images, stock_quantity, allow_sell_without_stock), product_variants(id, variant_name, sku, stock_quantity)),
            stores(name)
        `)
        .eq("id", orderId)
        .eq("partner_id", partnerId)
        .single()

    if (error) return { error: error.message }
    if (!data) return { error: "Pedido nÃ£o encontrado" }

    let customers = null
    if (data.buyer_id) {
        const { data: customerData } = await supabase
            .from("customers")
            .select("id, name, email, phone, addresses(*)")
            .eq("id", data.buyer_id)
            .single()
        customers = customerData
    }

    return { success: true, data: { ...data, customers } }
}

export async function getOrderHistoryAction(orderId: string, partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "NÃ£o autenticado" }

    await requirePartnerAccess(partnerId)

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
            delivery_address,
            inventory_deducted,
            order_items(product_id, variant_id, product_name, quantity, product_price)
        `)
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)
        .single()

    if (currentOrderError || !currentOrder) return { error: currentOrderError?.message || "Pedido nÃ£o encontrado" }
    if (currentOrder.situation === "paid") {
        return { error: "Pedidos pagos não podem mais ser editados." }
    }
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
            payment_method: data.paymentMethod,
            ...(deliveryAddressStr ? { delivery_address: deliveryAddressStr } : {})
        })
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)

    if (orderError) return { error: orderError.message }

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

    if (currentOrder.inventory_deducted) {
        if (delta.incoming.length > 0) {
            const movementResult = await createOrderStockMovement({
                supabase,
                partnerId: data.partnerId,
                orderId,
                createdBy: user.id,
                type: "in",
                reason: "Edicao de pedido",
                notes: "Devolucao de estoque ao editar pedido no ERP",
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
                notes: "Baixa adicional de estoque ao editar pedido no ERP",
                items: delta.outgoing,
            })

            if ("error" in movementResult) return { error: movementResult.error }
        }
    } else {
        const movementResult = await createOrderStockMovement({
            supabase,
            partnerId: data.partnerId,
            orderId,
            createdBy: user.id,
            type: "out",
            reason: "Venda ERP",
            notes: "Baixa de estoque ao editar pedido no ERP",
            items: sanitizedItems.map((item) => ({
                product_id: item.productId,
                variant_id: item.variantId || null,
                quantity: item.quantity,
            })),
        })

        if ("error" in movementResult) return { error: movementResult.error }

        await supabase
            .from("orders")
            .update({ inventory_deducted: true })
            .eq("id", orderId)
            .eq("partner_id", data.partnerId)
    }

    try {
        await createOrderHistoryEntry({
            orderId,
            partnerId: data.partnerId,
            actorUserId: user.id,
            entryType: "updated",
            changeLines,
        })
    } catch (historyError) {
        console.error("[orders_history] updateERPOrderAction:", historyError)
    }

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
    userName?: string
}) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

    await requirePartnerAccess(payload.partnerId)
    const supabase = await getSupabaseServerClient()

    const { data: currentOrders } = await supabase
        .from("orders")
        .select("id, situation, delivery_status, notes, total_amount, paid_amount, previous_situation_before_cancel, stock_restored_on_cancel, inventory_deducted, order_items(product_id, variant_id, quantity)")
        .in("id", payload.orderIds)
        .eq("partner_id", payload.partnerId)

    if (payload.actionType === "cancel" || payload.actionType === "reopen") {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", user.id)
            .single()

        const effectiveUserName = profile?.full_name || payload.userName || "UsuÃ¡rio"

        for (const order of currentOrders || []) {
            if (payload.actionType === "cancel") {
                if (order.situation === "cancelled") continue

                const nextNotes = payload.cancelReason?.trim()
                    ? `${order.notes || ""}\n\nPedido cancelado por: ${effectiveUserName} Ã s ${formatDateTime(new Date())} - ${payload.cancelReason.trim()}`.trim()
                    : order.notes

                const { error } = await supabase
                    .from("orders")
                    .update({
                        situation: "cancelled",
                        previous_situation_before_cancel: order.situation || "pending",
                        stock_restored_on_cancel: Boolean(payload.restoreStock && order.inventory_deducted),
                        notes: nextNotes || null,
                    })
                    .eq("id", order.id)
                    .eq("partner_id", payload.partnerId)

                if (error) return { error: error.message }

                if (payload.restoreStock && order.inventory_deducted) {
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

                    if ("error" in movementResult) return { error: movementResult.error }
                }
            }

            if (payload.actionType === "reopen") {
                if (order.situation !== "cancelled") continue

                const restoredSituation = order.previous_situation_before_cancel || "pending"
                const shouldReverseStock = Boolean(order.stock_restored_on_cancel)

                const { error } = await supabase
                    .from("orders")
                    .update({
                        situation: restoredSituation,
                        previous_situation_before_cancel: null,
                        stock_restored_on_cancel: false,
                    })
                    .eq("id", order.id)
                    .eq("partner_id", payload.partnerId)

                if (error) return { error: error.message }

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

                    if ("error" in movementResult) return { error: movementResult.error }
                }
            }
        }

        try {
            await Promise.all(
                (currentOrders || []).map((order: { id: string; previous_situation_before_cancel?: string | null; stock_restored_on_cancel?: boolean | null }) => {
                    const lines: string[] = []

                    if (payload.actionType === "cancel") {
                        lines.push("cancelou o pedido")
                        if (payload.cancelReason?.trim()) {
                            lines.push(`informou motivo do cancelamento: ${payload.cancelReason.trim()}`)
                        }
                        if (payload.restoreStock) {
                            lines.push("restaurou o estoque dos itens do pedido")
                        }
                    }

                    if (payload.actionType === "reopen") {
                        lines.push(`reabriu o pedido e restaurou o status para ${getPaymentStatusLabel(order.previous_situation_before_cancel || "pending")}`)
                        if (order.stock_restored_on_cancel) {
                            lines.push("removeu novamente os itens do estoque")
                        }
                    }

                    return createOrderHistoryEntry({
                        orderId: order.id,
                        partnerId: payload.partnerId,
                        actorUserId: user.id,
                        entryType: payload.actionType,
                        changeLines: lines,
                    })
                })
            )
        } catch (historyError) {
            console.error("[orders_history] updateOrdersStatusInBatchAction:", historyError)
        }

        await revalidateOrders(payload.partnerId)
        return { success: true }
    }

    let updateData: any = {}
    if (payload.actionType === "payment_status") {
        updateData.situation = payload.statusValue
    } else if (payload.actionType === "delivery_status") {
        updateData.delivery_status = payload.statusValue
    } else if (payload.actionType === "cancel") {
        updateData.situation = "cancelled"

        if (payload.cancelReason) {
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", user.id)
                .single()

            const effectiveUserName = profile?.full_name || payload.userName || "Usuário"

            if (currentOrders) {
                for (const order of currentOrders) {
                    const timestamp = formatDateTime(new Date())
                    const log = `\n\nPedido cancelado por: ${effectiveUserName} às ${timestamp} - ${payload.cancelReason}`
                    const newNotes = (order.notes || "") + log

                    await supabase.from("orders").update({ notes: newNotes }).eq("id", order.id)
                }
            }
        }
    }

    if (payload.actionType === "payment_status") {
        for (const order of currentOrders || []) {
            const paymentState = resolvePaymentState({
                requestedStatus: (payload.statusValue === "partially_paid" ? "partially_paid" : payload.statusValue === "paid" ? "paid" : "unpaid") as ERPOrderPayload["paymentStatus"],
                totalAmount: Number(order.total_amount || 0),
                fallbackPaidAmount:
                    payload.statusValue === "paid"
                        ? Number(order.total_amount || 0)
                        : payload.statusValue === "partially_paid"
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
        }
    } else {
        const { error } = await supabase
            .from("orders")
            .update(updateData)
            .in("id", payload.orderIds)
            .eq("partner_id", payload.partnerId)

        if (error) return { error: error.message }
    }

    try {
        await Promise.all(
            (currentOrders || []).map((order: { id: string; situation: string | null; delivery_status: string | null; notes?: string | null; total_amount?: number | null; paid_amount?: number | null }) => {
                const lines: string[] = []

                if (payload.actionType === "payment_status" && payload.statusValue && order.situation !== payload.statusValue) {
                    lines.push(`alterou status de pagamento: ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(payload.statusValue)}`)
                }

                if (payload.actionType === "delivery_status" && payload.statusValue && order.delivery_status !== payload.statusValue) {
                    lines.push(`alterou status de entrega: ${getDeliveryStatusLabel(order.delivery_status)} -> ${getDeliveryStatusLabel(payload.statusValue)}`)
                }

                if (payload.actionType === "cancel") {
                    lines.push("cancelou o pedido")
                    if (payload.cancelReason?.trim()) {
                        lines.push(`informou motivo do cancelamento: ${payload.cancelReason.trim()}`)
                    }
                }

                if (lines.length === 0) return Promise.resolve()

                return createOrderHistoryEntry({
                    orderId: order.id,
                    partnerId: payload.partnerId,
                    actorUserId: user.id,
                    entryType: payload.actionType,
                    changeLines: lines,
                })
            })
        )
    } catch (historyError) {
        console.error("[orders_history] updateOrdersStatusInBatchAction:", historyError)
    }

    await revalidateOrders(payload.partnerId)
    return { success: true }
}

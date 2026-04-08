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

type ERPItemPayload = {
    productId: string | null
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
        const key = productId ? `product:${productId}` : `custom:${name.toLowerCase()}`
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

    const itemsToInsert = data.items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.customName || null,
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
            order_items(*),
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
            order_items(product_id, product_name, quantity, product_price)
        `)
        .eq("id", orderId)
        .eq("partner_id", data.partnerId)
        .single()

    if (currentOrderError || !currentOrder) return { error: currentOrderError?.message || "Pedido nÃ£o encontrado" }
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

    const itemsToInsert = data.items.map(item => ({
        order_id: orderId,
        product_id: item.productId,
        product_name: item.customName || null,
        product_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        sort_order: item.sortOrder
    }))

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
    if (itemsError) return { error: itemsError.message }

    try {
        const changeLines = buildOrderChangeLines(currentOrder, data)
        if (changeLines.length > 0) {
            await createOrderHistoryEntry({
                orderId,
                partnerId: data.partnerId,
                actorUserId: user.id,
                entryType: "updated",
                changeLines,
            })
        }
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
    actionType: 'payment_status' | 'delivery_status' | 'cancel'
    statusValue?: string
    cancelReason?: string
    userName?: string
}) {
    const user = await requireUser()
    if (!user) return { error: "NÃ£o autenticado" }

    await requirePartnerAccess(payload.partnerId)
    const supabase = await getSupabaseServerClient()

    const { data: currentOrders } = await supabase
        .from("orders")
        .select("id, situation, delivery_status, notes, total_amount, paid_amount")
        .in("id", payload.orderIds)
        .eq("partner_id", payload.partnerId)

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

            const effectiveUserName = profile?.full_name || payload.userName || "UsuÃ¡rio"

            if (currentOrders) {
                for (const order of currentOrders) {
                    const timestamp = formatDateTime(new Date())
                    const log = `\n\nPedido cancelado por: ${effectiveUserName} Ã s ${timestamp} - ${payload.cancelReason}`
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

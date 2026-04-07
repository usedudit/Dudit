"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { requireUser, requirePartnerAccess } from "@/lib/auth/authorization"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"

async function generateOrderNumber(supabase: any): Promise<string> {
    const chars = '0123456789'
    let secondPart = ''
    for (let i = 0; i < 6; i++) {
        secondPart += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return `DDT${secondPart}`
}

export async function createERPOrderAction(data: {
    partnerId: string
    customerId?: string
    customerName?: string
    deliveryMethod: 'delivery' | 'pickup'
    paymentStatus: 'paid' | 'partially_paid' | 'unpaid'
    deliveryStatus: 'not_sent' | 'preparing' | 'sent' | 'delivered' | 'pickup_available' | 'delivery_failed'
    items: Array<{
        productId: string | null
        customName?: string
        quantity: number
        unitPrice: number
        sortOrder: number
    }>
    subtotal: number
    discountValue: number
    discountType: 'fixed' | 'percentage'
    shippingCost: number
    additionalCosts: number
    totalAmount: number
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
}) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)

    // Security check
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }
    
    const partnerId = data.partnerId
    const access = await requirePartnerAccess(partnerId)
    // requirePartnerAccess throws if no access, so we're safe here.

    // CSRF check
    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(data.csrf_token)
    if (!csrfValidation.valid) return { error: csrfValidation.error || "Token CSRF inválido" }

    // Check limits
    const limitCheck = await checkLimit(partnerId, "orders_per_month")
    if (!limitCheck.allowed) return { error: limitCheck.message || "Limite mensal atingido." }

    const supabase = await getSupabaseServerClient()
    const orderNumber = await generateOrderNumber(supabase)

    // Format address string if it exists
    let deliveryAddressStr = ""
    if (data.deliveryMethod === 'delivery' && data.address) {
        const { street, number, neighborhood, city, state, zipCode, complement } = data.address
        deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ''}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
    }

    // Insert Order
    const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
            partner_id: partnerId,
            buyer_id: data.customerId || null,
            customer_name: data.customerName || null,
            order_number: orderNumber,
            order_source: data.deliveryMethod === 'pickup' ? 'Balcão' : 'Entrega', // Defaulting to source based on method for now, or use channel if passed
            delivery_type: data.deliveryMethod,
            situation: data.paymentStatus === 'paid' ? 'paid' : (data.paymentStatus === 'partially_paid' ? 'partially_paid' : 'pending'),
            delivery_status: data.deliveryStatus,
            total_amount: data.totalAmount,
            discount_value: data.discountValue,
            discount_type: data.discountType,
            shipping_cost: data.shippingCost,
            additional_costs: data.additionalCosts,
            notes: data.notes || null,
            payment_method: data.paymentMethod,
            delivery_address: deliveryAddressStr || null,
            created_by: user.id
        })
        .select()
        .single()

    if (orderError) return { error: orderError.message }

    // Insert Items
    const itemsToInsert = data.items.map(item => ({
        order_id: order.id,
        product_id: item.productId,
        product_name: item.customName || null, // Will be fetched via join if null in views
        product_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        sort_order: item.sortOrder
    }))

    const { error: itemsError } = await supabase.from("order_items").insert(itemsToInsert)
    if (itemsError) {
        // Rollback? Supabase doesn't easily rollback without RPC, but for now we expect it to work
        await supabase.from("orders").delete().eq("id", order.id)
        return { error: itemsError.message }
    }


    // Handle Stock & Counter
    increment_usage_counter(partnerId, "orders_month_count").catch(console.error)

    // Revalidate
    await revalidateOrders(partnerId)

    return { success: true, orderId: order.id, orderNumber: order.order_number }
}

export async function getOrderDetailsAction(orderId: string, partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }

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
    if (!data) return { error: "Pedido não encontrado" }

    // Fetch customer data separately if buyer_id exists (no FK in schema)
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

export async function updateERPOrderAction(orderId: string, data: {
    partnerId: string
    customerId?: string
    customerName?: string
    deliveryMethod: 'delivery' | 'pickup'
    paymentStatus: 'paid' | 'partially_paid' | 'unpaid'
    deliveryStatus: 'not_sent' | 'preparing' | 'sent' | 'delivered' | 'pickup_available' | 'delivery_failed'
    items: Array<{
        productId: string | null
        customName?: string
        quantity: number
        unitPrice: number
        sortOrder: number
    }>
    subtotal: number
    discountValue: number
    discountType: 'fixed' | 'percentage'
    shippingCost: number
    additionalCosts: number
    totalAmount: number
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
}) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)

    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }
    
    await requirePartnerAccess(data.partnerId)

    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
    const csrfValidation = await requireCSRF(data.csrf_token)
    if (!csrfValidation.valid) return { error: csrfValidation.error || "Token CSRF inválido" }

    const supabase = await getSupabaseServerClient()

    let deliveryAddressStr = ""
    if (data.deliveryMethod === 'delivery' && data.address) {
        if (data.address.street && data.address.number) {
            const { street, number, neighborhood, city, state, zipCode, complement } = data.address
            deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ''}, ${neighborhood}, ${city} - ${state}, ${zipCode}`
        }
    }

    // Update order
    const { error: orderError } = await supabase
        .from("orders")
        .update({
            buyer_id: data.customerId || null,
            customer_name: data.customerName || null,
            order_source: data.deliveryMethod === 'pickup' ? 'Balcão' : 'Entrega',
            delivery_type: data.deliveryMethod,
            situation: data.paymentStatus === 'paid' ? 'paid' : (data.paymentStatus === 'partially_paid' ? 'partially_paid' : 'pending'),
            delivery_status: data.deliveryStatus,
            total_amount: data.totalAmount,
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

    // Re-insert items for simplicity (delete all and insert new)
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

    await revalidateOrders(data.partnerId)
    return { success: true }
}

export async function deleteOrdersInBatchAction(orderIds: string[], partnerId: string) {
    const user = await requireUser()
    if (!user) return { error: "Não autenticado" }
    
    await requirePartnerAccess(partnerId)
    const supabase = await getSupabaseServerClient()

    // order_items normally cascade, if not need to delete first. Let's assume cascade or we delete first.
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
    if (!user) return { error: "Não autenticado" }
    
    await requirePartnerAccess(payload.partnerId)
    const supabase = await getSupabaseServerClient()

    let updateData: any = {}
    if (payload.actionType === 'payment_status') {
        updateData.situation = payload.statusValue
    } else if (payload.actionType === 'delivery_status') {
        updateData.delivery_status = payload.statusValue
    } else if (payload.actionType === 'cancel') {
        updateData.situation = 'cancelled'
        
        if (payload.cancelReason && payload.userName) {
            // We need to fetch existing notes first to append or just set if we don't care about overwriting.
            // But usually we append. For simplicity and performance in batch, let's see. 
            // The user said "salva na observação", usually implying a log.
            
            const { data: currentOrders } = await supabase
                .from("orders")
                .select("id, notes")
                .in("id", payload.orderIds)

            if (currentOrders) {
                for (const order of currentOrders) {
                    const timestamp = new Date().toLocaleString('pt-BR')
                    const log = `\n\nPedido cancelado por: ${payload.userName} às ${timestamp} - : ${payload.cancelReason}`
                    const newNotes = (order.notes || "") + log
                    
                    await supabase.from("orders").update({ notes: newNotes }).eq("id", order.id)
                }
            }
        }
    }

    const { error } = await supabase
        .from("orders")
        .update(updateData)
        .in("id", payload.orderIds)
        .eq("partner_id", payload.partnerId)

    if (error) return { error: error.message }

    await revalidateOrders(payload.partnerId)
    return { success: true }
}

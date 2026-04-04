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
    orderDate: string
    salesChannel: string
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
            customer_id: data.customerId || null,
            customer_name: data.customerName || null,
            order_number: orderNumber,
            order_date: data.orderDate,
            sales_channel: data.salesChannel,
            delivery_type: data.deliveryMethod,
            situation: data.paymentStatus === 'paid' ? 'paid' : (data.paymentStatus === 'partially_paid' ? 'partially_paid' : 'pending'),
            delivery_status: data.deliveryStatus,
            total_amount: data.totalAmount,
            discount_value: data.discountValue,
            discount_type: data.discountType,
            shipping_cost: data.shippingCost,
            additional_costs: data.additionalCosts,
            notes: data.notes || null,
            delivery_address: deliveryAddressStr || null,
            buyer_id: null // Manual ERP orders might not have a platform user buyer_id
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

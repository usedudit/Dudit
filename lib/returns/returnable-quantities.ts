import { createAdminClient } from "@/lib/supabase/server"

/**
 * Calculates the remaining returnable quantity for each item in an order.
 * Considers all active return requests (not deleted, and not REJECTED or EXPIRED).
 */
export async function getReturnableQuantities(orderId: string): Promise<Record<string, number>> {
    const supabase = createAdminClient()

    // 1. Fetch all items belonging to the order
    const { data: orderItems, error: itemsError } = await supabase
        .from("order_items")
        .select("id, quantity")
        .eq("order_id", orderId)

    if (itemsError || !orderItems) {
        throw new Error(
            `Erro ao buscar itens do pedido para cálculo de saldo devolvível: ${
                itemsError?.message || "Erro desconhecido"
            }`
        )
    }

    // 2. Fetch all return items for active/resolved return requests
    // Filter out return requests that are deleted or have REJECTED or EXPIRED statuses
    const { data: returnRequests, error: returnError } = await supabase
        .from("return_requests")
        .select(`
            status,
            deleted_at,
            return_items (
                order_item_id,
                quantity
            )
        `)
        .eq("order_id", orderId)
        .is("deleted_at", null)

    if (returnError) {
        throw new Error(`Erro ao buscar solicitações de devolução do pedido: ${returnError.message}`)
    }

    const activeRequests = (returnRequests || []).filter(
        (rr: any) => {
            const status = String(rr.status || "").toUpperCase()
            return status !== "REJECTED" && status !== "EXPIRED" && status !== "CANCELLED"
        }
    )

    // 3. Accumulate returned quantities by order_item_id
    const returnedQuantities: Record<string, number> = {}
    for (const rr of activeRequests) {
        const items = (rr as any).return_items || []
        for (const item of items) {
            const orderItemId = (item as any).order_item_id
            const qty = (item as any).quantity
            if (orderItemId) {
                returnedQuantities[orderItemId] =
                    (returnedQuantities[orderItemId] || 0) + (qty || 0)
            }
        }
    }

    // 4. Calculate remaining quantities for each order item
    const remainingQuantities: Record<string, number> = {}
    for (const item of orderItems) {
        const returned = returnedQuantities[item.id] || 0
        remainingQuantities[item.id] = Math.max(0, (item.quantity || 0) - returned)
    }

    return remainingQuantities
}

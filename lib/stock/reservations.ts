type StockItem = {
  product_id?: string | null
  variant_id?: string | null
  quantity: number
}

type StockClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message?: string } | null }>
}

export const FINAL_DELIVERY_STATUSES = new Set(["sent", "delivered"])

export function shouldDeductInventory(deliveryStatus?: string | null) {
  return deliveryStatus ? FINAL_DELIVERY_STATUSES.has(deliveryStatus) : false
}

function normalizeItems(items: StockItem[]) {
  return items
    .filter((item) => item.product_id && Number(item.quantity || 0) > 0)
    .map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      quantity: Number(item.quantity || 0),
    }))
}

async function executeInventoryRpc(client: StockClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args)
  if (error) {
    return { error: error.message || "Falha ao atualizar o estoque." }
  }

  return { success: true as const, data }
}

export async function reserveOrderInventory(params: {
  client: StockClient
  partnerId: string
  orderId: string
  items: StockItem[]
}) {
  const items = normalizeItems(params.items)
  if (items.length === 0) return { success: true as const, data: null }

  return executeInventoryRpc(params.client, "reserve_order_inventory", {
    p_partner_id: params.partnerId,
    p_order_id: params.orderId,
    p_items: items,
  })
}

export async function releaseOrderInventory(params: {
  client: StockClient
  partnerId: string
  orderId: string
  items: StockItem[]
}) {
  const items = normalizeItems(params.items)
  if (items.length === 0) return { success: true as const, data: null }

  return executeInventoryRpc(params.client, "release_order_inventory", {
    p_partner_id: params.partnerId,
    p_order_id: params.orderId,
    p_items: items,
  })
}

export async function finalizeOrderInventory(params: {
  client: StockClient
  partnerId: string
  orderId: string
  createdBy: string
  reason: string
  notes?: string
  items: StockItem[]
}) {
  const items = normalizeItems(params.items)
  if (items.length === 0) return { success: true as const, data: null }

  return executeInventoryRpc(params.client, "finalize_order_inventory", {
    p_partner_id: params.partnerId,
    p_order_id: params.orderId,
    p_created_by: params.createdBy,
    p_reason: params.reason,
    p_notes: params.notes || null,
    p_items: items,
  })
}

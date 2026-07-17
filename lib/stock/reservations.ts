import "server-only"

type StockItem = {
  product_id?: string | null
  variant_id?: string | null
  quantity: number
  store_product_id?: string | null
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
      store_product_id: item.store_product_id || null,
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
  storeId?: string | null
}) {
  const items = normalizeItems(params.items)
  if (items.length === 0) return { success: true as const, data: null }

  return executeInventoryRpc(params.client, "reserve_order_inventory", {
    p_partner_id: params.partnerId,
    p_order_id: params.orderId,
    p_items: items,
    p_store_id: params.storeId || null,
  })
}

export async function releaseOrderInventory(params: {
  client: StockClient
  partnerId: string
  orderId: string
  items: StockItem[]
  storeId?: string | null
}) {
  const items = normalizeItems(params.items)
  if (items.length === 0) return { success: true as const, data: null }

  return executeInventoryRpc(params.client, "release_order_inventory", {
    p_partner_id: params.partnerId,
    p_order_id: params.orderId,
    p_items: items,
    p_store_id: params.storeId || null,
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
  storeId?: string | null
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
    p_store_id: params.storeId || null,
  })
}

export async function transferStockBetweenStores(params: {
  client: StockClient
  fromStoreProductId: string
  toStoreProductId: string
  quantity: number
  partnerId: string
  createdBy: string
  notes?: string
}) {
  return executeInventoryRpc(params.client, "transfer_store_stock", {
    p_from_store_product_id: params.fromStoreProductId,
    p_to_store_product_id: params.toStoreProductId,
    p_quantity: params.quantity,
    p_partner_id: params.partnerId,
    p_created_by: params.createdBy,
    p_notes: params.notes || null,
  })
}

export async function decrementStoreProductStock(params: {
  client: StockClient
  storeProductId: string
  quantity: number
  allowNegative?: boolean
}) {
  return executeInventoryRpc(params.client, "decrement_store_product_stock", {
    p_store_product_id: params.storeProductId,
    p_quantity: params.quantity,
    p_allow_negative: params.allowNegative || false,
  })
}

export async function incrementStoreProductStock(params: {
  client: StockClient
  storeProductId: string
  quantity: number
}) {
  return executeInventoryRpc(params.client, "increment_store_product_stock", {
    p_store_product_id: params.storeProductId,
    p_quantity: params.quantity,
  })
}

export async function getStoreProductStock(params: {
  client: StockClient
  productId: string
  storeId: string
}) {
  const { data, error } = await params.client.rpc("get_store_product_stock", {
    p_product_id: params.productId,
    p_store_id: params.storeId,
  })
  if (error) {
    return { error: error.message || "Falha ao consultar estoque." }
  }
  return { success: true as const, data }
}

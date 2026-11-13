import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { createNotification, buildIdempotencyKey } from "./notification.service"
import { buildNotificationContent } from "@/lib/notifications/templates"

const ABANDONMENT_THRESHOLD_MINUTES = 4 * 60
const NOTIFICATION_COOLDOWN_MS = 24 * 60 * 60 * 1000
const MAX_PRODUCT_NAMES = 3

interface SweepResult {
  processed: number
  notified: number
  skippedCooldown: number
  skippedNoToken: number
  errors: number
}

interface CartItemAgg {
  user_id: string
  partner_id: string
  store_id: string | null
  item_type: string
  quantity: number
  product_id: string | null
  service_id: string | null
  variant_id: string | null
  productName: string | null
}

export async function sweepAbandonedCarts(
  client: ReturnType<typeof getAdminClient> = getAdminClient(),
): Promise<SweepResult> {
  const threshold = new Date(
    Date.now() - ABANDONMENT_THRESHOLD_MINUTES * 60 * 1000,
  ).toISOString()
  const now = new Date().toISOString()

  const result: SweepResult = {
    processed: 0,
    notified: 0,
    skippedCooldown: 0,
    skippedNoToken: 0,
    errors: 0,
  }

  const { data: cartItems, error } = await client
    .from("cart_items")
    .select(`
      user_id,
      partner_id,
      store_id,
      item_type,
      quantity,
      product_id,
      service_id,
      variant_id,
      products!left(id, name),
      services!left(id, name)
    `)
    .lt("updated_at", threshold)
    .eq("selected", true)

  if (error) {
    console.error("[cart-abandonment] Error fetching cart items:", error.message)
    return result
  }

  if (!cartItems || cartItems.length === 0) {
    return result
  }

  const cartsByUser = groupCartItemsByUser(cartItems as any[])
  const userIds = Object.keys(cartsByUser)
  const [cooldowns, profiles] = await Promise.all([
    fetchCooldowns(client, userIds),
    fetchUserProfiles(client, userIds),
  ])

  const entries = Object.entries(cartsByUser)
  for (const [userId, items] of entries) {
    result.processed++

    if (cooldowns.has(userId)) {
      result.skippedCooldown++
      continue
    }

    const firstItem = items[0]
    const partnerId = firstItem.partner_id
    const storeId = firstItem.store_id ? String(firstItem.store_id) : null
    const storeName = await resolveStoreName(client, partnerId, firstItem.store_id)

    const productNames = buildProductNames(items)
    const itemCount = items.length
    const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 1), 0)

    const profile = profiles.get(userId)
    const customerName = profile?.fullName?.trim() || undefined
    const phone = profile?.phone?.trim() || undefined

    const { title, message } = buildNotificationContent("cart_abandoned", "customer", {
      storeName,
      itemCount,
      productNames,
      customerName,
    })

    const idempotencyKey = buildIdempotencyKey(
      "cart_abandoned",
      "cart",
      `user-${userId}`,
      userId,
      `sweep-${now.slice(0, 10)}`,
    )

    try {
      await createNotification({
        userId,
        type: "cart_abandoned",
        title,
        message,
        entityType: "cart",
        entityId: null,
        data: {
          itemCount,
          totalQuantity,
          storeName,
          store_id: storeId,
          productNames,
          customerName,
          customer_name: customerName,
          phone,
          partner_id: partnerId,
          audience: "customer",
        },
        idempotencyKey,
        origin: "system",
      })
      result.notified++
    } catch (err) {
      result.errors++
      console.error(
        `[cart-abandonment] Error creating notification for user ${userId}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return result
}

function groupCartItemsByUser(cartItems: any[]): Record<string, CartItemAgg[]> {
  const result: Record<string, CartItemAgg[]> = {}

  for (const item of cartItems) {
    const userId = String(item.user_id)
    if (!result[userId]) {
      result[userId] = []
    }

    const product = Array.isArray(item.products) ? item.products[0] : item.products
    const service = Array.isArray(item.services) ? item.services[0] : item.services

    const agg: CartItemAgg = {
      user_id: userId,
      partner_id: String(item.partner_id),
      store_id: item.store_id ? String(item.store_id) : null,
      item_type: item.item_type || "product",
      quantity: item.quantity || 1,
      product_id: item.product_id || null,
      service_id: item.service_id || null,
      variant_id: item.variant_id || null,
      productName: product?.name || service?.name || null,
    }
    result[userId].push(agg)
  }

  return result
}

function buildProductNames(items: CartItemAgg[]): string[] {
  const names: string[] = []
  for (const item of items) {
    if (item.productName && !names.includes(item.productName)) {
      names.push(item.productName)
      if (names.length >= MAX_PRODUCT_NAMES) {
        break
      }
    }
  }
  return names
}

async function resolveStoreName(
  client: ReturnType<typeof getAdminClient>,
  partnerId: string,
  storeId: string | null,
): Promise<string | undefined> {
  if (storeId) {
    const { data: store } = await client
      .from("stores")
      .select("name")
      .eq("id", storeId)
      .maybeSingle()
    if (store?.name) return store.name
  }

  const { data: hqStore } = await client
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  return hqStore?.name || undefined
}

async function fetchCooldowns(
  client: ReturnType<typeof getAdminClient>,
  userIds: string[],
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()

  const cutoff = new Date(Date.now() - NOTIFICATION_COOLDOWN_MS).toISOString()

  const { data, error } = await client
    .from("notifications")
    .select("user_id")
    .eq("type", "cart_abandoned")
    .in("user_id", userIds)
    .gte("created_at", cutoff)

  if (error) {
    console.error("[cart-abandonment] Error fetching cooldown notifications:", error.message)
    return new Set()
  }

  return new Set((data || []).map((row: { user_id: string }) => row.user_id))
}

async function fetchUserProfiles(
  client: ReturnType<typeof getAdminClient>,
  userIds: string[],
): Promise<Map<string, { fullName: string | null; phone: string | null }>> {
  if (userIds.length === 0) return new Map()

  try {
    const { data, error } = await client
      .from("user_profiles")
      .select("user_id, full_name, phone")
      .in("user_id", userIds)

    if (error) {
      console.error("[cart-abandonment] Error fetching user profiles:", error.message)
      return new Map()
    }

    return new Map(
      (data || []).map((row: { user_id: string; full_name: string | null; phone: string | null }) => [
        row.user_id,
        { fullName: row.full_name, phone: row.phone },
      ]),
    )
  } catch (err) {
    console.error("[cart-abandonment] Unexpected error fetching user profiles:", err)
    return new Map()
  }
}

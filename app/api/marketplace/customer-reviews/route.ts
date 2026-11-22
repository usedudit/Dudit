import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"

export async function GET(request: NextRequest) {
  const user = await requireUser()

  const customerId = request.nextUrl.searchParams.get("customerId")
  if (!customerId) {
    return NextResponse.json({ reviews: [] })
  }

  const supabase = createAdminClient()

  // Resolve the customer only through an existing link to the authenticated
  // marketplace account. Do not auto-link by email: a client-provided UUID
  // must never become an ownership bypass for an adminClient read.
  const { data: customer } = await supabase
    .from("customers")
    .select("id, partner_id, user_id, marketplace_user_id")
    .eq("id", customerId)
    .or(`user_id.eq.${user.id},marketplace_user_id.eq.${user.id}`)
    .maybeSingle()

  if (!customer) {
    return NextResponse.json({ reviews: [] })
  }

  const marketplaceUserId = customer.marketplace_user_id
  const userId = customer.user_id

  // 3. Find any orders for this customer under the current store (partner_id)
  const allCustomerIds = Array.from(
    new Set([customer.id, userId, marketplaceUserId].filter(Boolean))
  ) as string[]

  const orderOrParts: string[] = []
  for (const id of allCustomerIds) {
    orderOrParts.push(`customer_id.eq.${id}`)
    orderOrParts.push(`buyer_id.eq.${id}`)
  }

  const { data: customerOrders } = await supabase
    .from("orders")
    .select("id, buyer_id")
    .eq("partner_id", customer.partner_id)
    .or(orderOrParts.join(","))

  const orderIds = (customerOrders || []).map((o: any) => o.id).filter(Boolean)
  const orderBuyerIds = (customerOrders || []).map((o: any) => o.buyer_id).filter(Boolean)

  // 4. Collect all candidate user IDs (excluding customer.id UUID)
  const candidateUserIds = Array.from(
    new Set([userId, marketplaceUserId, ...orderBuyerIds].filter(Boolean))
  ) as string[]

  // 5. Build OR conditions for querying reviews (by user_id OR by order_id), strictly scoped to customer.partner_id
  const orConditions: string[] = []
  if (candidateUserIds.length > 0) {
    for (const uId of candidateUserIds) {
      orConditions.push(`user_id.eq.${uId}`)
    }
  }
  if (orderIds.length > 0) {
    for (const oId of orderIds) {
      orConditions.push(`order_id.eq.${oId}`)
    }
  }

  if (orConditions.length === 0) {
    return NextResponse.json({ reviews: [] })
  }

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select(`
      id,
      rating,
      comment,
      created_at,
      user_id,
      product_id,
      service_id,
      partner_id,
      order_id,
      products(name, images, unit),
      services(name, images, unit)
    `)
    .eq("partner_id", customer.partner_id)
    .is("deleted_at", null)
    .or(orConditions.join(","))
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const reviewOrderIds = Array.from(new Set((reviews || []).map((r: any) => r.order_id).filter(Boolean)))
  let orderItemsMap = new Map<string, { quantity: number | null; variant_name: string | null; variant_options: any }>()

  if (reviewOrderIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("order_items")
      .select(`
        id, order_id, quantity, product_id, service_id,
        product_variants(id, variant_name, variant_options)
      `)
      .in("order_id", reviewOrderIds)

    if (itemsData) {
      itemsData.forEach((item: any) => {
        const key = `${item.order_id}_${item.product_id || item.service_id}`
        orderItemsMap.set(key, {
          quantity: item.quantity,
          variant_name: item.product_variants?.variant_name || null,
          variant_options: item.product_variants?.variant_options || null,
        })
      })
    }
  }

  const reviewUserIds = Array.from(new Set((reviews || []).map((r: any) => r.user_id).filter(Boolean)))
  let profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()

  if (reviewUserIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("user_profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", reviewUserIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
          avatar_url: p.avatar_url,
        })
      })
    }
  }

  const enriched = (reviews || []).map((review: any) => {
    const itemKey = `${review.order_id}_${review.product_id || review.service_id}`
    const orderItem = orderItemsMap.get(itemKey)
    const product = review.products || null
    const service = review.services || null
    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      created_at: review.created_at,
      product_name: product?.name || null,
      service_name: service?.name || null,
      quantity: orderItem?.quantity || null,
      variant_name: orderItem?.variant_name || null,
      variant_options: orderItem?.variant_options || null,
      unit: product?.unit || service?.unit || null,
      products: product ? { name: product.name, images: product.images, unit: product.unit } : null,
      services: service ? { name: service.name, images: service.images, unit: service.unit } : null,
      profiles: profilesMap.get(review.user_id) || { full_name: "Usuário", avatar_url: null },
    }
  })

  return NextResponse.json({ reviews: enriched })
}

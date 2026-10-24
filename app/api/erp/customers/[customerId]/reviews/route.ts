import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await requireUser()
  const { customerId } = await params

  const supabase = createAdminClient()

  // Get the customer and verify it belongs to the user's partner
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, partner_id")
    .eq("id", customerId)
    .maybeSingle()

  if (customerError || !customer) {
    return NextResponse.json({ reviews: [] })
  }

  // Verify user has access to this partner
  const { data: partnerAccess } = await supabase
    .from("partners")
    .select("id")
    .eq("id", customer.partner_id)
    .eq("user_id", user.id)
    .maybeSingle()

  // Also check if user is a member of the partner
  const { data: memberAccess } = await supabase
    .from("partner_members")
    .select("partner_id")
    .eq("partner_id", customer.partner_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!partnerAccess && !memberAccess) {
    return NextResponse.json({ reviews: [] })
  }

  // Find all orders for this customer under the partner
  const { data: customerOrders } = await supabase
    .from("orders")
    .select("id, buyer_id, customer_id")
    .eq("partner_id", customer.partner_id)
    .or(`customer_id.eq.${customerId},buyer_id.eq.${customerId}`)

  const orderIds = (customerOrders || []).map((o: any) => o.id).filter(Boolean)
  const buyerIds = (customerOrders || []).map((o: any) => o.buyer_id).filter(Boolean)
  const customerIdsFromOrders = (customerOrders || []).map((o: any) => o.customer_id).filter(Boolean)

  // Collect all candidate user IDs that could have left reviews
  const candidateUserIds = Array.from(
    new Set([...buyerIds, ...customerIdsFromOrders].filter(Boolean))
  ) as string[]

  // Build OR conditions for querying reviews
  const orConditions: string[] = []
  
  // Search by user_id (marketplace users who placed orders)
  if (candidateUserIds.length > 0) {
    for (const uId of candidateUserIds) {
      orConditions.push(`user_id.eq.${uId}`)
    }
  }
  
  // Also search by order_id directly
  if (orderIds.length > 0) {
    for (const oId of orderIds) {
      orConditions.push(`order_id.eq.${oId}`)
    }
  }

  if (orConditions.length === 0) {
    return NextResponse.json({ reviews: [] })
  }

  // Fetch reviews
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
    .or(orConditions.join(","))
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with order item details (quantity, variant)
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

  // Enrich with user profiles
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
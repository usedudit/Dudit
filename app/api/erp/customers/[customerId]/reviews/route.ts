import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
  }

  const { customerId } = await params
  const supabase = createAdminClient()

  // Resolve the customer first, then validate the caller's access to its
  // partner. Never trust the customer id alone as an authorization boundary.
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, partner_id, user_id, marketplace_user_id")
    .eq("id", customerId)
    .maybeSingle()

  if (customerError) {
    console.error("[erp/customer-reviews] Customer lookup error:", customerError)
    return NextResponse.json({ error: customerError.message }, { status: 500 })
  }

  if (!customer) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
  }

  try {
    await requirePartnerAccessWithPermission(customer.partner_id, "customers", "view", user)
  } catch (error) {
    console.error("[erp/customer-reviews] Access denied:", error)
    return NextResponse.json({ error: "Acesso negado ao cliente" }, { status: 403 })
  }

  // A customer can be linked to a marketplace account through user_id and/or
  // marketplace_user_id. Legacy orders may also point buyer_id directly at the
  // customer id, so all variants are considered.
  const linkedIds = Array.from(
    new Set([customer.id, customer.user_id, customer.marketplace_user_id].filter(Boolean))
  ) as string[]

  const orderOrParts: string[] = []
  for (const id of linkedIds) {
    orderOrParts.push(`customer_id.eq.${id}`)
    orderOrParts.push(`buyer_id.eq.${id}`)
  }

  const { data: customerOrders, error: ordersError } = await supabase
    .from("orders")
    .select("id, buyer_id")
    .eq("partner_id", customer.partner_id)
    .or(orderOrParts.join(","))

  if (ordersError) {
    console.error("[erp/customer-reviews] Orders lookup error:", ordersError)
    return NextResponse.json({ error: ordersError.message }, { status: 500 })
  }

  const orderIds = Array.from(
    new Set((customerOrders || []).map((o: any) => o.id).filter(Boolean))
  ) as string[]
  const orderBuyerIds = Array.from(
    new Set((customerOrders || []).map((o: any) => o.buyer_id).filter(Boolean))
  ) as string[]

  // Collect all candidate user IDs that could have left reviews.
  const candidateUserIds = Array.from(
    new Set([
      customer.id,
      customer.user_id,
      customer.marketplace_user_id,
      ...orderBuyerIds,
    ].filter(Boolean))
  ) as string[]

  const orConditions: string[] = []
  if (candidateUserIds.length > 0) {
    orConditions.push(`user_id.in.(${candidateUserIds.join(",")})`)
  }
  if (orderIds.length > 0) {
    orConditions.push(`order_id.in.(${orderIds.join(",")})`)
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
    console.error("[erp/customer-reviews] Reviews lookup error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with order item details (quantity, variant)
  const reviewOrderIds = Array.from(new Set((reviews || []).map((r: any) => r.order_id).filter(Boolean)))
  const orderItemsMap = new Map<string, { quantity: number | null; variant_name: string | null; variant_options: any }>()

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
  const profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()

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

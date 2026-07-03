import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"

export async function GET(request: NextRequest) {
  await requireUser()

  const customerId = request.nextUrl.searchParams.get("customerId")
  if (!customerId) {
    return NextResponse.json({ reviews: [] })
  }

  const supabase = createAdminClient()

  const { data: customer } = await supabase
    .from("customers")
    .select("user_id, marketplace_user_id")
    .eq("id", customerId)
    .maybeSingle()

  const userId = customer?.user_id || customer?.marketplace_user_id
  if (!userId) {
    return NextResponse.json({ reviews: [] })
  }

  const { data: reviews, error } = await supabase
    .from("reviews")
    .select(`
      id,
      rating,
      comment,
      created_at,
      product_id,
      service_id,
      partner_id,
      order_id,
      products(name, images, slug, unit),
      services(name, images, slug, unit)
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const orderIds = Array.from(new Set((reviews || []).map((r: any) => r.order_id).filter(Boolean)))
  let orderItemsMap = new Map<string, { quantity: number | null; variant_name: string | null; variant_options: any }>()

  if (orderIds.length > 0) {
    const { data: itemsData } = await supabase
      .from("order_items")
      .select(`
        id, order_id, quantity, product_id, service_id,
        product_variants(id, variant_name, variant_options)
      `)
      .in("order_id", orderIds)

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
      partner_id: review.partner_id,
      quantity: orderItem?.quantity || null,
      variant_name: orderItem?.variant_name || null,
      variant_options: orderItem?.variant_options || null,
      unit: product?.unit || service?.unit || null,
      products: product ? { name: product.name, images: product.images, slug: product.slug, unit: product.unit } : null,
      services: service ? { name: service.name, images: service.images, slug: service.slug, unit: service.unit } : null,
    }
  })

  return NextResponse.json({ reviews: enriched })
}

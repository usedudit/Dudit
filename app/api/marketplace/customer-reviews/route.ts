import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  const customerId = request.nextUrl.searchParams.get("customerId")
  if (!customerId) {
    return NextResponse.json({ reviews: [] })
  }

  const supabase = createAdminClient()

  const { data: customer } = await supabase
    .from("customers")
    .select("marketplace_user_id")
    .eq("id", customerId)
    .maybeSingle()

  const userId = customer?.marketplace_user_id
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
      partner_id
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const enriched = await Promise.all(
    (reviews || []).map(async (review: any) => {
      let product_name: string | null = null
      let service_name: string | null = null

      if (review.product_id) {
        const { data: prod } = await supabase
          .from("products")
          .select("name")
          .eq("id", review.product_id)
          .maybeSingle()
        product_name = prod?.name || null
      } else if (review.service_id) {
        const { data: svc } = await supabase
          .from("services")
          .select("name")
          .eq("id", review.service_id)
          .maybeSingle()
        service_name = svc?.name || null
      }

      return {
        id: review.id,
        rating: review.rating,
        comment: review.comment,
        created_at: review.created_at,
        product_name,
        service_name,
        partner_id: review.partner_id,
      }
    }),
  )

  return NextResponse.json({ reviews: enriched })
}

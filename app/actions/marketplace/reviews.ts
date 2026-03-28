"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

async function checkFraudulentReview(
  supabase: any,
  userId: string,
  partnerId: string,
  productId: string | null,
  serviceId: string | null = null,
): Promise<{ isSuspicious: boolean; reason?: string }> {
  console.log(`[REVIEW CHECK] User: ${userId}, Partner: ${partnerId}, Product: ${productId}, Service: ${serviceId}`)

  // 1. Verificar se o usuário é o próprio dono do parceiro
  const { data: partner } = await supabase.from("partners").select("user_id").eq("id", partnerId).single()

  if (partner && partner.user_id === userId) {
    return { isSuspicious: true, reason: "Você não pode avaliar seus próprios produtos" }
  }

  // 2. Verificar se o usuário tem algum pedido pago DESTE produto/serviço
  // Selecionamos com !inner join em order_items para garantir que o item específico exista no pedido
  let query = supabase
    .from("orders")
    .select("id, order_items!inner(product_id, service_id)")
    .eq("buyer_id", userId)
    .eq("partner_id", partnerId)
    .eq("situation", "paid")

  if (productId) {
    query = query.eq("order_items.product_id", productId)
  } else if (serviceId) {
    query = query.eq("order_items.service_id", serviceId)
  }

  const { data: orders, error: ordersError } = await query

  if (ordersError) {
    console.error(`[REVIEW CHECK] Database error querying orders: ${ordersError.message}`)
    return { isSuspicious: true, reason: "Erro ao verificar histórico de compras" }
  }

  console.log(`[REVIEW CHECK] Found ${orders?.length || 0} matching paid orders`)

  if (!orders || orders.length === 0) {
    return { isSuspicious: true, reason: "Você precisa comprar este produto antes de avaliá-lo" }
  }

  // 3. Verificar se já avaliou este produto antes
  if (productId) {
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .maybeSingle()

    if (existingReview) {
      return { isSuspicious: true, reason: "Você já avaliou este produto" }
    }
  }

  // 4. Verificar padrão suspeito: muitas avaliações positivas do mesmo usuário para o mesmo parceiro
  const { data: userReviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)

  if (userReviews && userReviews.length >= 3) {
    const allHighRatings = userReviews.every((r: any) => r.rating >= 4)
    if (allHighRatings) {
      // Registrar atividade suspeita
      await supabase.from("fraud_checks").insert({
        user_id: userId,
        action_type: "suspicious_multiple_high_ratings",
        related_user_id: partner.user_id,
        metadata: {
          partner_id: partnerId,
          review_count: userReviews.length,
        },
      })
    }
  }

  // 5. Verificar se o usuário fez muitas compras recentes (possível conta fake)
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id, created_at")
    .eq("buyer_id", userId)
    .gte("created_at", thirtyDaysAgo.toISOString())

  if (recentOrders && recentOrders.length >= 5) {
    // Registrar atividade suspeita
    await supabase.from("fraud_checks").insert({
      user_id: userId,
      action_type: "high_frequency_orders",
      metadata: {
        order_count: recentOrders.length,
        period_days: 30,
      },
    })
  }

  return { isSuspicious: false }
}

async function updateProductRating(supabase: any, productId: string) {
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("product_id", productId)
    .not("rating", "is", null)

  if (!reviews || reviews.length === 0) {
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await supabase.from("products").update({ rating: averageRating }).eq("id", productId)
}

async function updatePartnerRating(supabase: any, partnerId: string) {
  // Get all products from this partner
  const { data: products } = await supabase.from("products").select("id").eq("partner_id", partnerId)

  if (!products || products.length === 0) {
    return
  }

  const productIds = products.map((p: any) => p.id)

  // Get all reviews for all products of this partner
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .in("product_id", productIds)
    .not("rating", "is", null)

  if (!reviews || reviews.length === 0) {
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await supabase.from("partners").update({ rating: averageRating }).eq("id", partnerId)
}

export async function createReviewAction(data: {
  orderId: string
  partnerId: string
  productId: string | null
  serviceId: string | null
  rating: number
  comment: string
  csrf_token?: string
}) {
  await requireRateLimit(RateLimitCategory.REVIEW_CREATE)

  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const supabase = await getSupabaseServerClient()

  // SECURITY: Use server-verified user identity instead of client-provided userId
  const currentUser = await requireUser()
  const userId = currentUser.id

  const fraudCheck = await checkFraudulentReview(supabase, userId, data.partnerId, data.productId, data.serviceId)

  if (fraudCheck.isSuspicious) {
    return { error: fraudCheck.reason || "Não foi possível criar a avaliação" }
  }

  const { error } = await supabase.from("reviews").insert({
    order_id: data.orderId,
    user_id: userId,
    partner_id: data.partnerId,
    product_id: data.productId,
    service_id: data.serviceId,
    rating: data.rating,
    comment: data.comment || null,
  })

  if (error) {
    return { error: error.message }
  }

  if (data.productId) {
    await updateProductRating(supabase, data.productId)
  }
  await updatePartnerRating(supabase, data.partnerId)

  revalidatePath("/my-orders")
  revalidatePath("/marketplace")
  revalidatePath(`/marketplace/products/${data.productId}`)

  return { success: true }
}

export async function updateReviewAction(reviewId: string, data: {
  rating: number
  comment: string
  csrf_token?: string
}) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  // Verify user owns this review
  const { data: review } = await supabase
    .from("reviews")
    .select("user_id")
    .eq("id", reviewId)
    .single()

  if (!review || review.user_id !== user.id) {
    return { error: "Você não tem permissão para editar esta avaliação" }
  }

  const { error } = await supabase
    .from("reviews")
    .update({
      rating: data.rating,
      comment: data.comment || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId)

  if (error) {
    return { error: error.message }
  }

  // Trigger will automatically update partner and product ratings
  revalidatePath("/marketplace")


  return { success: true }
}

export async function deleteReviewAction(reviewId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  // Verify user owns this review
  const { data: review } = await supabase
    .from("reviews")
    .select("user_id, product_id")
    .eq("id", reviewId)
    .single()

  if (!review || review.user_id !== user.id) {
    return { error: "Você não tem permissão para deletar esta avaliação" }
  }

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)

  if (error) {
    return { error: error.message }
  }

  // Trigger will automatically update partner and product ratings
  revalidatePath("/marketplace")
  if (review.product_id) {
    revalidatePath(`/marketplace/products/${review.product_id}`)
  }


  return { success: true }
}



// SECURITY FIX (MED-04): userId derived from session, not client parameter
export async function canUserReviewProduct(productId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient()
  const user = await requireUser()
  if (!user) return false
  const userId = user.id

  // Check if user has purchased this product with paid order
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      id,
      order_items!inner(product_id)
    `)
    .eq("buyer_id", userId)
    .eq("situation", "paid")
    .eq("order_items.product_id", productId)

  if (!orders || orders.length === 0) {
    return false
  }

  // Check if user already reviewed this product
  const { data: existingReview } = await supabase
    .from("reviews")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle()

  return !existingReview
}

export async function getProductReviews(productId: string) {
  const supabase = await getSupabaseServerClient()

  const { data: reviews } = await supabase
    .from("reviews")
    .select(`
      *,
      profiles:user_id(full_name, profile_image_url)
    `)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })

  return reviews || []
}

export async function getPartnerReviews(partnerId: string) {
  const supabase = await getSupabaseServerClient()

  const { data: reviews } = await supabase
    .from("reviews")
    .select(`
      *,
      profiles:user_id(full_name, profile_image_url),
      products(name, images),
      services(name, images)
    `)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })

  return reviews || []
}

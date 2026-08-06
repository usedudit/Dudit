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
  storeId?: string | null,
): Promise<{ isSuspicious: boolean; reason?: string }> {
  console.log(`[REVIEW CHECK] User: ${userId}, Partner: ${partnerId}, Product: ${productId}, Service: ${serviceId}`)

  // 1. Verificar se o usuário é o próprio dono do parceiro
  const { createAdminClient } = await import("@/lib/supabase/server")
  const adminSupabase = createAdminClient()
  const { data: partner } = await adminSupabase.from("partners").select("user_id").eq("id", partnerId).single()

  if (partner && partner.user_id === userId) {
    return { isSuspicious: true, reason: "Você não pode avaliar seus próprios produtos" }
  }

  // 2. Verificar se o usuário tem algum pedido pago DESTE produto/serviço
  let orders = null;

  if (productId) {
    let query = supabase
      .from("orders")
      .select("id, order_items!inner(product_id)")
      .eq("buyer_id", userId)
      .in("situation", ["paid", "shipped", "delivered"])
      .eq("order_items.product_id", productId)

    if (storeId) {
      query = query.eq("store_id", storeId)
    } else {
      query = query.eq("partner_id", partnerId)
    }

    const { data, error } = await query
    if (error) {
      console.error(`[REVIEW CHECK] Database error querying orders: ${error.message}`)
      return { isSuspicious: true, reason: "Erro ao verificar histórico de compras" }
    }
    orders = data;
  } else if (serviceId) {
    let query = supabase
      .from("orders")
      .select("id, order_items!inner(service_id)")
      .eq("buyer_id", userId)
      .in("situation", ["paid", "shipped", "delivered"])
      .eq("order_items.service_id", serviceId)

    if (storeId) {
      query = query.eq("store_id", storeId)
    } else {
      query = query.eq("partner_id", partnerId)
    }

    const { data, error } = await query
    if (error) {
      console.error(`[REVIEW CHECK] Database error querying orders: ${error.message}`)
      return { isSuspicious: true, reason: "Erro ao verificar histórico de compras" }
    }
    orders = data;
  }

  console.log(`[REVIEW CHECK] Found ${orders?.length || 0} matching paid orders`)

  if (!orders || orders.length === 0) {
    return { isSuspicious: true, reason: productId ? "Você precisa comprar este produto antes de avaliá-lo" : "Você precisa comprar este serviço antes de avaliá-lo" }
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
  } else if (serviceId) {
    const { data: existingReview } = await supabase
      .from("reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("service_id", serviceId)
      .maybeSingle()

    if (existingReview) {
      return { isSuspicious: true, reason: "Você já avaliou este serviço" }
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
        related_user_id: partner?.user_id || null,
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

async function updateServiceRating(supabase: any, serviceId: string) {
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("service_id", serviceId)
    .not("rating", "is", null)

  if (!reviews || reviews.length === 0) {
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await supabase.from("services").update({ rating: averageRating }).eq("id", serviceId)
}

async function updateStoreRating(supabase: any, storeId: string) {
  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("store_id", storeId)
    .not("rating", "is", null)

  if (!reviews || reviews.length < 3) {
    await supabase.from("stores").update({ rating: 0 }).eq("id", storeId)
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
  await supabase.from("stores").update({ rating: averageRating }).eq("id", storeId)
}

async function updatePartnerRating(supabase: any, partnerId: string) {
  // Get all reviews directly for this partner (both product and service reviews)
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("partner_id", partnerId)
    .not("rating", "is", null)

  if (error) {
    console.error(`[Reviews] Error fetching ratings for partner ${partnerId}:`, error.message)
    return
  }

  if (!reviews || reviews.length === 0) {
    // If no reviews, set store rating to 0
    await supabase.from("stores").update({ rating: 0 }).eq("partner_id", partnerId)
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await supabase.from("stores").update({ rating: averageRating }).eq("partner_id", partnerId)
}

export async function createReviewAction(data: {
  orderId: string
  partnerId: string
  productId: string | null
  serviceId: string | null
  storeId?: string | null
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

  const fraudCheck = await checkFraudulentReview(supabase, userId, data.partnerId, data.productId, data.serviceId, data.storeId)

  if (fraudCheck.isSuspicious) {
    return { error: fraudCheck.reason || "Não foi possível criar a avaliação" }
  }

  const { error } = await supabase.from("reviews").insert({
    order_id: data.orderId,
    user_id: userId,
    partner_id: data.partnerId,
    store_id: data.storeId || null,
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
  if (data.serviceId) {
    await updateServiceRating(supabase, data.serviceId)
  }
  await updatePartnerRating(supabase, data.partnerId)
  if (data.storeId) {
    await updateStoreRating(supabase, data.storeId)
  }

  // Invalidate partner cache tags to ensure seller page shows real-time stats
  try {
    const { revalidatePartnerProfile } = await import("@/lib/utils/revalidation")
    await revalidatePartnerProfile(data.partnerId)
    const { revalidateTag } = await import("next/cache")
    revalidateTag("partner-reviews", "max")
    revalidateTag(`partner-${data.partnerId}`, "max")
    if (data.storeId) {
      revalidateTag(`store-${data.storeId}`, "max")
      revalidateTag("store-reviews", "max")
      revalidateTag("store-stats", "max")
    }
  } catch (revalError) {
    console.error("[Reviews] Failed to revalidate partner details:", revalError)
  }

  revalidatePath("/pedidos")
  revalidatePath("/marketplace")
  if (data.productId) {
    revalidatePath(`/marketplace/products/${data.productId}`)
  }

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
    .select("user_id, partner_id, store_id, product_id, service_id")
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

  if (review.product_id) {
    await updateProductRating(supabase, review.product_id)
  }
  if (review.service_id) {
    await updateServiceRating(supabase, review.service_id)
  }
  await updatePartnerRating(supabase, review.partner_id)
  if (review.store_id) {
    await updateStoreRating(supabase, review.store_id)
  }

  // Invalidate cache tags
  try {
    const { revalidatePartnerProfile } = await import("@/lib/utils/revalidation")
    await revalidatePartnerProfile(review.partner_id)
    const { revalidateTag } = await import("next/cache")
    revalidateTag("partner-reviews", "max")
    revalidateTag(`partner-${review.partner_id}`, "max")
  } catch (revalError) {
    console.error("[Reviews] Failed to revalidate partner details:", revalError)
  }

  revalidatePath("/marketplace")
  revalidatePath("/pedidos")
  if (review.product_id) {
    revalidatePath(`/marketplace/products/${review.product_id}`)
  }

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
    .select("user_id, partner_id, store_id, product_id, service_id")
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

  if (review.product_id) {
    await updateProductRating(supabase, review.product_id)
  }
  if (review.service_id) {
    await updateServiceRating(supabase, review.service_id)
  }
  await updatePartnerRating(supabase, review.partner_id)
  if (review.store_id) {
    await updateStoreRating(supabase, review.store_id)
  }

  // Invalidate cache tags
  try {
    const { revalidatePartnerProfile } = await import("@/lib/utils/revalidation")
    await revalidatePartnerProfile(review.partner_id)
    const { revalidateTag } = await import("next/cache")
    revalidateTag("partner-reviews", "max")
    revalidateTag(`partner-${review.partner_id}`, "max")
    if (review.store_id) {
      revalidateTag(`store-${review.store_id}`, "max")
      revalidateTag("store-reviews", "max")
      revalidateTag("store-stats", "max")
    }
  } catch (revalError) {
    console.error("[Reviews] Failed to revalidate partner details:", revalError)
  }

  revalidatePath("/marketplace")
  revalidatePath("/pedidos")
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

  const { data: reviewsData, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return []
  }

  const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
  const profilesMap = new Map<string, { full_name: string; profile_image_url: string | null }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
          profile_image_url: null
        })
      })
    }
  }

  return reviewsData.map((r: any) => ({
    ...r,
    profiles: profilesMap.get(r.user_id) || { full_name: "Usuário", profile_image_url: null }
  }))
}

export async function getPartnerReviews(partnerId: string, storeId?: string | null) {
  const supabase = await getSupabaseServerClient()

  let query = supabase
    .from("reviews")
    .select(`
      *,
      products(name, images, unit),
      services(name, images, unit)
    `)
    .order("created_at", { ascending: false })

  if (storeId) {
    query = query.eq("store_id", storeId)
  } else {
    query = query.eq("partner_id", partnerId)
  }

  const { data: reviewsData, error } = await query

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return []
  }

  const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
  const profilesMap = new Map<string, { full_name: string; profile_image_url: string | null }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await supabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
          profile_image_url: null
        })
      })
    }
  }

  const orderIds = Array.from(new Set(reviewsData.map((r: any) => r.order_id).filter(Boolean)))
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

  return reviewsData.map((r: any) => {
    const itemKey = `${r.order_id}_${r.product_id || r.service_id}`
    const orderItem = orderItemsMap.get(itemKey)
    const product = r.products || null
    const service = r.services || null
    return {
      ...r,
      profiles: profilesMap.get(r.user_id) || { full_name: "Usuário", profile_image_url: null },
      quantity: orderItem?.quantity || null,
      variant_name: orderItem?.variant_name || null,
      variant_options: orderItem?.variant_options || null,
      unit: product?.unit || service?.unit || null,
    }
  })
}

export async function getBuyerReviewsAction() {
  const supabase = await getSupabaseServerClient()
  const user = await requireUser()

  const { data: reviewsData, error } = await supabase
    .from("reviews")
    .select(`
      *,
      products(id, name, images, video_thumbnail),
      services(id, name, images),
      partners(id),\r\n      stores(id, name, logo_url, addresses!store_id!left(city, state))
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return { success: false, error: error?.message || "Erro ao buscar avaliações" }
  }

  return { success: true, data: reviewsData }
}

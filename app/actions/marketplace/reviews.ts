"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sendSuspiciousReview } from "@/lib/services/discord-marketplace-webhook.service"

async function checkFraudulentReview(
  adminSupabase: any,
  userId: string,
  partnerId: string,
  productId: string | null,
  serviceId: string | null = null,
  storeId?: string | null,
): Promise<{ isSuspicious: boolean; reason?: string }> {
  console.log(`[REVIEW CHECK] User: ${userId}, Partner: ${partnerId}, Product: ${productId}, Service: ${serviceId}`)

  // 1. Verificar se o usuário é o próprio dono do parceiro
  const { data: partner } = await adminSupabase.from("partners").select("user_id").eq("id", partnerId).single()

  if (partner && partner.user_id === userId) {
    return { isSuspicious: true, reason: "Você não pode avaliar seus próprios produtos" }
  }

  // 2. Verificar se o usuário tem algum pedido pago DESTE produto/serviço
  let orders = null;

  if (productId) {
    let query = adminSupabase
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
    let query = adminSupabase
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
    const { data: existingReview } = await adminSupabase
      .from("reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("product_id", productId)
      .maybeSingle()

    if (existingReview) {
      return { isSuspicious: true, reason: "Você já avaliou este produto" }
    }
  } else if (serviceId) {
    const { data: existingReview } = await adminSupabase
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
  const { data: userReviews } = await adminSupabase
    .from("reviews")
    .select("rating")
    .eq("user_id", userId)
    .eq("partner_id", partnerId)

  if (userReviews && userReviews.length >= 3) {
    const allHighRatings = userReviews.every((r: any) => r.rating >= 4)
    if (allHighRatings) {
      // Registrar atividade suspeita
      await adminSupabase.from("fraud_checks").insert({
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

  const { data: recentOrders } = await adminSupabase
    .from("orders")
    .select("id, created_at")
    .eq("buyer_id", userId)
    .gte("created_at", thirtyDaysAgo.toISOString())

  if (recentOrders && recentOrders.length >= 5) {
    // Registrar atividade suspeita
    await adminSupabase.from("fraud_checks").insert({
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

async function updateProductRating(adminSupabase: any, productId: string) {
  const { data: reviews } = await adminSupabase
    .from("reviews")
    .select("rating")
    .eq("product_id", productId)
    .not("rating", "is", null)

  if (!reviews || reviews.length === 0) {
    await adminSupabase.from("products").update({ rating: 0 }).eq("id", productId)
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await adminSupabase.from("products").update({ rating: averageRating }).eq("id", productId)
}

async function updateServiceRating(adminSupabase: any, serviceId: string) {
  const { data: reviews } = await adminSupabase
    .from("reviews")
    .select("rating")
    .eq("service_id", serviceId)
    .not("rating", "is", null)

  if (!reviews || reviews.length === 0) {
    await adminSupabase.from("services").update({ rating: 0 }).eq("id", serviceId)
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await adminSupabase.from("services").update({ rating: averageRating }).eq("id", serviceId)
}

async function updateStoreRating(adminSupabase: any, storeId: string) {
  const { data: reviews } = await adminSupabase
    .from("reviews")
    .select("rating")
    .eq("store_id", storeId)
    .not("rating", "is", null)

  if (!reviews || reviews.length < 3) {
    await adminSupabase.from("stores").update({ rating: 0 }).eq("id", storeId)
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
  await adminSupabase.from("stores").update({ rating: averageRating }).eq("id", storeId)
}

async function updatePartnerRating(adminSupabase: any, partnerId: string) {
  // Get all reviews directly for this partner (both product and service reviews)
  const { data: reviews, error } = await adminSupabase
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
    await adminSupabase.from("stores").update({ rating: 0 }).eq("partner_id", partnerId)
    return
  }

  const averageRating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length

  await adminSupabase.from("stores").update({ rating: averageRating }).eq("partner_id", partnerId)
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

  // SECURITY: Use server-verified user identity instead of client-provided userId
  const currentUser = await requireUser()
  const userId = currentUser.id

  if (!data.rating || typeof data.rating !== "number" || data.rating < 1 || data.rating > 5) {
    return { error: "Avaliação deve ter nota entre 1 e 5" }
  }

  const adminSupabase = createAdminClient()

  const fraudCheck = await checkFraudulentReview(adminSupabase, userId, data.partnerId, data.productId, data.serviceId, data.storeId)

  if (fraudCheck.isSuspicious) {
    // Webhook Discord: notificar tentativa de review suspeita (fail-open)
    sendSuspiciousReview({
      userId,
      userEmail: currentUser.email,
      productId: data.productId || undefined,
      serviceId: data.serviceId || undefined,
      partnerId: data.partnerId,
      reason: fraudCheck.reason || "Padrão suspeito detectado",
      rating: data.rating,
    }).catch(err => console.warn("[REVIEWS] Discord webhook failed (non-blocking):", err))

    return { error: fraudCheck.reason || "Não foi possível criar a avaliação" }
  }

  const { error } = await adminSupabase.from("reviews").insert({
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
    console.error("[Reviews] Error inserting review:", error.message)
    return { error: error.message }
  }

  if (data.productId) {
    await updateProductRating(adminSupabase, data.productId)
  }
  if (data.serviceId) {
    await updateServiceRating(adminSupabase, data.serviceId)
  }
  if (data.storeId) {
    await updateStoreRating(adminSupabase, data.storeId)
  } else {
    await updatePartnerRating(adminSupabase, data.partnerId)
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

  const user = await requireUser()
  const adminSupabase = createAdminClient()

  if (!data.rating || typeof data.rating !== "number" || data.rating < 1 || data.rating > 5) {
    return { error: "Avaliação deve ter nota entre 1 e 5" }
  }

  // Verify user owns this review
  const { data: review } = await adminSupabase
    .from("reviews")
    .select("user_id, partner_id, store_id, product_id, service_id")
    .eq("id", reviewId)
    .single()

  if (!review || review.user_id !== user.id) {
    return { error: "Você não tem permissão para editar esta avaliação" }
  }

  const { error } = await adminSupabase
    .from("reviews")
    .update({
      rating: data.rating,
      comment: data.comment || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  if (review.product_id) {
    await updateProductRating(adminSupabase, review.product_id)
  }
  if (review.service_id) {
    await updateServiceRating(adminSupabase, review.service_id)
  }
  if (review.store_id) {
    await updateStoreRating(adminSupabase, review.store_id)
  } else {
    await updatePartnerRating(adminSupabase, review.partner_id)
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

export async function deleteReviewAction(reviewId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()
  const adminSupabase = createAdminClient()

  // Verify user owns this review
  const { data: review } = await adminSupabase
    .from("reviews")
    .select("user_id, partner_id, store_id, product_id, service_id")
    .eq("id", reviewId)
    .single()

  if (!review || review.user_id !== user.id) {
    return { error: "Você não tem permissão para deletar esta avaliação" }
  }

  const { error } = await adminSupabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", user.id)

  if (error) {
    return { error: error.message }
  }

  if (review.product_id) {
    await updateProductRating(adminSupabase, review.product_id)
  }
  if (review.service_id) {
    await updateServiceRating(adminSupabase, review.service_id)
  }
  if (review.store_id) {
    await updateStoreRating(adminSupabase, review.store_id)
  } else {
    await updatePartnerRating(adminSupabase, review.partner_id)
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
  const adminSupabase = createAdminClient()
  const user = await requireUser()
  if (!user) return false
  const userId = user.id

  // Check if user has purchased this product with paid order
  const { data: orders } = await adminSupabase
    .from("orders")
    .select(`
      id,
      order_items!inner(product_id)
    `)
    .eq("buyer_id", userId)
    .in("situation", ["paid", "shipped", "delivered"])
    .eq("order_items.product_id", productId)

  if (!orders || orders.length === 0) {
    return false
  }

  // Check if user already reviewed this product
  const { data: existingReview } = await adminSupabase
    .from("reviews")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle()

  return !existingReview
}

export async function getProductReviews(productId: string) {
  const adminSupabase = createAdminClient()

  const { data: reviewsData, error } = await adminSupabase
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return []
  }

  const userIds = Array.from(new Set(reviewsData.map((r: any) => r.user_id).filter(Boolean)))
  const profilesMap = new Map<string, { full_name: string }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await adminSupabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
        })
      })
    }
  }

  return reviewsData.map((r: any) => ({
    ...r,
    profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" }
  }))
}

export async function getPartnerReviews(partnerId: string, storeId?: string | null) {
  const adminSupabase = createAdminClient()

  let query = adminSupabase
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
  const profilesMap = new Map<string, { full_name: string }>()

  if (userIds.length > 0) {
    const { data: profilesData } = await adminSupabase
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", userIds)

    if (profilesData) {
      profilesData.forEach((p: any) => {
        profilesMap.set(p.user_id, {
          full_name: p.full_name,
        })
      })
    }
  }

  const orderIds = Array.from(new Set(reviewsData.map((r: any) => r.order_id).filter(Boolean)))
  let orderItemsMap = new Map<string, { quantity: number | null; variant_name: string | null; variant_options: any }>()

  if (orderIds.length > 0) {
    const { data: itemsData } = await adminSupabase
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
      profiles: profilesMap.get(r.user_id) || { full_name: "Usuário" },
      quantity: orderItem?.quantity || null,
      variant_name: orderItem?.variant_name || null,
      variant_options: orderItem?.variant_options || null,
      unit: product?.unit || service?.unit || null,
    }
  })
}

export async function getBuyerReviewsAction() {
  const adminSupabase = createAdminClient()
  const user = await requireUser()

  const { data: reviewsData, error } = await adminSupabase
    .from("reviews")
    .select(`
      *,
      products(id, short_id, name, images, video_thumbnail),
      services(id, short_id, name, images),
      partners(id),
      stores(id, short_id, slug, name, logo_url, addresses!store_id!left(city, state))
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return { success: false, error: error?.message || "Erro ao buscar avaliações" }
  }

  return { success: true, data: reviewsData }
}

export async function getBuyerReviewsPaginatedAction(page: number = 1, limit: number = 10) {
  const adminSupabase = createAdminClient()
  const user = await requireUser()

  const offset = (Math.max(1, page) - 1) * limit

  const [reviewsResult, countResult] = await Promise.all([
    adminSupabase
      .from("reviews")
      .select(`
        *,
        products(id, short_id, name, images, video_thumbnail),
        services(id, short_id, name, images),
        partners(id),
        stores(id, short_id, slug, name, logo_url, addresses!store_id!left(city, state))
      `)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    adminSupabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
  ])

  const { data: reviewsData, error } = reviewsResult

  if (error || !reviewsData) {
    console.error("[Reviews] Fetch error:", error?.message)
    return { success: false, error: error?.message || "Erro ao buscar avaliações", data: [], total: 0 }
  }

  const total = countResult.count || 0

  return { success: true, data: reviewsData, total }
}

"use server"

import { revalidateTag } from "next/cache"
import { TAGS } from "./revalidation-tags"
import { redis } from "@/lib/redis"

const GLOBAL_VERSION_KEY = "marketplace:global_cache_version"

// Helper interno para evitar repetição do "max"
export async function safeRevalidateTag(tag: string) {
  try {
    console.log(`[Revalidation] Triggering tag: ${tag}`)
    // @ts-ignore - The project environment requires a second profile argument "max"
    revalidateTag(tag, "max")
  } catch (err) {
    console.error(`[Revalidation] Failed to trigger tag: ${tag}`, err)
  }
}

/**
 * Revalida dados de PRODUTOS
 */
export async function revalidateProducts(partnerId: string, productId?: string) {
  // Limpa a lista de produtos desse parceiro
  if (partnerId) {
    await safeRevalidateTag(TAGS.products(partnerId))
    await safeRevalidateTag(partnerId) // Tag genérica do parceiro
    await safeRevalidateTag(`partner-${partnerId}`) // Just in case, explicit call as requested by user
  }

  // Limpa o cache do produto específico (detalhes)
  if (productId) {
    await safeRevalidateTag(TAGS.product(productId))
  }

  // Limpa a lista geral
  await safeRevalidateTag("products")
}

/**
 * Revalida dados de PEDIDOS
 */
export async function revalidateOrders(partnerId: string) {
  if (partnerId) {
    await safeRevalidateTag(TAGS.orders(partnerId))
    await safeRevalidateTag(partnerId)
  }
  await safeRevalidateTag("orders")
}

/**
 * Revalida dados de MARKETPLACE e CATEGORIAS
 */
export async function revalidateMarketplace() {
  await safeRevalidateTag(TAGS.marketplace)
  await safeRevalidateTag(TAGS.categories)
}

/**
 * Revalida dados de FORNECEDORES
 */
export async function revalidateSuppliers(partnerId: string) {
  if (partnerId) {
    await safeRevalidateTag(TAGS.suppliers(partnerId))
  }
  await safeRevalidateTag("suppliers")
}

/**
 * Revalida dados do CARRINHO
 */
export async function revalidateCart(userId?: string) {
  if (userId) {
    await safeRevalidateTag(TAGS.cart(userId))
  }
  await safeRevalidateTag(TAGS.cart()) // tag global "cart"
}

/**
 * Revalida dados de ENDEREÇOS
 */
export async function revalidateAddresses(entityType: string, entityId: string) {
  await safeRevalidateTag(TAGS.addresses(entityType, entityId))
}

/**
 * Revalida PERFIL do parceiro
 */
export async function revalidatePartnerProfile(partnerId: string) {
  await safeRevalidateTag(TAGS.partnerProfile(partnerId))
  await safeRevalidateTag(TAGS.partner(partnerId))
}

/**
 * Revalida STATUS do parceiro (usado no onboarding)
 */
export async function revalidatePartnerStatus() {
  await safeRevalidateTag(TAGS.partnerStatus)
}

/**
 * Revalida o Cache O(1) do Redis/Explore/Home no Next.js App Router
 */
export async function revalidateExploreSearch() {
  // 1. Increment global Redis version to invalidate all cached query results (O(1) invalidation)
  try {
    await redis.incr(GLOBAL_VERSION_KEY)
  } catch (err) {
    console.error("[Redis] Failed to incr cache version:", err)
  }

  // 2. Clear Next.js cache tags for lists
  await safeRevalidateTag('marketplace-search')
  await safeRevalidateTag('home-products')
  await safeRevalidateTag('explore-products')
}

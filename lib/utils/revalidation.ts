"use server"

import { revalidateTag } from "next/cache"
import { TAGS } from "./revalidation-tags"

// Helper interno para evitar repetição do "max"
function safeRevalidateTag(tag: string) {
  // @ts-ignore - Ignora erro se a tipagem local mudar, mas garante o envio do 'max'
  revalidateTag(tag, "max")
}

/**
 * Revalida dados de PRODUTOS
 */
export async function revalidateProducts(partnerId: string, productId?: string) {
  // Limpa a lista de produtos desse parceiro
  if (partnerId) {
    safeRevalidateTag(TAGS.products(partnerId))
    safeRevalidateTag(partnerId) // Tag genérica do parceiro
    safeRevalidateTag(`partner-${partnerId}`) // Just in case, explicit call as requested by user
  }

  // Limpa o cache do produto específico (detalhes)
  if (productId) {
    safeRevalidateTag(TAGS.product(productId))
  }

  // Limpa a lista geral
  safeRevalidateTag("products")
}

/**
 * Revalida dados de PEDIDOS
 */
export async function revalidateOrders(partnerId: string) {
  if (partnerId) {
    safeRevalidateTag(TAGS.orders(partnerId))
    safeRevalidateTag(partnerId)
  }
  safeRevalidateTag("orders")
}

/**
 * Revalida dados de MARKETPLACE e CATEGORIAS
 */
export async function revalidateMarketplace() {
  safeRevalidateTag(TAGS.marketplace)
  safeRevalidateTag(TAGS.categories)
}

/**
 * Revalida dados de FORNECEDORES
 */
export async function revalidateSuppliers(partnerId: string) {
  if (partnerId) {
    safeRevalidateTag(TAGS.suppliers(partnerId))
  }
  safeRevalidateTag("suppliers")
}

/**
 * Revalida dados do CARRINHO
 */
export async function revalidateCart(userId?: string) {
  if (userId) {
    safeRevalidateTag(TAGS.cart(userId))
  }
  safeRevalidateTag(TAGS.cart()) // tag global "cart"
}

/**
 * Revalida dados de ENDEREÇOS
 */
export async function revalidateAddresses(entityType: string, entityId: string) {
  safeRevalidateTag(TAGS.addresses(entityType, entityId))
}

/**
 * Revalida PERFIL do parceiro
 */
export async function revalidatePartnerProfile(partnerId: string) {
  safeRevalidateTag(TAGS.partnerProfile(partnerId))
  safeRevalidateTag(TAGS.partner(partnerId))
}

/**
 * Revalida STATUS do parceiro (usado no onboarding)
 */
export async function revalidatePartnerStatus() {
  safeRevalidateTag(TAGS.partnerStatus)
}

/**
 * Revalida o Cache O(1) do Redis/Explore/Home no Next.js App Router
 */
export async function revalidateExploreSearch() {
  safeRevalidateTag('marketplace-search')
  safeRevalidateTag('home-products')
  safeRevalidateTag('explore-products')
}

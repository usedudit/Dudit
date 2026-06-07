"use server"

import { revalidateTag, revalidatePath } from "next/cache"
import { TAGS } from "./revalidation-tags"
import { redis } from "@/lib/redis"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"

const GLOBAL_VERSION_KEY = "marketplace:global_cache_version"

// Helper interno para evitar repetição do "max"
export async function safeRevalidateTag(tag: string) {
    // @ts-ignore - Ignora erro se a tipagem local mudar, mas garante o envio do 'max'
    revalidateTag(tag, "max")
}

/**
 * Revalida dados de PRODUTOS
 */
export async function revalidateProducts(partnerId: string, productId?: string) {
    // Limpa a lista de produtos desse parceiro
    if (partnerId) {
        await safeRevalidateTag(TAGS.products(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.products(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.alerts(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.categories(partnerId))
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
        await safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.products(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.financial(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.metrics(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.alerts(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.revenue(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.revenueOrigin(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.activity(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.categories(partnerId))
        await safeRevalidateTag(partnerId)
        await safeRevalidateTag(`partner-${partnerId}-orders`)
    }
    await safeRevalidateTag("orders")

    // Clear router cache for relevant pages
    revalidatePath("/erp/orders")
    revalidatePath("/erp/dashboard")
    revalidatePath("/pedidos")
    revalidatePath("/", "layout")
}

export async function revalidateCoupons(partnerId: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.coupons(partnerId))
        await safeRevalidateTag(partnerId)
    }
    await safeRevalidateTag("coupons")
    revalidatePath("/erp/coupons")
}

/**
 * Revalida histórico de um pedido específico
 */
export async function revalidateOrderHistory(orderId: string) {
    if (!orderId) return
    await safeRevalidateTag(TAGS.orderHistory(orderId))
}

export async function revalidateTransactionHistory(transactionId: string) {
    if (!transactionId) return
    await safeRevalidateTag(TAGS.transactionHistory(transactionId))
}

/**
 * Revalida dados de ORÇAMENTOS
 */
export async function revalidateQuotes(partnerId: string, quoteId?: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.quotes(partnerId))
        await safeRevalidateTag(partnerId)
    }
    if (quoteId) {
        await safeRevalidateTag(`quote-${quoteId}`)
    }
    await safeRevalidateTag("quotes")
    revalidatePath("/erp/quotes")
}

export async function revalidateQuoteHistory(quoteId: string) {
    if (!quoteId) return
    await safeRevalidateTag(TAGS.quoteHistory(quoteId))
}

/**
 * Revalida timeline unificado de uma entidade.
 * Also revalidates legacy history tags for backward compatibility.
 */
export async function revalidateEntityTimeline(entityType: string, entityId: string) {
    if (!entityId) return
    await safeRevalidateTag(TAGS.entityTimeline(entityType, entityId))
    // Also invalidate legacy per-entity history caches
    if (entityType === "transaction") await safeRevalidateTag(TAGS.transactionHistory(entityId))
    if (entityType === "order") await safeRevalidateTag(TAGS.orderHistory(entityId))
    if (entityType === "quote") await safeRevalidateTag(TAGS.quoteHistory(entityId))
}

/**
 * Revalida dados de CLIENTES
 */
export async function revalidateCustomers(partnerId: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.customers(partnerId))
    }
    await safeRevalidateTag("customers")
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
 * Revalida dados de MOVIMENTAÇÕES DE ESTOQUE
 */
export async function revalidateStockMovements(partnerId: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.stockMovements(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.products(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.operations(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.alerts(partnerId))
    }
    await safeRevalidateTag("stock-movements")
}

/**
 * Revalida dados de TRANSAÇÕES FINANCEIRAS
 */
export async function revalidateTransactions(partnerId: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.transactions(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.financial(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.metrics(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.alerts(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.revenue(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.activity(partnerId))
    }
    await safeRevalidateTag("transactions")
    revalidatePath("/erp/resumo-financeiro")
    revalidatePath("/erp/dashboard")
    revalidatePath("/erp/transactions")
    revalidatePath("/erp/contas-a-pagar")
    revalidatePath("/erp/contas-a-receber")
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
    await safeRevalidateTag("partner-profile")
    await safeRevalidateTag(TAGS.partner(partnerId))
}

/**
 * Revalida STATUS do parceiro (usado no onboarding)
 */
export async function revalidatePartnerStatus() {
    await safeRevalidateTag(TAGS.partnerStatus)
}

/**
 * Revalida cache de acesso do usuário (lista de ERPs disponíveis).
 * Deve ser chamada quando:
 * - Usuário aceita convite (ganha acesso a novo ERP)
 * - Usuário é removido de equipe (perde acesso ao ERP)
 * - Role do usuário muda
 */
export async function revalidateUserAccess(userId: string) {
    await safeRevalidateTag(TAGS.userAccess(userId))
}

/**
 * Revalida a lista de convites de um parceiro.
 * Deve ser chamada quando convites são criados, revogados ou aceitos.
 */
export async function revalidatePartnerInvitations(partnerId: string) {
    await safeRevalidateTag(TAGS.partnerInvitations(partnerId))
}

/**
 * Revalida o Cache O(1) do Redis/Explore/Home no Next.js App Router
 */
export async function revalidateExploreSearch(options?: { silent?: boolean }) {
    // 1. Increment global Redis version to invalidate all cached query results (O(1) invalidation)
    // Only done for non-silent updates to avoid "thundering herd" re-renders of the home page
    if (!options?.silent) {
        try {
            await redis.incr(GLOBAL_VERSION_KEY)
        } catch (err) {
            console.error("[Redis] Failed to incr cache version:", err)
        }
    }

    // 2. Clear Next.js cache tags for lists
    await safeRevalidateTag('marketplace-search')
    await safeRevalidateTag('home-products')
    await safeRevalidateTag('explore-products')
}

"use server"

import { revalidateTag, revalidatePath } from "next/cache"
import { TAGS } from "./revalidation-tags"
import { DASHBOARD_TAGS } from "@/lib/data/dashboard"
import { REPORT_TAGS } from "@/lib/data/reports/cache"

// Helper interno para evitar repetição do "max"
export async function safeRevalidateTag(tag: string) {
    try {
        // @ts-ignore - Ignora erro se a tipagem local mudar, mas garante o envio do 'max'
        revalidateTag(tag, "max")
    } catch (err) {
        // Next.js pode lançar unhandledRejection se revalidateTag for chamado
        // durante renderização. Engolimos silenciosamente porque o cache
        // será eventualmente consistente via outras tags.
    }
}

// Helper interno para evitar erros se revalidatePath for chamado durante renderização
export async function safeRevalidatePath(path: string, type?: "layout" | "page") {
    try {
        revalidatePath(path, type)
    } catch (err) {
        // Next.js lança erro se revalidatePath for chamado durante o ciclo de renderização
        // (ex: rotas públicas ou componentes do servidor executando GET/SSR).
    }
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
        await safeRevalidatePath("/erp/entregas")
        await safeRevalidatePath("/erp/logistica")
    }
    await safeRevalidateTag("orders")
}

export async function revalidateCoupons(partnerId: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.coupons(partnerId))
        await safeRevalidateTag(partnerId)
    }
    await safeRevalidateTag("coupons")
    await safeRevalidatePath("/erp/cupons")
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
    await safeRevalidatePath("/erp/orcamentos")
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
 * Revalida dados de SERVIÇOS
 * (inclusive as seções "Serviços em <cidade>" da home, que usam a tag "services")
 */
export async function revalidateServices(partnerId?: string, serviceId?: string) {
    if (partnerId) {
        await safeRevalidateTag(TAGS.services(partnerId))
        await safeRevalidateTag(partnerId)
        await safeRevalidateTag(`partner-${partnerId}`)
    }

    if (serviceId) {
        await safeRevalidateTag(`service-${serviceId}`)
    }

    await safeRevalidateTag("services")
    await safeRevalidateTag(TAGS.marketplace)
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
 * Revalida dados de RELATÓRIOS
 */
export async function revalidateReports(partnerId: string, categories?: string[]) {
    if (!partnerId) return
    const cats = categories || Object.keys(REPORT_TAGS)
    for (const cat of cats) {
        const tagFn = (REPORT_TAGS as Record<string, Function>)[cat]
        if (tagFn) {
            await safeRevalidateTag(tagFn(partnerId))
        }
    }
    await safeRevalidateTag(`report:${partnerId}`)
    await safeRevalidateTag(TAGS.report(partnerId, "*"))
}

export async function revalidateReportCategory(partnerId: string, category: string) {
    const tagFn = (REPORT_TAGS as Record<string, Function>)[category]
    if (tagFn) {
        await safeRevalidateTag(tagFn(partnerId))
    }
    await safeRevalidateTag(TAGS.report(partnerId, category))
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
        await safeRevalidateTag(TAGS.financeAccounts(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.general(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.financial(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.metrics(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.alerts(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.revenue(partnerId))
        await safeRevalidateTag(DASHBOARD_TAGS.activity(partnerId))
    }
    await safeRevalidateTag("transactions")
    await safeRevalidatePath("/erp/painel")
    await safeRevalidatePath("/erp/inicio")
    await safeRevalidatePath("/erp/transacoes/cadastros-financeiro")
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
    try {
        // Authorization data must not use stale-while-revalidate after a role
        // change or membership revocation. Wait for a fresh access record.
        revalidateTag(TAGS.userAccess(userId), { expire: 0 })
    } catch {
        // Match the other revalidation helpers' resilience during render paths.
    }
}

/**
 * Revalida a lista de convites de um parceiro.
 * Deve ser chamada quando convites são criados, revogados ou aceitos.
 */
export async function revalidatePartnerInvitations(partnerId: string) {
    await safeRevalidateTag(TAGS.partnerInvitations(partnerId))
}

/**
 * Revalida a lista de membros da equipe de um parceiro.
 * Deve ser chamada quando membros são adicionados, removidos ou têm roles alterados.
 */
export async function revalidateTeamMembers(partnerId: string) {
    await safeRevalidateTag(TAGS.teamMembers(partnerId))
}

/**
 * Revalida o Cache O(1) do Redis/Explore/Home no Next.js App Router
 */
export async function revalidateExploreSearch(options?: { silent?: boolean }) {
    // Clear the in-memory version cache on the Next.js server instance
    try {
        const { invalidateInMemoryVersionCache } = await import("@/app/actions/marketplace/search")
        invalidateInMemoryVersionCache()
    } catch {
        // Silently ignore if import fails in non-server contexts
    }

    // 2. Clear Next.js cache tags for lists
    await safeRevalidateTag('marketplace-search')
    await safeRevalidateTag('home-products')
    await safeRevalidateTag('explore-products')
}

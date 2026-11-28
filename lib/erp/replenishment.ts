/**
 * Regras compartilhadas de sugestão de reposição.
 *
 * A notificação "Sugestão de reposição" e a aba Sugestões & Oportunidades
 * precisam usar exatamente o mesmo critério. Antes a notificação contava todo
 * produto com `min_stock > 0`, enquanto a lista só mostrava `estoque <= mínimo`
 * — então o número do aviso não batia com o que aparecia na tela.
 */

/** Tamanho de página usado ao varrer os produtos (limite do PostgREST é 1000). */
export const REPLENISHMENT_PAGE_SIZE = 1000

interface StockFields {
    stock_quantity?: number | string | null
    min_stock?: number | string | null
}

const toQuantity = (value: number | string | null | undefined): number => {
    const parsed = typeof value === "string" ? Number(value) : value
    return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : 0
}

/** Produto precisa de reposição quando o estoque está no ou abaixo do mínimo. */
export function isLowStockProduct(product: StockFields): boolean {
    return toQuantity(product.stock_quantity) <= toQuantity(product.min_stock)
}

/** Quanto repor para voltar ao estoque mínimo. */
export function getReplenishmentQuantity(product: StockFields): number {
    return Math.max(0, toQuantity(product.min_stock) - toQuantity(product.stock_quantity))
}

export interface FetchLowStockProductsOptions {
    partnerId: string
    storeId?: string | null
    /** Colunas/embeds do select do Supabase. */
    select: string
    pageSize?: number
}

/**
 * Busca todos os produtos ativos com estoque mínimo cadastrado (na loja atual)
 * e devolve apenas os que estão no ou abaixo do mínimo.
 *
 * A paginação evita o corte silencioso de 200 produtos que existia antes: com
 * catálogos maiores, sugestões válidas ficavam de fora.
 */
export async function fetchLowStockProducts(
    admin: any,
    options: FetchLowStockProductsOptions,
): Promise<any[]> {
    const { partnerId, storeId, select, pageSize = REPLENISHMENT_PAGE_SIZE } = options
    const rows: any[] = []
    let from = 0

    for (;;) {
        let query = admin
            .from("products")
            .select(select)
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .gt("min_stock", 0)

        if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`)

        const { data, error } = await query
            .order("name", { ascending: true })
            .order("id", { ascending: true })
            .range(from, from + pageSize - 1)

        if (error) throw new Error(error.message)

        const page = Array.isArray(data) ? data : []
        rows.push(...page)

        if (page.length < pageSize) break
        from += pageSize
    }

    return rows.filter(isLowStockProduct)
}

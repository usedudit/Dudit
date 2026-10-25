/**
 * Helpers de paginação A4 (210mm x 297mm) compartilhados pelos previews de impressão.
 *
 * Mantém todos os previews paginação consistentes: uma página corresponde a
 * exatamente uma folha A4 (altura 297mm) e o conteúdo nunca estoura a folha.
 */

export const A4_PAGE_WIDTH_MM = 210
export const A4_PAGE_HEIGHT_MM = 297
export const A4_CONTENT_HEIGHT_PX = 1123
export const A4_ROW_HEIGHT = 40
export const A4_HEADER_HEIGHT = 160
export const A4_TABLE_HEADER_HEIGHT = 40
export const A4_FOOTER_HEIGHT = 40

export interface PaginatedChunk<T> {
    /** Itens (linhas/tabelas) que cabem nesta página. */
    items: T[]
    /** Tipo da página: "first" = cabeçalho + primeiros blocos; "middle" = continuação. */
    type: "first" | "middle"
    /** Indica se esta página traz o bloco final (totais/assinaturas/etc.). */
    hasTotals: boolean
}

export interface PaginateRowsOptions<T> {
    items: T[]
    rowHeight?: number
    /** Altura fixa da página 1 (header + blocos estáticos + cabeçalho da tabela). */
    firstPageFixedHeight: number
    /** Altura fixa das páginas seguintes (header + cabeçalho da tabela). */
    nextPageFixedHeight: number
    /** Altura do conteúdo "final" (totais, observações, assinaturas...) que cabe só na última página. */
    lastPageExtrasHeight?: number
    totalPageHeight?: number
    footerHeight?: number
}

/**
 * Divide uma lista de itens em páginas A4, garantindo que:
 * - a página 1 respeite `firstPageFixedHeight`;
 * - páginas seguintes respeitem `nextPageFixedHeight`;
 * - a última página reserve espaço para `lastPageExtrasHeight`.
 *
 * Se todo o conteúdo couber na página 1 (juntamente com os extras), retorna
 * um único chunk com `hasTotals: true`.
 */
export function paginateRows<T>({
    items,
    rowHeight = A4_ROW_HEIGHT,
    firstPageFixedHeight,
    nextPageFixedHeight,
    lastPageExtrasHeight = 0,
    totalPageHeight = A4_CONTENT_HEIGHT_PX,
    footerHeight = A4_FOOTER_HEIGHT,
}: PaginateRowsOptions<T>): PaginatedChunk<T>[] {
    const chunks: PaginatedChunk<T>[] = []

    // Caso vazio: uma página "first" que apenas exibirá os extras.
    if (items.length === 0) {
        chunks.push({ items: [], type: "first", hasTotals: true })
        return chunks
    }

    const firstAvail = totalPageHeight - firstPageFixedHeight - footerHeight
    const nextAvail = totalPageHeight - nextPageFixedHeight - footerHeight - lastPageExtrasHeight

    const requiredAllOnFirst = items.length * rowHeight + lastPageExtrasHeight
    if (requiredAllOnFirst <= firstAvail) {
        chunks.push({ items: [...items], type: "first", hasTotals: true })
        return chunks
    }

    const maxItemsFirst = Math.max(1, Math.floor(firstAvail / rowHeight))
    const firstItems = items.slice(0, maxItemsFirst)
    chunks.push({ items: firstItems, type: "first", hasTotals: false })
    let remaining = items.slice(maxItemsFirst)

    while (remaining.length > 0) {
        const required = remaining.length * rowHeight + lastPageExtrasHeight
        if (required <= nextAvail) {
            chunks.push({ items: remaining, type: "middle", hasTotals: true })
            remaining = []
        } else {
            const maxItemsNext = Math.max(1, Math.floor(nextAvail / rowHeight))
            chunks.push({ items: remaining.slice(0, maxItemsNext), type: "middle", hasTotals: false })
            remaining = remaining.slice(maxItemsNext)
        }
    }

    if (!chunks[chunks.length - 1].hasTotals) {
        chunks.push({ items: [], type: "middle", hasTotals: true })
    }

    return chunks
}

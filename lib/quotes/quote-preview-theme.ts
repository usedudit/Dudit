/** Cores padrão do preview de orçamento (`CreateQuote` / `QuotePreview`). */
export const QUOTE_PREVIEW_PRIMARY_COLOR = "#113833"
export const QUOTE_PREVIEW_SECONDARY_COLOR = "#d4f995"

export function applyQuotePreviewTheme<T extends { primaryColor?: string; secondaryColor?: string }>(
    data: T,
): T {
    return {
        ...data,
        primaryColor: QUOTE_PREVIEW_PRIMARY_COLOR,
        secondaryColor: QUOTE_PREVIEW_SECONDARY_COLOR,
    }
}

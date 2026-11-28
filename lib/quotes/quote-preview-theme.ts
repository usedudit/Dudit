/** Cores padrão do preview de orçamento (`CreateQuote` / `QuotePreview`). */
export const QUOTE_PREVIEW_PRIMARY_COLOR = "#09211b"
export const QUOTE_PREVIEW_SECONDARY_COLOR = "#d4f995"

export function getThemeColorsByAvatarColor(colorClass: string) {
    const c = colorClass.toLowerCase();
    if (c.includes("red")) {
        return { primary: "#991b1b", secondary: "#fca5a5" };
    }
    if (c.includes("orange")) {
        return { primary: "#c2410c", secondary: "#fed7aa" };
    }
    if (c.includes("yellow")) {
        return { primary: "#854d0e", secondary: "#fde047" };
    }
    if (c.includes("green")) {
        return { primary: "#065f46", secondary: "#a7f3d0" };
    }
    if (c.includes("blue")) {
        return { primary: "#1e40af", secondary: "#bfdbfe" };
    }
    if (c.includes("indigo")) {
        return { primary: "#3730a3", secondary: "#c7d2fe" };
    }
    if (c.includes("purple")) {
        return { primary: "#6b21a8", secondary: "#e9d5ff" };
    }
    if (c.includes("pink")) {
        return { primary: "#9d174d", secondary: "#fbcfe8" };
    }
    return { primary: "#09211b", secondary: "#d4f995" };
}

export function applyQuotePreviewTheme<T extends { primaryColor?: string; secondaryColor?: string }>(
    data: T,
): T {
    return {
        ...data,
        primaryColor: data.primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR,
        secondaryColor: data.secondaryColor || QUOTE_PREVIEW_SECONDARY_COLOR,
    }
}

export function parseQuotePreviewMetadata(metadata: Record<string, unknown> | null | undefined): {
    primaryColor: string
    secondaryColor: string
    quoteTitle: string
    quoteSubtitle: string
    showDecoration: boolean
} {
    const preview = (metadata?.preview as Record<string, unknown>) || {}
    return {
        primaryColor: (preview.primaryColor as string) || QUOTE_PREVIEW_PRIMARY_COLOR,
        secondaryColor: (preview.secondaryColor as string) || QUOTE_PREVIEW_SECONDARY_COLOR,
        quoteTitle: (preview.quoteTitle as string) || "",
        quoteSubtitle: (preview.quoteSubtitle as string) || "",
        showDecoration: preview.showDecoration !== false,
    }
}

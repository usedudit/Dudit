/** Cores padrão do preview de orçamento (`CreateQuote` / `QuotePreview`). */
export const QUOTE_PREVIEW_PRIMARY_COLOR = "#113833"
export const QUOTE_PREVIEW_SECONDARY_COLOR = "#d4f995"

export function getThemeColorsByAvatarColor(colorClass: string) {
    const c = colorClass.toLowerCase();
    if (c.includes("red")) {
        return { primary: "#991b1b", secondary: "#fca5a5" }; // red
    }
    if (c.includes("orange")) {
        return { primary: "#c2410c", secondary: "#fed7aa" }; // orange
    }
    if (c.includes("yellow")) {
        return { primary: "#854d0e", secondary: "#fde047" }; // yellow
    }
    if (c.includes("green")) {
        return { primary: "#065f46", secondary: "#a7f3d0" }; // green
    }
    if (c.includes("blue")) {
        return { primary: "#1e40af", secondary: "#bfdbfe" }; // blue
    }
    if (c.includes("indigo")) {
        return { primary: "#3730a3", secondary: "#c7d2fe" }; // indigo
    }
    if (c.includes("purple")) {
        return { primary: "#6b21a8", secondary: "#e9d5ff" }; // purple
    }
    if (c.includes("pink")) {
        return { primary: "#9d174d", secondary: "#fbcfe8" }; // pink
    }
    // Default fallback
    return { primary: "#113833", secondary: "#d4f995" };
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

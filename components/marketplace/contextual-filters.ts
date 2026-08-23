import type { SortOption } from "./explorar-constants"

export interface FilterConfig {
    showSubcategories?: boolean
    showType?: boolean
    showCategory?: boolean
    showPrice?: boolean
    showSort?: boolean
    showPromo?: boolean
    showRadius?: boolean
}

export type PageMode = "sections" | "category" | "section-detail" | "search"

interface SectionFilterMapping {
    label: string
    icon: string
    config: FilterConfig
}

export const SECTION_FILTERS: Record<string, SectionFilterMapping> = {
    default: {
        label: "Todos os itens",
        icon: "📋",
        config: { showType: true, showCategory: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    trending: {
        label: "Bombando",
        icon: "🔥",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    bestSellers: {
        label: "Mais vendidos",
        icon: "⭐",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    topRated: {
        label: "Melhor avaliados",
        icon: "🏆",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    promos: {
        label: "Promoções",
        icon: "🎯",
        config: { showCategory: true, showSort: true, showRadius: true },
    },
    services: {
        label: "Serviços",
        icon: "🧰",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    topVitrines: {
        label: "Lojas",
        icon: "🏪",
        config: { showCategory: true, showRadius: true },
    },
    category: {
        label: "Categoria",
        icon: "📁",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    recent: {
        label: "Recentes",
        icon: "🆕",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    popular: {
        label: "Populares",
        icon: "📈",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    products: {
        label: "Produtos",
        icon: "🛍️",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    businesses: {
        label: "Negócios",
        icon: "🏢",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    "well-rated": {
        label: "Bem avaliados",
        icon: "⭐",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    "on-offer": {
        label: "Em oferta",
        icon: "🎯",
        config: { showCategory: true, showSort: true, showRadius: true },
    },
    "high-demand": {
        label: "Em alta",
        icon: "🔥",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    "newly-announced": {
        label: "Novos anunciados",
        icon: "🆕",
        config: { showCategory: true, showPrice: true, showSort: true, showRadius: true },
    },
    theme_alimentacao: {
        label: "Sabores da região",
        icon: "🍽️",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    theme_casa: {
        label: "Dando um trato na casa",
        icon: "🏠",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    theme_tecnologia: {
        label: "Tecnologia pra facilitar",
        icon: "💻",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    theme_moda: {
        label: "Renove o visual",
        icon: "👗",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    theme_saude: {
        label: "Cuide de você",
        icon: "💚",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    theme_automotivo: {
        label: "Cuidado com o veículo",
        icon: "🚗",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
    theme_pets: {
        label: "Mimos pro seu pet",
        icon: "🐾",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true, showRadius: true },
    },
}

export function getFilterConfig(sectionId: string | null, pageMode: PageMode): FilterConfig {
    if (pageMode === "category") return SECTION_FILTERS.category.config
    if (sectionId && SECTION_FILTERS[sectionId]) return SECTION_FILTERS[sectionId].config
    return SECTION_FILTERS.default.config
}

export function getSortOptionsForMode(pageMode: PageMode, sectionId?: string | null): { value: SortOption; label: string }[] {
    const base = [
        { value: "relevancia" as SortOption, label: "Relevância" },
        { value: "preco_menor" as SortOption, label: "Menor Preço" },
        { value: "preco_maior" as SortOption, label: "Maior Preço" },
        { value: "recentes" as SortOption, label: "Mais Recentes" },
    ]

    if (pageMode === "category" || sectionId === "topRated") {
        return [
            { value: "relevancia" as SortOption, label: "Relevância" },
            { value: "preco_menor" as SortOption, label: "Menor Preço" },
            { value: "preco_maior" as SortOption, label: "Maior Preço" },
            { value: "recentes" as SortOption, label: "Mais Recentes" },
        ]
    }

    return base
}

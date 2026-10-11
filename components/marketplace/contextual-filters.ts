import type { SortOption } from "./explorar-constants"

export interface FilterConfig {
    showSubcategories?: boolean
    showType?: boolean
    showCategory?: boolean
    showPrice?: boolean
    showSort?: boolean
    showPromo?: boolean
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
        config: { showType: true, showCategory: true, showPrice: true, showSort: true, showPromo: true },
    },
    trending: {
        label: "Bombando",
        icon: "🔥",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    bestSellers: {
        label: "Mais vendidos",
        icon: "⭐",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    topRated: {
        label: "Melhor avaliados",
        icon: "🏆",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    promos: {
        label: "Promoções",
        icon: "🎯",
        config: { showCategory: true, showSort: true },
    },
    services: {
        label: "Serviços",
        icon: "🧰",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    topVitrines: {
        label: "Lojas",
        icon: "🏪",
        config: { showCategory: true },
    },
    category: {
        label: "Categoria",
        icon: "📁",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    recent: {
        label: "Recentes",
        icon: "🆕",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    popular: {
        label: "Populares",
        icon: "📈",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    products: {
        label: "Produtos",
        icon: "🛍️",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    businesses: {
        label: "Negócios",
        icon: "🏢",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    "well-rated": {
        label: "Bem avaliados",
        icon: "⭐",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    "on-offer": {
        label: "Em oferta",
        icon: "🎯",
        config: { showCategory: true, showSort: true },
    },
    "high-demand": {
        label: "Em alta",
        icon: "🔥",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    "newly-announced": {
        label: "Novos anunciados",
        icon: "🆕",
        config: { showCategory: true, showPrice: true, showSort: true },
    },
    theme_alimentacao: {
        label: "Sabores da região",
        icon: "🍽️",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    theme_casa: {
        label: "Dando um trato na casa",
        icon: "🏠",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    theme_tecnologia: {
        label: "Tecnologia pra facilitar",
        icon: "💻",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    theme_moda: {
        label: "Renove o visual",
        icon: "👗",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    theme_saude: {
        label: "Cuide de você",
        icon: "💚",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    theme_automotivo: {
        label: "Cuidado com o veículo",
        icon: "🚗",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
    theme_pets: {
        label: "Mimos pro seu pet",
        icon: "🐾",
        config: { showSubcategories: true, showPrice: true, showSort: true, showPromo: true },
    },
}

export function getFilterConfig(sectionId: string | null, pageMode: PageMode, currentType?: string): FilterConfig {
    let base: FilterConfig

    if (pageMode === "category") {
        base = SECTION_FILTERS.category.config
    } else if (sectionId && SECTION_FILTERS[sectionId]) {
        base = SECTION_FILTERS[sectionId].config
    } else {
        base = SECTION_FILTERS.default.config
    }

    if (currentType === "vitrines") {
        return { ...base, showPrice: false, showPromo: false }
    }

    if (currentType === "servicos") {
        return { ...base, showPromo: false }
    }

    return base
}

export function getSortOptionsForMode(pageMode: PageMode, sectionId?: string | null, currentType?: string): { value: SortOption; label: string }[] {
    if (currentType === "vitrines") {
        return [
            { value: "relevancia" as SortOption, label: "Relevância" },
            { value: "recentes" as SortOption, label: "Mais Recentes" },
        ]
    }

    if (currentType === "servicos") {
        return [
            { value: "relevancia" as SortOption, label: "Relevância" },
            { value: "preco_menor" as SortOption, label: "Menor Preço" },
            { value: "preco_maior" as SortOption, label: "Maior Preço" },
            { value: "recentes" as SortOption, label: "Mais Recentes" },
        ]
    }

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

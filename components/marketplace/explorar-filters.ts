/**
 * Helpers compartilhados dos filtros da página Explorar.
 *
 * Fica isolado num módulo próprio (sem "use client") para poder ser testado
 * com Vitest e reutilizado pela página, pelo bottom sheet de filtros e pelo
 * servidor.
 */

/** Categoria "pseudo" que agrupa tudo que não está numa categoria conhecida. */
export const OUTROS_CATEGORY = "Outros"

/** Categoria que o servidor usa quando a loja parceira não tem categoria. */
export const LOJA_SEM_CATEGORIA = "Loja Parceira"

export type DeliveryFilter = "" | "entrega" | "retirada" | "frete"

export interface ExploreFilterState {
    categories: string[]
    minPrice: string | number
    maxPrice: string | number
    promoOn: boolean
    condition: string
    shipping: boolean
    minRating: number | null
    delivery: DeliveryFilter
    maxDistanceKm: number | null
    showcaseOnly: boolean
    /** Agrupar resultados de busca em seções de proximidade (padrão: true). */
    groupByProximity?: boolean
    /** Marcas selecionadas (usado na vitrine do vendedor). */
    brands?: string[]
}

export interface CategoryOption {
    name: string
    icon_url: string | null
}

export interface CategoryLists {
    products: CategoryOption[]
    services: CategoryOption[]
    partners: CategoryOption[]
}

export const RATING_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: "Qualquer avaliação" },
    { value: 4, label: "4 estrelas ou mais" },
    { value: 4.5, label: "4,5 estrelas ou mais" },
]

export const DELIVERY_OPTIONS: { value: DeliveryFilter; label: string }[] = [
    { value: "", label: "Qualquer entrega" },
    { value: "entrega", label: "Com entrega" },
    { value: "retirada", label: "Somente retirada" },
    { value: "frete", label: "Entrega grátis" },
]

export const DISTANCE_OPTIONS: { value: number; label: string }[] = [
    { value: 0, label: "Qualquer distância" },
    { value: 2, label: "Até 2 km" },
    { value: 5, label: "Até 5 km" },
    { value: 10, label: "Até 10 km" },
    { value: 20, label: "Até 20 km" },
]

export const CONDITION_OPTIONS: { value: string; label: string }[] = [
    { value: "", label: "Todos os estados" },
    { value: "novo", label: "Apenas Novos" },
    { value: "usado", label: "Usados / Desapegos" },
]

export const EMPTY_FILTER_STATE: ExploreFilterState = {
    categories: [],
    minPrice: "",
    maxPrice: "",
    promoOn: false,
    condition: "",
    shipping: false,
    minRating: null,
    delivery: "",
    maxDistanceKm: null,
    showcaseOnly: false,
    groupByProximity: true,
    brands: [],
}

/* -------------------------------------------------------------------------- */
/* Categorias                                                                  */
/* -------------------------------------------------------------------------- */

export function normalizeCategoryLabel(value: string | null | undefined): string {
    if (!value) return ""
    return String(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/&/g, "e")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/**
 * Compara o rótulo de categoria de um item com o filtro selecionado.
 * Além da igualdade exata, aceita variações ("Moda" x "Moda e Beleza"),
 * mas evita falsos positivos quando a diferença de tamanho é grande.
 */
export function categoriesMatch(itemCategory: string | null | undefined, target: string | null | undefined): boolean {
    if (!itemCategory || !target) return false
    const normItem = normalizeCategoryLabel(itemCategory)
    const normTarget = normalizeCategoryLabel(target)
    if (!normItem || !normTarget) return false
    if (normItem === normTarget) return true
    const lenDiff = Math.abs(normItem.length - normTarget.length)
    if (lenDiff <= 8 && (normItem.includes(normTarget) || normTarget.includes(normItem))) {
        return true
    }
    return false
}

/** Todos os rótulos de categoria que um item carrega. */
export function getItemCategoryLabels(item: any): string[] {
    if (!item) return []
    return [
        item.category,
        item.subcategoryName,
        item.subcategory,
        item.marketplace_category?.name,
        item.marketplace_category?.parent?.name,
        item.service_categories?.name,
        item.partners?.category?.name,
        item.partners?.category?.parent?.name,
    ]
        .filter((v): v is string => typeof v === "string" && !!v.trim())
}

/** O item pertence à categoria selecionada? */
export function itemMatchesCategory(item: any, target: string): boolean {
    return getItemCategoryLabels(item).some((label) => categoriesMatch(label, target))
}

/** Lista de categorias relevante para o tipo do item. */
export function getCategoryListForItem(item: any, lists: CategoryLists): CategoryOption[] {
    if (item?.itemType === "loja") return lists.partners
    if (item?.itemType === "servico") return lists.services
    return lists.products
}

/**
 * O item está sem categoria (ou na categoria "Outros")?
 *
 * Isso vale tanto para produtos/serviços quanto para vitrines: uma loja
 * parceira sem `category_id` chega do servidor com o rótulo "Loja Parceira"
 * e precisa aparecer no filtro "Outros".
 */
export function isItemUncategorized(item: any, lists: CategoryLists): boolean {
    const labels = getItemCategoryLabels(item)
    if (labels.length === 0) return true

    const normLabels = labels.map(normalizeCategoryLabel)
    const normOutros = normalizeCategoryLabel(OUTROS_CATEGORY)
    const normSentinel = normalizeCategoryLabel(LOJA_SEM_CATEGORIA)

    // Categoria explícita "Outros" (existe nas 3 tabelas) ou rótulo sentinela
    if (normLabels.includes(normOutros) || normLabels.includes(normSentinel)) return true

    const relevant = getCategoryListForItem(item, lists)
    // Sem a lista de categorias carregada não dá para judging: um item com
    // categoria não deve ser classificado como "sem categoria".
    if (relevant.length === 0) return false

    return !relevant.some((cat) => labels.some((label) => categoriesMatch(label, cat.name)))
}

/** Une listas de categorias removendo nomes duplicados (ignora acentos/caixa). */
export function mergeCategoryLists(lists: CategoryOption[][]): CategoryOption[] {
    const seen = new Set<string>()
    const merged: CategoryOption[] = []
    for (const list of lists) {
        for (const cat of list) {
            const key = normalizeCategoryLabel(cat.name)
            if (!key || seen.has(key)) continue
            seen.add(key)
            merged.push(cat)
        }
    }
    return merged
}

/* -------------------------------------------------------------------------- */
/* Preço / promoção                                                            */
/* -------------------------------------------------------------------------- */

/** Vitrines (lojas) não têm preço próprio - filtros de preço não se aplicam. */
export function supportsPriceFilter(item: any): boolean {
    return item?.itemType !== "loja"
}

/** Preço numérico válido do item (0 / null / undefined => sem preço). */
export function getItemPrice(item: any): number | null {
    if (!supportsPriceFilter(item)) return null
    const raw = item?.price
    const price = Number(raw)
    if (!Number.isFinite(price) || price <= 0) return null
    return price
}

export function matchesPriceRange(item: any, minPrice: number | null, maxPrice: number | null): boolean {
    if (!supportsPriceFilter(item)) return true
    const price = getItemPrice(item)
    // Item sem preço ("sob consulta") nunca é descartado pelo filtro de preço.
    if (price === null) return true
    if (minPrice !== null && price < minPrice) return false
    if (maxPrice !== null && price > maxPrice) return false
    return true
}

export function isPromoItem(item: any): boolean {
    if (item?.itemType === "loja") return false
    return item?.originalPrice !== undefined && item?.originalPrice !== null && Number(item.originalPrice) > Number(item.price)
}

/* -------------------------------------------------------------------------- */
/* Entrega / distância                                                         */
/* -------------------------------------------------------------------------- */

export function getItemDeliverySettings(item: any): any {
    if (!item) return null
    const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const raw = partner?.delivery_settings || item.delivery_settings || null
    return Array.isArray(raw) ? raw[0] : raw
}

export function isDeliveryEnabled(item: any): boolean {
    const settings = getItemDeliverySettings(item)
    if (!settings) return true
    return settings.is_delivery_enabled !== false && settings.isDeliveryEnabled !== false
}

export function hasFreeDelivery(item: any): boolean {
    if (!isDeliveryEnabled(item)) return false
    const settings = getItemDeliverySettings(item)
    const baseFee = settings?.base_fee ?? settings?.baseFee
    if (baseFee !== null && baseFee !== undefined && Number(baseFee) === 0) return true
    const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    const feeLabel = partner?.delivery_fee_formatted || item?.delivery_fee_formatted || ""
    return typeof feeLabel === "string" && /gr[aá]tis/i.test(feeLabel)
}

export function matchesDeliveryFilter(item: any, delivery: DeliveryFilter): boolean {
    if (!delivery) return true
    if (delivery === "entrega") return isDeliveryEnabled(item)
    if (delivery === "retirada") return !isDeliveryEnabled(item)
    if (delivery === "frete") return hasFreeDelivery(item)
    return true
}

/** Distância em km do item em relação ao usuário (null quando desconhecida). */
export function getItemDistanceKm(item: any, userCoords?: { lat: number; lng: number } | null): number | null {
    if (!item) return null
    const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners

    if (partner?.distance_km != null && typeof partner.distance_km === "number") return partner.distance_km
    if (item?.distance_km != null && typeof item.distance_km === "number") return item.distance_km

    if (userCoords?.lat != null && userCoords?.lng != null) {
        const lat = partner?.latitude ?? item?.latitude ?? item?.addresses?.[0]?.latitude
        const lng = partner?.longitude ?? item?.longitude ?? item?.addresses?.[0]?.longitude
        if (lat != null && lng != null) {
            const dLat = (Number(lat) - userCoords.lat) * Math.PI / 180
            const dLng = (Number(lng) - userCoords.lng) * Math.PI / 180
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(userCoords.lat * Math.PI / 180) * Math.cos(Number(lat) * Math.PI / 180) * Math.sin(dLng / 2) ** 2
            const distance = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
            return Number(distance.toFixed(1))
        }
    }

    return null
}

export function matchesDistanceFilter(item: any, maxDistanceKm: number | null, userCoords?: { lat: number; lng: number } | null): boolean {
    if (!maxDistanceKm) return true
    const distance = getItemDistanceKm(item, userCoords)
    if (distance === null) return false
    return distance <= maxDistanceKm
}

/* -------------------------------------------------------------------------- */
/* Vitrine online ativa                                                        */
/* -------------------------------------------------------------------------- */

export function isShowcaseActive(item: any): boolean {
    if (item?.itemType !== "loja") return true
    const partner = Array.isArray(item.partners) ? item.partners[0] : item.partners
    if (item?.is_showcase_active === false) return false
    if (partner?.is_showcase_active === false) return false
    return true
}

/* -------------------------------------------------------------------------- */
/* Avaliação                                                                   */
/* -------------------------------------------------------------------------- */

export function getItemRating(item: any): number {
    const rating = Number(item?.rating ?? 0)
    return Number.isFinite(rating) ? rating : 0
}

export function matchesRatingFilter(item: any, minRating: number | null): boolean {
    if (!minRating) return true
    return getItemRating(item) >= minRating
}

/* -------------------------------------------------------------------------- */
/* Condição                                                                    */
/* -------------------------------------------------------------------------- */

export function matchesConditionFilter(item: any, condition: string): boolean {
    if (!condition) return true
    if (item?.itemType !== "produto") return true
    const raw = (item.condition || item.condicao || "Novo").toLowerCase()
    const isNew = raw === "novo" || raw === "new"
    if (condition === "novo") return isNew
    if (condition === "usado") return !isNew
    return true
}

/* -------------------------------------------------------------------------- */
/* Envio nacional                                                              */
/* -------------------------------------------------------------------------- */

export function matchesShippingFilter(item: any): boolean {
    if (!item || item.itemType === "servico" || item.itemType === "loja") return false
    const modes = item.fulfillment_modes || item.fulfillmentModes || []
    return Array.isArray(modes) && modes.includes("shipping")
}

/* -------------------------------------------------------------------------- */
/* Marcas                                                                      */
/* -------------------------------------------------------------------------- */

export function matchesBrandFilter(item: any, brands: string[]): boolean {
    if (!brands || brands.length === 0) return true
    const brand = item?.brand
    if (!brand) return false
    return brands.includes(brand)
}

export interface ExplorePathParts {
    city: string | null
    category: string | null
}

/**
 * Extrai cidade e categoria do caminho vivo da URL (`/explorar/[cidade]/[categoria]`).
 * Retorna `null` quando o pathname não pertence à rota `/explorar`.
 */
export function getExplorePathParts(pathname: string | null | undefined): ExplorePathParts | null {
    const parts = (pathname || "").split("/").filter(Boolean)
    if (parts[0] !== "explorar") return null
    return {
        city: parts[1] || null,
        category: parts[2] || null,
    }
}

/**
 * Resolve cidade e categoria da rota priorizando a URL viva do browser.
 *
 * Depois de um `history.pushState` (ex.: remover a categoria em
 * `/explorar/cidade/alimentacao` -> `/explorar/cidade`), o `useParams()` do
 * App Router mantém o `slug` da árvore RSC anterior (`["cidade", "alimentacao"]`).
 * Usar `live.category || slug[1]` ressuscitava a categoria removida sempre que
 * `searchParams` mudava. Quando a URL viva está em `/explorar`, ela é a única
 * fonte de verdade (inclusive quando `category` é `null`).
 */
export function resolveExploreRouteParts(
    livePathname: string | null | undefined,
    fallbackSlug: readonly string[] = []
): ExplorePathParts {
    const live = getExplorePathParts(livePathname)
    if (live) return live
    return {
        city: fallbackSlug[0] || null,
        category: fallbackSlug[1] || null,
    }
}

/* -------------------------------------------------------------------------- */
/* Serialização (URL)                                                          */
/* -------------------------------------------------------------------------- */

export function serializeFiltersToParams(filters: ExploreFilterState, params: URLSearchParams): void {
    const min = filters.minPrice === "" || filters.minPrice === null || filters.minPrice === undefined ? null : Number(filters.minPrice)
    const max = filters.maxPrice === "" || filters.maxPrice === null || filters.maxPrice === undefined ? null : Number(filters.maxPrice)

    if (min !== null && Number.isFinite(min) && min > 0) params.set("preco_min", String(min))
    if (max !== null && Number.isFinite(max) && max > 0) params.set("preco_max", String(max))
    if (filters.promoOn) params.set("promo", "1")
    if (filters.condition) params.set("cond", filters.condition)
    if (filters.shipping) params.set("envio", "1")
    if (filters.minRating) params.set("avaliacao", String(filters.minRating))
    if (filters.delivery) params.set("entrega", filters.delivery)
    if (filters.maxDistanceKm) params.set("raio", String(filters.maxDistanceKm))
    if (filters.showcaseOnly) params.set("vitrine", "1")
    if (filters.groupByProximity === false) params.set("agrupar", "0")
    if (filters.brands && filters.brands.length > 0) params.set("marca", filters.brands.join(","))
}

function parseNumber(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value === "") return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
}

export function parseFiltersFromParams(params: URLSearchParams | { get: (key: string) => string | null }): ExploreFilterState {
    const get = (key: string) => params.get(key)
    const minRating = parseNumber(get("avaliacao"))
    const maxDistanceKm = parseNumber(get("raio"))
    const deliveryRaw = get("entrega") || ""

    return {
        categories: [],
        minPrice: get("preco_min") || "",
        maxPrice: get("preco_max") || "",
        promoOn: get("promo") === "1",
        condition: get("cond") || "",
        shipping: get("envio") === "1",
        minRating: minRating && minRating > 0 ? minRating : null,
        delivery: (deliveryRaw === "entrega" || deliveryRaw === "retirada" || deliveryRaw === "frete") ? deliveryRaw as DeliveryFilter : "",
        maxDistanceKm: maxDistanceKm && maxDistanceKm > 0 ? maxDistanceKm : null,
        showcaseOnly: get("vitrine") === "1",
        groupByProximity: get("agrupar") !== "0",
        brands: (get("marca") || "").split(",").map(b => b.trim()).filter(Boolean),
    }
}

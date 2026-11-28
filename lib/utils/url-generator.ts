import { createSlug } from "@/lib/utils/slugify"

/**
 * Helper para formatar a cidade e estado na URL, de acordo com as regras de SEO
 * Ex: São Paulo, SP -> sao-paulo-sp
 * Fallback sem cidade/estado: "brasil" (elimina o legado "/vitrine/...")
 */
export function formatCityStateSlug(city?: string, state?: string): string {
    const isMissing = (val?: string) => !val || val.toLowerCase() === "brasil" || val.toLowerCase() === "br"

    if (isMissing(city) && isMissing(state)) return "brasil"
    if (isMissing(city)) return createSlug(state!)
    if (isMissing(state)) return createSlug(city!)

    return `${createSlug(city!)}-${createSlug(state!)}`
}

function firstOrSelf<T>(value: T | T[] | null | undefined): T | undefined {
    if (Array.isArray(value)) return value[0]
    return value ?? undefined
}

/**
 * Gera a URL canonica do produto utilizando o novo formato com cidade e estado
 * /[cidade-uf]/[slug-do-produto]/p/[short_id-ou-id]
 */
export function getProductUrl(product: any, partner?: any): string {
    if (!product) return "/"

    const prodSlug = product.slug || createSlug(product.name || "")
    const prodId = product.short_id || product.id || ""

    // Normaliza partner/partners mesmo quando passado como array (ex: product.partners)
    const p = firstOrSelf(partner) || firstOrSelf(product.partners) || {}
    const address = firstOrSelf(p?.addresses) || p?.address || p
    const storeObj = firstOrSelf(product.stores) || firstOrSelf(product.store) || {}
    const storeAddr = firstOrSelf(storeObj?.addresses) || storeObj?.address || {}

    const city = p?.city || address?.city || product.store_city || storeAddr?.city || storeObj?.city || product.city
    const state = p?.state || address?.state || product.store_state || storeAddr?.state || storeObj?.state || product.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${prodSlug}/p/${prodId}`
}

/**
 * Gera a URL canonica do parceiro utilizando o novo formato com cidade e estado
 * /[cidade-uf]/[slug-da-loja]/v/[id]
 * @deprecated Use getStoreUrl() para vitrines baseadas em loja.
 */
export function getPartnerUrl(partner: any): string {
    return getStoreUrl(partner)
}

/**
 * Gera a URL canonica da loja (store-based vitrine)
 * /[cidade-uf]/[slug-gerado-de-store.name]/v/[short_id-ou-id-da-loja]
 */
export function getStoreUrl(store: any): string {
    if (!store) return "/"

    const s = (Array.isArray(store?.stores) ? store.stores[0] : store?.stores) || (Array.isArray(store?.store) ? store.store[0] : store?.store) || store
    const storeId = s?.short_id || store?.short_id || s?.id || store?.store_id || store?.id || ""
    const storeName = s?.name || store?.name || ""
    const storeSlug = createSlug(storeName)

    const address = s?.addresses?.[0] || store?.addresses?.[0] || store?.address || s || store
    const city = s?.city || store?.city || s?.store_city || store?.store_city || address?.city
    const state = s?.state || store?.state || s?.store_state || store?.store_state || address?.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${storeSlug}/v/${storeId}`
}

/**
 * Gera a URL canonica do serviço utilizando o novo formato com cidade e estado
 * /[cidade-uf]/[slug-do-servico]/s/[short_id-ou-id]
 */
export function getServiceUrl(service: any, partner?: any): string {
    if (!service) return "/"

    const serviceSlug = service.slug || createSlug(service.name || "")
    const serviceId = service.short_id || service.id || ""

    const p = firstOrSelf(partner) || firstOrSelf(service.partners) || {}
    const address = firstOrSelf(p?.addresses) || p?.address || p
    const storeObj = firstOrSelf(service.stores) || firstOrSelf(service.store) || {}
    const storeAddr = firstOrSelf(storeObj?.addresses) || storeObj?.address || {}

    const city = p?.city || address?.city || service.store_city || storeAddr?.city || storeObj?.city || service.city
    const state = p?.state || address?.state || service.store_state || storeAddr?.state || storeObj?.state || service.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${serviceSlug}/s/${serviceId}`
}

/**
 * Gera a URL canonica do plano recorrente utilizando o formato com cidade e estado
 * /[cidade-uf]/[slug-do-plano]/sub/[short_id-ou-id]
 */
export function getPlanUrl(plan: any, partner?: any): string {
    if (!plan) return "/"

    const planSlug = createSlug(plan.name || "")
    const planId = plan.short_id || plan.id || ""

    const p = firstOrSelf(partner) || firstOrSelf(plan.partners) || firstOrSelf(plan.partner) || {}
    const address = firstOrSelf(p?.addresses) || p?.address || p
    const city = p?.city || address?.city || plan.store_city || plan.city
    const state = p?.state || address?.state || plan.store_state || plan.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${planSlug}/sub/${planId}`
}

/**
 * Gera a URL canonica de uma coleção
 * /colecoes/[short_id-ou-id]
 */
export function getCollectionUrl(collection: any): string {
    if (!collection) return "/colecoes"
    const colId = collection.short_id || collection.id || ""
    return `/colecoes/${colId}`
}




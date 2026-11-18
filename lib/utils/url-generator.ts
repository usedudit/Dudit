import { createSlug } from "@/lib/utils/slugify"

/**
 * Helper para formatar a cidade e estado na URL, de acordo com as regras de SEO
 * Ex: São Paulo, SP -> saopaulo-sp
 */
export function formatCityStateSlug(city?: string, state?: string): string {
    const isMissing = (val?: string) => !val || val.toLowerCase() === "brasil" || val.toLowerCase() === "br"

    if (isMissing(city) && isMissing(state)) return "vitrine"
    if (isMissing(city)) return createSlug(state!)
    if (isMissing(state)) return createSlug(city!)

    return `${createSlug(city!)}-${createSlug(state!)}`
}

/**
 * Gera a URL canonica do produto utilizando o novo formato com cidade e estado
 * /[cidade-uf]/[slug-do-produto]/p/[short_id-ou-id]
 */
export function getProductUrl(product: any, partner?: any): string {
    if (!product) return "/"

    const prodSlug = product.slug || createSlug(product.name || "")
    const prodId = product.short_id || product.id || ""

    // Se não passar partner explicitamente, tenta pegar do próprio produto
    const p = partner || (Array.isArray(product.partners) ? product.partners[0] : product.partners) || {}

    // As vezes o endereço está em p.addresses[0], as vezes na raiz (p.address ou p direto se já normalizado)
    const address = p.addresses?.[0] || p.address || p
    const storeObj = (Array.isArray(product.stores) ? product.stores[0] : product.stores) || (Array.isArray(product.store) ? product.store[0] : product.store) || {}
    const storeAddr = (Array.isArray(storeObj?.addresses) ? storeObj?.addresses[0] : storeObj?.addresses) || storeObj?.address || {}

    const city = p.city || address?.city || product.store_city || storeAddr?.city || storeObj?.city
    const state = p.state || address?.state || product.store_state || storeAddr?.state || storeObj?.state

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
    const city = s?.city || store?.city || address?.city
    const state = s?.state || store?.state || address?.state

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

    const p = partner || (Array.isArray(service.partners) ? service.partners[0] : service.partners) || {}
    const address = p.addresses?.[0] || p.address || p
    const storeObj = (Array.isArray(service.stores) ? service.stores[0] : service.stores) || (Array.isArray(service.store) ? service.store[0] : service.store) || {}
    const storeAddr = (Array.isArray(storeObj?.addresses) ? storeObj?.addresses[0] : storeObj?.addresses) || storeObj?.address || {}

    const city = p.city || address?.city || service.store_city || storeAddr?.city || storeObj?.city
    const state = p.state || address?.state || service.store_state || storeAddr?.state || storeObj?.state

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

    const p = partner || (Array.isArray(plan.partners) ? plan.partners[0] : plan.partners) || plan.partner || {}
    const address = p.addresses?.[0] || p.address || p
    const city = p.city || address?.city
    const state = p.state || address?.state

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




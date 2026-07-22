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
 * /[cidade-uf]/[slug-do-produto]/p/[id]
 */
export function getProductUrl(product: any, partner?: any): string {
    if (!product) return "/"

    const prodSlug = product.slug || createSlug(product.name || "")
    const prodId = product.id || ""

    // Se não passar partner explicitamente, tenta pegar do próprio produto
    const p = partner || (Array.isArray(product.partners) ? product.partners[0] : product.partners) || {}

    // As vezes o endereço está em p.addresses[0], as vezes na raiz (p.address ou p direto se já normalizado)
    const address = p.addresses?.[0] || p.address || p
    const city = p.city || address?.city
    const state = p.state || address?.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${prodSlug}/p/${prodId}`
}

/**
 * Gera a URL canonica do parceiro utilizando o novo formato com cidade e estado
 * /[cidade-uf]/[slug-da-loja]/v/[id]
 * @deprecated Use getStoreUrl() para vitrines baseadas em loja.
 */
export function getPartnerUrl(partner: any): string {
    if (!partner) return "/"

    const partnerSlug = partner.slug || createSlug(partner.store_name || "")
    const partnerId = partner.id || ""

    const address = partner.addresses?.[0] || partner.address || partner
    const city = partner.city || address?.city
    const state = partner.state || address?.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${partnerSlug}/v/${partnerId}`
}

/**
 * Gera a URL canonica da loja (store-based vitrine)
 * /[cidade-uf]/[slug-da-loja]
 */
export function getStoreUrl(store: any): string {
    if (!store) return "/"

    const storeSlug = store.slug || createSlug(store.name || store.store_name || "")
    const storeId = store.store_id || store.id || ""
    const address = store.addresses?.[0]
    const city = store.city || address?.city
    const state = store.state || address?.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${storeSlug}/v/${storeId}`
}

/**
 * Gera a URL canonica do serviço utilizando o novo formato com cidade e estado
 * /[cidade-uf]/[slug-do-servico]/s/[id]
 */
export function getServiceUrl(service: any, partner?: any): string {
    if (!service) return "/"

    const serviceSlug = createSlug(service.name || "")
    const serviceId = service.id || ""

    const p = partner || (Array.isArray(service.partners) ? service.partners[0] : service.partners) || {}
    const address = p.addresses?.[0] || p.address || p
    const city = p.city || address?.city
    const state = p.state || address?.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${serviceSlug}/s/${serviceId}`
}

/**
 * Gera a URL canonica do plano recorrente utilizando o formato com cidade e estado
 * /[cidade-uf]/[slug-do-plano]/sub/[id]
 */
export function getPlanUrl(plan: any, partner?: any): string {
    if (!plan) return "/"

    const planSlug = createSlug(plan.name || "")
    const planId = plan.id || ""

    const p = partner || (Array.isArray(plan.partners) ? plan.partners[0] : plan.partners) || plan.partner || {}
    const address = p.addresses?.[0] || p.address || p
    const city = p.city || address?.city
    const state = p.state || address?.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/${cityStateSlug}/${planSlug}/sub/${planId}`
}



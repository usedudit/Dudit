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
 * /produto/[slug-do-produto]/[cidade-uf]/p/[id]
 */
export function getProductUrl(product: any, partner?: any): string {
    if (!product) return "/"

    const prodSlug = product.slug || createSlug(product.name || "")
    const prodId = product.id || ""

    // Se não passar partner explicitamente, tenta pegar do próprio produto
    const p = partner || (Array.isArray(product.partners) ? product.partners[0] : product.partners) || {}

    // As vezes o endereço está em p.addresses[0], as vezes na raiz (p.address ou p direto se já normalizado)
    const address = p.addresses?.[0] || p.address || p
    const city = p.city || address.city
    const state = p.state || address.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/produto/${prodSlug}/${cityStateSlug}/p/${prodId}`
}

/**
 * Gera a URL canonica do parceiro utilizando o novo formato com cidade e estado
 * /vitrine/[slug-da-loja]/[cidade-uf]/v/[id]
 */
export function getPartnerUrl(partner: any): string {
    if (!partner) return "/"

    const partnerSlug = partner.slug || createSlug(partner.store_name || "")
    const partnerId = partner.id || ""

    const address = partner.addresses?.[0] || partner.address || partner
    const city = partner.city || address.city
    const state = partner.state || address.state

    const cityStateSlug = formatCityStateSlug(city, state)

    return `/vitrine/${partnerSlug}/${cityStateSlug}/v/${partnerId}`
}


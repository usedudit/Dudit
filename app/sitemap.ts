import { MetadataRoute } from 'next'
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getStoreUrl, getProductUrl, getServiceUrl } from "@/lib/utils/url-generator"
import { getProductDisplayImages, PLACEHOLDER } from "@/lib/utils/product-display-images"
import { helpCategories } from "@/lib/help-data"
import { BLOG_CATEGORIES } from "@/lib/blog/categories"
import { getPublishedBlogSlugs } from "@/lib/blog/queries"

export const revalidate = 86400

const CATEGORY_SLUGS = [
    // Produtos
    "alimentacao", "casa", "tecnologia", "moda-e-beleza", "saude",
    "automotivo", "pets", "servicos", "outros",
    // Serviços
    "reformas-e-manutencao", "assistencia-tecnica", "beleza-e-estetica",
    "fretes-e-profissionais", "outros-servicos",
    // Lojas / vitrines
    "varejo", "construcao-e-casa", "profissional-consultoria", "educacao",
]

const ESTADOS = [
    "ac", "al", "ap", "am", "ba", "ce", "df", "es", "go", "ma",
    "mt", "ms", "mg", "pa", "pb", "pr", "pe", "pi", "rj", "rn",
    "rs", "ro", "rr", "sc", "sp", "se", "to",
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = await getSupabaseServerClient()

    const now = new Date()

    // --- Static institutional & hub pages ---
    const staticUrls: MetadataRoute.Sitemap = [
        { url: "https://dudit.com.br", lastModified: now, changeFrequency: "daily", priority: 1 },
        { url: "https://dudit.com.br/explorar", lastModified: now, changeFrequency: "daily", priority: 0.9 },
        { url: "https://dudit.com.br/ferramentas", lastModified: now, changeFrequency: "daily", priority: 0.9 },
        { url: "https://dudit.com.br/ajuda", lastModified: now, changeFrequency: "daily", priority: 0.9 },
        { url: "https://dudit.com.br/blog", lastModified: now, changeFrequency: "daily", priority: 0.9 },
        { url: "https://dudit.com.br/institucional/inicio", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: "https://dudit.com.br/institucional/sobre", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: "https://dudit.com.br/institucional/planos", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: "https://dudit.com.br/institucional/segmentos", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: "https://dudit.com.br/mapa-do-site", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: "https://dudit.com.br/institucional/termos", lastModified: now, changeFrequency: "monthly", priority: 0.3 },
        { url: "https://dudit.com.br/institucional/privacidade", lastModified: now, changeFrequency: "monthly", priority: 0.3 },
        { url: "https://dudit.com.br/institucional/estatisticas", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
        { url: "https://dudit.com.br/mapa", lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ]

    // --- Public Tool Pages (Tool SEO) ---
    const toolUrls: MetadataRoute.Sitemap = [
        { url: "https://dudit.com.br/ferramentas/calculadora-taxas-marketplace", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/ferramentas/calculadora-margem-lucro-preco-venda", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/ferramentas/calculadora-ponto-equilibrio", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/ferramentas/gerador-link-whatsapp", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    ]

    // --- Segment Pages (Niche Verticals) ---
    const segmentUrls: MetadataRoute.Sitemap = [
        { url: "https://dudit.com.br/segmentos/oficinas-e-tecnicos", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/segmentos/assistencia-tecnica-celulares", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/segmentos/saloes-e-barbearias", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/segmentos/confeitarias-e-alimentacao", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/segmentos/lojas-de-roupas-e-calcados", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
        { url: "https://dudit.com.br/segmentos/autonomos-e-prestadores-de-servicos", lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    ]

    // --- Blog do Dino: index, categories and published posts ---
    const blogCategoryUrls: MetadataRoute.Sitemap = BLOG_CATEGORIES.map((category) => ({
        url: `https://dudit.com.br/blog/categoria/${category.id}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
    }))

    const blogSlugs = await getPublishedBlogSlugs()
    const blogPostUrls: MetadataRoute.Sitemap = blogSlugs.map((post) => ({
        url: `https://dudit.com.br/blog/${post.slug}`,
        lastModified: new Date(post.updated_at),
        changeFrequency: "weekly",
        priority: 0.8,
    }))

    // --- Help Center Categories & Articles (AEO / GEO) ---
    const helpUrls: MetadataRoute.Sitemap = []
    for (const cat of helpCategories) {
        helpUrls.push({
            url: `https://dudit.com.br/ajuda/${cat.id}`,
            lastModified: now,
            changeFrequency: "weekly",
            priority: 0.8,
        })
        for (const art of cat.articles) {
            helpUrls.push({
                url: `https://dudit.com.br/ajuda/${cat.id}/${art.slug}`,
                lastModified: now,
                changeFrequency: "weekly",
                priority: 0.8,
            })
        }
    }

    // --- State pages: /explorar/estado-{uf} ---
    const stateUrls: MetadataRoute.Sitemap = ESTADOS.map((uf) => ({
        url: `https://dudit.com.br/explorar/estado-${uf}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.7,
    }))

    // --- Brazil category pages: /explorar/brasil/{categoria} ---
    const categoryUrls: MetadataRoute.Sitemap = CATEGORY_SLUGS.map((cat) => ({
        url: `https://dudit.com.br/explorar/brasil/${cat}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.6,
    }))

    // Base sitemap before dynamic content
    const baseUrls = [
        ...staticUrls,
        ...toolUrls,
        ...segmentUrls,
        ...blogCategoryUrls,
        ...blogPostUrls,
        ...helpUrls,
        ...stateUrls,
        ...categoryUrls
    ]

    if (!supabase) return baseUrls

    try {
        const [storesResponse, productsResponse, servicesResponse, citiesResponse] = await Promise.all([
            // Active stores (excluding admin showcase-suspended stores)
            supabase
                .from("stores")
                .select("id, short_id, name, slug, logo_url, updated_at, created_at, showcase_suspended_at, showcase_suspended_until, partners!inner(showcase_suspended_at, showcase_suspended_until), addresses(city, state)")
                .eq("is_active", true)
                .is("showcase_suspended_at", null)
                .is("partners.showcase_suspended_at", null)
                .order("updated_at", { ascending: false, nullsFirst: false })
                .limit(5000),

            // Active public products in marketplace
            supabase
                .rpc("get_marketplace_products_public", { p_product_ids: null, p_store_id: null })
                .order("created_at", { ascending: false })
                .limit(2500),

            // Active services in marketplace
            supabase
                .rpc("get_marketplace_services_public", { p_service_ids: null, p_store_id: null })
                .order("created_at", { ascending: false })
                .limit(2500),

            // Distinct cities from active stores
            supabase
                .from("stores")
                .select("addresses!store_id!left(city, state)")
                .eq("is_active", true)
                .not("addresses", "is", null)
                .limit(1000),
        ])

        if (storesResponse.error) console.error("Sitemap stores error:", storesResponse.error)
        if (productsResponse.error) console.error("Sitemap products error:", productsResponse.error)
        if (servicesResponse.error) console.error("Sitemap services error:", servicesResponse.error)
        if (citiesResponse.error) console.error("Sitemap cities error:", citiesResponse.error)

        // --- Products ---
        const products = productsResponse.data || []
        const productsSitemap: MetadataRoute.Sitemap = products.map((prod: any) => {
            const imgs = getProductDisplayImages(prod, "large").filter(
                (img) => img && img !== PLACEHOLDER && img.startsWith("http")
            )
            return {
                url: `https://dudit.com.br${getProductUrl(prod, {
                    id: prod.partner_id,
                    city: prod.store_city,
                    state: prod.store_state,
                    addresses: [{ city: prod.store_city, state: prod.store_state }],
                })}`,
                lastModified: new Date(prod.updated_at || prod.created_at),
                changeFrequency: "daily",
                priority: 0.8,
                ...(imgs.length > 0 ? { images: imgs.slice(0, 3) } : {}),
            }
        })

        // --- Services ---
        const services = servicesResponse.data || []
        const servicesSitemap: MetadataRoute.Sitemap = services.map((srv: any) => {
            const serviceWithPartner = {
                ...srv,
                partners: [{
                    city: srv.store_city,
                    state: srv.store_state,
                    addresses: [{ city: srv.store_city, state: srv.store_state }],
                }],
            }
            const imgs = (Array.isArray(srv.images) ? srv.images : []).filter(
                (img: any): img is string => typeof img === "string" && img.startsWith("http") && img !== PLACEHOLDER
            )
            return {
                url: `https://dudit.com.br${getServiceUrl(serviceWithPartner)}`,
                lastModified: new Date(srv.updated_at || srv.created_at),
                changeFrequency: "daily",
                priority: 0.8,
                ...(imgs.length > 0 ? { images: imgs.slice(0, 3) } : {}),
            }
        })

        // --- Stores ---
        const stores = storesResponse.data || []
        const storesSitemap: MetadataRoute.Sitemap = stores.map((s: any) => ({
            url: `https://dudit.com.br${getStoreUrl(s)}`,
            lastModified: new Date(s.updated_at || s.created_at),
            changeFrequency: "daily",
            priority: 0.7,
            ...(typeof s.logo_url === "string" && s.logo_url.startsWith("http")
                ? { images: [s.logo_url] }
                : {}),
        }))

        // --- City pages from DB: /explorar/{cidade-uf} ---
        const seenCities = new Set<string>()
        const citiesSitemap: MetadataRoute.Sitemap = []

        const citiesData = (citiesResponse.data || []) as any[]
        for (const store of citiesData) {
            const addr = Array.isArray(store.addresses) ? store.addresses[0] : store.addresses
            if (addr?.city && addr?.state) {
                const normalizedCity = addr.city
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, "-")
                const stateCode = addr.state.toLowerCase()
                const citySlug = `${normalizedCity}-${stateCode}`

                if (!seenCities.has(citySlug)) {
                    seenCities.add(citySlug)
                    citiesSitemap.push({
                        url: `https://dudit.com.br/explorar/${citySlug}`,
                        lastModified: now,
                        changeFrequency: "daily",
                        priority: 0.8,
                    })
                }
            }
        }

        const completeSitemap: MetadataRoute.Sitemap = [
            ...baseUrls,
            ...productsSitemap,
            ...servicesSitemap,
            ...storesSitemap,
            ...citiesSitemap,
        ]

        return completeSitemap
    } catch (error) {
        console.error("Erro gerando sitemap:", error)
        return baseUrls
    }
}

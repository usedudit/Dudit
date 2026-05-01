import { MetadataRoute } from 'next'
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getPartnerUrl, getProductUrl } from "@/lib/utils/url-generator"

// 86400 = Cache por 24 horas (em segundos)
// Evita consultas repetitivas ao banco
export const revalidate = 86400

// Regra de Ouro SEO Marketplace Novo: Limite seguro indexáveis
const MAX_SITEMAP_URLS = 130

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const supabase = await getSupabaseServerClient()
    // URLs base irremovíveis (Institucional/Index)
    const staticUrls: MetadataRoute.Sitemap = [
        { url: 'https://dudit.com.br', lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
        { url: 'https://dudit.com.br/explorar', lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
        { url: 'https://dudit.com.br/institucional/inicio', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: 'https://dudit.com.br/institucional/sobre', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: 'https://dudit.com.br/institucional/planos', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
        { url: 'https://dudit.com.br/institucional/segmentos', lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    ]

    if (!supabase) return staticUrls

    try {
        const [partnersResponse, productsResponse] = await Promise.all([
            // 40 vendedores mais ativos
            supabase
                .from('partners')
                .select('id, store_name, created_at, addresses(city, state)')
                .eq('is_active', true)
                .order('rating', { ascending: false })
                .limit(40),

            // 80 produtos mais recentes ativos
            supabase
                .from('products')
                .select('id, name, created_at, partners(id, store_name, addresses(city, state))')
                .eq('is_active', true)
                .eq('show_in_marketplace', true)
                .order('created_at', { ascending: false })
                .limit(80)
        ])

        if (partnersResponse.error) console.error("Sitemap: Erro buscando partners", partnersResponse.error)
        if (productsResponse.error) console.error("Sitemap: Erro buscando products", productsResponse.error)

        const partners = partnersResponse.data || []
        const products = productsResponse.data || []

        const productsSitemap: MetadataRoute.Sitemap = products.map((prod: any) => ({
            url: `https://dudit.com.br${getProductUrl(prod, prod.partners)}`,
            lastModified: new Date(prod.updated_at || prod.created_at),
            changeFrequency: 'daily',
            priority: 0.9,
        }))

        const partnersSitemap: MetadataRoute.Sitemap = partners.map((p: any) => ({
            url: `https://dudit.com.br${getPartnerUrl(p)}`,
            lastModified: new Date(p.updated_at || p.created_at),
            changeFrequency: 'weekly',
            priority: 0.8,
        }))

        // Juntamos e limitamos para validar o conceito: Crescimento Orgânico Simples sem Indexação Lixo
        const completeSitemap = [...staticUrls, ...productsSitemap, ...partnersSitemap]

        return completeSitemap.slice(0, MAX_SITEMAP_URLS)
    } catch (error) {
        console.error("Erro gerando Sitemap orgânico", error)
        return staticUrls
    }
}

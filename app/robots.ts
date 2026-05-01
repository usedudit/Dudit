import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                disallow: [
                    '/api/',
                    '/auth/',
                    '/erp/',
                    '/cart/',
                    '/payment/',
                    '/pedidos/',
                    '/dashboard/',
                    '/invite/',
                    '/select-erp/',
                    '/perfil/'
                ],
            },
            // Googlebot regras explícitas (Performance de Crawl)
            {
                userAgent: 'Googlebot',
                disallow: [
                    '/api/',
                    '/erp/',
                    '/cart/',
                    '/auth/',
                    '*?sort=*',       // Bloqueia parâmetros de filtro
                    '*?searchValue=*',// Bloqueia buscas por ter zero valia orgânica (Thin Content)
                    '*?category=*',    // Bloqueia categorização dinâmica de Lojas p/ economizar budget
                    '*?tab=*',    // Bloqueia tabs
                    '*?q=*'       // Bloqueia queries genericas da exploração
                ]
            }
        ],
        sitemap: 'https://dudit.com.br/sitemap.xml',
    }
}

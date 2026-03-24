import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: [
                    '/',
                    '/vitrine/*',
                    '/produto/*',
                    '/services/*',
                    '/products/*',
                ],
                disallow: [
                    '/api/',
                    '/auth/',
                    '/account/',
                    '/erp/',
                    '/cart/',
                    '/payment/',
                    '/pedidos/',
                    '/my-orders/',
                    '/dashboard/',
                    '/invite/',
                    '/select-erp/',
                    '/profile/'
                ],
            },
            // Googlebot regras explícitas (Performance de Crawl)
            {
                userAgent: 'Googlebot',
                allow: [
                    '/',
                    '/vitrine/*',
                    '/produto/*',
                ],
                disallow: [
                    '/api/',
                    '/erp/',
                    '/cart/',
                    '/auth/',
                    '/account/',
                    '*?sort=*',       // Bloqueia parâmetros de filtro
                    '*?searchValue=*',// Bloqueia buscas por ter zero valia orgânica (Thin Content)
                    '*?category=*',    // Bloqueia categorização dinâmica de Lojas p/ economizar budget
                    '*?tab=*'    // Bloqueia tabs
                ]
            }
        ],
        sitemap: 'https://dudit.com.br/sitemap.xml',
    }
}

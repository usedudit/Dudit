import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            {
                userAgent: '*',
                allow: '/',
                disallow: [
                    '/api/',
                    '/auth/',
                    '/erp/',
                    '/sacola/',
                    '/checkout/',
                    '/payment/',
                    '/pedidos/',
                    '/dashboard/',
                    '/invite/',
                    '/select-erp/',
                    '/perfil/',
                    '/assinaturas/',
                    '/print/',
                    '/ddt-admin/',
                    '/~offline/',
                ],
            },
            {
                userAgent: 'Googlebot',
                allow: '/',
                disallow: [
                    '/api/',
                    '/auth/',
                    '/erp/',
                    '/sacola/',
                    '/checkout/',
                    '/payment/',
                    '/pedidos/',
                    '/dashboard/',
                    '/invite/',
                    '/select-erp/',
                    '/perfil/',
                    '/assinaturas/',
                    '/print/',
                    '/ddt-admin/',
                    '/~offline/',
                    '*?sort=*',
                    '*?searchValue=*',
                    '*?category=*',
                    '*?tab=*',
                    '*?q=*',
                ],
            },
        ],
        sitemap: 'https://dudit.com.br/sitemap.xml',
    }
}

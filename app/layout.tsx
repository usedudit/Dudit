import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { NotificationProvider } from "@/hooks/use-notification"
import { PreventSamePageNavigation } from "@/components/PreventSamePageNavigation"
import { PWAUpdatePrompt } from "@/components/pwa/PWAUpdatePrompt"
import { MarketplaceBottomMenu } from "@/components/marketplace/MarketplaceBottomMenu"

export const metadata: Metadata = {
    title: "Dudit | Achou, anunciou, resolveu",
    description:
        "Descubra oportunidades, anuncie o que quiser e gerencie seu negócio sem complicação.",
    keywords: [
        "vender online sem taxa",
        "vitrine digital",
        "produtos perto de mim",
        "serviços na minha cidade",
        "marketplace local",
        "como vender pelo whatsapp",
        "catálogo online grátis",
        "divulgar serviços locais",
    ],
    openGraph: {
        title: "Dudit | Achou, anunciou, resolveu",
        description:
            "Descubra oportunidades, anuncie o que quiser e gerencie seu negócio sem complicação.",
        url: "https://dudit.com.br",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/Icon.png",
                width: 512,
                height: 512,
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    icons: {
        icon: [
            { url: '/favicon.ico?v=2', sizes: '32x32' },
            { url: '/icons/icon-192x192.png?v=2', sizes: '192x192', type: 'image/png' },
            { url: '/icons/icon-512x512.png?v=2', sizes: '512x512', type: 'image/png' },
        ],
        apple: '/icons/apple-touch-icon.png?v=2',
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: 'black-translucent',
        title: 'Dudit',
    },
    metadataBase: new URL("https://dudit.com.br"),
}

import { SupabaseProvider } from "@/providers/supabase-provider"
import { QueryProvider } from "@/providers/query-provider"
import { getCurrentUser } from "@/lib/auth/server-user"
import { TransitionProvider } from "@/providers/transition-provider"
import { FavoritesProvider } from "@/providers/favorites-provider"
import { PushNotificationManager } from "@/components/notifications/PushNotificationManager"

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getCurrentUser()

    return (
        <html lang="pt-BR">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <meta name="theme-color" content="#003229" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="mobile-web-app-capable" content="yes" />
                <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=2" />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify({
                            "@context": "https://schema.org",
                            "@graph": [
                                {
                                    "@type": "Organization",
                                    "name": "Dudit",
                                    "url": "https://dudit.com.br",
                                    "logo": "https://img.dudit.com.br/static/Icon.png",
                                    "description": "A Dudit é uma plataforma para descobrir produtos e serviços locais e ajudar negócios a vender e se organizar de forma simples.",
                                    "knowsAbout": [
                                        "vendas online",
                                        "produtos locais",
                                        "serviços locais",
                                        "catálogo online",
                                        "marketplace",
                                        "negócios locais",
                                        "vendas pelo whatsapp"
                                    ]
                                },
                                {
                                    "@type": "WebSite",
                                    "name": "Dudit",
                                    "url": "https://dudit.com.br",
                                    "description": "Explore produtos, serviços e negócios da sua cidade em um só lugar.",
                                    "potentialAction": {
                                        "@type": "SearchAction",
                                        "target": "https://dudit.com.br/explorar?q={search_term_string}",
                                        "query-input": "required name=search_term_string"
                                    }
                                },
                                {
                                    "@type": "WebApplication",
                                    "name": "Dudit",
                                    "applicationCategory": "BusinessApplication",
                                    "operatingSystem": "All",
                                    "url": "https://dudit.com.br",
                                    "description": "Gerencie pedidos, clientes e vendas e anuncie seus produtos e serviços de forma simples, sem taxas.",
                                    "offers": {
                                        "@type": "Offer",
                                        "priceCurrency": "BRL"
                                    }
                                },
                                {
                                    "@type": "OnlineBusiness",
                                    "name": "Dudit",
                                    "areaServed": {
                                        "@type": "Country",
                                        "name": "Brasil"
                                    },
                                    "description": "Plataforma online que conecta pessoas a produtos e serviços disponíveis na sua cidade."
                                },
                                {
                                    "@type": "SoftwareApplication",
                                    "name": "Dudit",
                                    "applicationCategory": "BusinessApplication",
                                    "offers": {
                                        "@type": "Offer",
                                        "price": "0",
                                        "priceCurrency": "BRL"
                                    }
                                }
                            ]
                        })
                    }}
                />
            </head>
            <body className="font-sans">
                <SupabaseProvider initialUser={user} initialSessionData={null}>
                    <QueryProvider>
                        <PreventSamePageNavigation />
                        <NotificationProvider>
                            <FavoritesProvider>
                                <TransitionProvider>
                                    {children}
                                </TransitionProvider>
                            </FavoritesProvider>
                        </NotificationProvider>
                        <PWAUpdatePrompt />
                        <PushNotificationManager />
                        <MarketplaceBottomMenu />
                    </QueryProvider>
                </SupabaseProvider>
            </body>
        </html>
    )
}

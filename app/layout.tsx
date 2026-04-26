import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { NotificationProvider } from "@/hooks/use-notification"
import { PreventSamePageNavigation } from "@/components/PreventSamePageNavigation"

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
})

export const metadata: Metadata = {
    title: "Dudit | Descubra o que tem por aqui",
    description:
        "Encontre produtos, serviços e negócios perto de você ou comece a vender online sem taxas. Organize pedidos, clientes e vendas em um só lugar com a Dudit.",
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
        title: "Dudit | Descubra o que tem por aqui",
        description:
            "Compre de quem está perto ou venda online sem taxas. Produtos, serviços e negócios locais em um só lugar.",
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
        icon: "https://img.dudit.com.br/static/Icon.png",
        apple: "https://img.dudit.com.br/static/Icon.png",
    },
}

import { SupabaseProvider } from "@/providers/supabase-provider"
import { QueryProvider } from "@/providers/query-provider"
import { getCurrentUser } from "@/lib/auth/server-user"
import { TransitionProvider } from "@/providers/transition-provider"

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const user = await getCurrentUser()

    return (
        <html lang="pt-BR" className={inter.variable}>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <meta name="theme-color" content="#059669" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="mobile-web-app-capable" content="yes" />
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
                                    "description": "Plataforma para encontrar produtos, serviços e negócios locais ou vender online sem taxas.",
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
                                    "description": "Descubra produtos, serviços e negócios perto de você.",
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
                                    "description": "Venda online sem taxas e organize pedidos, clientes e serviços em um só lugar.",
                                    "offers": {
                                        "@type": "Offer",
                                        "price": "0",
                                        "priceCurrency": "BRL"
                                    }
                                },
                                {
                                    "@type": "LocalBusiness",
                                    "name": "Dudit",
                                    "areaServed": {
                                        "@type": "Country",
                                        "name": "Brasil"
                                    },
                                    "description": "Marketplace local para comprar e vender produtos e serviços na sua cidade."
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
                            <TransitionProvider>
                                {children}
                            </TransitionProvider>
                        </NotificationProvider>
                    </QueryProvider>
                </SupabaseProvider>
            </body>
        </html>
    )
}

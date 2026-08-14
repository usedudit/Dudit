import type React from "react"
import type { Metadata, Viewport } from "next"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import "./globals.css"
import { SupabaseProvider } from "@/providers/supabase-provider"
import { QueryProvider } from "@/providers/query-provider"
import { getCurrentUser } from "@/lib/auth/server-user"
import { TransitionProvider } from "@/providers/transition-provider"
import { FavoritesProvider } from "@/providers/favorites-provider"
import { PushNotificationManager } from "@/components/notifications/PushNotificationManager"
import { NotificationProvider } from "@/hooks/use-notification"
import { PreventSamePageNavigation } from "@/components/PreventSamePageNavigation"
import { PWAUpdatePrompt } from "@/components/pwa/PWAUpdatePrompt"
import { MarketplaceBottomMenu } from "@/components/marketplace/MarketplaceBottomMenu"
import { TimezoneProvider } from "@/lib/date"
import Script from "next/script"

export const viewport: Viewport = {
    themeColor: "#003229",
    width: "device-width",
    initialScale: 1,
    colorScheme: "light",
}

export const metadata: Metadata = {
    metadataBase: new URL("https://dudit.com.br"),
    title: {
        default: "Dudit | Descubra. Anuncie. Organize.",
        template: "%s | Dudit",
    },
    description:
        "Encontre produtos, serviços e negócios perto de você. E ajude seu negócio a ser descoberto por mais pessoas. A Dudit é o lugar onde pessoas descobrem o que precisam e negócios mostram tudo que têm a oferecer.",
    keywords: [
        "descobrir negócios locais",
        "produtos perto de mim",
        "serviços na minha cidade",
        "anunciar produtos e serviços",
        "comércio local brasil",
        "vitrine digital grátis",
        "sistema para pequeno negócio",
        "ordem de serviço online",
        "agendamento online grátis",
        "catálogo online grátis",
        "controle de estoque gratuito",
    ],
    authors: [{ name: "Dudit" }],
    creator: "Dudit",
    publisher: "Dudit",
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
    openGraph: {
        type: "website",
        locale: "pt_BR",
        url: "https://dudit.com.br",
        siteName: "Dudit",
        title: "Dudit | Descubra. Anuncie. Organize.",
        description:
            "Encontre produtos, serviços e negócios perto de você. E ajude seu negócio a ser descoberto por mais pessoas.",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Dudit - Descubra. Anuncie. Organize.",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        site: "@dudit",
        creator: "@dudit",
        title: "Dudit | Descubra. Anuncie. Organize.",
        description:
            "Encontre produtos, serviços e negócios perto de você. E ajude seu negócio a ser descoberto por mais pessoas.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br",
        languages: {
            "pt-BR": "https://dudit.com.br",
        },
    },
    verification: {
        google: "hXFfOouvlwKXKhn4_MYJofV6FPW6",
    },
    appleWebApp: {
        capable: true,
        statusBarStyle: "black-translucent",
        title: "Dudit",
    },
    formatDetection: {
        telephone: true,
        address: true,
        email: true,
    },
    icons: {
        icon: [
            { url: "/favicon.ico?v=2", sizes: "32x32" },
            { url: "/icons/icon-192x192.png?v=2", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512x512.png?v=2", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png?v=2", sizes: "180x180" }],
        other: [
            { rel: "mask-icon", url: "/icons/icon-maskable-512x512.png?v=2" },
        ],
    },
    manifest: "/manifest.webmanifest",
    other: {
        "mobile-web-app-capable": "yes",
        "msapplication-TileColor": "#003229",
    },
}

const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
        {
            "@type": "Organization",
            "@id": "https://dudit.com.br/#organization",
            name: "Dudit",
            url: "https://dudit.com.br",
            logo: "https://img.dudit.com.br/static/Icon.png",
            description:
                "A Dudit é o lugar onde pessoas descobrem o que precisam e onde negócios mostram tudo que têm para oferecer. Descubra. Anuncie. Organize.",
            sameAs: [
                "https://instagram.com/usedudit",
                "https://x.com/usedudit"
            ],
            contactPoint: {
                "@type": "ContactPoint",
                contactType: "customer support",
                availableLanguage: ["Portuguese"],
            },
            address: {
                "@type": "PostalAddress",
                addressCountry: "BR",
            },
        },
        {
            "@type": "WebSite",
            "@id": "https://dudit.com.br/#website",
            url: "https://dudit.com.br",
            name: "Dudit",
            description:
                "Descubra produtos, serviços e negócios perto de você e ajude seu negócio a ser encontrado.",
            publisher: {
                "@id": "https://dudit.com.br/#organization",
            },
            inLanguage: "pt-BR",
            potentialAction: {
                "@type": "SearchAction",
                target: {
                    "@type": "EntryPoint",
                    urlTemplate:
                        "https://dudit.com.br/explorar?q={search_term_string}",
                },
                "query-input": "required name=search_term_string",
            },
        },
        {
            "@type": "SoftwareApplication",
            "@id": "https://dudit.com.br/#software",
            name: "Dudit",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web, Android, iOS",
            description:
                "A Dudit ajuda pessoas a encontrarem o que precisam e ajuda negócios a serem encontrados. Cadastre produtos, serviços e organize sua rotina.",
            url: "https://dudit.com.br",
            offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "BRL",
                description: "Plano gratuito disponível. Planos pagos a partir de R$ 19,90/mês.",
            },
            featureList: [
                "Descoberta de produtos e serviços locais",
                "Perfil público e vitrine online",
                "Gestão de estoque e catálogo",
                "Agendamentos online",
                "Ordens de serviço",
                "Controle financeiro simples",
            ],
        },
    ],
}

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
                <link
                    id="mapbox-gl-css"
                    rel="stylesheet"
                    href="https://api.mapbox.com/mapbox-gl-js/v3.28.0/mapbox-gl.css"
                />

                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: safeJsonLdStringify(jsonLd),
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
                                    <TimezoneProvider>
                                        {children}
                                    </TimezoneProvider>
                                </TransitionProvider>
                            </FavoritesProvider>
                        </NotificationProvider>
                        <PWAUpdatePrompt />
                        <PushNotificationManager />
                        <MarketplaceBottomMenu />
                    </QueryProvider>
                </SupabaseProvider>

                <Script
                    async
                    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8357337871781593"
                    crossOrigin="anonymous"
                />
            </body>
        </html>
    )
}

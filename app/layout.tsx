import type React from "react"
import type { Metadata, Viewport } from "next"
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
import { headers } from "next/headers"
import { AccountDeletionBanner } from "@/components/shared/AccountDeletionBanner"

export const viewport: Viewport = {
    themeColor: "#003229",
    width: "device-width",
    initialScale: 1,
    colorScheme: "light",
}

export const metadata: Metadata = {
    metadataBase: new URL("https://dudit.com.br"),
    title: {
        default: "Dudit - Organize seu negócio e seja encontrado na sua cidade",
        template: "%s | Dudit",
    },
    description:
        "Cadastre produtos e serviços uma única vez. Organize tudo e apareça para clientes da sua cidade. Plataforma gratuita para pequenos negócios.",
    keywords: [
        "sistema para pequeno negócio",
        "sistema para comércio local",
        "ERP gratuito pequena empresa",
        "vitrine digital grátis",
        "marketplace local brasil",
        "vender online sem taxa",
        "sistema para barbearia",
        "sistema para salão de beleza",
        "sistema para oficina mecânica",
        "ordem de serviço online",
        "agendamento online grátis",
        "catálogo online grátis",
        "controle de estoque gratuito",
        "comprar perto de mim",
        "serviços na minha cidade",
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
        title: "Dudit - Organize seu negócio e seja encontrado",
        description:
            "Cadastre produtos e serviços uma única vez. Organize tudo e apareça para clientes da sua cidade.",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Dudit - Organize. Anuncie. Venda.",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        site: "@dudit",
        creator: "@dudit",
        title: "Dudit - Organize seu negócio e seja encontrado",
        description:
            "Cadastre produtos e serviços uma única vez. Organize tudo e apareça para clientes da sua cidade.",
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
                "Plataforma gratuita que une gestão de negócios, vitrine digital e marketplace local para pequenas empresas brasileiras.",
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
                "Organize seu negócio e seja encontrado por clientes da sua cidade.",
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
                "Gerencie pedidos, clientes e vendas e anuncie produtos e serviços de forma simples, sem taxas.",
            url: "https://dudit.com.br",
            offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "BRL",
                description: "Plano gratuito disponível. Planos pagos a partir de R$ 19,90/mês.",
            },
            featureList: [
                "Gestão de produtos e serviços",
                "Ordem de serviço",
                "Agendamento online",
                "Controle de estoque",
                "Vitrine digital",
                "Marketplace local",
                "CRM",
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
    const reqHeaders = await headers()
    const isPendingDeletion = reqHeaders.get("x-account-pending-deletion") === "true"

    return (
        <html lang="pt-BR">
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link
                    rel="preconnect"
                    href="https://fonts.gstatic.com"
                    crossOrigin="anonymous"
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(jsonLd),
                    }}
                />
            </head>
            <body className="font-sans">
                {isPendingDeletion && <AccountDeletionBanner />}
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
            </body>
        </html>
    )
}

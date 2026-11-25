import type React from "react"
import type { Metadata, Viewport } from "next"
import { Plus_Jakarta_Sans, Libre_Barcode_128_Text } from "next/font/google"
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld"
import { headers } from "next/headers"
import "./globals.css"
import { SupabaseProvider } from "@/providers/supabase-provider"
import { QueryProvider } from "@/providers/query-provider"
import { getCurrentUser } from "@/lib/auth/server-user"
import { TransitionProvider } from "@/providers/transition-provider"
import { NotificationProvider } from "@/hooks/use-notification"
import { PreventSamePageNavigation } from "@/components/PreventSamePageNavigation"
import { PWAUpdatePrompt } from "@/components/pwa/PWAUpdatePrompt"
import { LegalConsentBanner } from "@/components/legal/LegalConsentBanner"
import { TimezoneProvider } from "@/lib/date"
import { ThemeProvider } from "@/components/theme-provider"
import { RouteAwareGlobalFeatures } from "@/providers/route-aware-global-features"
import { GlobalAnnouncementBanner } from "@/components/announcements/GlobalAnnouncementBanner"
import { getGlobalAnnouncementConfig } from "@/lib/services/system-settings.service"
import { PostHogProvider } from "@/providers/posthog-provider"
import { getBannedUserProfile, getCachedBanStatus } from "@/lib/auth/ban-check"
import BannedView from "@/components/admin/BannedView"

const plusJakartaSans = Plus_Jakarta_Sans({
    subsets: ["latin"],
    display: "swap",
    // The font is loaded on demand. Preloading it on every route was
    // generating warnings on routes whose first paint does not use it.
    preload: false,
    variable: "--font-sans",
})

const libreBarcode = Libre_Barcode_128_Text({
    weight: "400",
    subsets: ["latin"],
    display: "swap",
    // Barcode text is only needed by print/label views, never during the
    // initial render of the application shell.
    preload: false,
    variable: "--font-barcode",
})

export const viewport: Viewport = {
    themeColor: "#003229",
    width: "device-width",
    initialScale: 1,
    colorScheme: "light",
}

export const metadata: Metadata = {
    metadataBase: new URL("https://dudit.com.br"),
    title: {
        default: "Dudit | Vendas e Gestão Comercial com 0% de Comissão",
        template: "%s | Dudit",
    },
    description:
        "Sistema de gestão comercial e vendas com 0% de comissão: PDV, catálogo digital, Tiny ERP e Bling, agendamento, OS e envios locais ou nacionais.",
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
        title: "Dudit | Vendas e Gestão Comercial com 0% de Comissão",
        description:
            "Sistema de gestão comercial e vendas com 0% de comissão: PDV, catálogo digital, Tiny ERP, agendamento, OS e envios locais ou para todo o Brasil.",
        images: [
            {
                url: "/og-image.png",
                width: 1200,
                height: 630,
                alt: "Dudit - Gestão Comercial e Vendas Locais e Nacionais",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        site: "@usedudit",
        creator: "@usedudit",
        title: "Dudit | Vendas e Gestão Comercial com 0% de Comissão",
        description:
            "Sistema de gestão comercial e vendas com 0% de comissão: PDV, catálogo digital, Tiny ERP, agendamento, OS e envios locais ou para todo o Brasil.",
        images: ["/og-image.png"],
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
            { url: "/favicon.ico?v=3", sizes: "32x32" },
            { url: "/icons/icon-192x192.png?v=3", sizes: "192x192", type: "image/png" },
            { url: "/icons/icon-512x512.png?v=3", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/icons/apple-touch-icon.png?v=3", sizes: "180x180" }],
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
            alternateName: ["Dudit Plataforma", "Dudit Brasil"],
            url: "https://dudit.com.br",
            logo: "https://img.dudit.com.br/static/Icon.png",
            description:
                "A Dudit é uma plataforma brasileira de software de gestão comercial e vendas (ERP, PDV e Marketplace) com 0% de comissão por venda. Permite vendas locais (retirada e motoboy) e envios nacionais para todo o Brasil via transportadoras e Correios com cálculo integrado de frete.",
            areaServed: {
                "@type": "Country",
                name: "Brasil",
            },
            knowsAbout: [
                "Sistema de Gestão Comercial (ERP)",
                "Integração com Tiny ERP e Bling",
                "Sincronização de Estoque e Pedidos via ERP",
                "PDV Frente de Caixa",
                "Vendas Online com Envio Nacional",
                "Integração Logística e Fretes com Transportadoras e Correios",
                "Catálogo Digital sem Comissão",
                "Controle de Estoque e Variações",
                "Ordens de Serviço e Orçamentos",
                "Agendamento Online de Serviços",
                "Controle Financeiro e Fechamento de Caixa",
            ],
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
            alternateName: ["Dudit Plataforma", "Dudit Brasil"],
            description:
                "Sistema de gestão comercial, catálogo digital e plataforma de vendas locais e nacionais com 0% de comissão.",
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
            name: "Dudit - Sistema de Gestão Comercial e Vendas",
            applicationCategory: "BusinessApplication, CommerceApplication",
            operatingSystem: "Web, Android, iOS",
            description:
                "Sistema tudo-em-um para gestão comercial e vendas: PDV balcão, catálogo digital com 0% de comissão, agendamentos, ordens de serviço, controle de estoque e suporte integrado a entregas locais e envios nacionais para todo o Brasil via transportadoras e Correios.",
            url: "https://dudit.com.br",
            offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "BRL",
                description: "Plano gratuito disponível. Planos pagos a partir de R$ 29,90/mês com 0% de comissão por venda.",
            },
            featureList: [
                "0% de comissão por venda (o valor da venda fica com o comerciante)",
                "Integração nativa com Tiny ERP e Bling para sincronização de estoque e envio automático de pedidos",
                "Envios para todo o Brasil via transportadoras e Correios integrados",
                "Vendas locais com entrega própria, retirada no balcão ou motoboy",
                "PDV balcão para frente de caixa e vendas presenciais",
                "Catálogo digital e pedidos integrados ao WhatsApp",
                "Gestão de estoque com grade de variações (cor, tamanho e atributos)",
                "Ordens de serviço (OS) com fotos, orçamentos e aprovação digital",
                "Agendamento online de horários e serviços para clientes",
                "Controle financeiro, fechamento de caixa e relatórios operacionais",
            ],
        },
        {
            "@type": "ItemList",
            "@id": "https://dudit.com.br/#navigation",
            name: "Navegação Principal Dudit",
            itemListElement: [
                {
                    "@type": "SiteNavigationElement",
                    position: 1,
                    name: "Explorar Produtos e Lojas",
                    description: "Encontre produtos e lojas que entregam na sua cidade ou em todo o Brasil",
                    url: "https://dudit.com.br/explorar",
                },
                {
                    "@type": "SiteNavigationElement",
                    position: 2,
                    name: "Planos com 0% de Comissão",
                    description: "Planos acessíveis sem cobrança de porcentagem sobre as vendas",
                    url: "https://dudit.com.br/institucional/planos",
                },
                {
                    "@type": "SiteNavigationElement",
                    position: 3,
                    name: "Segmentos Atendidos",
                    description: "Soluções para roupas, alimentação, oficinas, salões e autônomos",
                    url: "https://dudit.com.br/institucional/segmentos",
                },
                {
                    "@type": "SiteNavigationElement",
                    position: 4,
                    name: "Ferramentas e Calculadoras",
                    description: "Calculadoras gratuitas de taxas de marketplace, markup e margem",
                    url: "https://dudit.com.br/ferramentas",
                },
                {
                    "@type": "SiteNavigationElement",
                    position: 5,
                    name: "Sobre a Dudit",
                    description: "Conheça nossa história e modelo de gestão e vendas sem comissão",
                    url: "https://dudit.com.br/institucional/sobre",
                },
                {
                    "@type": "SiteNavigationElement",
                    position: 6,
                    name: "Central de Ajuda",
                    description: "Tutoriais e suporte passo a passo para lojistas e clientes",
                    url: "https://dudit.com.br/ajuda",
                },
                {
                    "@type": "SiteNavigationElement",
                    position: 7,
                    name: "Blog do Dino",
                    description: "Dicas práticas de vendas, finanças, segurança e gestão para pequenos negócios",
                    url: "https://dudit.com.br/blog",
                },
            ],
        },
    ],
}

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const h = await headers()
    const isPublicPage = h.get("x-dudit-public-page") === "1"
    // Skip the server-side auth round-trip on public pages (institucional, ajuda,
    // auth, manutencao). The client-side SupabaseProvider will fetch the user
    // lazily if needed, saving ~50-150ms on these routes.
    // Run global announcement lookup in parallel with auth to avoid a waterfall.
    const [user, initialAnnouncement] = await Promise.all([
        isPublicPage ? Promise.resolve(null) : getCurrentUser(),
        getGlobalAnnouncementConfig(),
    ])
    // Use the tag-invalidated ban status cache (60s TTL, invalidated immediately
    // on admin ban/unban via `user-ban-${userId}`) so non-banned users skip a
    // direct `user_profiles` query on every layout render.
    const isBanned = user ? await getCachedBanStatus(user.id)() : false
    const bannedProfile = user && isBanned ? await getBannedUserProfile(user.id) : null

    if (bannedProfile && user) {
        return (
            <html lang="pt-BR" suppressHydrationWarning className={`${plusJakartaSans.variable} ${libreBarcode.variable}`}>
                <head>
                    <title>Conta Suspensa</title>
                    <meta name="robots" content="noindex, nofollow" />
                </head>
                <body className="font-sans overflow-x-clip">
                    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                        <PostHogProvider>
                            <SupabaseProvider initialUser={user} initialSessionData={null}>
                                <QueryProvider>
                                    <NotificationProvider>
                                        <BannedView profile={bannedProfile} user={user} />
                                    </NotificationProvider>
                                </QueryProvider>
                            </SupabaseProvider>
                        </PostHogProvider>
                    </ThemeProvider>
                </body>
            </html>
        )
    }

    return (
        <html lang="pt-BR" suppressHydrationWarning className={`${plusJakartaSans.variable} ${libreBarcode.variable}`}>
            <head>
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: safeJsonLdStringify(jsonLd),
                    }}
                />
            </head>

            <body className="font-sans overflow-x-clip">
                <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                    <PostHogProvider>
                        <SupabaseProvider initialUser={user} initialSessionData={null}>
                            <QueryProvider>
                                <GlobalAnnouncementBanner initialAnnouncement={initialAnnouncement} />
                                <PreventSamePageNavigation />
                                <NotificationProvider>
                                    <RouteAwareGlobalFeatures>
                                        <TransitionProvider>
                                            <TimezoneProvider>
                                                {children}
                                            </TimezoneProvider>
                                        </TransitionProvider>
                                    </RouteAwareGlobalFeatures>
                                </NotificationProvider>
                                <PWAUpdatePrompt />
                                {/*
                                  Legal consent intentionally remains global. The
                                  server decides whether a newly published version
                                  still needs acceptance; this is not delegated to
                                  client-side storage.
                                */}
                                <LegalConsentBanner />
                            </QueryProvider>
                        </SupabaseProvider>
                    </PostHogProvider>
                </ThemeProvider>

                <script
                    async
                    src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8357337871781593"
                    crossOrigin="anonymous"
                />
            </body>
        </html>
    )
}

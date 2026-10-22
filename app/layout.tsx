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
    const h = await headers()
    const isPublicPage = h.get("x-dudit-public-page") === "1"
    // Skip the server-side auth round-trip on public pages (institucional, ajuda,
    // auth, manutencao). The client-side SupabaseProvider will fetch the user
    // lazily if needed, saving ~50-150ms on these routes.
    const user = isPublicPage ? null : await getCurrentUser()

    const initialAnnouncement = await getGlobalAnnouncementConfig()

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

            <body className="font-sans">
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

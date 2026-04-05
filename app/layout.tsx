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
  title: "Dudit | Vitrine Digital: Compre e Venda sem Taxas em todo o Brasil",
  description:
    "A forma simples de organizar sua vitrine digital e começar a vender online na sua região e em todo o Brasil. A Dudit conecta você ao seu cliente. A venda é sua, sem taxas nem comissões.",
  generator: "Dudit",
  icons: {
    icon: "https://img.dudit.com.br/static/Icon.png",
    apple: "https://img.dudit.com.br/static/Icon.png",
  },
}

import { SupabaseProvider } from "@/providers/supabase-provider"
import { QueryProvider } from "@/providers/query-provider"
import { getCurrentUser } from "@/lib/auth/server-user"

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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "SoftwareApplication",
                  "name": "Dudit",
                  "alternateName": ["Dudit Vitrine", "Sistema Dudit", "Dudit Vendas", "Vitrine Digital Dudit"],
                  "applicationCategory": "BusinessApplication",
                  "operatingSystem": "All",
                  "url": "https://dudit.com.br",
                  "description": "A vitrine digital de vendas locais e nacionais para você montar seu catálogo online sem taxas.",
                  "publisher": {
                    "@type": "Organization",
                    "name": "Dudit Vitrine Digital",
                    "logo": "https://img.dudit.com.br/static/Icon.png",
                    "address": {
                      "@type": "PostalAddress",
                      "addressCountry": "BR"
                    }
                  }
                },
                {
                  "@type": "WebSite",
                  "url": "https://dudit.com.br",
                  "potentialAction": {
                    "@type": "SearchAction",
                    "target": "https://dudit.com.br/explorar?q={search_term_string}",
                    "query-input": "required name=search_term_string"
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
              {children}
            </NotificationProvider>
          </QueryProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}

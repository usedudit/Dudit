import type React from "react"
import type { Metadata } from "next"
import BlogHeader from "@/components/blog/BlogHeader"
import MarketplaceFooter from "@/components/marketplace/MarketplaceFooter"

export const metadata: Metadata = {
    title: {
        default: "Blog do Dino | Dicas para pequenos negócios",
        template: "%s | Blog do Dino",
    },
    description:
        "Dicas práticas sobre segurança, fluxo de caixa, fotos de produtos, vendas e gestão para pequenos negócios brasileiros.",
    alternates: {
        types: {
            "application/rss+xml": "/blog/feed.xml",
        },
    },
}

export default function BlogLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-screen flex-col bg-white dark:bg-dark-surface">
            <BlogHeader />
            <main className="flex-1">{children}</main>
            <MarketplaceFooter />
        </div>
    )
}

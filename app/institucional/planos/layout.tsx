import type { Metadata } from "next";
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld";

export const metadata: Metadata = {
    title: "Planos e Preços - Sistema de Gestão Completo",
    description: "Planos Dudit: Começar (R$ 0), Crescer (R$ 29,90/mês) e Escalar (R$ 49,90/mês). Vitrine online, PDV, Tiny ERP, Bling e 0% de comissão.",
    openGraph: {
        title: "Planos e Preços - Venda com 0% de Comissão",
        description: "Crie sua vitrine online, gerencie pedidos, controle estoque e emita ordens de serviço com 0% de comissão por venda.",
        url: "https://dudit.com.br/institucional/planos",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Planos e Preços Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Planos e Preços - Venda com 0% de Comissão",
        description: "Planos a partir de R$ 0/mês. Vitrine online, controle de estoque e pedidos com 0% de comissão por venda.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/planos",
    },
};

const softwareApplicationJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dudit",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: "https://dudit.com.br/institucional/planos",
    offers: [
        {
            "@type": "Offer",
            name: "Plano Começar",
            price: "0.00",
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
        },
        {
            "@type": "Offer",
            name: "Plano Crescer",
            price: "29.90",
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
        },
        {
            "@type": "Offer",
            name: "Plano Escalar",
            price: "49.90",
            priceCurrency: "BRL",
            availability: "https://schema.org/InStock",
        },
    ],
};

export default function InstitucionalPlanosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(softwareApplicationJsonLd) }}
            />
            {children}
        </>
    );
}


import type { Metadata } from "next";
import { getInstitutionalFaqJsonLd } from "@/lib/constants/institutional-faq";
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld";

export const metadata: Metadata = {
    title: {
        absolute: "Sobre a Dudit | Sistema de Gestão e Vendas Locais e Nacionais",
    },
    description: "Conheça a Dudit: plataforma brasileira de gestão comercial e vendas com 0% de taxa. Venda na sua região com entrega local ou para todo o Brasil via transportadoras e Correios.",
    openGraph: {
        title: "Sobre a Dudit | Sistema de Gestão e Vendas Locais e Nacionais",
        description: "Conheça a Dudit: plataforma brasileira de gestão comercial e vendas com 0% de taxa. Venda na sua região com entrega local ou para todo o Brasil via transportadoras e Correios.",
        url: "https://dudit.com.br/institucional/sobre",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sobre a Dudit - Sistema de Gestão e Vendas",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sobre a Dudit | Sistema de Gestão e Vendas Locais e Nacionais",
        description: "Conheça a Dudit: plataforma brasileira de gestão comercial e vendas com 0% de taxa. Venda na sua região com entrega local ou para todo o Brasil via transportadoras e Correios.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/sobre",
    },
    keywords: [
        "sobre a dudit",
        "o que é a dudit",
        "sistema de gestao comercial",
        "vender para todo o brasil",
        "envio transportadora correios",
        "vitrine digital sem taxa",
        "pdv balcao",
        "dudit brasil",
    ],
};

export default function InstitucionalSobreLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const faqJsonLd = getInstitutionalFaqJsonLd();

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(faqJsonLd) }}
            />
            {children}
        </>
    );
}

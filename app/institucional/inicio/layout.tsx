import type { Metadata } from "next";
import { getInstitutionalFaqJsonLd } from "@/lib/constants/institutional-faq";
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld";

export const metadata: Metadata = {
    title: {
        absolute: "Dudit | Venda no Balcão, na Cidade ou no Brasil (0% Comissão)",
    },
    description: "Plataforma de vendas e gestão com 0% de comissão: vitrine online, PDV, estoque, agenda, OS, Tiny ERP, Bling e envio nacional.",
    openGraph: {
        title: "Dudit | Venda no Balcão, na Cidade ou no Brasil (0% Comissão)",
        description: "Plataforma de vendas e gestão com 0% de comissão: vitrine online, PDV, estoque, agenda, OS, Tiny ERP, Bling e envio nacional.",
        url: "https://dudit.com.br/institucional/inicio",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Dudit - Gestão Comercial e Vendas Locais e Nacionais",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Dudit | Venda no Balcão, na Cidade ou no Brasil (0% Comissão)",
        description: "Plataforma de vendas e gestão com 0% de comissão: vitrine online, PDV, estoque, agenda, OS, Tiny ERP, Bling e envio nacional.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/inicio",
    },
};

export default function InstitucionalInicioLayout({
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

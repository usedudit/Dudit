import type { Metadata } from "next";
import { getInstitutionalFaqJsonLd } from "@/lib/constants/institutional-faq";
import { safeJsonLdStringify } from "@/lib/utils/safe-json-ld";

export const metadata: Metadata = {
    title: "Dudit | Venda no Balcão, na Sua Cidade ou Para Todo o Brasil com 0% de Taxa",
    description: "Sistema completo de gestão comercial e vendas com 0% de comissão: integração com Tiny ERP, venda no balcão (PDV), online na sua cidade ou envie para todo o Brasil via transportadoras e Correios. Catálogo online, agendamento e ordens de serviço.",
    openGraph: {
        title: "Dudit | Venda no Balcão, na Sua Cidade ou Para Todo o Brasil com 0% de Taxa",
        description: "Sistema completo de gestão comercial e vendas com 0% de comissão: integração com Tiny ERP, venda no balcão (PDV), online na sua cidade ou envie para todo o Brasil via transportadoras e Correios. Catálogo online, agendamento e ordens de serviço.",
        url: "https://dudit.com.br/institucional/inicio",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
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
        title: "Dudit | Venda no Balcão, na Sua Cidade ou Para Todo o Brasil com 0% de Taxa",
        description: "Sistema completo de gestão comercial e vendas com 0% de comissão: integração com Tiny ERP, venda no balcão (PDV), online na sua cidade ou envie para todo o Brasil via transportadoras e Correios. Catálogo online, agendamento e ordens de serviço.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/inicio",
    },
    keywords: [
        "vender online brasil",
        "integracao tiny erp",
        "catalogo integrado tiny",
        "sistema de gestao empresarial",
        "envio correios transportadora",
        "pdv balcao gratis",
        "catalogo digital sem taxa",
        "ordem de servico online",
        "agenda para profissionais",
        "comercio local e nacional",
        "dudit brasil",
    ],
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

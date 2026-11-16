import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Segmentos Atendidos | Dudit - Vendas Locais e Nacionais",
    description: "Soluções completas para lojas de roupas, oficinas, salões de beleza, confeitarias e autônomos. Venda no balcão, na sua cidade e envie para todo o Brasil com 0% de comissão.",
    openGraph: {
        title: "Segmentos Atendidos | Dudit - Vendas Locais e Nacionais",
        description: "Soluções completas para lojas de roupas, oficinas, salões de beleza, confeitarias e autônomos. Venda no balcão, na sua cidade e envie para todo o Brasil com 0% de comissão.",
        url: "https://dudit.com.br/institucional/segmentos",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Segmentos e Soluções na Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Segmentos Atendidos | Dudit - Vendas Locais e Nacionais",
        description: "Soluções completas para lojas de roupas, oficinas, salões de beleza, confeitarias e autônomos. Venda no balcão, na sua cidade e envie para todo o Brasil com 0% de comissão.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/segmentos",
    },
    keywords: [
        "vender online brasil",
        "envio nacional transportadora correios",
        "sistema para lojas de roupas",
        "sistema para oficinas e mecanicas",
        "agenda para saloes de beleza",
        "cardapio digital sem comissao",
        "sistema para autonomos",
        "produtos e serviços perto de mim",
        "comercio local e nacional",
        "dudit segmentos",
    ],
};

export default function InstitucionalSegmentosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

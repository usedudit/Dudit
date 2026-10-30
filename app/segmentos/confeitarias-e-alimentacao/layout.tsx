import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sistema para Confeitarias, Docerias e Marmitarias: Pedidos sem Taxa | Dudit",
    description: "Receba encomendas pelo WhatsApp, controle ficha técnica de ingredientes, organize entregas e tenha um catálogo online com 0% de comissão por venda.",
    openGraph: {
        title: "Sistema para Confeitarias e Pequena Alimentação | Dudit",
        description: "Catálogo digital, encomendas pelo WhatsApp, ficha técnica e entregas sem taxas abusivas de aplicativos.",
        url: "https://dudit.com.br/segmentos/confeitarias-e-alimentacao",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sistema Dudit para Confeitarias e Alimentação",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sistema para Confeitarias e Pequena Alimentação | Dudit",
        description: "Catálogo de encomendas, controle de estoque e vendas sem comissão.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/segmentos/confeitarias-e-alimentacao",
    },
    keywords: [
        "sistema para confeitaria",
        "cardapio digital doceria",
        "catalogo online encomendas",
        "sistema marmitaria sem taxa",
        "delivery 0 comissao alimentos",
        "programa para confeiteira gratis",
    ],
};

export default function ConfeitariasEAlimentacaoLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


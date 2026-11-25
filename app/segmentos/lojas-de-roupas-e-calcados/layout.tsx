import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sistema para Lojas de Roupas e Calçados: Grade e Etiquetas | Dudit",
    description: "Controle de estoque por grade de cor e tamanho, etiquetas com código de barras, PDV rápido e vitrine online com 0% de comissão para lojas de moda.",
    openGraph: {
        title: "Sistema para Lojas de Roupas, Calçados e Varejo de Moda | Dudit",
        description: "Grade de variações de cor e tamanho, impressão de código de barras, PDV balcão e vitrine online sem taxa de comissão.",
        url: "https://dudit.com.br/segmentos/lojas-de-roupas-e-calcados",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sistema Dudit para Lojas de Roupas",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sistema para Lojas de Roupas e Calçados | Dudit",
        description: "Grade de cor e tamanho, etiquetas de código de barras e vendas sem taxas.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/segmentos/lojas-de-roupas-e-calcados",
    },
};

export default function LojasDeRoupasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


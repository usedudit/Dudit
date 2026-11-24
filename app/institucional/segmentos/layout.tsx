import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Segmentos Atendidos - Vendas Locais e Nacionais",
    description: "Soluções completas para lojas de roupas, oficinas, salões de beleza, confeitarias e autônomos. Venda no balcão, na sua cidade e envie para todo o Brasil com 0% de comissão.",
    openGraph: {
        title: "Segmentos Atendidos - Vendas Locais e Nacionais",
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
        title: "Segmentos Atendidos - Vendas Locais e Nacionais",
        description: "Soluções completas para lojas de roupas, oficinas, salões de beleza, confeitarias e autônomos. Venda no balcão, na sua cidade e envie para todo o Brasil com 0% de comissão.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/segmentos",
    },
};

export default function InstitucionalSegmentosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Mapa do Site | Dudit",
    description: "Navegue por todas as páginas da Dudit: soluções por segmento para pequenos negócios, ferramentas e calculadoras gratuitas, páginas institucionais e marketplace.",
    openGraph: {
        title: "Mapa do Site | Dudit",
        description: "Índice completo de páginas da Dudit: soluções por segmento, ferramentas grátis, planos e marketplace.",
        url: "https://dudit.com.br/mapa-do-site",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Mapa do Site - Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Mapa do Site | Dudit",
        description: "Índice completo de páginas da Dudit: soluções por segmento, ferramentas grátis, planos e marketplace.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/mapa-do-site",
    },
    keywords: [
        "mapa do site dudit",
        "paginas dudit",
        "solucoes por segmento",
        "ferramentas gratuitas dudit",
        "sistema pequenos negocios brasil",
        "dudit",
    ],
};

export default function MapaDoSiteLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


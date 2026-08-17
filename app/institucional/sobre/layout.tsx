import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sobre a Dudit | Descubra, anuncie e organize em um só lugar",
    description: "Conheça a Dudit, uma plataforma para encontrar produtos, serviços e negócios, além de ajudar empresas a divulgarem e organizarem suas operações.",
    openGraph: {
        title: "Sobre a Dudit | Descubra, anuncie e organize em um só lugar",
        description: "Conheça a Dudit, uma plataforma para encontrar produtos, serviços e negócios, além de ajudar empresas a divulgarem e organizarem suas operações.",
        url: "https://dudit.com.br/institucional/sobre",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sobre a Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sobre a Dudit | Descubra, anuncie e organize em um só lugar",
        description: "Conheça a Dudit, uma plataforma para encontrar produtos, serviços e negócios, além de ajudar empresas a divulgarem e organizarem suas operações.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/sobre",
    },
    keywords: [
        "sobre a dudit",
        "o que é a dudit",
        "plataforma de comércio local",
        "produtos e serviços perto de mim",
        "anunciar produtos online",
        "vitrine digital para negócios",
        "dudit brasil",
    ],
};

export default function InstitucionalSobreLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

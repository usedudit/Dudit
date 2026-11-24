import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Ferramentas e Calculadoras Gratuitas para Lojistas e MEIs",
    description: "Calculadoras gratuitas de taxas de marketplace, margem de lucro e markup, ponto de equilíbrio e gerador de link do WhatsApp para impulsionar seu comércio local.",
    openGraph: {
        title: "Ferramentas e Calculadoras Gratuitas para Lojistas e MEIs | Dudit",
        description: "Calculadoras de taxas de marketplace, precificação de produtos, ponto de equilíbrio e links de WhatsApp para pequenos comerciantes.",
        url: "https://dudit.com.br/ferramentas",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Ferramentas Gratuitas Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Ferramentas Gratuitas para Lojistas e MEIs | Dudit",
        description: "Calculadoras de taxas, markup, ponto de equilíbrio e gerador de link wa.me para pequenos comerciantes.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/ferramentas",
    },
};

export default function FerramentasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


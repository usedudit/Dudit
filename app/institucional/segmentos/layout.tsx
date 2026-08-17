import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Encontre produtos e serviços na Dudit",
    description: "Descubra lojas, profissionais, produtos e serviços na Dudit.",
    openGraph: {
        title: "Encontre produtos e serviços na Dudit",
        description: "Descubra lojas, profissionais, produtos e serviços na Dudit.",
        url: "https://dudit.com.br/institucional/segmentos",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Segmentos na Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Encontre produtos e serviços na Dudit",
        description: "Descubra lojas, profissionais, produtos e serviços na Dudit.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/segmentos",
    },
    keywords: [
        "produtos e serviços perto de mim",
        "lojas locais",
        "profissionais locais",
        "serviços na minha cidade",
        "comércio de bairro",
        "anunciar produtos",
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

import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Dudit | Descubra. Anuncie. Organize.",
    description: "Encontre produtos, serviços, lojas e profissionais perto de você. Anuncie o que quiser ou organize seu negócio com a Dudit.",
    openGraph: {
        title: "Dudit | Descubra. Anuncie. Organize.",
        description: "Encontre produtos, serviços, lojas e profissionais perto de você. Anuncie o que quiser ou organize seu negócio com a Dudit.",
        url: "https://dudit.com.br/institucional/inicio",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Dudit - Descubra. Anuncie. Organize.",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Dudit | Descubra. Anuncie. Organize.",
        description: "Encontre produtos, serviços, lojas e profissionais perto de você. Anuncie o que quiser ou organize seu negócio com a Dudit.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/inicio",
    },
    keywords: [
        "produtos perto de mim",
        "serviços na minha cidade",
        "comprar produtos na minha cidade",
        "anunciar produtos online",
        "anunciar serviços",
        "negócios locais",
        "agenda online para serviços",
        "vitrine digital para pequenos negócios",
        "dudit",
    ],
};

export default function InstitucionalInicioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

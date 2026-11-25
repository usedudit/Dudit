import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sistema para Salões de Beleza e Barbearias: Agendamento e Caixa | Dudit",
    description: "Agendamento online integrado com WhatsApp, controle de comissões de profissionais, fechamento de caixa e vitrine online para salões, barbearias e estética.",
    openGraph: {
        title: "Sistema para Salões de Beleza e Barbearias | Dudit",
        description: "Agendamento online, controle de profissionais e comissões, vendas de produtos e vitrine online sem taxa de intermediação.",
        url: "https://dudit.com.br/segmentos/saloes-e-barbearias",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sistema Dudit para Salões e Barbearias",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sistema para Salões de Beleza e Barbearias | Dudit",
        description: "Agendamento online, comissão de equipe e controle financeiro simples.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/segmentos/saloes-e-barbearias",
    },
};

export default function SaloesEBarbeariasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


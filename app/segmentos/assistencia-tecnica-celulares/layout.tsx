import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sistema para Assistência Técnica de Celulares e TI: OS com Fotos | Dudit",
    description: "Ordem de serviço (OS) no celular com fotos da entrada, orçamentos com aprovação no WhatsApp, controle de peças e estoque para assistências técnicas.",
    openGraph: {
        title: "Sistema para Assistência Técnica de Celulares e Informática | Dudit",
        description: "Emissão de ordem de serviço pelo celular, fotos de inspeção visual, baixa de peças no estoque e aprovação por WhatsApp com 0% de comissão.",
        url: "https://dudit.com.br/segmentos/assistencia-tecnica-celulares",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sistema Dudit para Assistência Técnica",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sistema para Assistência Técnica de Celulares e TI | Dudit",
        description: "OS com fotos no celular, aprovação no WhatsApp e controle de peças sem taxas.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/segmentos/assistencia-tecnica-celulares",
    },
    keywords: [
        "sistema para assistencia tecnica celular",
        "ordem de servico com fotos",
        "programa para conserto de celular",
        "software os informatica",
        "controle de estoque peças celular",
        "orcamento aprovado whatsapp celular",
    ],
};

export default function AssistenciaTecnicaLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


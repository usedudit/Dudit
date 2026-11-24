import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sistema para Oficinas Mecânicas e Auto Centers: OS e Peças | Dudit",
    description: "Gerencie ordens de serviço (OS) com fotos, aprovação pelo WhatsApp, controle de peças e estoque no celular. Sistema completo para oficinas e auto centers com 0% de comissão.",
    openGraph: {
        title: "Sistema para Oficinas Mecânicas e Auto Centers | Dudit",
        description: "Emissão de ordens de serviço no celular, controle de estoque de peças, aprovação por WhatsApp e financeiro integrado.",
        url: "https://dudit.com.br/segmentos/oficinas-e-tecnicos",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sistema Dudit para Oficinas e Auto Centers",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sistema para Oficinas Mecânicas e Auto Centers | Dudit",
        description: "Ordens de serviço, controle de peças e aprovação por WhatsApp sem complicação.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/segmentos/oficinas-e-tecnicos",
    },
};

export default function OficinasETecnicosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


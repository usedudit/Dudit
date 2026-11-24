import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Sistema para Autônomos e Prestadores de Serviços: Orçamentos e Agenda | Dudit",
    description: "Crie sua vitrine de serviços, envie orçamentos em PDF, organize a agenda e acompanhe clientes. Sistema para autônomos e prestadores de serviços com 0% de comissão por venda.",
    openGraph: {
        title: "Sistema para Autônomos e Prestadores de Serviços | Dudit",
        description: "Vitrine de serviços, orçamentos profissionais em PDF, agenda e financeiro em um só lugar.",
        url: "https://dudit.com.br/segmentos/autonomos-e-prestadores-de-servicos",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Sistema Dudit para Autônomos e Prestadores de Serviços",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Sistema para Autônomos e Prestadores de Serviços | Dudit",
        description: "Orçamentos em PDF, agenda online, vitrine de serviços e clientes organizados.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/segmentos/autonomos-e-prestadores-de-servicos",
    },
};

export default function AutonomosEPrestadoresLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

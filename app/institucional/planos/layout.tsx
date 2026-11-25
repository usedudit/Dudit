import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Planos e Preços - Sistema de Gestão Completo",
    description: "Conheça os planos da Dudit: Começar Grátis (R$ 0), Crescer (R$ 29,90/mês) e Escalar (R$ 49,90/mês). Vitrine online, PDV balcão, pedidos e estoque com 0% de taxa por venda.",
    openGraph: {
        title: "Planos e Preços - Venda com 0% de Comissão",
        description: "Crie sua vitrine online, gerencie pedidos, controle estoque e emita ordens de serviço sem pagar comissões abusivas por venda.",
        url: "https://dudit.com.br/institucional/planos",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Planos e Preços Dudit",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Planos e Preços - Venda com 0% de Comissão",
        description: "Planos a partir de R$ 0/mês. Vitrine online, controle de estoque e pedidos com 0% de comissão por venda.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/planos",
    },
};

export default function InstitucionalPlanosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


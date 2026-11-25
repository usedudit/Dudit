import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Calculadora de Margem de Lucro e Preço de Venda (Markup) | Dudit",
    description: "Calcule o preço de venda ideal e a margem de lucro real dos seus produtos e serviços. Simule markup divisor, custos fixos e despesas variáveis gratuitamente.",
    openGraph: {
        title: "Calculadora de Margem de Lucro e Preço de Venda | Dudit",
        description: "Descubra o markup ideal e o preço de venda para garantir lucro líquido no seu comércio ou prestação de serviço.",
        url: "https://dudit.com.br/ferramentas/calculadora-margem-lucro-preco-venda",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Calculadora de Margem de Lucro e Markup",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Calculadora de Margem de Lucro e Preço de Venda | Dudit",
        description: "Simule custos, despesas e margem de lucro para precificar produtos corretamente.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/ferramentas/calculadora-margem-lucro-preco-venda",
    },
};

export default function CalculadoraMargemLucroLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


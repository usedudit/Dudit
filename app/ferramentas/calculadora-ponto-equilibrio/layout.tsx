import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Calculadora de Ponto de Equilíbrio (Break-Even) Grátis | Dudit",
    description: "Descubra quanto sua loja ou oficina precisa faturar por mês para pagar todas as contas fixas e começar a ter lucro real. Cálculo de ponto de equilíbrio financeiro online.",
    openGraph: {
        title: "Calculadora de Ponto de Equilíbrio (Break-Even) | Dudit",
        description: "Saiba exatamente quantas unidades vender ou quanto faturar para cobrir custos fixos e variáveis sem prejuízo.",
        url: "https://dudit.com.br/ferramentas/calculadora-ponto-equilibrio",
        siteName: "Dudit",
        images: [
            {
                url: "https://img.dudit.com.br/static/og-image.png",
                width: 1200,
                height: 630,
                alt: "Calculadora de Ponto de Equilíbrio",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Calculadora de Ponto de Equilíbrio | Dudit",
        description: "Calcule o ponto de equilíbrio financeiro do seu negócio gratuitamente.",
        images: ["https://img.dudit.com.br/static/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/ferramentas/calculadora-ponto-equilibrio",
    },
    keywords: [
        "calculadora ponto de equilibrio",
        "break even point",
        "calcular ponto de equilibrio empresa",
        "margem de contribuicao",
        "custos fixos e variaveis",
        "equilibrio financeiro comercio",
    ],
};

export default function CalculadoraPontoEquilibrioLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


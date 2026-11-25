import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Calculadora de Taxas de Marketplace e Delivery: Compare Custos | Dudit",
    description: "Calcule quanto você perde pagando comissões de 12% a 27% em marketplaces e apps de delivery e descubra quanto economizaria vendendo direto com 0% de comissão na Dudit.",
    openGraph: {
        title: "Calculadora de Taxas de Marketplace e Delivery | Dudit",
        description: "Veja quanto você paga em comissões em marketplaces e quanto economizaria vendendo direto com 0% de comissão.",
        url: "https://dudit.com.br/ferramentas/calculadora-taxas-marketplace",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Calculadora de Taxas de Marketplace",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Calculadora de Taxas de Marketplace e Delivery | Dudit",
        description: "Simule as comissões pagas para marketplaces e veja sua economia com a Dudit.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/ferramentas/calculadora-taxas-marketplace",
    },
};

export default function CalculadoraTaxasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


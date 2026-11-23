import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Estatísticas e Economia no Comércio Local",
    description:
        "Veja o índice de taxas de marketplaces e a economia gerada para pequenos negócios com o modelo de 0% de comissão da Dudit.",
    openGraph: {
        title: "Estatísticas e Economia no Comércio Local | Dudit",
        description:
            "Dados sobre comissões de marketplaces e economia gerada pelo modelo de 0% de comissão da Dudit.",
        url: "https://dudit.com.br/institucional/estatisticas",
        siteName: "Dudit",
        locale: "pt_BR",
        type: "website",
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/estatisticas",
    },
};

export default function InstitucionalEstatisticasLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

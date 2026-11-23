import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Termos de Uso",
    description:
        "Leia os Termos de Uso da plataforma Dudit aplicáveis a parceiros, lojistas, prestadores de serviços e compradores.",
    openGraph: {
        title: "Termos de Uso | Dudit",
        description:
            "Condições gerais de acesso e utilização da plataforma Dudit.",
        url: "https://dudit.com.br/institucional/termos",
        siteName: "Dudit",
        locale: "pt_BR",
        type: "website",
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/termos",
    },
};

export default function InstitucionalTermosLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

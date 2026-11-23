import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Política de Privacidade",
    description:
        "Saiba como a Dudit coleta, utiliza, armazena e protege seus dados pessoais em conformidade com a LGPD.",
    openGraph: {
        title: "Política de Privacidade | Dudit",
        description:
            "Política de Privacidade e proteção de dados pessoais da plataforma Dudit (LGPD).",
        url: "https://dudit.com.br/institucional/privacidade",
        siteName: "Dudit",
        locale: "pt_BR",
        type: "website",
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/privacidade",
    },
};

export default function InstitucionalPrivacidadeLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

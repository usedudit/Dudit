import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contato e Suporte",
    description:
        "Fale com a equipe da Dudit. Envie dúvidas, sugestões, reporte problemas ou solicite atendimento para sua loja ou conta.",
    openGraph: {
        title: "Contato e Suporte | Dudit",
        description:
            "Entre em contato com o suporte da Dudit para dúvidas sobre planos, vitrine online, PDV e pedidos.",
        url: "https://dudit.com.br/institucional/contato",
        siteName: "Dudit",
        locale: "pt_BR",
        type: "website",
    },
    alternates: {
        canonical: "https://dudit.com.br/institucional/contato",
    },
};

export default function InstitucionalContatoLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}

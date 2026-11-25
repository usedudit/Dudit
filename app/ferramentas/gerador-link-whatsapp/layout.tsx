import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Gerador de Link de WhatsApp com Mensagem Pronta (wa.me) | Dudit",
    description: "Crie links personalizados do WhatsApp com mensagem inicial para colocar na bio do Instagram, redes sociais ou enviar a clientes. Gratuito e sem cadastro.",
    openGraph: {
        title: "Gerador de Link de WhatsApp com Mensagem Pronta | Dudit",
        description: "Gere links personalizados wa.me para Instagram, redes sociais e atendimento rápido de clientes.",
        url: "https://dudit.com.br/ferramentas/gerador-link-whatsapp",
        siteName: "Dudit",
        images: [
            {
                url: "https://dudit.com.br/og-image.png",
                width: 1200,
                height: 630,
                alt: "Gerador de Link de WhatsApp",
            },
        ],
        locale: "pt_BR",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Gerador de Link de WhatsApp | Dudit",
        description: "Crie links diretos para o WhatsApp com mensagem pronta gratuitamente.",
        images: ["https://dudit.com.br/og-image.png"],
    },
    alternates: {
        canonical: "https://dudit.com.br/ferramentas/gerador-link-whatsapp",
    },
};

export default function GeradorLinkWhatsAppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}


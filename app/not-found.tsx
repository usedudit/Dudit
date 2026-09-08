import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
    title: "Página não encontrada",
    description: "A página que você procura não existe ou foi removida.",
    robots: {
        index: false,
        follow: true,
    },
}

export default function NotFound() {
    return (
        <div className="flex flex-col min-h-screen">
            <header className="lg:flex flex-col w-full bg-brand-dark dark:bg-dark-surface border-b border-white/10 sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
                    <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
                            loading="lazy"
                            className="h-10 w-auto object-contain"
                        />
                    </a>
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-4 mb-6 md:p-8 mt-20 md:mt-32">
                <div className="max-w-2xl w-full flex flex-col items-center">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                        imageAlt="Não encontrado"
                        title="Ops! Essa página não está na vitrine."
                        subtitle="Não encontramos a página ou o item que você buscou."
                        itemButton={{
                            text: "Voltar para o início",
                            action: "/"
                        }}
                    />
                </div>
            </main>

            <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark dark:bg-dark-surface">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
                    <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
                        © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                    </p>
                </div>
            </footer>
        </div>
    )
}

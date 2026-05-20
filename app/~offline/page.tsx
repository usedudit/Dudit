"use client"

import { IconPlaceholder } from "@/components/reusable"

export default function OfflinePage() {
    return (
        <div className="flex flex-col min-h-screen">
            <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-between max-w-[1300px] px-2 mx-auto gap-4">
                    <a href="/" className="cursor-pointer shrink-0 z-[110] pt-1">
                        <img
                            src="https://img.dudit.com.br/static/Logo.png"
                            alt="Dudit"
                            width={140}
                            height={40}
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
                        title="Você está offline"
                        subtitle="Verifique sua conexão com a internet e tente novamente."
                        itemButton={{
                            text: "Tentar novamente",
                            action: "/"
                        }}
                    />
                </div>
            </main>
        </div>
    )
}

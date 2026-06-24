"use client"

import { useEffect } from "react"
import IconPlaceholder from "@/components/reusable/IconPlaceholder"
import { InfoCard } from "@/components/reusable/InfoCard"
import { getErrorMessage } from "@/lib/utils/error-handlers"
import Link from "next/link"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error)

        const isChunkError =
            error.name === "ChunkLoadError" ||
            error.message?.includes("ChunkLoadError") ||
            error.message?.includes("Loading chunk") ||
            error.message?.includes("Failed to fetch dynamically imported module")

        if (isChunkError) {
            const lastReload = sessionStorage.getItem("last-chunk-error-reload")
            const now = Date.now()
            // Only reload if we haven't reloaded in the last 10 seconds to prevent infinite reload loops
            if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
                sessionStorage.setItem("last-chunk-error-reload", now.toString())
                window.location.reload()
            }
        }
    }, [error])

    return (
        <div className="flex flex-col min-h-screen">
            <header className="lg:flex flex-col w-full bg-brand-dark sticky top-0 z-50 shadow-md">
                <div className="w-full h-[68px] flex items-center justify-center max-w-[1400px] px-2 mx-auto gap-4">
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

            <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 mt-20 md:mt-32">
                <div className="max-w-2xl w-full flex flex-col items-center">
                    <IconPlaceholder
                        placeholderType="image"
                        imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                        imageAlt="Erro"
                        title="Ops! Algo deu errado por aqui"
                        subtitle="Algo inesperado aconteceu. Tente novamente em alguns instantes."
                        itemButton={{
                            text: "Voltar para o início",
                            action: "/"
                        }}
                    />

                    <div className="w-full mt-12 max-w-lg">
                        <InfoCard
                            color="red"
                            title="Detalhes do erro"
                            message={
                                <div className="flex flex-col gap-1">
                                    <p className="text-xs break-all">
                                        {getErrorMessage(error)}
                                    </p>
                                    {error.digest && (
                                        <p className="text-[10px] opacity-70">
                                            ID: {error.digest}
                                        </p>
                                    )}
                                </div>
                            }
                        />
                    </div>
                </div>
            </main>

            <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
                    <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
                        © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os direitos reservados.
                    </p>
                </div>
            </footer>
        </div>
    )
}

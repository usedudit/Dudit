"use client"

import { useEffect } from "react"

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        try {
            console.error(error)

            // Report to Sentry without risking this boundary: if it fails,
            // the error page must still render (otherwise Next.js falls back
            // to the blank built-in "Application error" page).
            import("@/lib/monitoring/sentry")
                .then(({ captureError }) => {
                    try {
                        captureError(error, {
                            module: "client",
                            action: "error_boundary",
                            metadata: { boundary: "app/error" },
                        })
                    } catch { }
                })
                .catch(() => { })
        } catch { }

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

    const digest = typeof error?.digest === "string" ? error.digest : undefined
    const message = safeErrorMessage(error)

    return (
        <div className="flex flex-col min-h-screen bg-white dark:bg-dark-background transition-colors duration-300">
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

            <main className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 mt-20 md:mt-32">
                <div className="max-w-2xl w-full flex flex-col items-center">
                    <img
                        src="https://img.dudit.com.br/static/mascots/Ops.png"
                        alt="Erro"
                        loading="lazy"
                        className="w-72 h-72 mb-4 object-contain"
                    />

                    <h1 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2 text-center">
                        Ops! Algo deu errado por aqui
                    </h1>

                    <p className="text-brand-inactive-text dark:text-dark-body max-w-sm text-center">
                        Algo inesperado aconteceu. Tente novamente em alguns
                        instantes.
                    </p>

                    <div className="flex flex-row flex-wrap items-center justify-center gap-3 mt-8">
                        <a
                            href="/"
                            className="inline-flex items-center justify-center gap-2 rounded-full bg-brand-green px-6 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-brand-green/90"
                        >
                            Voltar para o início
                        </a>
                        <button
                            onClick={() => reset()}
                            className="inline-flex items-center justify-center gap-2 rounded-full border border-brand-border bg-white px-6 py-2.5 text-sm font-semibold text-brand-dark transition-all duration-150 hover:bg-brand-gray dark:bg-dark-surface dark:border-dark-border dark:text-dark-heading dark:hover:bg-dark-border"
                        >
                            Tentar novamente
                        </button>
                    </div>

                    <div className="w-full mt-12 max-w-lg">
                        <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded-lg px-4 py-3 flex gap-3 items-start">
                            <div className="bg-red-400 w-1 rounded-full self-stretch shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-red-700 dark:text-red-300/80 mb-0.5">
                                    Detalhes do erro
                                </p>
                                <p className="text-xs text-red-700 dark:text-red-300/80 break-all">
                                    {message}
                                </p>
                                {digest && (
                                    <p className="text-[10px] opacity-70 text-red-700 dark:text-red-300/80 mt-1">
                                        ID: {digest}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <footer className="w-full h-[68px] py-6 border-t border-white/10 bg-brand-dark dark:bg-dark-surface">
                <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-center items-center">
                    <p className="text-white text-xs sm:text-sm font-medium tracking-tight">
                        © {new Date().getFullYear()} Dudit Tecnologia Ltda. Todos os
                        direitos reservados.
                    </p>
                </div>
            </footer>
        </div>
    )
}

function safeErrorMessage(error: unknown): string {
    if (!error) return "Ocorreu um erro inesperado."
    if (typeof error === "string" && error) return error
    if (typeof error === "object") {
        const maybe = (error as Record<string, unknown>).message
        if (typeof maybe === "string" && maybe) return maybe
    }
    return "Ocorreu um erro inesperado."
}

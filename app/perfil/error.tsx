"use client"

import { useEffect, useState } from "react"

export default function ProfileError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [isTransient, setIsTransient] = useState(false)

    useEffect(() => {
        const msg = error?.message || ""
        const isNetworkError =
            msg.includes("unexpected response") ||
            msg.includes("Unexpected response") ||
            msg.includes("Failed to fetch") ||
            msg.includes("NetworkError") ||
            msg.includes("Network request failed") ||
            msg.includes("ECONNRESET") ||
            msg.includes("ETIMEDOUT")

        setIsTransient(isNetworkError)

        try {
            import("@/lib/monitoring/sentry").then(({ captureError }) => {
                try {
                    captureError(error, {
                        module: "perfil",
                        action: "error_boundary",
                        metadata: { boundary: "perfil", isTransient },
                    })
                } catch { }
            }).catch(() => { })
        } catch { }
    }, [error])

    return (
        <div className="min-h-screen bg-white dark:bg-dark-background flex flex-col items-center justify-center px-4">
            <div className="max-w-md w-full text-center space-y-4">
                <img
                    src="https://img.dudit.com.br/static/mascots/Ops.png"
                    alt="Erro"
                    loading="lazy"
                    className="w-48 h-48 mx-auto object-contain"
                />
                <h1 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                    {isTransient
                        ? "Falha na conexão"
                        : "Algo deu errado"}
                </h1>
                <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                    {isTransient
                        ? "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
                        : "Ocorreu um erro inesperado ao carregar seu perfil."}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <button
                        onClick={() => reset()}
                        className="rounded-full bg-brand-green px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-green/90 transition-colors"
                    >
                        Tentar novamente
                    </button>
                    <a
                        href="/"
                        className="rounded-full border border-brand-border bg-white px-6 py-2.5 text-sm font-semibold text-brand-dark hover:bg-brand-gray transition-colors dark:bg-dark-surface dark:border-dark-border dark:text-dark-heading"
                    >
                        Voltar ao início
                    </a>
                </div>
                {error?.digest && (
                    <p className="text-[10px] text-brand-inactive-text/60 dark:text-dark-body/60 pt-4">
                        ID: {error.digest}
                    </p>
                )}
            </div>
        </div>
    )
}

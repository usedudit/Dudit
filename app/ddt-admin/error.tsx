"use client"

import { useEffect, useState } from "react"
import { Button, IconPlaceholder } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import Link from "next/link"

export default function AdminErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [copied, setCopied] = useState(false)
    const [showDetails, setShowDetails] = useState(false)

    useEffect(() => {
        console.error("================ DDT ADMIN ERROR CAUGHT ================")
        console.error("Error Name:", error?.name)
        console.error("Error Message:", error?.message)
        console.error("Digest:", error?.digest)
        console.error("Stack Trace:", error?.stack)
        console.error("Full Error Object:", error)
        console.error("========================================================")

        const isChunkError =
            error?.name === "ChunkLoadError" ||
            error?.message?.includes("ChunkLoadError") ||
            error?.message?.includes("Loading chunk") ||
            error?.message?.includes("Failed to fetch dynamically imported module")

        if (isChunkError) {
            const lastReload = sessionStorage.getItem("last-chunk-error-reload")
            const now = Date.now()
            if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
                sessionStorage.setItem("last-chunk-error-reload", now.toString())
                window.location.reload()
            }
        }
    }, [error])

    const msg = error?.message?.toLowerCase() || ""
    const isAccessDenied = msg.includes("acesso negado") || msg.includes("permissão") || error?.name === "ForbiddenError"

    const handleCopyLogs = () => {
        const errorLog = [
            `[DUDIT ADMIN ERROR REPORT]`,
            `Time: ${new Date().toISOString()}`,
            `Name: ${error?.name || "Unknown"}`,
            `Message: ${error?.message || "No message"}`,
            `Digest: ${error?.digest || "N/A"}`,
            `URL: ${typeof window !== "undefined" ? window.location.href : "N/A"}`,
            `Stack:\n${error?.stack || "No stack trace available"}`,
        ].join("\n")

        navigator.clipboard.writeText(errorLog)
        setCopied(true)
        toast.success("Logs do erro copiados para a área de transferência!")
        setTimeout(() => setCopied(false), 3000)
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[85vh] p-4 text-center max-w-2xl mx-auto">
            <div className="flex flex-col items-center w-full">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Erro no Painel Administrativo"
                    title={isAccessDenied ? "Acesso Restrito ao Painel" : "Algo deu errado no Painel Admin"}
                    subtitle={
                        isAccessDenied
                            ? "Você não tem permissão para visualizar ou executar esta ação administrativa."
                            : error?.message && error.message !== "An error occurred in the Server Action"
                            ? error.message
                            : "Ocorreu uma falha ao processar ou renderizar esta seção administrativa."
                    }
                />

                {/* Ações imediatas */}
                <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                    <Button
                        variant="filled"
                        onClick={() => reset()}
                    >
                        Tentar Novamente
                    </Button>

                    <Button
                        variant="outline"
                        onClick={handleCopyLogs}
                    >
                        {copied ? "Logs Copiados!" : "Copiar Logs do Erro"}
                    </Button>

                    <Link href="/ddt-admin">
                        <Button variant="ghost">
                            Voltar ao Início do Admin
                        </Button>
                    </Link>
                </div>

                {/* Detalhes Técnicos para o Admin */}
                <div className="w-full mt-8 text-left border border-brand-border dark:border-dark-border rounded-xl bg-brand-gray/40 dark:bg-dark-surface/40 p-4">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-inactive-text">
                            Diagnóstico Técnico
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowDetails(!showDetails)}
                            className="text-xs font-semibold text-brand-green hover:underline cursor-pointer"
                        >
                            {showDetails ? "Ocultar Detalhes" : "Ver Detalhes & Stack"}
                        </button>
                    </div>

                    <div className="mt-2 text-xs font-mono text-brand-dark dark:text-dark-heading break-all space-y-1">
                        <div>
                            <strong className="text-brand-inactive-text">Mensagem: </strong>
                            <span className="text-red-600 dark:text-red-400 font-semibold">{error?.message || "Sem mensagem de erro disponível"}</span>
                        </div>
                        {error?.digest && (
                            <div>
                                <strong className="text-brand-inactive-text">Digest ID: </strong>
                                <span>{error.digest}</span>
                            </div>
                        )}
                        {typeof window !== "undefined" && (
                            <div>
                                <strong className="text-brand-inactive-text">URL Atual: </strong>
                                <span className="text-brand-inactive-text">{window.location.href}</span>
                            </div>
                        )}
                    </div>

                    {showDetails && (
                        <div className="mt-3 pt-3 border-t border-brand-border dark:border-dark-border">
                            <span className="text-[11px] font-bold text-brand-inactive-text uppercase block mb-1">
                                Stack Trace:
                            </span>
                            <pre className="text-[11px] font-mono bg-black/5 dark:bg-black/40 p-3 rounded-lg overflow-x-auto text-brand-dark dark:text-dark-heading max-h-60 custom-scrollbar whitespace-pre-wrap select-all">
                                {error?.stack || "Nenhum stack trace disponível no ambiente de produção."}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

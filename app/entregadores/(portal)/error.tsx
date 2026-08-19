"use client"

import { useEffect } from "react"
import { IconPlaceholder } from "@/components/reusable"

export default function DeliveryPortalErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Delivery Portal Error Boundary caught:", error)
    }, [error])

    const msg = error.message?.toLowerCase() || ""
    const isAccessDenied =
        msg.includes("acesso restrito") ||
        msg.includes("acesso negado") ||
        msg.includes("permissão") ||
        error.name === "ForbiddenError"

    return (
        <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-4 text-center">
            <div className="flex flex-col items-center">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Erro"
                    title={isAccessDenied ? "Acesso Restrito ao Portal" : "Algo deu errado"}
                    subtitle={
                        isAccessDenied
                            ? "Sua conta não tem permissão para acessar o Portal do Entregador."
                            : "Ocorreu um erro inesperado ao carregar o portal. Tente novamente."
                    }
                    buttons={[
                        {
                            text: isAccessDenied ? "Voltar para o Início" : "Tentar novamente",
                            action: isAccessDenied ? "/" : () => reset(),
                            variant: "default",
                        },
                    ]}
                />
            </div>
        </div>
    )
}

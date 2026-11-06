"use client"

import { useEffect, useState } from "react"
import { IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import { ReturnIcon } from "@/lib/icons"
import { getAdminReturnRequestDetail } from "@/app/actions/admin/return-detail"
import AdminReturnDetailClient from "./AdminReturnDetailClient"

interface AdminReturnDetailClientWrapperProps {
    returnId: string
    onBack: () => void
}

/**
 * Busca o detalhe completo da devolução no client e renderiza o form de edição
 * admin (mesmo componente usado pela rota /ddt-admin/returns/[id]).
 *
 * Usado pela listagem de devoluções para manter o mesmo padrão das demais
 * páginas do admin.
 */
export default function AdminReturnDetailClientWrapper({
    returnId,
    onBack,
}: AdminReturnDetailClientWrapperProps) {
    const [detail, setDetail] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        const fetchDetail = async () => {
            try {
                const data = await getAdminReturnRequestDetail(returnId)
                if (!cancelled) setDetail(data)
            } catch (err) {
                console.error("[ADMIN_RETURN_DETAIL_INLINE] fetch failed:", err)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        fetchDetail()

        return () => {
            cancelled = true
        }
    }, [returnId])

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!detail) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center">
                <IconPlaceholder
                    icon={ReturnIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Solicitação não encontrada"
                    subtitle="A solicitação pode ter sido removida ou o link está incorreto."
                    itemButton={{
                        text: "Voltar às devoluções",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    return <AdminReturnDetailClient detail={detail} onBack={onBack} />
}

"use client"

import { useEffect, useState } from "react"
import { IconPlaceholder, ThreeDotsLoader } from "@/components/reusable"
import { PackageIcon } from "@/lib/icons"
import { getAdminMarketplaceOrderDetail } from "@/app/actions/admin/marketplace-ops"
import AdminOrderDetailClient from "./AdminOrderDetailClient"

interface AdminOrderDetailClientWrapperProps {
    orderId: string
    onBack: () => void
}

/**
 * Busca o detalhe completo do pedido no client e renderiza o form de edição
 * admin (mesmo componente usado pela rota /ddt-admin/orders/[id]).
 *
 * Usado pela listagem de pedidos quando a URL é /ddt-admin/orders?view=<id>,
 * para manter o mesmo padrão de URL das demais páginas do admin.
 */
export default function AdminOrderDetailClientWrapper({
    orderId,
    onBack,
}: AdminOrderDetailClientWrapperProps) {
    const [detail, setDetail] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let cancelled = false

        const fetchDetail = async () => {
            try {
                const data = await getAdminMarketplaceOrderDetail(orderId)
                if (!cancelled) setDetail(data)
            } catch (err) {
                console.error("[ADMIN_ORDER_DETAIL_INLINE] fetch failed:", err)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }

        fetchDetail()

        return () => {
            cancelled = true
        }
    }, [orderId])

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
                    icon={PackageIcon}
                    containerSize="w-16 h-16 mb-2"
                    iconSize="w-6 h-6"
                    title="Pedido não encontrado"
                    subtitle="O pedido pode ter sido removido ou o link está incorreto."
                    itemButton={{
                        text: "Voltar aos pedidos",
                        action: onBack,
                        variant: "outline",
                    }}
                />
            </div>
        )
    }

    return <AdminOrderDetailClient detail={detail} onBack={onBack} />
}

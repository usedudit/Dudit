"use client"

import React, { useState, useEffect } from "react"
import { ThreeDotsLoader, IconPlaceholder } from "@/components/reusable"
import { PackageIcon } from "@/lib/icons"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"
import OrderDetailView from "@/components/erp/orders/OrderDetailView"
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { getAdminMarketplaceOrderDetail } from "@/app/actions/admin/marketplace-ops"

interface AdminOrderDetailViewProps {
    orderId: string
    initialOrder?: any
    onBack: () => void
    onEdit?: (orderId: string) => void
}

export function AdminOrderDetailView({
    orderId,
    initialOrder,
    onBack,
    onEdit,
}: AdminOrderDetailViewProps) {
    const [order, setOrder] = useState<any>(initialOrder || null)
    const [isLoading, setIsLoading] = useState(!initialOrder)

    useEffect(() => {
        if (initialOrder) {
            setOrder(initialOrder)
            setIsLoading(false)
            return
        }

        let cancelled = false
        const fetchDetail = async () => {
            try {
                const data = await getAdminMarketplaceOrderDetail(orderId)
                if (!cancelled) setOrder(data)
            } catch (err) {
                console.error("[ADMIN_ORDER_DETAIL] fetch failed:", err)
            } finally {
                if (!cancelled) setIsLoading(false)
            }
        }
        fetchDetail()
        return () => {
            cancelled = true
        }
    }, [orderId, initialOrder])

    if (isLoading && !order) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <ThreeDotsLoader />
            </div>
        )
    }

    if (!order) {
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

    const partnerId = order.partner_id || order.stores?.partner_id || ""
    const store = order.stores || null
    const buyer = order.buyer_profile || {}

    const extraTabs = [
        {
            value: "parties",
            label: "Comprador e Loja",
            content: (
                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        <AdminBuyerCard
                            buyer={buyer}
                            buyerId={order.buyer_id}
                            customerName={order.customer_name}
                        />
                    </div>
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        <AdminStoreCard store={store} fallbackStoreId={order.store_id} />
                    </div>
                </div>
            ),
        },
    ]

    return (
        <PermissionProvider
            role="OWNER"
            routePermissions={ROUTE_PERMISSION_PRESETS.OWNER}
            partnerId={partnerId}
            businessInfo={{}}
            planSlug="escalar"
        >
            <StoreProvider
                partnerId={partnerId}
                initialStores={store ? [store] : []}
                activeStoreId={order.store_id || store?.id || null}
            >
                <OrderDetailView
                    orderId={orderId}
                    partnerId={partnerId}
                    initialOrder={order}
                    adminContext={true}
                    onBack={onBack}
                    onEditOrder={() => onEdit ? onEdit(order.id || orderId) : undefined}
                    extraTabs={extraTabs}
                />
            </StoreProvider>
        </PermissionProvider>
    )
}

export default AdminOrderDetailView

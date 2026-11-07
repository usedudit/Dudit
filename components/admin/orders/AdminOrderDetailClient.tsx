"use client"

import { useCallback } from "react"
import { useRouter } from "next/navigation"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"
import CreateOrder from "@/components/erp/orders/CreateOrder"
import { useAdminActionModal, type AdminActionPayload } from "@/components/admin/AdminActionModal"
import { CatalogTimelineTab } from "@/components/admin/catalog/AdminCatalogDetailTabs"
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"

interface AdminOrderDetailClientProps {
    /** Pedido completo de getAdminMarketplaceOrderDetail (order + stores + buyer_profile + audit_events). */
    detail: any
    /**
     * Callback de retorno. Quando omitido, volta para a listagem de pedidos
     * via router (comportamento da rota /ddt-admin/orders/[id]).
     */
    onBack?: () => void
}

type OrderAdminActionContext = {
    reason?: string | null
    riskScore?: number | null
    notifySeller?: boolean
    changedFields?: string[]
}

/**
 * Detalhe de pedido em modo admin: o mesmo form do ERP (CreateOrder) com
 * edição livre de qualquer status (bypass no server action), abas extras
 * "Comprador e Loja" e "Histórico & Auditoria" e o AdminActionModal antes
 * de salvar (motivo + risk score + notificação ao vendedor).
 */
export default function AdminOrderDetailClient({ detail, onBack }: AdminOrderDetailClientProps) {
    const router = useRouter()
    const { modal: actionModal, runAction } = useAdminActionModal()

    const partnerId: string = detail.partner_id
    const store = detail.stores || null
    const buyer = detail.buyer_profile || {}

    const handleBack = useCallback(
        () => (onBack ? onBack() : router.push("/ddt-admin/orders")),
        [onBack, router],
    )

    const adminActionGate = useCallback(
        async (changedFields: string[]): Promise<{ cancelled?: boolean; ctx?: OrderAdminActionContext }> => {
            let capturedCtx: OrderAdminActionContext | undefined
            const result = await runAction({
                title: "Salvar alterações",
                description: `Pedido #${detail.order_number || String(detail.id).slice(0, 8)}`,
                changedFields,
                force: true,
                confirmLabel: "Salvar",
                notifyLabel: "Enviar notificação pelo Dudit",
                runner: async (payload: AdminActionPayload) => {
                    capturedCtx = {
                        reason: payload.reason || null,
                        riskScore: payload.riskScore,
                        notifySeller: payload.notifySeller,
                        changedFields,
                    }
                    return { success: true }
                },
            })
            if (result.cancelled) return { cancelled: true }
            return { ctx: capturedCtx }
        },
        [detail, runAction],
    )

    const extraTabs = [
        {
            value: "parties",
            label: "Comprador e Loja",
            content: (
                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        <AdminBuyerCard
                            buyer={buyer}
                            buyerId={detail.buyer_id}
                            customerName={detail.customer_name}
                        />
                    </div>
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        <AdminStoreCard store={store} fallbackStoreId={detail.store_id} />
                    </div>
                </div>
            ),
        },
        {
            value: "timeline",
            label: "Histórico & Auditoria",
            content: (
                <CatalogTimelineTab events={detail.audit_events} createdAt={detail.created_at} />
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
                activeStoreId={detail.store_id || null}
            >
                <div className="px-4 md:px-8 pt-4 pb-8">
                    <CreateOrder
                        onBack={handleBack}
                        partnerId={partnerId}
                        editOrderId={detail.id}
                        adminContext
                        adminActionGate={adminActionGate}
                        extraTabs={extraTabs}
                    />
                </div>

                {actionModal}
            </StoreProvider>
        </PermissionProvider>
    )
}

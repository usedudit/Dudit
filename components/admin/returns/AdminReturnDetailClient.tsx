"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { PermissionProvider } from "@/lib/permission-context"
import { ROUTE_PERMISSION_PRESETS } from "@/lib/permissions/route-permissions"
import { StoreProvider } from "@/lib/store-context"
import CreateReturnPage from "@/components/erp/returns/CreateReturnPage"
import { useAdminActionModal, type AdminActionPayload } from "@/components/admin/AdminActionModal"
import { AdminBuyerCard } from "@/components/admin/AdminBuyerCard"
import { AdminStoreCard } from "@/components/admin/AdminStoreCard"
import { processReturnRequestAction } from "@/app/actions/erp/returns"
import { useToast } from "@/hooks/use-toast"

interface AdminReturnDetailClientProps {
    /** Detalhe de getAdminReturnRequestDetail (request normalizado + buyerProfile + auditoria). */
    detail: any
    /**
     * Callback de retorno. Quando omitido, volta para a listagem de devoluções
     * via router (comportamento da rota /ddt-admin/returns/[id]).
     */
    onBack?: () => void
    mode?: "view" | "edit"
}

type ReturnAdminActionContext = {
    reason?: string | null
    riskScore?: number | null
    notifySeller?: boolean
    changedFields?: string[]
}

/**
 * Detalhe de devolução em modo admin: o mesmo form do ERP (CreateReturnPage)
 * com edição livre de qualquer status (bypass no server action), aba extra
 * "Comprador e Loja" e o AdminActionModal antes de salvar (motivo + risk score
 * + notificação ao vendedor). A edição da Dudit entra na timeline da devolução.
 */
export default function AdminReturnDetailClient({ detail, onBack, mode = "edit" }: AdminReturnDetailClientProps) {
    const router = useRouter()
    const { toast } = useToast()
    const { modal: actionModal, runAction } = useAdminActionModal()
    const [isSaving, setIsSaving] = useState(false)

    const request = detail?.request || detail
    const partnerId: string = request?.partnerId || request?.partner_id
    const store = request?.stores || null
    const buyer = detail?.buyerProfile || {}

    const handleBack = useCallback(
        () => (onBack ? onBack() : router.push("/ddt-admin/returns")),
        [onBack, router],
    )

    const adminActionGate = useCallback(
        async (changedFields: string[]): Promise<{ cancelled?: boolean; ctx?: ReturnAdminActionContext }> => {
            let capturedCtx: ReturnAdminActionContext | undefined
            const result = await runAction({
                title: "Salvar alterações",
                description: `Solicitação DVL-${String(request?.id || "").slice(0, 6).toUpperCase()}`,
                changedFields,
                force: true,
                confirmLabel: "Salvar",
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
        [request?.id, runAction],
    )

    const handleSave = useCallback(async (data: Partial<any> & Record<string, any>) => {
        if (!request?.id || !partnerId) return
        setIsSaving(true)
        try {
            const statusChanged = data.status && data.status !== request.status
            const nextStatus = statusChanged ? data.status : undefined
            
            // Only auto-approve refund if status is being changed to an approved/resolved state
            const shouldApproveRefund = nextStatus && 
                ["APPROVED", "PROCESSING", "RESOLVED"].includes(nextStatus) && 
                Number(data.refundValue || 0) > 0

            const response = await processReturnRequestAction({
                partnerId,
                requestId: request.id,
                action: "updated",
                nextStatus,
                refundAmount: Number(data.refundValue || 0),
                refundStatus: shouldApproveRefund ? "APPROVED" : "PENDING",
                refundPaymentMethod: (data.resolutionType === "refund" || (data.resolutionType === "exchange" && data.exchangeBalanceResolution === "refund"))
                    ? data.refundPaymentMethod || null
                    : null,
                returnToInventory: Boolean(data.returnToInventory),
                returnToInventoryItems: data.returnToInventoryItems || null,
                customerId: data.customerId || null,
                storeCreditAmount: data.resolutionType === "store_credit" ? Number(data.storeCreditValue || 0) : 0,
                exchangeItems: data.resolutionType === "exchange" ? data.exchangeItems || [] : [],
                exchangeBalanceResolution: data.exchangeBalanceResolution || null,
                notes: data.observations || "",
                idempotencyKey: `admin-update:${request.id}:${Date.now()}`,
                accountId: data.accountId || null,
            }, {
                adminBypass: true,
                actionCtx: data.adminActionCtx ?? null,
            })

            if (!response.success) throw new Error(response.error)

            toast({ title: "Sucesso", description: "Solicitação atualizada com sucesso." })
            handleBack()
            router.refresh()
        } catch (err: any) {
            toast({
                title: "Erro",
                description: err?.message || "Erro ao salvar devolução.",
                variant: "destructive",
            })
        } finally {
            setIsSaving(false)
        }
    }, [partnerId, request?.id, request?.status, handleBack, router, toast])

    const extraTabs = [
        {
            value: "parties",
            label: "Comprador e Loja",
            content: (
                <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
                    <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12">
                        <AdminBuyerCard
                            buyer={{
                                ...buyer,
                                full_name: buyer.full_name || request?.customerName,
                                email: buyer.email || request?.customerEmail,
                                phone: buyer.phone || request?.customerPhone,
                            }}
                            buyerId={request?.customerId}
                            customerName={request?.customerName}
                        />
                    </div>
                    <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 border-0 xl:border-l border-brand-border dark:border-dark-border">
                        <AdminStoreCard store={store || {}} fallbackStoreId={request?.store_id} />
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
                activeStoreId={request?.store_id || store?.id || null}
            >
                <div className="px-4 md:px-8 pt-4 pb-8">
                    <CreateReturnPage
                        partnerId={partnerId}
                        mode={mode}
                        returnRequest={request}
                        onBack={handleBack}
                        onSave={handleSave}
                        isSaving={isSaving}
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

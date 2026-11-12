import { getAdminClient } from "@/lib/supabase/admin"
import { getReturnRequestDetailsAction } from "@/app/actions/erp/returns"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { notFound, redirect } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import ReturnReceiptA4Preview from "@/components/erp/returns/ReturnReceiptA4Preview"
import ReturnReceiptThermalPreview from "@/components/erp/returns/ReturnReceiptThermalPreview"

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        format?: string
    }>
}

export default async function PrintTrocaPage({ params, searchParams }: PageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams

    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()

    // Find partner_id and store_id from return_requests table
    const { data: requestData } = await supabase
        .from("return_requests")
        .select("partner_id, store_id")
        .eq("id", id)
        .maybeSingle()

    if (!requestData?.partner_id) {
        notFound()
    }

    const partnerId = requestData.partner_id
    const storeId = requestData.store_id || undefined

    // Verify authorized access to view return details
    try {
        await requirePartnerAccessWithPermission(partnerId, "orders", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar este comprovante.
            </div>
        )
    }

    // Fetch return/exchange details
    const returnRes = await getReturnRequestDetailsAction(partnerId, id)
    if (!returnRes.success || !returnRes.data) {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Solicitação de troca/devolução não encontrada.
            </div>
        )
    }
    const returnRequest = returnRes.data as any
    const effectiveStoreId = storeId || returnRequest.store_id || undefined

    // Fetch partner metadata, store avatar and address details
    const [headerRes, storeRes, policyRes] = await Promise.all([
        getPartnerReceiptHeaderAction(partnerId, effectiveStoreId),
        effectiveStoreId
            ? supabase.from("stores").select("id, name, logo_url").eq("id", effectiveStoreId).maybeSingle()
            : supabase.from("stores").select("id, name, logo_url").eq("partner_id", partnerId).limit(1).maybeSingle(),
        supabase
            .from("partner_return_policies")
            .select("receipt_message, receipt_show_acknowledgment")
            .eq("partner_id", partnerId)
            .maybeSingle(),
    ])
    const storeData = storeRes.data
    const partnerRes = { data: { store_name: storeData?.name, store_image_url: storeData?.logo_url } }

    const partnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
        fantasyName: "",
        legalName: "",
        addressLine: "",
        taxIdLine: "",
        phone: "",
    }
    const partnerName = storeRes.data?.name || partnerRes.data?.store_name || "Parceiro"
    const rawAvatar = storeRes.data?.logo_url || partnerRes.data?.store_image_url || undefined
    const partnerAvatar = rawAvatar ? getR2ImageUrl(rawAvatar) : undefined

    const rawFormat = resolvedSearchParams.format
    const isThermal = rawFormat === "thermal" || rawFormat === "thermal-58"
    const format = isThermal ? (rawFormat as "thermal" | "thermal-58") : "a4"
    const thermalWidth: "80mm" | "58mm" = format === "thermal-58" ? "58mm" : "80mm"
    const footerMessage = policyRes.data?.receipt_message?.trim() || null
    const showAcknowledgment = policyRes.data?.receipt_show_acknowledgment !== false

    return (
        <PrintLayout paperSize={format === "thermal-58" ? "thermal-58" : format === "thermal" ? "thermal" : "a4"}>
            {isThermal ? (
                <div className={`w-[${thermalWidth}] max-w-[${thermalWidth}] print:w-[${thermalWidth}] print:max-w-[${thermalWidth}] mx-auto`}>
                    <ReturnReceiptThermalPreview
                        returnRequest={returnRequest}
                        partnerHeader={partnerHeader}
                        partnerName={partnerName}
                        footerMessage={footerMessage}
                        showAcknowledgment={showAcknowledgment}
                        printMode={true}
                        thermalWidth={thermalWidth}
                    />
                </div>
            ) : (
                <ReturnReceiptA4Preview
                    returnRequest={returnRequest}
                    partnerHeader={partnerHeader}
                    partnerName={partnerName}
                    partnerAvatar={partnerAvatar}
                    showAcknowledgment={showAcknowledgment}
                    printMode={true}
                />
            )}
        </PrintLayout>
    )
}
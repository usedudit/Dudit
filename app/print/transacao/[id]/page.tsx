import { getAdminClient } from "@/lib/supabase/admin"
import { getTransactionDetailsAction } from "@/app/actions/erp/transactions"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { DEFAULT_RECEIPT_FOOTER_MESSAGE } from "@/lib/sales/sale-receipt"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import TransactionReceiptA4Preview from "@/components/erp/transactions/TransactionReceiptA4Preview"
import TransactionReceiptThermalPreview from "@/components/erp/transactions/TransactionReceiptThermalPreview"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { notFound, redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        format?: string
    }>
}

export default async function PrintTransacaoPage({ params, searchParams }: PageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams

    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()

    const { data: transactionRow } = await supabase
        .from("transactions")
        .select("partner_id")
        .eq("id", id)
        .maybeSingle()

    if (!transactionRow?.partner_id) {
        notFound()
    }

    const partnerId = transactionRow.partner_id

    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar este comprovante.
            </div>
        )
    }

    const detailRes = await getTransactionDetailsAction(id, partnerId)
    if (!detailRes.success || !detailRes.data) {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Transação não encontrada.
            </div>
        )
    }
    const detail = detailRes.data

    const [headerRes, storeRes] = await Promise.all([
        getPartnerReceiptHeaderAction(partnerId),
        supabase
            .from("stores")
            .select("id, name, logo_url")
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
    ])

    const partnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
        fantasyName: "",
        legalName: "",
        addressLine: "",
        taxIdLine: "",
        phone: "",
    }
    const partnerName = storeRes.data?.name || partnerHeader.fantasyName || "Estabelecimento"
    const rawAvatar = storeRes.data?.logo_url || undefined
    const partnerAvatar = rawAvatar ? getR2ImageUrl(rawAvatar) : undefined

    const rawFormat = resolvedSearchParams.format
    const isThermal = rawFormat === "thermal" || rawFormat === "thermal-58"
    const format = isThermal ? (rawFormat as "thermal" | "thermal-58") : "a4"
    const thermalWidth: "80mm" | "58mm" = format === "thermal-58" ? "58mm" : "80mm"

    return (
        <PrintLayout paperSize={format === "thermal-58" ? "thermal-58" : format === "thermal" ? "thermal" : "a4"}>
            {isThermal ? (
                <div className={`w-[${thermalWidth}] max-w-[${thermalWidth}] print:w-[${thermalWidth}] print:max-w-[${thermalWidth}] mx-auto`}>
                    <TransactionReceiptThermalPreview
                        detail={detail}
                        partnerHeader={partnerHeader}
                        partnerName={partnerName}
                        footerMessage={DEFAULT_RECEIPT_FOOTER_MESSAGE}
                        printMode={true}
                        thermalWidth={thermalWidth}
                    />
                </div>
            ) : (
                <TransactionReceiptA4Preview
                    detail={detail}
                    partnerHeader={partnerHeader}
                    partnerName={partnerName}
                    partnerAvatar={partnerAvatar}
                    printMode={true}
                />
            )}
        </PrintLayout>
    )
}

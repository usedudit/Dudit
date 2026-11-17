import { getAdminClient } from "@/lib/supabase/admin"
import { getCashSessionDetailsAction } from "@/app/actions/erp/cash-register"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import CashSessionCouponPreview from "@/components/erp/cash-register/CashSessionCouponPreview"
import { buildCashSessionCouponData } from "@/lib/cash-register/cash-session-coupon"
import CashSessionA4Preview from "@/components/erp/cash-register/CashSessionA4Preview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { notFound, redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        type?: string
        format?: string
    }>
}

export default async function PrintCaixaPage({ params, searchParams }: PageProps) {
    const { id } = await params
    const { type, format } = await searchParams

    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()

    const { data: session } = await supabase
        .from("cash_sessions")
        .select("partner_id, store_id")
        .eq("id", id)
        .maybeSingle()

    if (!session) {
        notFound()
    }

    const partnerId = session.partner_id
    const storeId = session.store_id

    try {
        await requirePartnerAccessWithPermission(partnerId, "pdv", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar este cupom.
            </div>
        )
    }

    const [detailsRes, headerRes, storeRes] = await Promise.all([
        getCashSessionDetailsAction(partnerId, id),
        getPartnerReceiptHeaderAction(partnerId, storeId || undefined),
        storeId
            ? supabase.from("stores").select("logo_url").eq("id", storeId).maybeSingle()
            : supabase.from("stores").select("logo_url").eq("partner_id", partnerId).limit(1).maybeSingle(),
    ])

    if (!detailsRes.success || !detailsRes.data) {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Cupom não encontrado.
            </div>
        )
    }

    const details = detailsRes.data
    const partnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
        fantasyName: "",
        legalName: "",
        addressLine: "",
        taxIdLine: "",
    }

    const isOpen = details.session.status === "open"
    const couponType = type === "opening" || isOpen ? "opening" : "closing"

    const couponData = buildCashSessionCouponData(details, partnerHeader)
    const partnerAvatarRaw = storeRes.data?.logo_url || undefined
    const partnerAvatar = partnerAvatarRaw ? getR2ImageUrl(partnerAvatarRaw) : undefined

    const printFormat =
        format === "thermal" || format === "thermal-58" || format === "a4" ? format : "thermal"
    const isThermal = printFormat === "thermal" || printFormat === "thermal-58"
    const thermalWidth = printFormat === "thermal-58" ? "58mm" : "80mm"

    return (
        <PrintLayout paperSize={printFormat === "thermal-58" ? "thermal-58" : printFormat === "a4" ? "a4" : "thermal"}>
            {isThermal ? (
                thermalWidth === "58mm" ? (
                    <div className="w-[58mm] max-w-[58mm] print:w-[58mm] print:max-w-[58mm] mx-auto">
                        <CashSessionCouponPreview
                            data={couponData}
                            type={couponType}
                            printMode={true}
                            thermalWidth="58mm"
                        />
                    </div>
                ) : (
                    <div className="w-[80mm] max-w-[80mm] print:w-[80mm] print:max-w-[80mm] mx-auto">
                        <CashSessionCouponPreview
                            data={couponData}
                            type={couponType}
                            printMode={true}
                            thermalWidth="80mm"
                        />
                    </div>
                )
            ) : (
                <CashSessionA4Preview
                    data={couponData}
                    partnerHeader={partnerHeader}
                    partnerAvatar={partnerAvatar}
                    type={couponType}
                    printMode={true}
                />
            )}
        </PrintLayout>
    )
}

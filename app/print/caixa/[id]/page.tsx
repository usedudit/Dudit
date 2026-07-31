import { getAdminClient } from "@/lib/supabase/admin"
import { getCashSessionDetailsAction } from "@/app/actions/erp/cash-register"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import CashSessionCouponPreview from "@/components/erp/cash-register/CashSessionCouponPreview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { notFound, redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        type?: string
    }>
}

export default async function PrintCaixaPage({ params, searchParams }: PageProps) {
    const { id } = await params
    const { type } = await searchParams

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

    const [detailsRes, headerRes] = await Promise.all([
        getCashSessionDetailsAction(partnerId, id),
        getPartnerReceiptHeaderAction(partnerId, storeId || undefined),
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

    const couponData = {
        partnerName: partnerHeader.fantasyName,
        partnerDoc: partnerHeader.taxIdLine,
        partnerPhone: partnerHeader.phone || null,
        partnerAddress: partnerHeader.addressLine,
        sessionId: details.session.id,
        status: details.session.status,
        openedAt: details.session.opened_at,
        closedAt: details.session.closed_at || null,
        openOperator: details.operators.open_name,
        closeOperator: details.operators.close_name,
        initialAmount: details.totals.initial,
        summaryByPaymentMethod: details.summaryByPaymentMethod.map((row: any) => ({
            label: row.label,
            calculated: row.calculated,
            counted: row.counted,
            difference: row.difference,
        })),
        totals: {
            totalSalesAllMethods: details.totals.totalSalesAllMethods,
            totalWithdrawals: details.totals.totalWithdrawals,
            totalDeposits: details.totals.totalDeposits,
            totalRefunds: details.totals.totalRefunds,
            calculatedDrawerTotal: details.totals.calculatedDrawerTotal,
            informedDrawerTotal: details.totals.informedDrawerTotal,
            difference: details.totals.difference,
        },
        notes: details.session.notes || null,
    }

    return (
        <PrintLayout>
            <div className="w-[80mm] max-w-[80mm] print:w-[80mm] print:max-w-[80mm]">
                <CashSessionCouponPreview
                    data={couponData}
                    type={couponType}
                    printMode={true}
                />
            </div>
        </PrintLayout>
    )
}

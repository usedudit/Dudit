import { getAdminClient } from "@/lib/supabase/admin"
import { getOrderDetailsAction } from "@/app/actions/erp/orders"
import { getPartnerReceiptHeaderAction } from "@/app/actions/erp/receipt"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { buildSaleReceiptFromOrder, DEFAULT_RECEIPT_FOOTER_MESSAGE, type SaleReceiptFormat } from "@/lib/sales/sale-receipt"
import SaleReceiptA4Preview from "@/components/erp/orders/receipt/SaleReceiptA4Preview"
import SaleReceiptThermalPreview from "@/components/erp/orders/receipt/SaleReceiptThermalPreview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { notFound, redirect } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        format?: string
        footerMessage?: string
        showAcknowledgment?: string
    }>
}

export default async function PrintReciboPage({ params, searchParams }: PageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    
    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()
    let partnerId = ""
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

    let storeId: string | undefined = undefined

    // Check orders table
    const orderQuery = supabase
        .from("orders")
        .select("partner_id, store_id")
    
    if (isUuid) {
        orderQuery.eq("id", id)
    } else {
        orderQuery.eq("order_number", id)
    }

    const { data: orderData } = await orderQuery.maybeSingle()

    if (orderData?.partner_id) {
        partnerId = orderData.partner_id
        storeId = orderData.store_id || undefined
    } else {
        // Fallback check sales table
        const saleQuery = supabase
            .from("sales")
            .select("partner_id, store_id")
        
        if (isUuid) {
            saleQuery.eq("id", id)
        } else {
            saleQuery.eq("sale_number", id)
        }

        const { data: saleData } = await saleQuery.maybeSingle()

        if (saleData?.partner_id) {
            partnerId = saleData.partner_id
            storeId = saleData.store_id || undefined
        }
    }

    if (!partnerId) {
        notFound()
    }

    // Verify authorized access to view order details
    try {
        await requirePartnerAccessWithPermission(partnerId, "orders", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar este recibo.
            </div>
        )
    }

    // Fetch order details
    const orderRes = await getOrderDetailsAction(id, partnerId)
    if (!orderRes.success || !orderRes.data) {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Recibo não encontrado.
            </div>
        )
    }
    const order = orderRes.data
    if (!storeId && order.store_id) {
        storeId = order.store_id
    }

    // Fetch partner header, logo details and return policy receipt message
    const [headerRes, storeRes, policyRes] = await Promise.all([
        getPartnerReceiptHeaderAction(partnerId, storeId),
        storeId
            ? supabase.from("stores").select("logo_url").eq("id", storeId).maybeSingle()
            : supabase.from("stores").select("logo_url").eq("partner_id", partnerId).limit(1).maybeSingle(),
        supabase.from("partner_return_policies").select("receipt_message, receipt_show_acknowledgment, receipt_show_policy_block").eq("partner_id", partnerId).maybeSingle(),
    ])

    const partnerHeader = headerRes.success && headerRes.data ? headerRes.data : {
        fantasyName: "",
        legalName: "",
        addressLine: "",
        taxIdLine: "",
    }
    const rawAvatar = storeRes.data?.logo_url || undefined
    const partnerAvatar = rawAvatar ? getR2ImageUrl(rawAvatar) : undefined

    // Build receipt payload
    const receiptData = buildSaleReceiptFromOrder(order, partnerHeader, {
        partnerAvatar,
        sellerName: order.seller_name || undefined,
        primaryColor: order.primary_color || undefined,
        secondaryColor: order.secondary_color || undefined,
    })

    const format: SaleReceiptFormat =
        resolvedSearchParams.format === "thermal" || resolvedSearchParams.format === "thermal-58"
            ? (resolvedSearchParams.format as SaleReceiptFormat)
            : "a4"
    const isThermal = format === "thermal" || format === "thermal-58"
    const thermalWidth = format === "thermal-58" ? "58mm" : "80mm"
    const defaultFooterMsg = policyRes.data?.receipt_message?.trim() || DEFAULT_RECEIPT_FOOTER_MESSAGE
    const footerMessage = resolvedSearchParams.footerMessage || defaultFooterMsg
    const defaultAck = policyRes.data?.receipt_show_acknowledgment !== false
    const showAcknowledgment =
        resolvedSearchParams.showAcknowledgment !== undefined
            ? resolvedSearchParams.showAcknowledgment !== "false"
            : defaultAck

    return (
        <PrintLayout paperSize={format === "thermal-58" ? "thermal-58" : format === "thermal" ? "thermal" : "a4"}>
            {isThermal ? (
                <div className={`w-[${thermalWidth}] max-w-[${thermalWidth}] print:w-[${thermalWidth}] print:max-w-[${thermalWidth}] mx-auto`}>
                    <SaleReceiptThermalPreview
                        data={receiptData}
                        footerMessage={footerMessage}
                        showAcknowledgment={showAcknowledgment}
                        printMode={true}
                        thermalWidth={thermalWidth}
                    />
                </div>
            ) : (
                <SaleReceiptA4Preview
                    data={receiptData}
                    footerMessage={footerMessage}
                    showAcknowledgment={showAcknowledgment}
                    printMode={true}
                />
            )}
        </PrintLayout>
    )
}

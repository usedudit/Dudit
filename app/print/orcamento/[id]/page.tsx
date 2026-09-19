import { getAdminClient } from "@/lib/supabase/admin"
import { getQuoteWithItemsCached } from "@/lib/data/quotes"
import { getPartnerAddressAction } from "@/app/actions/erp/quotes"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import QuotePreview from "@/components/erp/quotes/QuotePreview"
import QuoteThermalPreview from "@/components/erp/quotes/QuoteThermalPreview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { notFound, redirect } from "next/navigation"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"

interface PageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        format?: string
    }>
}

export default async function PrintOrcamentoPage({ params, searchParams }: PageProps) {
    const { id } = await params
    const resolvedSearchParams = await searchParams
    const isThermal = resolvedSearchParams.format === "thermal" || resolvedSearchParams.format === "thermal-58"
    const thermalWidth: "80mm" | "58mm" = resolvedSearchParams.format === "thermal-58" ? "58mm" : "80mm"
    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()
    const { data: quote } = await supabase
        .from("quotes")
        .select("partner_id, store_id")
        .eq("id", id)
        .maybeSingle()

    if (!quote) {
        notFound()
    }

    // Verify authorized access to this ERP's budgets
    try {
        await requirePartnerAccessWithPermission(quote.partner_id, "quotes", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar este orçamento.
            </div>
        )
    }

    // Load detailed budget data
    const quoteDetails = await getQuoteWithItemsCached(id, quote.partner_id)
    if (!quoteDetails) {
        notFound()
    }

    const storeId = quote.store_id || quoteDetails.store_id || undefined

    // Fetch store logo, partner fallback and address details
    const [storeRes, addressRes] = await Promise.all([
        storeId
            ? supabase.from("stores").select("name, logo_url, phone").eq("id", storeId).maybeSingle()
            : supabase.from("stores").select("name, logo_url, phone").eq("partner_id", quote.partner_id).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        getPartnerAddressAction(quote.partner_id, storeId)
    ])

    const partnerName = storeRes.data?.name || "Parceiro"
    const rawAvatar = storeRes.data?.logo_url || undefined
    const partnerAvatar = rawAvatar ? getR2ImageUrl(rawAvatar) : undefined
    const partnerAddress = (addressRes.success && addressRes.data?.formatted) || undefined
    const partnerPhone = storeRes.data?.phone || undefined

    const formattedItems = (quoteDetails.items || []).map((item: any) => ({
        name: item.custom_name || item.products?.name || "Produto sem nome",
        qty: item.quantity,
        price: item.unit_price
    }))

    const meta = quoteDetails.metadata || {}
    const preview = meta.preview || {}
    const previewMeta = {
        primaryColor: preview.primaryColor || undefined,
        secondaryColor: preview.secondaryColor || undefined,
        quoteTitle: preview.quoteTitle || undefined,
        quoteSubtitle: preview.quoteSubtitle || undefined,
        showDecoration: preview.showDecoration !== false,
    }

    return (
        <PrintLayout paperSize={isThermal ? (resolvedSearchParams.format === "thermal-58" ? "thermal-58" : "thermal") : "a4"}>
            {isThermal ? (
                <div className={`w-[${thermalWidth}] max-w-[${thermalWidth}] print:w-[${thermalWidth}] print:max-w-[${thermalWidth}] mx-auto`}>
                    <QuoteThermalPreview
                        invoiceNumber={quoteDetails.quote_number || ""}
                        quoteDate={quoteDetails.issue_date || ""}
                        expiryDate={quoteDetails.expiration_date || ""}
                        selectedCustomer={quoteDetails.customers}
                        quoteItems={formattedItems}
                        subtotal={Number(quoteDetails.subtotal || 0)}
                        shippingNum={Number(quoteDetails.shipping_cost || 0)}
                        otherCosts={Number(quoteDetails.additional_costs || 0)}
                        discountValue={Number(quoteDetails.discount_value || 0)}
                        total={Number(quoteDetails.total || 0)}
                        note={quoteDetails.notes || undefined}
                        partnerName={partnerName}
                        partnerAddress={partnerAddress}
                        partnerPhone={partnerPhone}
                        partnerAvatar={partnerAvatar}
                        printMode={true}
                        thermalWidth={thermalWidth}
                        primaryColor={previewMeta.primaryColor}
                        secondaryColor={previewMeta.secondaryColor}
                        quoteTitle={previewMeta.quoteTitle}
                        quoteSubtitle={previewMeta.quoteSubtitle}
                        showDecoration={previewMeta.showDecoration}
                        salespersonName={quoteDetails.user_profiles?.full_name || undefined}
                    />
                </div>
            ) : (
                <QuotePreview
                    invoiceNumber={quoteDetails.quote_number || ""}
                    quoteDate={quoteDetails.issue_date || ""}
                    expiryDate={quoteDetails.expiration_date || ""}
                    selectedCustomer={quoteDetails.customers}
                    quoteItems={formattedItems}
                    subtotal={Number(quoteDetails.subtotal || 0)}
                    shippingNum={Number(quoteDetails.shipping_cost || 0)}
                    otherCosts={Number(quoteDetails.additional_costs || 0)}
                    discountValue={Number(quoteDetails.discount_value || 0)}
                    total={Number(quoteDetails.total || 0)}
                    note={quoteDetails.notes || undefined}
                    partnerName={partnerName}
                    partnerAddress={partnerAddress}
                    partnerPhone={partnerPhone}
                    partnerAvatar={partnerAvatar}
                    printMode={true}
                    primaryColor={previewMeta.primaryColor}
                    secondaryColor={previewMeta.secondaryColor}
                    quoteTitle={previewMeta.quoteTitle}
                    quoteSubtitle={previewMeta.quoteSubtitle}
                    showDecoration={previewMeta.showDecoration}
                    salespersonName={quoteDetails.user_profiles?.full_name || undefined}
                />
            )}
        </PrintLayout>
    )
}

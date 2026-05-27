import { getAdminClient } from "@/lib/supabase/admin"
import { getQuoteWithItemsCached } from "@/lib/data/quotes"
import { getPartnerAddressAction } from "@/app/actions/erp/quotes"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import QuotePreview from "@/components/erp/quotes/QuotePreview"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { notFound, redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function PrintOrcamentoPage({ params }: PageProps) {
    const { id } = await params
    
    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()
    const { data: quote } = await supabase
        .from("quotes")
        .select("partner_id")
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

    // Fetch partner logo and address details
    const [partnerRes, addressRes] = await Promise.all([
        supabase.from("partners").select("store_name, image_url").eq("id", quote.partner_id).maybeSingle(),
        getPartnerAddressAction(quote.partner_id)
    ])

    const partnerName = partnerRes.data?.store_name || "Parceiro"
    const partnerAvatar = partnerRes.data?.image_url || undefined
    const partnerAddress = addressRes.success && addressRes.data ? addressRes.data.formatted : undefined

    const formattedItems = (quoteDetails.items || []).map((item: any) => ({
        name: item.custom_name || item.products?.name || "Produto sem nome",
        qty: item.quantity,
        price: item.unit_price
    }))

    return (
        <PrintLayout>
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
                partnerAvatar={partnerAvatar}
                printMode={true}
            />
        </PrintLayout>
    )
}

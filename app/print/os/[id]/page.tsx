import { getAdminClient } from "@/lib/supabase/admin"
import { getServiceOrderDetailsAction } from "@/app/actions/erp/service-orders"
import { getPartnerAddressAction } from "@/app/actions/erp/quotes"
import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import OSPreview from "@/components/erp/service-orders/OSPreview"
import { notFound, redirect } from "next/navigation"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function PrintOSPage({ params }: PageProps) {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) {
        redirect("/auth/login")
    }

    const supabase = getAdminClient()
    const { data: so } = await supabase
        .from("service_orders")
        .select("partner_id, store_id")
        .eq("id", id)
        .maybeSingle()

    if (!so) {
        notFound()
    }

    try {
        await requirePartnerAccessWithPermission(so.partner_id, "service_orders", "view", user)
    } catch {
        return (
            <div className="p-8 text-center text-brand-red font-bold font-sans">
                Acesso negado. Você não possui permissão para visualizar esta Ordem de Serviço.
            </div>
        )
    }

    const result = await getServiceOrderDetailsAction(id, so.partner_id)
    if (!result.success) {
        notFound()
    }

    const order = result.data
    const storeId = so.store_id || order.store_id || undefined

    const [storeRes, addressRes] = await Promise.all([
        storeId
            ? supabase.from("stores").select("name, logo_url, phone").eq("id", storeId).maybeSingle()
            : supabase.from("stores").select("name, logo_url, phone").eq("partner_id", so.partner_id).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        getPartnerAddressAction(so.partner_id, storeId),
    ])

    const partnerName = storeRes.data?.name || "Parceiro"
    const partnerAvatar = storeRes.data?.logo_url || undefined
    const partnerAddress = (addressRes.success && addressRes.data?.formatted) || undefined
    const partnerPhone = storeRes.data?.phone || undefined

    let selectedCustomer = order.customer_snapshot
    if (typeof selectedCustomer === "string") {
        try {
            selectedCustomer = JSON.parse(selectedCustomer)
        } catch {
            selectedCustomer = null
        }
    }
    if (!selectedCustomer?.name && order.customer_id) {
        const { data: customer } = await supabase
            .from("customers")
            .select("id, name, email, phone, document, addresses(*)")
            .eq("id", order.customer_id)
            .maybeSingle()
        if (customer) selectedCustomer = customer
    }

    return (
        <PrintLayout paperSize="a4">
            <OSPreview
                invoiceNumber={order.order_number || ""}
                orderDate={order.created_at || ""}
                expectedCompletionDate={order.expected_completion_date}
                expectedCompletionTime={order.expected_completion_time}
                selectedCustomer={selectedCustomer}
                services={order.services || []}
                products={order.products || []}
                totalServiceAmount={Number(order.total_service_amount || 0)}
                totalProductAmount={Number(order.total_product_amount || 0)}
                totalAmount={Number(order.total_amount || 0)}
                description={order.description}
                diagnosis={order.diagnosis}
                signatureImageKey={order.signature_image_key}
                signedAt={order.signed_at}
                partnerName={partnerName}
                partnerAddress={partnerAddress}
                partnerPhone={partnerPhone}
                partnerAvatar={partnerAvatar}
                printMode={true}
                salespersonName={order.assigned_user_name || undefined}
            />
        </PrintLayout>
    )
}

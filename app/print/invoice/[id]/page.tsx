import { getCurrentUser } from "@/lib/auth/server-user"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import PrintLayout from "@/components/erp/shared/PrintLayout"
import { InvoicePreview } from "@/components/billing/InvoicePreview"
import { getInvoiceForPrintAction } from "@/app/actions/billing/invoices"
import { redirect } from "next/navigation"

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) redirect("/login")

    const invoiceData = await getInvoiceForPrintAction(id)
    if (!invoiceData) {
        return <div className="p-8 text-center text-red-600">Fatura não encontrada ou acesso negado.</div>
    }

    return (
        <PrintLayout>
            <InvoicePreview data={invoiceData} printMode />
        </PrintLayout>
    )
}

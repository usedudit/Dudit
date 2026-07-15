import { getAdminClient } from "@/lib/supabase/admin"
import type { BillingPurchase, BillingPayment, InvoiceData, InvoiceItem } from "./types"

const INVOICE_PREFIX = "INV"
const HASH_PREFIX_LENGTH = 8
const FOOTER_TEXT = "Criado via Dudit - dudit.com.br"

async function getNextSequenceNumber(): Promise<number> {
    const admin = getAdminClient()
    const { data } = await admin.rpc("nextval", { sequence_name: "billing_invoice_number_seq" })
    if (data) return Number(data)

    const { data: seqData } = await admin
        .from("billing_invoice_number_seq")
        .select("last_value")
        .single()
    return (seqData?.last_value || 0) + 1
}

function generateInvoiceNumber(sequence: number): string {
    const year = new Date().getFullYear()
    const padded = String(sequence).padStart(6, "0")
    return `${INVOICE_PREFIX}-${year}-${padded}`
}

async function generateVerificationHash(invoiceNumber: string, purchaseId: string): Promise<string> {
    const data = `${invoiceNumber}:${purchaseId}:${Date.now()}`
    const encoder = new TextEncoder()
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

import { formatDocument, getPaymentMethodLabel, getGatewayLabel, getStatusLabel } from "./invoice-utils"
export { formatDocument, getPaymentMethodLabel, getGatewayLabel, getStatusLabel }


function buildPurchaseTypeLabel(type: string): string {
    const labels: Record<string, string> = {
        subscription: "Assinatura de Plano",
        addon: "Add-on",
        marketplace_feature: "Funcionalidade Marketplace",
        credit_pack: "Pacote de Créditos",
        service: "Serviço",
        order_payment: "Pagamento de Pedido",
        future: "Compra Futura",
    }
    return labels[type] || type
}

export async function generateInvoiceData(
    purchase: BillingPurchase,
    payments: BillingPayment[],
    partnerDetails: { name: string; document: string | null; address: string; email: string | null; phone: string | null; image_url: string | null },
    customerDetails: { name: string; document: string | null; email: string | null } | null,
    purchaseableDetails?: { name?: string; code?: string; description?: string } | null,
    periodStart?: string | null,
    periodEnd?: string | null,
): Promise<{ invoiceNumber: string; verificationHash: string; invoiceData: InvoiceData }> {
    const sequence = await getNextSequenceNumber()
    const invoiceNumber = generateInvoiceNumber(sequence)
    const verificationHash = await generateVerificationHash(invoiceNumber, purchase.id)

    const mainPayment = payments.find((p) => p.status === "approved") || payments[0]

    const items: InvoiceItem[] = [
        {
            code: purchaseableDetails?.code || null,
            name: purchaseableDetails?.name || buildPurchaseTypeLabel(purchase.purchase_type),
            description: purchase.description || purchaseableDetails?.description || null,
            quantity: 1,
            unit_price: purchase.amount,
            total: purchase.amount,
        },
    ]

    const invoiceData: InvoiceData = {
        invoice_number: invoiceNumber,
        verification_hash: verificationHash,
        created_at: new Date().toISOString(),
        status: "issued",

        partner: {
            name: partnerDetails.name,
            document: formatDocument(partnerDetails.document),
            address: partnerDetails.address,
            email: partnerDetails.email,
            phone: partnerDetails.phone,
            image_url: partnerDetails.image_url,
        },

        customer: customerDetails,

        purchase: {
            id: purchase.id,
            type: purchase.purchase_type,
            description: purchase.description || null,
            amount: Number(purchase.amount),
            discount_amount: Number(purchase.discount_amount),
            total_amount: Number(purchase.total_amount),
            currency: purchase.currency,
        },

        items,

        payment: {
            method: mainPayment?.payment_method_type || "other",
            method_label: getPaymentMethodLabel(mainPayment?.payment_method_type || null),
            gateway: purchase.gateway,
            gateway_label: getGatewayLabel(purchase.gateway),
            status: getStatusLabel(purchase.status),
            paid_at: mainPayment?.paid_at || null,
            installments: mainPayment?.payment_method_details?.installments || null,
        },

        period: periodStart || periodEnd ? { start: periodStart ?? null, end: periodEnd ?? null } : null,

        notes: null,
        footer: FOOTER_TEXT,
    }

    return { invoiceNumber, verificationHash, invoiceData }
}

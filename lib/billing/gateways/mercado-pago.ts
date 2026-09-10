import { getAdminClient } from "@/lib/supabase/admin"
import { gatewayRegistry, type BillingGateway, type PaymentResult, type WebhookResult, type CancelResult } from "../gateway"
import type { CreatePaymentInput, GatewayName } from "../types"

class MercadoPagoGateway implements BillingGateway {
    name: GatewayName = "mercado_pago"

    async createPayment(input: CreatePaymentInput, metadata?: Record<string, any>): Promise<PaymentResult> {
        try {
            const { createMpPreapproval } = await import("@/lib/services/mercadopago/partner-preapproval")

            if (metadata?.preapproval) {
                const result = await createMpPreapproval({
                    partnerId: metadata.partnerId,
                    payerEmail: metadata.payerEmail,
                    planName: metadata.reason || "Assinatura",
                    amount: input.amount,
                    frequency: metadata.frequency || 1,
                    frequencyType: metadata.frequencyType || "months",
                    externalReference: input.purchase_id,
                })

                if (result.initPoint) {
                    return {
                        success: true,
                        checkout_url: result.initPoint,
                        gateway_payment_id: result.id,
                        gateway_status: "pending",
                    }
                }
                return { success: false, error: "Falha ao criar preapproval" }
            }

            const { MercadoPagoConfig, Preference } = await import("mercadopago")
            const mpClient = new MercadoPagoConfig({
                accessToken: process.env.MP_SUBSCRIPTION_CLIENT_SECRET!,
            })

            const preference = await new Preference(mpClient).create({
                body: {
                    items: [
                        {
                            id: input.purchase_id,
                            title: metadata?.itemName || "Compra Dudit",
                            quantity: 1,
                            unit_price: input.amount,
                            currency_id: "BRL",
                        },
                    ],
                    external_reference: input.purchase_id,
                    back_urls: {
                        success: `${process.env.NEXT_PUBLIC_APP_URL}/payment/success`,
                        failure: `${process.env.NEXT_PUBLIC_APP_URL}/payment/failure`,
                        pending: `${process.env.NEXT_PUBLIC_APP_URL}/payment/pending`,
                    },
                    auto_return: "approved",
                },
            })

            return {
                success: true,
                checkout_url: preference.init_point!,
                gateway_payment_id: preference.id!,
                gateway_status: "pending",
            }
        } catch (error: any) {
            console.error("[MP Gateway] createPayment error:", error)
            return { success: false, error: error.message || "Erro no gateway Mercado Pago" }
        }
    }

    async processWebhook(event: any): Promise<WebhookResult> {
        try {
            const action = event?.action || event?.type
            const dataId = event?.data?.id

            if (!dataId) {
                return { processed: false, error: "Missing data.id" }
            }

            const response = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
                headers: { Authorization: `Bearer ${process.env.MP_SUBSCRIPTION_CLIENT_SECRET}` },
            })

            if (!response.ok) {
                return { processed: false, error: `MP API error: ${response.status}` }
            }

            const payment = await response.json()
            const statusMap: Record<string, string> = {
                approved: "approved",
                rejected: "rejected",
                pending: "pending",
                in_process: "processing",
                in_mediation: "processing",
                cancelled: "cancelled",
                refunded: "refunded",
                charged_back: "chargeback",
            }

            return {
                processed: true,
                payment_id: dataId,
                status: statusMap[payment.status] || payment.status,
            }
        } catch (error: any) {
            console.error("[MP Gateway] processWebhook error:", error)
            return { processed: false, error: error.message }
        }
    }

    async getPaymentStatus(gatewayPaymentId: string): Promise<{ status: string; details?: any }> {
        try {
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${gatewayPaymentId}`, {
                headers: { Authorization: `Bearer ${process.env.MP_SUBSCRIPTION_CLIENT_SECRET}` },
            })

            if (!response.ok) {
                return { status: "unknown" }
            }

            const data = await response.json()
            return { status: data.status, details: data }
        } catch {
            return { status: "unknown" }
        }
    }

    async cancelPayment(gatewayPaymentId: string, amount?: number): Promise<CancelResult> {
        try {
            const response = await fetch(`https://api.mercadopago.com/v1/payments/${gatewayPaymentId}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${process.env.MP_SUBSCRIPTION_CLIENT_SECRET}`,
                },
                body: JSON.stringify({ status: "cancelled" }),
            })

            if (!response.ok) {
                return { success: false, error: `MP cancel error: ${response.status}` }
            }

            return { success: true, gateway_status: "cancelled" }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }
}

const mpGateway = new MercadoPagoGateway()
gatewayRegistry.register(mpGateway)

export default mpGateway

import type { CreatePaymentInput, BillingPayment, GatewayName } from "./types"

export interface PaymentResult {
    success: boolean
    gateway_payment_id?: string
    gateway_status?: string
    checkout_url?: string
    qr_code?: string
    qr_code_base64?: string
    boleto_url?: string
    barcode?: string
    error?: string
}

export interface WebhookResult {
    processed: boolean
    payment_id?: string
    status?: string
    error?: string
}

export interface CancelResult {
    success: boolean
    gateway_status?: string
    error?: string
}

export interface BillingGateway {
    name: GatewayName
    createPayment(input: CreatePaymentInput, metadata?: Record<string, any>): Promise<PaymentResult>
    processWebhook(event: any): Promise<WebhookResult>
    getPaymentStatus(gatewayPaymentId: string): Promise<{ status: string; details?: any }>
    cancelPayment(gatewayPaymentId: string, amount?: number): Promise<CancelResult>
}

class GatewayRegistry {
    private gateways = new Map<GatewayName, BillingGateway>()

    register(gateway: BillingGateway): void {
        this.gateways.set(gateway.name, gateway)
    }

    get(name: GatewayName): BillingGateway {
        const gateway = this.gateways.get(name)
        if (!gateway) {
            throw new Error(`Gateway "${name}" is not registered. Available: ${Array.from(this.gateways.keys()).join(", ")}`)
        }
        return gateway
    }

    has(name: string): boolean {
        return this.gateways.has(name as GatewayName)
    }
}

export const gatewayRegistry = new GatewayRegistry()

export function getGateway(name: GatewayName): BillingGateway {
    return gatewayRegistry.get(name)
}

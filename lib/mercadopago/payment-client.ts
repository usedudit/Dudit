import "server-only"
import { MercadoPagoConfig, Payment } from "mercadopago"
import { SecureLogger } from "@/lib/secure-logger"

export interface CreateMercadoPagoPaymentInput {
  accessToken: string
  paymentPayload: Record<string, any>
  idempotencyKey: string
  deviceId?: string | null
}

export interface CreateMercadoPagoPaymentResult {
  success: boolean
  status: number
  data?: any
  errorMessage?: string
  errorCode?: string | null
  cause?: any
}

/**
 * Cria um pagamento na API do Mercado Pago usando o SDK oficial (Node.js v3).
 * Envia automaticamente os cabeçalhos de conformidade PCI, SDK backend e Device ID (X-Meli-Session-Id).
 */
export async function createMercadoPagoPayment(
  input: CreateMercadoPagoPaymentInput
): Promise<CreateMercadoPagoPaymentResult> {
  const { accessToken, paymentPayload, idempotencyKey, deviceId } = input

  try {
    const cleanDeviceId = typeof deviceId === "string" && deviceId.trim().length > 0 ? deviceId.trim() : undefined

    const client = new MercadoPagoConfig({
      accessToken,
      options: {
        timeout: 15000,
        meliSessionId: cleanDeviceId,
      },
    })

    const payment = new Payment(client)

    const response = await payment.create({
      body: paymentPayload as any,
      requestOptions: {
        idempotencyKey,
        meliSessionId: cleanDeviceId,
      },
    })

    if (!response || !response.id) {
      SecureLogger.error("Mercado Pago SDK returned response without payment ID", {
        status: response?.status,
      })
      return {
        success: false,
        status: 500,
        errorMessage: "ID de pagamento não retornado pelo provedor.",
      }
    }

    return {
      success: true,
      status: 201,
      data: response,
    }
  } catch (err: any) {
    // Tratamento de erros do SDK do Mercado Pago
    const statusCode = err?.status || err?.statusCode || 400
    const errorCode = err?.code || err?.cause?.[0]?.code || null
    const errorMessage = typeof err?.message === "string" ? err.message : "Erro ao processar pagamento com Mercado Pago"
    const cause = err?.cause || null

    SecureLogger.error("Mercado Pago SDK payment creation failed", {
      status: statusCode,
      errorCode,
      message: errorMessage.slice(0, 200),
      causeCount: Array.isArray(cause) ? cause.length : 0,
    })

    return {
      success: false,
      status: statusCode,
      errorMessage,
      errorCode,
      cause,
    }
  }
}

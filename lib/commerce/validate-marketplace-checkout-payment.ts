import type { CheckoutRequirements } from "@/lib/commerce/checkout-requirements"

export function validateMarketplaceCheckoutPayment(params: {
  requirements: CheckoutRequirements
  paymentOption: "mercadopago" | "traditional"
  paymentMethodType?: string | null
  productDeliveryType?: "delivery" | "pickup"
  useMercadoPago?: boolean
}): { valid: true } | { valid: false; error: string } {
  const { requirements, paymentOption, paymentMethodType, productDeliveryType } = params

  if (paymentOption === "traditional" && paymentMethodType === "cash") {
    if (!requirements.allowPayOnDelivery) {
      return {
        valid: false,
        error:
          "Pagamento em dinheiro na entrega não está disponível para este pedido. Escolha outro meio de pagamento.",
      }
    }
    if (productDeliveryType === "pickup" && requirements.hasServiceLines) {
      return {
        valid: false,
        error: "Não é possível combinar pagamento na retirada em dinheiro com serviços neste checkout.",
      }
    }
  }

  if (
    requirements.hasPayOnService &&
    paymentOption === "traditional" &&
    paymentMethodType &&
    paymentMethodType !== "cash"
  ) {
    // Offline non-cash for pay-on-service is allowed (manual confirmation)
  }

  if (requirements.hasPayOnService && !requirements.hasProductLines && paymentOption === "traditional") {
    const blockedForServiceOnly = ["cash"].includes(paymentMethodType || "")
    if (blockedForServiceOnly) {
      return {
        valid: false,
        error: "Para este serviço, o pagamento é realizado no atendimento. Use Mercado Pago ou aguarde confirmação.",
      }
    }
  }

  return { valid: true }
}

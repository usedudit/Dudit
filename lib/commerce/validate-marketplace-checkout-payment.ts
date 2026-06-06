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
    if (!requirements.allowPayOnDelivery && !requirements.hasPayOnService) {
      return {
        valid: false,
        error:
          "Pagamento em dinheiro na entrega não está disponível para este pedido. Escolha outro meio de pagamento.",
      }
    }
    if (productDeliveryType === "pickup" && requirements.hasServiceLines && !requirements.hasPayOnService) {
      return {
        valid: false,
        error: "Não é possível combinar pagamento na retirada em dinheiro com serviços neste checkout.",
      }
    }
  }

  return { valid: true }
}
